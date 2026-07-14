import cerebras from "@lobehub/icons-static-svg/icons/cerebras-color.svg";
import google from "@lobehub/icons-static-svg/icons/google-color.svg";
import googleCloud from "@lobehub/icons-static-svg/icons/googlecloud-color.svg";
import nvidia from "@lobehub/icons-static-svg/icons/nvidia-color.svg";

import type { AiProviderId } from "./ai";

export type ProviderBrand =
  | { id: "google" | "google-cloud" | "nvidia" | "cerebras"; src: string; asset: string }
  | { id: "fallback"; src: null; asset: null };

const providerBrands: Record<AiProviderId, ProviderBrand> = {
  "google-ai-studio": { id: "google", src: google, asset: "google-color.svg" },
  "google-translation": { id: "google-cloud", src: googleCloud, asset: "googlecloud-color.svg" },
  nvidia: { id: "nvidia", src: nvidia, asset: "nvidia-color.svg" },
  openrouter: { id: "fallback", src: null, asset: null },
  cerebras: { id: "cerebras", src: cerebras, asset: "cerebras-color.svg" },
};

export function providerBrandFor(providerId: AiProviderId): ProviderBrand {
  return providerBrands[providerId];
}
