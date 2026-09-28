"""Spinestack API.

  GET /api/health                 -> {"ok": true, "tmdb": bool}
  GET /api/identify?q=gummo       -> films (TMDB) and books (Open Library) matching the name
  GET /api/spines?title=..&kind=movie|book&year=..&creator=..
                                  -> real spines cut from wrap scans found via SearXNG
  GET /api/image?url=..           -> proxy for poster/cover images (TMDB, Open Library only)
  GET /api/recent                 -> last titles that found a real spine (for the ticker)
  /media/...                      -> cropped spine and front images
  /                               -> the website (index.html at the repo root)
"""
from __future__ import annotations

import asyncio
import hashlib
import io
import ipaddress
import json
import os
import socket
import sqlite3
import time
from pathlib import Path
from urllib.parse import urlparse

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from PIL import Image

from spine import find_spine

SEARXNG_URL = os.environ.get("SEARXNG_URL", "http://localhost:8888").rstrip("/")
TMDB_KEY = os.environ.get("TMDB_API_KEY", "").strip()
DATA_DIR = Path(os.environ.get("DATA_DIR", Path(__file__).parent / "data"))
WEB_DIR = Path(os.environ.get("WEB_DIR", Path(__file__).resolve().parents[2]))   # repo root, where index.html lives
# Sites allowed to call this API from the browser, comma-separated, e.g. "https://yourname.github.io"
ALLOWED_ORIGINS = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "").split(",") if o.strip()]
MAX_CANDIDATES = int(os.environ.get("MAX_CANDIDATES", "14"))
MAX_BYTES = 10 * 1024 * 1024
UA = "Mozilla/5.0 (compatible; Spinestack/1.0)"
PROXY_HOSTS = {"image.tmdb.org", "covers.openlibrary.org"}

MEDIA = DATA_DIR / "media"
MEDIA.mkdir(parents=True, exist_ok=True)
db = sqlite3.connect(DATA_DIR / "cache.db", check_same_thread=False)
db.execute("CREATE TABLE IF NOT EXISTS results (key TEXT PRIMARY KEY, title TEXT, kind TEXT, found INTEGER, json TEXT, created REAL)")
db.commit()

app = FastAPI(title="Spinestack")
if ALLOWED_ORIGINS:
    app.add_middleware(CORSMiddleware, allow_origins=ALLOWED_ORIGINS, allow_methods=["GET"], allow_headers=["*"])


# ---------- helpers ----------
def is_public_host(url: str) -> bool:
    """Block requests to private/loopback addresses (SSRF guard)."""
    try:
        p = urlparse(url)
        if p.scheme not in ("http", "https") or not p.hostname:
            return False
        for info in socket.getaddrinfo(p.hostname, None):
            ip = ipaddress.ip_address(info[4][0])
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
                return os.environ.get("ALLOW_PRIVATE_FETCH") == "1"   # tests only
        return True
    except Exception:
        return False


async def fetch_image(client: httpx.AsyncClient, url: str) -> Image.Image | None:
    if not is_public_host(url):
        return None
    try:
        async with client.stream("GET", url, headers={"User-Agent": UA}, timeout=8, follow_redirects=True) as r:
            if r.status_code != 200 or not r.headers.get("content-type", "").startswith("image/"):
                return None
            buf = bytearray()
            async for chunk in r.aiter_bytes():
                buf += chunk
                if len(buf) > MAX_BYTES:
                    return None
        img = Image.open(io.BytesIO(bytes(buf)))
        img.load()
        return img.convert("RGB")
    except Exception:
        return None


def save(img: Image.Image, name: str) -> str:
    path = MEDIA / f"{name}.jpg"
    if not path.exists():
        img.save(path, "JPEG", quality=90)
    return f"/media/{path.name}"


# ---------- identify ----------
async def tmdb_search(client: httpx.AsyncClient, q: str) -> list[dict]:
    if not TMDB_KEY:
        return []
    bearer = len(TMDB_KEY) > 40               # v4 read token vs v3 key
    headers = {"Authorization": f"Bearer {TMDB_KEY}"} if bearer else {}
    params = {"query": q, "include_adult": "false"} | ({} if bearer else {"api_key": TMDB_KEY})
    r = await client.get("https://api.themoviedb.org/3/search/movie", params=params, headers=headers, timeout=8)
    out = []
    for m in r.json().get("results", [])[:5]:
        item = {"kind": "movie", "title": m.get("title", ""), "year": (m.get("release_date") or "")[:4],
                "creator": "", "cover": f"https://image.tmdb.org/t/p/w500{m['poster_path']}" if m.get("poster_path") else ""}
        try:
            c = await client.get(f"https://api.themoviedb.org/3/movie/{m['id']}/credits",
                                 params={} if bearer else {"api_key": TMDB_KEY}, headers=headers, timeout=6)
            item["creator"] = next((p["name"] for p in c.json().get("crew", []) if p.get("job") == "Director"), "")
        except Exception:
            pass
        out.append(item)
    return out


