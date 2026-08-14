import { expect, test } from "vitest";

import type { AiProviderId } from "./ai";
import { providerBrandFor } from "./providerBrand";

test.each([
  ["google-ai-studio", "google", "google-color.svg"],
  ["google-translation", "google-cloud", "googlecloud-color.svg"],
  ["nvidia", "nvidia", "nvidia-color.svg"],
  ["openrouter", "openrouter", "openrouter.svg"],
  ["cerebras", "cerebras", "cerebras-color.svg"],
])("resolves %s to its provider brand", (providerId, id, assetName) => {
  const brand = providerBrandFor(providerId as AiProviderId);
  expect(brand.id).toBe(id);
  expect(brand.asset).toBe(assetName);
});

test("loads provider icons from bundled files instead of data URLs", () => {
  expect(providerBrandFor("google-ai-studio").src).not.toMatch(/^data:/);
});
