// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "AppleTranslation",
    platforms: [.macOS(.v12)],
    products: [
        .library(
            name: "AppleTranslation",
            type: .static,
            targets: ["AppleTranslation"]
        )
    ],
    targets: [
        .target(name: "AppleTranslation")
    ],
    swiftLanguageModes: [.v5]
)
