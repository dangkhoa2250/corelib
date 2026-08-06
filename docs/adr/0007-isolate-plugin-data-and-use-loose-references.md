# Isolate Plugin Data and use loose references

Each Plugin owns Plugin Data in an isolated storage namespace and cannot directly query Corelib or another Plugin's tables. Cross-Plugin workflows use Plugin Commands or read-only Capabilities, while durable relationships use Plugin References that remain valid but unresolved when the owning Plugin is disabled or removed; this requires explicit contracts and resolution states, but allows Plugins such as Library and Memora to evolve, disappear, and return without corrupting each other's data.
