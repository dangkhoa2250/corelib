#!/usr/bin/env bash
#
# SQLite-consistent backup for the Library PocketBase service.
#
# Strategy: briefly stop PocketBase so SQLite is quiesced, copy the
# data directory into a timestamped tar.gz, encrypt it with gpg, and
# retain only the seven most recent local archives.
#
# The encrypted archive is intended for off-host copy (e.g. rsync to
# external storage). Only the encrypted form should leave this host.
#
set -euo pipefail

DATA_DIR="${POCKETBASE_DATA_DIR:-/var/lib/corelib-pocketbase/pb_data}"
BACKUP_DIR="${BACKUP_DIR:-/var/lib/corelib-pocketbase/backups}"
SERVICE_NAME="corelib-pocketbase"
RETENTION_COUNT=7
GPG_RECIPIENT="${BACKUP_GPG_RECIPIENT:-}"

if [ -z "$GPG_RECIPIENT" ]; then
  echo "ERROR: BACKUP_GPG_RECIPIENT must be set to a GPG key ID or email" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)
ARCHIVE_NAME="pocketbase-${TIMESTAMP}.tar.gz"
ARCHIVE_PATH="${BACKUP_DIR}/${ARCHIVE_NAME}"
ENCRYPTED_PATH="${ARCHIVE_PATH}.gpg"

echo "Stopping ${SERVICE_NAME} for consistent snapshot..."
systemctl stop "$SERVICE_NAME"

# Ensure the service is restarted even if the backup fails.
trap 'systemctl start "$SERVICE_NAME"' EXIT

echo "Creating archive: ${ARCHIVE_PATH}"
tar --create --gzip --file "$ARCHIVE_PATH" \
  --directory "$(dirname "$DATA_DIR")" \
  "$(basename "$DATA_DIR")"

echo "Starting ${SERVICE_NAME}..."
systemctl start "$SERVICE_NAME"
trap - EXIT

echo "Encrypting archive..."
gpg --batch --yes --trust-model always \
  --recipient "$GPG_RECIPIENT" \
  --output "$ENCRYPTED_PATH" \
  --encrypt "$ARCHIVE_PATH"

# Remove the unencrypted archive — only the encrypted copy is retained.
rm -f "$ARCHIVE_PATH"

echo "Encrypted backup: ${ENCRYPTED_PATH}"

# Retain only the N most recent encrypted archives.
ls -1t "${BACKUP_DIR}"/pocketbase-*.tar.gz.gpg 2>/dev/null \
  | tail -n +$((RETENTION_COUNT + 1)) \
  | while IFS= read -r old_file; do
      echo "Pruning old backup: $old_file"
      rm -f "$old_file"
    done

echo "Backup complete. $(ls -1 "${BACKUP_DIR}"/pocketbase-*.tar.gz.gpg 2>/dev/null | wc -l | tr -d ' ') archive(s) retained."
