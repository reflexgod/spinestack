FROM python:3.12-slim
WORKDIR /app/backend/api
COPY backend/api/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/api/ /app/backend/api/
COPY index.html /app/index.html
ENV DATA_DIR=/data WEB_DIR=/app
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
