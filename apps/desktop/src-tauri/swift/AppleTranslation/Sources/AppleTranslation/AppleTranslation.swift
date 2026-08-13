import AppKit
import SwiftUI
import Translation

public typealias TranslationCallback = @convention(c) (
    UInt64,
    UnsafePointer<CChar>?,
    UnsafePointer<CChar>?
) -> Void

@MainActor
private var activeHosts: [UInt64: NSView] = [:]

@available(macOS 15.0, *)
private struct TranslationHost: View {
    let requestID: UInt64
    let text: String
    let target: String
    let sourceLang: String?
    let callback: TranslationCallback

    @State private var configuration: TranslationSession.Configuration?

    var body: some View {
        Color.clear
            .frame(width: 1, height: 1)
            .onAppear {
                let sourceLocale = sourceLang.map { Locale.Language(identifier: $0) }
                configuration = TranslationSession.Configuration(
                    source: sourceLocale,
                    target: Locale.Language(identifier: target)
                )
            }
            .translationTask(configuration) { session in
                do {
                    let response = try await session.translate(text)
                    finish(result: response.targetText, error: nil)
                } catch {
                    finish(result: nil, error: normalizedMessage(error))
                }
            }
    }

    private func normalizedMessage(_ error: Error) -> String {
        let message = error.localizedDescription
        let lowercased = message.lowercased()
        if lowercased.contains("not installed") || lowercased.contains("download") {
            return "language_pack_required: \(message)"
        }
        if lowercased.contains("unsupported") {
            return "unsupported_language_pair: \(message)"
        }
        return "engine_unavailable: \(message)"
    }

    @MainActor
    private func finish(result: String?, error: String?) {
        if let result {
            result.withCString { callback(requestID, $0, nil) }
        } else if let error {
            error.withCString { callback(requestID, nil, $0) }
        } else {
            "engine_unavailable: Apple Translation returned no result."
                .withCString { callback(requestID, nil, $0) }
        }
        activeHosts.removeValue(forKey: requestID)?.removeFromSuperview()
    }
}

@MainActor
private func startTranslation(
    requestID: UInt64,
    text: String,
    target: String,
    sourceLang: String?,
    callback: @escaping TranslationCallback
) {
    guard #available(macOS 15.0, *) else {
        "engine_unavailable: Apple Translation requires macOS 15 or later."
            .withCString { callback(requestID, nil, $0) }
        return
    }
    guard let contentView = NSApp.keyWindow?.contentView ?? NSApp.windows.first?.contentView else {
        "engine_unavailable: No active application window is available for Apple Translation."
            .withCString { callback(requestID, nil, $0) }
        return
    }

    let host = NSHostingView(rootView: TranslationHost(
        requestID: requestID,
        text: text,
        target: target,
        sourceLang: sourceLang,
        callback: callback
    ))
    host.frame = NSRect(x: 0, y: 0, width: 1, height: 1)
    contentView.addSubview(host)
    activeHosts[requestID] = host
}

@_cdecl("library_apple_translation_available")
public func appleTranslationAvailable() -> Bool {
    if #available(macOS 15.0, *) {
        return true
    }
    return false
}

@_cdecl("library_apple_translate")
public func appleTranslate(
    _ requestID: UInt64,
    _ source: UnsafePointer<CChar>,
    _ target: UnsafePointer<CChar>,
    _ sourceLang: UnsafePointer<CChar>?,
    _ callback: @escaping TranslationCallback
) {
    let text = String(cString: source)
    let targetCode = String(cString: target)
    let sourceCode = sourceLang != nil ? String(cString: sourceLang!) : nil
    Task { @MainActor in
        startTranslation(
            requestID: requestID,
            text: text,
            target: targetCode,
            sourceLang: sourceCode,
            callback: callback
        )
    }
}
