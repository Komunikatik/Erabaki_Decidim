#!/bin/bash
set -euo pipefail

APP_NAME="erabaki_komunikatik"
APP_DIR="/root/erabaki_komunikatik"
BACKUP_DIR="/root/backups_archivo"
DB_NAME="erabaki_komunikatik"
DAY="$(date +%A | tr '[:upper:]' '[:lower:]')"

mkdir -p "$BACKUP_DIR"

echo "[$(date)] Starting backup for ${APP_NAME}"

# Database dump
sudo -u postgres pg_dump -Fc "$DB_NAME" > "/tmp/${APP_NAME}_db.dump"

# Full app backup, including dump and important files
tar -czf "${BACKUP_DIR}/BACKUP_${APP_NAME}_${DAY}.tar.gz" \
  -C /tmp "${APP_NAME}_db.dump" \
  -C "$APP_DIR" storage public config db Gemfile Gemfile.lock package.json package-lock.json 2>/dev/null || true

# Installation/config backup
tar -czf "${BACKUP_DIR}/INSTALACION_${APP_NAME}_${DAY}.tar.gz" \
  -C "$APP_DIR" . \
  --exclude="node_modules" \
  --exclude="vendor/bundle" \
  --exclude="tmp" \
  --exclude="log" \
  --exclude="storage" \
  --exclude="public/uploads" \
  --exclude=".git" \
  2>/dev/null || true

# Include env separately with restricted permissions
if [ -f /etc/erabaki-komunikatik.env ]; then
  cp /etc/erabaki-komunikatik.env "${BACKUP_DIR}/ENV_${APP_NAME}_${DAY}.env"
  chmod 600 "${BACKUP_DIR}/ENV_${APP_NAME}_${DAY}.env"
fi

rm -f "/tmp/${APP_NAME}_db.dump"

echo "[$(date)] Backup completed for ${APP_NAME}"
