# macOS 12 Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce one Universal Corelib release that launches on macOS 12 and later while exposing Apple Translation only on macOS 15 and later.

**Architecture:** Set the deployment floor to macOS 12 consistently across Tauri, Rust, and Swift while preserving runtime availability guards around Apple's macOS 15 Translation framework. Keep OpenCode Go independent of Apple Translation, and add source-level plus release-artifact checks so future builds cannot silently raise the minimum OS or drop an architecture.

**Tech Stack:** Tauri 2, Rust, Swift Package Manager, SwiftUI Translation framework, React/TypeScript, Vitest, GitHub Actions, macOS `plutil`, `lipo`, and `otool`.

---

### Task 1: Add deployment-target regression coverage

**Files:**
- Create: `apps/desktop/src/macosCompatibility.test.ts`
- Inspect: `apps/desktop/src-tauri/tauri.macos.conf.json`
- Inspect: `apps/desktop/src-tauri/build.rs`
- Inspect: `apps/desktop/src-tauri/swift/AppleTranslation/Package.swift`
- Inspect: `apps/desktop/src-tauri/swift/AppleTranslation/Sources/AppleTranslation/AppleTranslation.swift`

- [ ] **Step 1: Write the failing compatibility tests**

Create `apps/desktop/src/macosCompatibility.test.ts`:

```ts
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function source(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

describe("macOS deployment compatibility", () => {
  it("sets the Tauri application floor to macOS 12", () => {
    const config = JSON.parse(source("../src-tauri/tauri.macos.conf.json"));

    expect(config.bundle.macOS.minimumSystemVersion).toBe("12.0");
  });

  it("builds the Rust and Swift bridge for macOS 12", () => {
    const buildScript = source("../src-tauri/build.rs");
    const swiftPackage = source("../src-tauri/swift/AppleTranslation/Package.swift");

    expect(buildScript).toContain('const MACOS_DEPLOYMENT_TARGET: &str = "12.0";');
    expect(buildScript).toContain("-mmacosx-version-min={MACOS_DEPLOYMENT_TARGET}");
    expect(buildScript).toContain("SwiftLinker::new(MACOS_DEPLOYMENT_TARGET)");
    expect(swiftPackage).toContain("platforms: [.macOS(.v12)]");
  });

  it("keeps Apple Translation gated to macOS 15 at runtime", () => {
    const bridge = source(
      "../src-tauri/swift/AppleTranslation/Sources/AppleTranslation/AppleTranslation.swift",
    );

    expect(bridge).toContain("@available(macOS 15.0, *)");
    expect(bridge.match(/#available\(macOS 15\.0, \*\)/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
cd apps/desktop
npx vitest run src/macosCompatibility.test.ts
```

Expected: two tests fail because the current deployment values are 15.0 and no shared `MACOS_DEPLOYMENT_TARGET` constant exists; the runtime-gating test passes.

### Task 2: Lower the app floor without lowering the Apple Translation gate

**Files:**
- Modify: `apps/desktop/src-tauri/tauri.macos.conf.json:20`
- Modify: `apps/desktop/src-tauri/build.rs:1-20`
- Modify: `apps/desktop/src-tauri/swift/AppleTranslation/Package.swift:4-7`
- Test: `apps/desktop/src/macosCompatibility.test.ts`

- [ ] **Step 1: Set Tauri's minimum system version to 12.0**

Change the macOS bundle configuration to:

```json
"macOS": {
  "minimumSystemVersion": "12.0"
}
```

- [ ] **Step 2: Give the native build one shared deployment target**

Replace `apps/desktop/src-tauri/build.rs` with the following complete content so Windows behavior remains unchanged and macOS uses one deployment target:

```rust
#[cfg(target_os = "macos")]
const MACOS_DEPLOYMENT_TARGET: &str = "12.0";

fn main() {
    #[cfg(target_os = "windows")]
    println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
    #[cfg(target_os = "windows")]
    {
        let manifest = std::path::Path::new(&std::env::var("CARGO_MANIFEST_DIR").unwrap())
            .join("windows-app.manifest");
        println!("cargo:rustc-link-arg=/MANIFESTINPUT:{}", manifest.display());
        println!("cargo:rerun-if-changed={}", manifest.display());
    }

    #[cfg(target_os = "macos")]
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        println!("cargo:rustc-link-arg=-mmacosx-version-min={MACOS_DEPLOYMENT_TARGET}");
        swift_rs::SwiftLinker::new(MACOS_DEPLOYMENT_TARGET)
            .with_package("AppleTranslation", "swift/AppleTranslation")
            .link();
        println!("cargo:rerun-if-changed=swift/AppleTranslation/Package.swift");
        println!("cargo:rerun-if-changed=swift/AppleTranslation/Sources/AppleTranslation/AppleTranslation.swift");
    }
    #[cfg(target_os = "windows")]
    {
        let windows = tauri_build::WindowsAttributes::new_without_app_manifest();
        let attributes = tauri_build::Attributes::new().windows_attributes(windows);
        tauri_build::try_build(attributes).expect("failed to run Tauri build script");
    }

    #[cfg(not(target_os = "windows"))]
    tauri_build::build();
}
```

