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
