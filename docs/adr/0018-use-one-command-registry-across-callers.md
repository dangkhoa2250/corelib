# Use one Command Registry across callers

Every operation that crosses a Plugin boundary uses one Plugin Command implementation and versioned JSON contract registered with declared Command Audiences for humans, other Plugins, the Agent Runtime, and Automations. Audience visibility does not replace Plugin Permissions or Agent Grants, while purely internal functions remain unregistered; this avoids parallel human, integration, and AI APIs drifting into different behavior while retaining explicit control over who may discover and request each operation.
