FROM node:22-slim AS frontend
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

FROM python:3.13-slim
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    LONGWATCH_FRONTEND=/app/frontend/dist
WORKDIR /app/backend
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/longwatch ./longwatch
COPY backend/data ./data
COPY docs/validation_results.json docs/detectability_curve.json docs/madrid_crosscheck.json /app/docs/
COPY --from=frontend /build/dist /app/frontend/dist
RUN useradd --system --no-create-home longwatch && chown -R longwatch /app/backend/data
USER longwatch
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD ["python", "-c", "import os, urllib.request; urllib.request.urlopen('http://127.0.0.1:' + os.environ.get('PORT', '8000') + '/api/health', timeout=4)"]
CMD ["sh", "-c", "uvicorn longwatch.api:app --host 0.0.0.0 --port ${PORT:-8000}"]