async def openlibrary_search(client: httpx.AsyncClient, q: str) -> list[dict]:
    r = await client.get("https://openlibrary.org/search.json", timeout=8, headers={"User-Agent": UA},
                         params={"q": q, "limit": 5, "fields": "title,author_name,first_publish_year,cover_i"})
    return [{"kind": "book", "title": d.get("title", ""), "year": str(d.get("first_publish_year") or ""),
             "creator": (d.get("author_name") or [""])[0],
             "cover": f"https://covers.openlibrary.org/b/id/{d['cover_i']}-L.jpg" if d.get("cover_i") else ""}
            for d in r.json().get("docs", [])]


@app.get("/api/health")
def health():
    return {"ok": True, "tmdb": bool(TMDB_KEY)}


@app.get("/api/identify")
async def identify(q: str = Query(..., min_length=1, max_length=120)):
    async with httpx.AsyncClient() as client:
        films, books = await asyncio.gather(tmdb_search(client, q), openlibrary_search(client, q),
                                            return_exceptions=True)
    films = films if isinstance(films, list) else []
    books = books if isinstance(books, list) else []
    if not films and not TMDB_KEY:
        # No TMDB key: still let people search a film by name.
        films = [{"kind": "movie", "title": q.strip(), "year": "", "creator": "", "cover": ""}]
    return {"results": films + books}


# ---------- spines ----------
async def searx_images(client: httpx.AsyncClient, query: str) -> list[dict]:
    try:
        r = await client.get(f"{SEARXNG_URL}/search", timeout=15,
                             params={"q": query, "format": "json", "categories": "images", "safesearch": 1})
        return r.json().get("results", [])
    except Exception:
        return []


def queries_for(title: str, kind: str, year: str, creator: str) -> list[str]:
    if kind == "movie":
        return [f'"{title}" {year} dvd cover'.strip(), f"{title} dvd cover full"]
    return [f'"{title}" {creator} book cover spine'.strip(), f"{title} {creator} full cover wrap"]


@app.get("/api/spines")
async def spines(title: str = Query(..., min_length=1, max_length=120),
                 kind: str = Query("movie", pattern="^(movie|book)$"),
                 year: str = Query("", max_length=4), creator: str = Query("", max_length=80),
                 refresh: bool = False):
    key = hashlib.sha1(f"{kind}|{title.lower()}|{year}".encode()).hexdigest()
    if not refresh:
        row = db.execute("SELECT json FROM results WHERE key=?", (key,)).fetchone()
        if row:
            return json.loads(row[0])

    async with httpx.AsyncClient() as client:
        lists = await asyncio.gather(*(searx_images(client, q) for q in queries_for(title, kind, year, creator)))
        seen, cands = set(), []
        for res in lists:
            for r in res:
                url = r.get("img_src") or ""
                if url and url not in seen:
                    seen.add(url)
                    cands.append(r)
        cands = cands[:MAX_CANDIDATES]
        images = await asyncio.gather(*(fetch_image(client, c["img_src"]) for c in cands))

    found = []
    for c, img in zip(cands, images):
        if img is None or img.width < 300:
            continue
        cut = find_spine(img, kind)
        if not cut:
            continue
        name = hashlib.sha1(c["img_src"].encode()).hexdigest()[:16]
        found.append({"id": name, "spine": save(cut.spine, name + "-spine"), "front": save(cut.front, name + "-front"),
                      "score": round(cut.score, 1), "source": c.get("url") or c["img_src"],
                      "source_title": (c.get("title") or "")[:120]})
    found.sort(key=lambda f: -f["score"])
    result = {"title": title, "kind": kind, "spines": found[:8]}
    db.execute("INSERT OR REPLACE INTO results VALUES (?,?,?,?,?,?)",
               (key, title, kind, int(bool(found)), json.dumps(result), time.time()))
    db.commit()
    return result


@app.get("/api/recent")
def recent():
    rows = db.execute("SELECT title, kind FROM results WHERE found=1 ORDER BY created DESC LIMIT 60").fetchall()
    seen, out = set(), []
    for t, k in rows:
        if t.lower() not in seen:
            seen.add(t.lower())
            out.append({"title": t, "kind": k})
    return {"recent": out[:20]}


@app.get("/api/image")
async def image_proxy(url: str):
    if urlparse(url).hostname not in PROXY_HOSTS:
        raise HTTPException(400, "Only TMDB and Open Library images can be proxied.")
    async with httpx.AsyncClient() as client:
        r = await client.get(url, timeout=10, headers={"User-Agent": UA}, follow_redirects=True)
    if r.status_code != 200:
        raise HTTPException(404, "Image not found.")
    return Response(r.content, media_type=r.headers.get("content-type", "image/jpeg"),
                    headers={"Cache-Control": "public, max-age=86400"})


app.mount("/media", StaticFiles(directory=MEDIA), name="media")


@app.get("/")
def index():
    return FileResponse(WEB_DIR / "index.html")
