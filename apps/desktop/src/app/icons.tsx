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

export function IconArrowLeft({ size = 16 }: IconProps) {
  return (
    <svg {...baseProps} height={size} width={size}>
      <path d="M19 12H5" />
      <polyline points="12 19 5 12 12 5" />
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
    <svg {...baseProps} height={size} width={size}>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.51a2 2 0 0 1 1-1.72l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function IconEye({ size = 16 }: IconProps) {
  return (
    <svg {...baseProps} height={size} width={size}>
      <path d="M2.5 12s3.2-5 9.5-5 9.5 5 9.5 5-3.2 5-9.5 5-9.5-5-9.5-5Z" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  );
}

export function IconEyeOff({ size = 16 }: IconProps) {
  return (
    <svg {...baseProps} height={size} width={size}>
      <path d="m3 3 18 18" />
      <path d="M10.6 6.2A10.5 10.5 0 0 1 12 6c6.3 0 9.5 6 9.5 6a16.7 16.7 0 0 1-3.1 3.5M6.2 6.9C3.8 8.5 2.5 12 2.5 12s3.2 6 9.5 6c1 0 1.9-.1 2.7-.4" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </svg>
  );
}

export function IconAppearance({ size = 16 }: IconProps) {
  return (
    <svg {...baseProps} height={size} width={size}>
      <circle cx="12" cy="12" r="5" />
      <line x1="12" x2="12" y1="1" y2="3" />
      <line x1="12" x2="12" y1="21" y2="23" />
      <line x1="4.22" x2="5.64" y1="4.22" y2="5.64" />
      <line x1="18.36" x2="19.78" y1="18.36" y2="19.78" />
      <line x1="1" x2="3" y1="12" y2="12" />
      <line x1="21" x2="23" y1="12" y2="12" />
      <line x1="4.22" x2="5.64" y1="19.78" y2="18.36" />
      <line x1="18.36" x2="19.78" y1="5.64" y2="4.22" />
    </svg>
  );
}

export function IconSpeaker({ size = 16 }: IconProps) {
  return (
    <svg {...baseProps} height={size} width={size}>
      <path d="M11 5 6 9H2v6h4l5 4V5Z" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
    </svg>
  );
}

export function IconStop({ size = 14 }: IconProps) {
  return (
    <svg {...baseProps} height={size} width={size}>
      <rect x="4" y="4" width="16" height="16" rx="2" />
    </svg>
  );
}

export function IconChevronDown({ size = 16 }: IconProps) {
  return (
    <svg {...baseProps} height={size} width={size}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

export function IconCheck({ size = 16 }: IconProps) {
  return (
    <svg {...baseProps} height={size} width={size}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export function IconCloud({ size = 16 }: IconProps) {
  return (
    <svg {...baseProps} height={size} width={size}>
      <path d="M17.5 19A4.5 4.5 0 0 0 22 14.5c0-2.22-1.6-4.07-3.73-4.43A6 6 0 0 0 6.5 11c-2.3 0-4.22 1.68-4.48 4A4 4 0 0 0 6 19h11.5Z" />
    </svg>
  );
}
