#!/bin/sh
# Inicia o PocketBase. Os dados ficam em /pb/pb_data (volume persistente).
set -e
DATA_DIR="${PB_DATA_DIR:-/pb/pb_data}"
APP_DIR="${PB_APP_DIR:-/pb}"

# Cria/atualiza o superusuário (painel /_/) a partir das variáveis de ambiente, se informadas.
if [ -n "$PB_ADMIN_EMAIL" ] && [ -n "$PB_ADMIN_PASSWORD" ]; then
  "$APP_DIR/pocketbase" superuser upsert "$PB_ADMIN_EMAIL" "$PB_ADMIN_PASSWORD" \
    --dir="$DATA_DIR" --migrationsDir="$APP_DIR/pb_migrations"
fi

exec "$APP_DIR/pocketbase" serve \
  --http="0.0.0.0:${PORT:-8080}" \
  --dir="$DATA_DIR" \
  --hooksDir="$APP_DIR/pb_hooks" \
  --migrationsDir="$APP_DIR/pb_migrations" \
  --publicDir="$APP_DIR/pb_public"
