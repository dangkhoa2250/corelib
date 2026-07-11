import { PronunciationButton } from "../../components/PronunciationButton";

export interface CardSelectionToolbarProps {
  quote: string;
  onCreate: () => void;
  onDismiss: () => void;
}

function selectedTextSummary(quote: string): string {
  const normalized = quote.trim().replace(/\s+/g, " ");
  return normalized.length > 140 ? `${normalized.slice(0, 137)}…` : normalized;
}

export function CardSelectionToolbar({
  quote,
  onCreate,
  onDismiss,
}: CardSelectionToolbarProps) {
  return (
    <aside
      aria-label="Selected text actions"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        maxWidth: "min(540px, calc(100vw - 32px))",
        padding: "10px 12px",
        border: "1px solid rgb(0 0 0 / 9%)",
        borderRadius: "14px",
        background: "rgb(255 255 255 / 94%)",
        boxShadow: "0 12px 32px rgb(0 0 0 / 18%)",
        backdropFilter: "blur(18px)",
      }}
    >
      <p
        style={{
          flex: "1 1 auto",
          minWidth: 0,
          margin: 0,
          overflow: "hidden",
          color: "#48484a",
          fontSize: "13px",
          lineHeight: 1.35,
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {selectedTextSummary(quote)}
      </p>
      <div style={{ display: "flex", flex: "0 0 auto", gap: "8px" }}>
        <PronunciationButton text={quote} />
        <button
          aria-label="Dismiss"
          onClick={() => onDismiss()}
          style={{
            border: 0,
            borderRadius: "999px",
            padding: "7px 10px",
            color: "#3a3a3c",
            background: "#e5e5ea",
            cursor: "pointer",
          }}
          type="button"
        >
          Dismiss
        </button>
        <button
          aria-label="Create flashcard"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onCreate()}
          style={{
            border: 0,
            borderRadius: "999px",
            padding: "7px 12px",
            color: "#fff",
            background: "#007aff",
            cursor: "pointer",
            fontWeight: 600,
          }}
          type="button"
        >
          Create flashcard
        </button>
      </div>
    </aside>
  );
}
