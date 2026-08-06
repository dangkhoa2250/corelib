# Run Plugin web code in an isolated Runtime

The Plugin Runtime supports sandboxed JavaScript or TypeScript bundles for Plugin Surfaces and DOM-free command workers, with optional WebAssembly for heavier computation or additional source languages. It prohibits dynamic code loading, Node.js and native APIs, and undeclared network access, applies a strict content security policy, exposes Corelib only through its SDK and granted Capabilities, and signs every packaged file; this keeps Plugin development accessible without placing Marketplace code in the host DOM or native process.
