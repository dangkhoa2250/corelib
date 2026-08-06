# Enforce an acyclic, versioned Plugin dependency graph

Plugins declare version-constrained Plugin Dependencies as required or optional, and dependency cycles are invalid. Corelib presents and installs required dependencies together with their permissions, prevents removal of a dependency while enabled dependents still require it unless the user accepts a cascade disable, and degrades only the related integration when an optional dependency disappears; this adds resolver complexity but avoids implicit coupling and partially broken installations.
