export type DesktopPlatform = "windows" | "macos" | "linux" | "unknown";

export interface PlatformNavigator {
  platform?: string;
  userAgent?: string;
}

export function detectDesktopPlatform(navigatorLike: PlatformNavigator): DesktopPlatform {
  const signature = `${navigatorLike.platform ?? ""} ${navigatorLike.userAgent ?? ""}`.toLowerCase();
  if (signature.includes("win")) return "windows";
  if (signature.includes("mac")) return "macos";
  if (signature.includes("linux") || signature.includes("x11")) return "linux";
  return "unknown";
}

export function desktopPlatform(): DesktopPlatform {
  return typeof navigator === "undefined" ? "unknown" : detectDesktopPlatform(navigator);
}

export function primaryShortcut(key: string, platform = desktopPlatform()): string {
  return platform === "macos" ? `⌘${key}` : `Ctrl+${key}`;
}
