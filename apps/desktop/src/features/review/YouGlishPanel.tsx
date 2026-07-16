import { useId, useLayoutEffect, useRef, useState } from "react";
import { SUPPORTED_LANGUAGES } from "../../domain/learning";

interface YouGlishPanelProps {
  word: string | null;
  frontLanguage: string | null;
  onClose: () => void;
}

const FLUENT_FOOTER_HEIGHT = 240;
const MIN_VIEWPORT_HEIGHT = 480;

export function youGlishEmbedUrl(word: string, language: string, widgetId: string): string {
  return `https://youglish.com/pronounce/${encodeURIComponent(word)}/${language.toLowerCase()}/all/emb=1&e_id=${encodeURIComponent(widgetId)}&e_comp=8&e_notif_h=1`;
}

export function YouGlishPanel({ word, frontLanguage, onClose }: YouGlishPanelProps) {
  const rawWidgetId = useId();
  const widgetId = `youglish-${rawWidgetId.replace(/[^a-z0-9]/gi, "")}`;
  const [viewportHeight, setViewportHeight] = useState(640);
  const awaitingCaptionResizeRef = useRef(false);

  useLayoutEffect(() => {
    const handleYouGlishMessage = (event: MessageEvent) => {
      if (event.origin !== "https://youglish.com" || typeof event.data !== "string") return;

      try {
        const message = JSON.parse(event.data) as { wid?: string; action?: number; height?: number };
        if (message.wid !== widgetId) return;

        if (message.action === 22) {
          awaitingCaptionResizeRef.current = true;
          return;
        }

        if (message.action === 2 && awaitingCaptionResizeRef.current && typeof message.height === "number" && Number.isFinite(message.height) && message.height > 0) {
          setViewportHeight(Math.max(MIN_VIEWPORT_HEIGHT, message.height - FLUENT_FOOTER_HEIGHT));
          awaitingCaptionResizeRef.current = false;
        }
      } catch {
        // Ignore unrelated cross-origin messages.
      }
    };

    window.addEventListener("message", handleYouGlishMessage);
    return () => window.removeEventListener("message", handleYouGlishMessage);
  }, [widgetId]);

  if (!word) return null;

  const languageName = frontLanguage ? SUPPORTED_LANGUAGES[frontLanguage.toLowerCase()] : undefined;

  return (
    <div
      style={{
        marginTop: "16px",
        padding: "16px",
        borderRadius: "12px",
        background: "var(--main-bg)",
        border: "1px solid var(--border-subtle)",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
      }}
    >
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
          Pronunciation for <span style={{ color: "var(--link)" }}>"{word}"</span>
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close YouGlish panel"
          style={{
            background: "transparent",
            border: "none",
            fontSize: "18px",
            cursor: "pointer",
            color: "var(--text-secondary)",
            padding: "4px 8px",
          }}
        >
          ✕
        </button>
      </header>

      {languageName ? (
        <div data-testid="youglish-video-viewport" style={{ height: `${viewportHeight}px`, overflow: "hidden", borderRadius: "8px", background: "var(--surface-1)" }}>
          <iframe
            title={`YouGlish pronunciation for ${word}`}
            data-youglish-id={widgetId}
            src={youGlishEmbedUrl(word, languageName, widgetId)}
            allow="autoplay"
            style={{ width: "100%", height: "1200px", border: "none", background: "var(--surface-1)" }}
          />
        </div>
      ) : (
        <div style={{ padding: "12px", borderRadius: "8px", color: "var(--warning)", background: "var(--color-danger-bg-soft)", fontSize: "13px" }}>
          {!frontLanguage
            ? "No confirmed front language. Choose the front language in card edit to use YouGlish."
            : `Unsupported front language "${frontLanguage}". Choose a supported language in card edit to use YouGlish.`}
        </div>
      )}

      <footer style={{ display: "flex", justifyContent: "flex-end", fontSize: "11px", color: "var(--text-secondary)" }}>
        Powered by&nbsp;
        <a
          href="https://youglish.com"
          target="_blank"
          rel="noreferrer"
          style={{ color: "inherit", textDecoration: "underline" }}
        >
          YouGlish.com
        </a>
      </footer>
    </div>
  );
}
