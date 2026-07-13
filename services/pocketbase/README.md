# PocketBase Service for Library

This service provides identity, user approval, feature flag entitlements, and telemetry aggregation.

## Local Development

### 1. Download PocketBase
Download the PocketBase binary matching your OS and architecture. For Apple Silicon macOS:
- Extract the binary and place it at `services/pocketbase/pocketbase`.

### 2. Configure Environment
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Keep this file local; it is ignored by git.

### 3. Run Migrations and Start
Run migrations using the pocketbase binary:
```bash
./pocketbase migrate up --dir ./pb_data
```

Start the PocketBase server:
```bash
./pocketbase serve --http=127.0.0.1:8090 --dir ./pb_data
```

### 4. Run Smoke Tests
In another terminal, run the smoke test script:
```bash
bash tests/smoke.sh http://127.0.0.1:8090
```

## Security and Git Policy
- **Never commit `pb_data/` or `.env`.** They are explicitly ignored in `.gitignore`.
- Database files, passwords, API keys, and backups are non-public and must not be committed to GitHub.

## Production Deployment (Oracle + DuckDNS + Caddy)

### Prerequisites

1. An Oracle Cloud (or equivalent) Linux host with ports **80** and **443** open.
2. A DuckDNS subdomain (e.g. `library-home`) — record the domain name and token.
3. PocketBase binary placed at `/opt/corelib-pocketbase/pocketbase`.
4. Caddy installed (it manages Let's Encrypt certificates automatically).
5. GPG key pair for encrypted backups (export `BACKUP_GPG_RECIPI`).

### Install steps

```bash
# 1. Create a dedicated non-login service user.
sudo useradd --system --no-create-home --shell /usr/sbin/nologin corelib

# 2. Create directories.
sudo mkdir -p /opt/corelib-pocketbase /var/lib/corelib-pocketbase/pb_data /var/lib/corelib-pocketbase/backups
sudo chown -R corelib:corelib /var/lib/corelib-pocketbase

# 3. Place binary and scripts.
sudo cp pocketbase /opt/corelib-pocketbase/pocketbase
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile.d/corelib.caddy
sudo cp deploy/pocketbase.service deploy/duckdns.service deploy/duckdns.timer deploy/backup-pocketbase.service deploy/backup-pocketbase.timer /etc/systemd/system/
sudo cp deploy/duckdns-update.sh deploy/backup-pocketbase.sh /opt/corelib-pocketbase/
sudo chmod +x /opt/corelib-pocketbase/duckdns-update.sh /opt/corelib-pocketbase/backup-pocketbase.sh

# 4. Configure secrets (never commit this file).
sudo tee /etc/corelib-pocketbase.env > /dev/null <<EOF
DUCKDNS_DOMAIN=library-home
DUCKDNS_TOKEN=your-duckdns-token
BACKUP_GPG_RECIPI=your@gpg.key
EOF
sudo chmod 600 /etc/corelib-pocketbase.env
sudo chown root:root /etc/corelib-pocketbase.env

# 5. Apply migrations BEFORE starting the service (no --automigrate).
sudo -u corelib /opt/corelib-pocketbase/pocketbase migrate up --dir /var/lib/corelib-pocketbase/pb_data

# 6. Create the PocketBase superuser.
sudo -u corelib /opt/corelib-pocketbase/pocketbase superuser create admin@example.com 'strong-password'

# 7. Start services.
sudo systemctl daemon-reload
sudo systemctl enable --now caddy
sudo systemctl enable --now corelib-pocketbase
sudo systemctl enable --now duckdns.timer
sudo systemctl enable --now backup-pocketbase.timer
```

### Acceptance commands

After deployment, run these checks — every command must succeed:

```bash
# Health check over HTTPS
curl --fail --silent --show-error https://LIBRARY_HOME.duckdns.org/api/health

# Only Caddy should own 80/443; PocketBase must be local-only
sudo ss -ltnp | grep ':(80\|443\|8090)'
# Expected: Caddy on :80 and :443; PocketBase on 127.0.0.1:8090 only

# All services must be active
sudo systemctl is-active caddy corelib-pocketbase backup-pocketbase.timer duckdns.timer
```

### Restoration drill

Test backup integrity on a regular schedule:

```bash
# 1. Decrypt the latest backup into an isolated directory.
mkdir -p /tmp/corelib-restore
gpg --decrypt /var/lib/corelib-pocketbase/backups/pocketbase-LATEST.tar.gz.gpg \
  | tar --extract --gzip --directory /tmp/corelib-restore

# 2. Start a temporary PocketBase instance on a different port.
/opt/corelib-pocketbase/pocketbase serve --http=127.0.0.1:8091 \
  --dir /tmp/corelib-restore/pb_data &

# 3. Run smoke tests against the restored database.
bash services/pocketbase/tests/smoke.sh http://127.0.0.1:8091

# 4. Clean up.
kill %1
rm -rf /tmp/corelib-restore
```

### Security checklist

- PocketBase listens **only** on `127.0.0.1:8090` — the raw server IP must not serve the API.
- The DuckDNS token appears in **no** log file or process listing.
- SSH is restricted to the owner's source IP at both the Oracle firewall and OS firewall.
- Backups are encrypted (GPG) before any off-host copy; unencrypted archives are deleted immediately.
