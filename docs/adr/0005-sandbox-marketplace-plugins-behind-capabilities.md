# Sandbox Marketplace Plugins behind Capabilities

Marketplace Plugins will not ship or execute their own native libraries, executables, or unrestricted Tauri commands. They run in an isolated environment and reach files, network resources, credentials, notifications, calendars, and other host or operating-system services only through permission-scoped Plugin Capabilities; this limits some integrations until Corelib exposes an appropriate Capability, but makes installation and removal enforceable and prevents reviewed Plugins from gaining ambient native authority.
