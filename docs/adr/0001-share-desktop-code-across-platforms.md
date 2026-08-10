# Share the Library codebase across platforms

The Windows Edition will evolve from the existing Library codebase instead of being reimplemented as a separate application. This preserves product and data compatibility while allowing platform-specific integrations behind explicit operating-system boundaries; a separate rewrite was rejected because it would create two products that can drift in behavior, storage, and maintenance. Windows work may use a temporary integration branch, but the branch must remain mergeable into `main` and must not become a permanent platform fork.
