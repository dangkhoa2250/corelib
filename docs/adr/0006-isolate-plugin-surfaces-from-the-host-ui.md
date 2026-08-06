# Isolate Plugin Surfaces from the host UI

Corelib will render shared contributions such as navigation entries, commands, and settings from declarative Plugin metadata, while each Plugin Surface runs as an isolated web UI with freedom over its own HTML, CSS, and JavaScript. Plugin code cannot directly access Corelib's DOM or React state and instead communicates through Plugin Capabilities; this gives unrelated everyday functions enough UI freedom without making host stability and security depend on every Plugin's frontend implementation.
