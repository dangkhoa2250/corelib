# Keep Agent authority in the Corelib host

Corelib will own the Agent Runtime that discovers Plugin Commands, validates requests, enforces permissions and confirmations, coordinates execution, and records outcomes. AI model providers and agent-specific experiences may remain replaceable Plugins, but no ordinary Plugin receives ambient authority over other Plugins; this keeps cross-Plugin automation model-independent and prevents each agent implementation from inventing its own security boundary.