- [ ] **Step 3: Build the Swift package for macOS 12**

Change the package declaration to:

```swift
let package = Package(
    name: "AppleTranslation",
    platforms: [.macOS(.v12)],
```

Do not alter the `@available(macOS 15.0, *)` and `#available(macOS 15.0, *)` guards in `AppleTranslation.swift`.

- [ ] **Step 4: Run the compatibility test and verify GREEN**

Run:

```bash
cd apps/desktop
npx vitest run src/macosCompatibility.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 5: Prove the weak-linked bridge compiles with a macOS 12 floor**

Run:

```bash
MACOSX_DEPLOYMENT_TARGET=12.0 cargo test \
  --features dev-tools \
  --manifest-path apps/desktop/src-tauri/Cargo.toml \
  translation::tests::links_apple_translation_on_supported_macos
```

Expected: the Apple Translation package compiles against the current SDK with a macOS 12 deployment target and the targeted test passes on the development Mac.

- [ ] **Step 6: Commit the deployment-target change**

```bash
git add \
  apps/desktop/src/macosCompatibility.test.ts \
  apps/desktop/src-tauri/tauri.macos.conf.json \
  apps/desktop/src-tauri/build.rs \
  apps/desktop/src-tauri/swift/AppleTranslation/Package.swift
git commit -m "fix: support macOS 12 without Apple Translation"
```

### Task 3: Enforce compatibility on release artifacts

**Files:**
- Modify: `apps/desktop/src/macosCompatibility.test.ts`
- Modify: `.github/workflows/release-desktop.yml:31-44`

- [ ] **Step 1: Add a failing workflow regression test**

Append this test inside the existing `describe` block:

```ts
it("verifies the bundled minimum OS and both Universal architectures in release CI", () => {
  const workflow = source("../../../.github/workflows/release-desktop.yml");

  expect(workflow).toContain("Verify macOS 12 Universal compatibility");
  expect(workflow).toContain("LSMinimumSystemVersion");
  expect(workflow).toContain('expected_archs="x86_64 arm64"');
  expect(workflow).toContain("otool -arch x86_64 -l");
  expect(workflow).toContain("otool -arch arm64 -l");
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
cd apps/desktop
npx vitest run src/macosCompatibility.test.ts
```

Expected: only the new release-workflow test fails because the workflow does not inspect the produced app yet.

- [ ] **Step 3: Add an artifact verification step to release CI**

Insert this step after `Build signed universal macOS artifacts` and before `Stage macOS release files`:

```yaml
      - name: Verify macOS 12 Universal compatibility
        working-directory: apps/desktop
        shell: bash
        run: |
          set -euo pipefail
          app="src-tauri/target/universal-apple-darwin/release/bundle/macos/Corelib.app"
          binary="$app/Contents/MacOS/library_desktop"
          test "$(plutil -extract LSMinimumSystemVersion raw "$app/Contents/Info.plist")" = "12.0"
          expected_archs="x86_64 arm64"
          test "$(lipo -archs "$binary")" = "$expected_archs"
          otool -arch x86_64 -l "$binary" | grep -A4 LC_BUILD_VERSION | grep -q "minos 12.0"
          otool -arch arm64 -l "$binary" | grep -A4 LC_BUILD_VERSION | grep -q "minos 12.0"
```

- [ ] **Step 4: Run the compatibility test and verify GREEN**

Run:

```bash
cd apps/desktop
npx vitest run src/macosCompatibility.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit the release guard**

```bash
git add apps/desktop/src/macosCompatibility.test.ts .github/workflows/release-desktop.yml
git commit -m "ci: verify macOS 12 universal releases"
```

### Task 4: Document behavior and run automated verification

**Files:**
- Modify: `apps/desktop/README.md:1-20`

- [ ] **Step 1: Document supported versions and translation behavior**

Add this section after the opening paragraph:

```markdown
## macOS 12 and later

The macOS release is a Universal application for Intel and Apple Silicon and supports macOS 12.0 or later. Apple Translation is available only on macOS 15.0 or later; on macOS 12 through 14 it is hidden and users can select OpenCode Go or another configured cloud translation provider.
```

- [ ] **Step 2: Run the full frontend suite**

Run `cd apps/desktop && npm test -- --run`.

Expected: all frontend test files pass with zero failures.

- [ ] **Step 3: Build the frontend**

Run `cd apps/desktop && npm run build`.

Expected: TypeScript and Vite complete with exit code 0.

- [ ] **Step 4: Run the full Rust suite**

Run:

```bash
cargo test --all-targets --features dev-tools --manifest-path apps/desktop/src-tauri/Cargo.toml
```

Expected: all Rust unit and integration tests pass with zero failures.

- [ ] **Step 5: Run Clippy**

Run:

```bash
cargo clippy --all-targets --all-features --manifest-path apps/desktop/src-tauri/Cargo.toml -- -D warnings -A linker-messages
```

Expected: Clippy completes with exit code 0 and no denied warnings.

- [ ] **Step 6: Commit the support documentation**

```bash
git add apps/desktop/README.md
git commit -m "docs: document macOS translation compatibility"
```

### Task 5: Build and inspect a fresh Universal artifact

**Files:**
- Verify: `apps/desktop/src-tauri/target/universal-apple-darwin/release/bundle/macos/Corelib.app`
- Verify: `apps/desktop/src-tauri/target/universal-apple-darwin/release/bundle/dmg/Corelib_0.1.0_universal.dmg`

- [ ] **Step 1: Record the exact checkout and running desktop processes**

Run:

```bash
git rev-parse --short HEAD
git status --short
ps -axo pid,etime,command | grep -E '[t]auri dev|[v]ite|[l]ibrary_desktop'
```

Expected: record the revision and existing processes. Do not treat an existing process as evidence for this checkout.

- [ ] **Step 2: Ensure both Rust targets are installed**

Run `rustup target add aarch64-apple-darwin x86_64-apple-darwin`.

Expected: both targets are installed or already up to date.

- [ ] **Step 3: Build a fresh unsigned Universal artifact**

Run:

```bash
date +%s > /tmp/corelib-macos12-build-start
cd apps/desktop
npm run tauri -- build \
  --target universal-apple-darwin \
  --config '{"bundle":{"createUpdaterArtifacts":false}}'
```

Expected: Tauri creates a fresh Universal `.app` and DMG with exit code 0.

- [ ] **Step 4: Confirm the artifact is newer than the build start**

Run:

```bash
app="apps/desktop/src-tauri/target/universal-apple-darwin/release/bundle/macos/Corelib.app"
test "$(stat -f %m "$app")" -ge "$(cat /tmp/corelib-macos12-build-start)"
```

Expected: exit code 0.

- [ ] **Step 5: Inspect bundle metadata and both Mach-O slices**

Run:

```bash
app="apps/desktop/src-tauri/target/universal-apple-darwin/release/bundle/macos/Corelib.app"
binary="$app/Contents/MacOS/library_desktop"
plutil -extract LSMinimumSystemVersion raw "$app/Contents/Info.plist"
lipo -archs "$binary"
otool -arch x86_64 -l "$binary" | grep -A4 LC_BUILD_VERSION | grep "minos"
otool -arch arm64 -l "$binary" | grep -A4 LC_BUILD_VERSION | grep "minos"
```

Expected output includes:

```text
12.0
x86_64 arm64
    minos 12.0
    minos 12.0
```

- [ ] **Step 6: Launch only the freshly built application**

Run the exact new executable in a PTY:

```bash
apps/desktop/src-tauri/target/universal-apple-darwin/release/bundle/macos/Corelib.app/Contents/MacOS/library_desktop
```

Expected: the process remains alive long enough to create the Corelib window without a dynamic-linker or startup error. Stop only this verification process after inspection; do not reuse or replace `/Applications/Corelib.app`.

- [ ] **Step 7: Record the remaining acceptance-test limitation**

Record in the final handoff that the tested launch occurred on the development Mac, including its `sw_vers -productVersion` output. State explicitly that macOS 12.7.4 Intel runtime acceptance remains pending until the artifact is opened on that machine.

### Task 6: Final diff and branch verification

**Files:**
- Review all files changed from `main`

- [ ] **Step 1: Review scope and whitespace**

Run:

```bash
git diff --check main...HEAD
git diff --stat main...HEAD
git status --short
```

Expected: no whitespace errors, only compatibility-related files are changed, and the worktree is clean after plan tracking is committed.

- [ ] **Step 2: Commit plan tracking if checkboxes changed**

```bash
git add docs/superpowers/plans/2026-08-14-macos-12-compatibility.md
git commit -m "docs: record macOS 12 compatibility implementation"
```

- [ ] **Step 3: Report exact verification evidence**

The final handoff must include the tested commit, launch mode (`release`), exact artifact path, frontend/Rust/build results, `LSMinimumSystemVersion`, both binary architectures, both Mach-O deployment targets, and whether a real macOS 12.7.4 Intel launch was performed.
