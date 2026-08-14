import cerebras from "@lobehub/icons-static-svg/icons/cerebras-color.svg?no-inline";
import google from "@lobehub/icons-static-svg/icons/google-color.svg?no-inline";
import googleCloud from "@lobehub/icons-static-svg/icons/googlecloud-color.svg?no-inline";
import nvidia from "@lobehub/icons-static-svg/icons/nvidia-color.svg?no-inline";
import opencode from "@lobehub/icons-static-svg/icons/opencode.svg?no-inline";
import openrouter from "@lobehub/icons-static-svg/icons/openrouter.svg?no-inline";

import type { AiProviderId } from "./ai";

export type ProviderBrand =
  | { id: "google" | "google-cloud" | "nvidia" | "cerebras"; src: string; asset: string; variant?: "image" }
  | { id: "openrouter" | "opencode-go"; src: string; asset: string; variant: "mask" }
  | { id: "fallback"; src: null; asset: null };

const providerBrands: Record<AiProviderId, ProviderBrand> = {
  "google-ai-studio": { id: "google", src: google, asset: "google-color.svg" },
  "google-translation": { id: "google-cloud", src: googleCloud, asset: "googlecloud-color.svg" },
  nvidia: { id: "nvidia", src: nvidia, asset: "nvidia-color.svg" },
  openrouter: { id: "openrouter", src: openrouter, asset: "openrouter.svg", variant: "mask" },
  cerebras: { id: "cerebras", src: cerebras, asset: "cerebras-color.svg" },
  "opencode-go": { id: "opencode-go", src: opencode, asset: "opencode.svg", variant: "mask" },
};

export function providerBrandFor(providerId: AiProviderId): ProviderBrand {
  return providerBrands[providerId];
}
