# Store Plugin lifecycle state per account on each device

Corelib stores First-party Plugin enablement and pinned Surface order in a versioned, Core-owned JSON file below the Tauri application data directory, with separate records keyed by PocketBase account ID. Writes are atomic, malformed files are quarantined before safe default recovery, and this state is not synchronized in Phase 2; this prevents accounts on one device from sharing customization while keeping lifecycle configuration separate from Plugin Data and future Core Sync.
