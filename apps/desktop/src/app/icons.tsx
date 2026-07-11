interface IconProps {
  size?: number;
}

const baseProps = {
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  strokeWidth: 1.8,
  viewBox: "0 0 24 24",
};

export function IconSearch({ size = 15 }: IconProps) {
  return (
    <svg {...baseProps} height={size} width={size}>
      <circle cx="11" cy="11" r="7.5" />
      <line x1="21" x2="16.4" y1="21" y2="16.4" />
    </svg>
  );
}

export function IconLibrary({ size = 16 }: IconProps) {
  return (
    <svg {...baseProps} height={size} width={size}>
      <path d="M2 4h6a3.5 3.5 0 0 1 3.5 3.5V20a2.5 2.5 0 0 0-2.5-2.5H2z" />
      <path d="M22 4h-6a3.5 3.5 0 0 0-3.5 3.5V20a2.5 2.5 0 0 1 2.5-2.5h7z" />
    </svg>
  );
}

export function IconMemora({ size = 16 }: IconProps) {
  return (
    <svg {...baseProps} height={size} width={size}>
      <polygon points="12 3 3 8 12 13 21 8 12 3" />
      <polyline points="3 16 12 21 21 16" />
      <polyline points="3 12 12 17 21 12" />
    </svg>
  );
}

export function IconTrash({ size = 16 }: IconProps) {
  return (
    <svg {...baseProps} height={size} width={size}>
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    </svg>
  );
}
