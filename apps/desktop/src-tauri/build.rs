fn main() {
    println!("cargo:rerun-if-env-changed=ACCOUNT_API_BASE_URL");

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
        println!("cargo:rustc-link-arg=-mmacosx-version-min=15.0");
        swift_rs::SwiftLinker::new("15.0")
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
