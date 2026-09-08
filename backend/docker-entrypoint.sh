#!/bin/sh
set -eu

encoded_db_password="$(python3 -c "import os,sys,urllib.parse; sys.stdout.write(urllib.parse.quote_plus(os.environ['DB_PASSWORD']))")"
export DATABASE_URL="postgresql+psycopg2://${DB_USERNAME}:${encoded_db_password}@${DB_HOST}:${DB_PORT}/${DB_NAME}"

exec uvicorn app.main:app --host 0.0.0.0 --port 8000
