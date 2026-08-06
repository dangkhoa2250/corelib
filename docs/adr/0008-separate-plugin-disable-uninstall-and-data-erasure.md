# Separate Plugin disable, uninstall, and data erasure

Corelib treats Disable, Uninstall, and Erase Plugin Data as separate lifecycle operations: disabling retains the package and Plugin Data, uninstalling removes the package but retains Plugin Data, and erasure permanently deletes that data only after independent confirmation. Retaining data consumes storage and requires orphaned-data management, but prevents experimentation, troubleshooting, or temporary removal from destroying important everyday information.
