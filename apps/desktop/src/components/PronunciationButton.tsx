import { IconSpeaker, IconStop } from "../app/icons";
import { detectLanguage } from "../lib/language";
import { usePronunciation } from "../lib/pronunciation";

export interface PronunciationButtonProps {
  text: string;
  lang?: string | null;
}

export function PronunciationButton({ text, lang }: PronunciationButtonProps) {
  const { isSupported, isPlaying, play, stop } = usePronunciation();

  if (!isSupported) {
    return (
      <button
        aria-label="Play pronunciation"
        disabled
        style={{
          border: 0,
          borderRadius: "50%",
          width: "32px",
          height: "32px",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--surface-2)",
          color: "var(--text-secondary)",
          cursor: "not-allowed",
          flexShrink: 0,
        }}
        title="Speech synthesis is not available in this browser"
        type="button"
      >
        <IconSpeaker size={14} />
      </button>
    );
  }

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const trimmed = text.trim();
    if (!trimmed) return;
    if (isPlaying) {
      stop();
    } else {
      const resolvedLang = lang || detectLanguage(trimmed) || undefined;
      play(trimmed, resolvedLang);
    }
  };

  return (
    <button
      aria-label={isPlaying ? "Stop pronunciation" : "Play pronunciation"}
      onClick={handleClick}
      style={{
        border: 0,
        borderRadius: "50%",
        width: "32px",
        height: "32px",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: isPlaying ? "var(--border-strong)" : "var(--surface-2)",
        color: isPlaying ? "var(--text-primary)" : "var(--link)",
        cursor: "pointer",
        flexShrink: 0,
      }}
      type="button"
    >
      {isPlaying ? <IconStop size={14} /> : <IconSpeaker size={14} />}
    </button>
  );
}
