# Require explicit, scoped Plugin Permissions

Every Plugin declares its required and optional Plugin Permissions before installation, separating read from write access and declaring scopes such as allowed network domains. Users may deny or revoke grants, updates that expand permissions pause for renewed consent, and high-impact Plugin Commands still require execution-time confirmation; the Agent Runtime uses the same grants and cannot bypass them, trading some interaction cost for least-privilege control that remains meaningful during AI automation.
