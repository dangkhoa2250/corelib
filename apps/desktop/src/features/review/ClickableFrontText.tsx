interface ClickableFrontTextProps {
  text: string;
  frontLanguage: string | null;
  selectedWord: string | null;
  onWordSelect: (word: string) => void;
}

export function ClickableFrontText({
  text,
  frontLanguage,
  selectedWord,
  onWordSelect,
}: ClickableFrontTextProps) {
  if (!frontLanguage) {
    return <>{text}</>;
  }

  // Tokenize using Unicode property escape for letters
  // Includes hyphens and apostrophes inside words (e.g. don't, self-esteem, l'amour)
  const tokenRegex = /(\p{L}+(?:['’]\p{L}+)*|[^\p{L}]+)/gu;
  const tokens = text.match(tokenRegex) || [];

  return (
    <>
      {tokens.map((token, index) => {
        const isWord = /\p{L}/u.test(token);
        if (isWord) {
          // Normalize by trimming leading/trailing non-letters/non-digits
          const normalized = token.replace(/^[^a-zA-Z0-9\p{L}]+|[^a-zA-Z0-9\p{L}]+$/gu, "");
          const isSelected = selectedWord === normalized;

          return (
            <button
              key={index}
              type="button"
              onClick={(e) => {
                e.stopPropagation(); // Stop propagation to avoid flipping the card!
                onWordSelect(normalized);
              }}
              aria-label={`Hear '${normalized}' in YouGlish`}
              style={{
                background: isSelected
                  ? "rgba(14, 165, 233, 0.2)" // pale blue fill
                  : "transparent",
                border: "none",
                borderRadius: "4px",
                padding: "0 2px",
                margin: "0 -2px",
                color: "inherit",
                font: "inherit",
                cursor: "pointer",
                display: "inline",
                outline: "none",
                transition: "background 0.2s ease",
              }}
              onMouseEnter={(e) => {
                if (!isSelected) {
                  e.currentTarget.style.background = "rgba(14, 165, 233, 0.08)";
                }
              }}
              onMouseLeave={(e) => {
                if (!isSelected) {
                  e.currentTarget.style.background = "transparent";
                }
              }}
              onFocus={(e) => {
                if (!isSelected) {
                  e.currentTarget.style.background = "rgba(14, 165, 233, 0.08)";
                }
              }}
              onBlur={(e) => {
                if (!isSelected) {
                  e.currentTarget.style.background = "transparent";
                }
              }}
            >
              {token}
            </button>
          );
        } else {
          return <span key={index}>{token}</span>;
        }
      })}
    </>
  );
}
