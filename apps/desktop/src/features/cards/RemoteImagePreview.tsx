import { useEffect, useState } from "react";

import type { RemoteImagePreviewPayload } from "../../domain/media";
import { fetchRemoteImagePreview } from "../../lib/media";

export interface RemoteImagePreviewProps {
  url: string;
  fallbackUrl?: string;
  alt?: string;
  fetchPreview?: (url: string) => Promise<RemoteImagePreviewPayload>;
}

function objectUrl(payload: RemoteImagePreviewPayload): string {
  const binary = atob(payload.dataBase64);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return URL.createObjectURL(new Blob([bytes], { type: payload.mimeType }));
}

export function RemoteImagePreview({ url, fallbackUrl, alt = "", fetchPreview = fetchRemoteImagePreview }: RemoteImagePreviewProps) {
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    setLocalUrl(null);
    void (async () => {
      const candidates = [...new Set([url, fallbackUrl].filter((candidate): candidate is string => Boolean(candidate)))];
      for (const candidate of candidates) {
        try {
          const nextUrl = objectUrl(await fetchPreview(candidate));
          if (cancelled) {
            URL.revokeObjectURL(nextUrl);
            return;
          }
          setLocalUrl(nextUrl);
          return;
        } catch {
          // Try the provider's original image when its thumbnail endpoint is
          // unavailable or transiently rejects the request.
        }
      }
      if (!cancelled) setFailed(true);
    })();

    return () => {
      cancelled = true;
      setLocalUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return null;
      });
    };
  }, [fallbackUrl, fetchPreview, url]);

  if (failed) {
    return <span className="remote-image-preview remote-image-preview--fallback" role="img" aria-label={alt || "Image preview unavailable"}>Image preview unavailable</span>;
  }
  if (!localUrl) {
    return <span className="remote-image-preview remote-image-preview--fallback" role="status">Loading preview…</span>;
  }
  return <img alt={alt} className="remote-image-preview" src={localUrl} />;
}
