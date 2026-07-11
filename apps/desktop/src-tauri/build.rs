fn main() {
    #[cfg(target_os = "macos")]
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        println!("cargo:rustc-link-arg=-mmacosx-version-min=15.0");
        swift_rs::SwiftLinker::new("15.0")
            .with_package("AppleTranslation", "swift/AppleTranslation")
            .link();
        println!("cargo:rerun-if-changed=swift/AppleTranslation/Package.swift");
        println!("cargo:rerun-if-changed=swift/AppleTranslation/Sources/AppleTranslation/AppleTranslation.swift");
    }
    tauri_build::build()
}
