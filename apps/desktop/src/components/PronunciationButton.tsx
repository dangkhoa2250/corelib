import { IconSpeaker } from "../app/icons";
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
          background: "#e5e5ea",
          color: "#8e8e93",
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

  const handleClick = () => {
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
        background: isPlaying ? "#d1d1d6" : "#e5f1ff",
        color: isPlaying ? "#3a3a3c" : "#007aff",
        cursor: "pointer",
        flexShrink: 0,
      }}
      type="button"
    >
      {isPlaying ? (
        <span style={{ fontSize: "14px", lineHeight: 1, fontWeight: 700 }}>■</span>
      ) : (
        <IconSpeaker size={14} />
      )}
    </button>
  );
}
