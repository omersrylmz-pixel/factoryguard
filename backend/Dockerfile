FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app

COPY backend/requirements.txt backend/requirements.lock ./
# Kilitli sürümler: yalnızca çalışma zamanı paketlerini lock dosyasından sabitle.
RUN pip install -r requirements.txt -c requirements.lock

COPY backend/alembic.ini ./
COPY backend/migrations ./migrations
COPY backend/app ./app
COPY sensor ./sensor
COPY sample-data ./sample-data

# root olmayan kullanıcı
RUN useradd --system --uid 10001 --no-create-home fg && chown -R fg /app
USER fg

EXPOSE 8000
# Başlangıçta migration'ları uygula, demo verisini hazırla, sonra API'yi başlat.
CMD ["sh", "-c", "alembic upgrade head && python -m app.cli seed-demo && uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers"]
