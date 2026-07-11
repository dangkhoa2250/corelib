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

export function IconSettings({ size = 16 }: IconProps) {
  return (
    <svg fill="currentColor" height={size} viewBox="0 0 24 24" width={size}>
      <path d="M19.43 12.98c.04-.32.07-.65.07-.98s-.02-.66-.07-.98l2.11-1.65a.5.5 0 0 0 .12-.64l-2-3.46a.5.5 0 0 0-.61-.22l-2.49 1a7.4 7.4 0 0 0-1.69-.98L14.5 2.42A.49.49 0 0 0 14.02 2h-4a.49.49 0 0 0-.49.42L9.15 5.07c-.6.25-1.16.58-1.69.98l-2.49-1a.5.5 0 0 0-.61.22l-2 3.46a.5.5 0 0 0 .12.64l2.11 1.65c-.04.32-.08.65-.08.98s.03.66.08.98l-2.11 1.65a.5.5 0 0 0-.12.64l2 3.46c.12.22.38.31.61.22l2.49-1c.52.4 1.09.73 1.69.98l.38 2.65c.04.24.24.42.49.42h4c.24 0 .45-.18.49-.42l.38-2.65c.6-.25 1.17-.58 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46a.5.5 0 0 0-.12-.64l-2.11-1.65ZM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5Z" />
    </svg>
  );
}
