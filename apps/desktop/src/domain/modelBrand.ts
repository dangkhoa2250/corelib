import ai21 from "@lobehub/icons-static-svg/icons/ai21-brand-color.svg?no-inline";
import baai from "@lobehub/icons-static-svg/icons/baai.svg?no-inline";
import deepseek from "@lobehub/icons-static-svg/icons/deepseek-color.svg?no-inline";
import gemini from "@lobehub/icons-static-svg/icons/gemini-color.svg?no-inline";
import grok from "@lobehub/icons-static-svg/icons/grok.svg?no-inline";
import meta from "@lobehub/icons-static-svg/icons/meta-color.svg?no-inline";
import mistral from "@lobehub/icons-static-svg/icons/mistral-color.svg?no-inline";
import qwen from "@lobehub/icons-static-svg/icons/qwen-color.svg?no-inline";
import zeroone from "@lobehub/icons-static-svg/icons/zeroone-color.svg?no-inline";

export type ModelBrand =
  | { id: "zeroone" | "meta" | "ai21" | "baai" | "gemini" | "mistral" | "qwen" | "deepseek" | "grok"; src: string; asset: string }
  | { id: "fallback"; src: null; asset: null };

type KnownModelBrand = Exclude<ModelBrand, { id: "fallback" }>;

// Keep vendor prefixes first so an explicit creator is never overridden by a generic token.
const vendorBrands: Array<[string, KnownModelBrand]> = [
  ["01-ai/", { id: "zeroone", src: zeroone, asset: "zeroone-color.svg" }],
  ["meta/", { id: "meta", src: meta, asset: "meta-color.svg" }],
  ["ai21labs/", { id: "ai21", src: ai21, asset: "ai21-brand-color.svg" }],
  ["ai21/", { id: "ai21", src: ai21, asset: "ai21-brand-color.svg" }],
  ["baai/", { id: "baai", src: baai, asset: "baai.svg" }],
  ["google/", { id: "gemini", src: gemini, asset: "gemini-color.svg" }],
  ["mistralai/", { id: "mistral", src: mistral, asset: "mistral-color.svg" }],
  ["qwen/", { id: "qwen", src: qwen, asset: "qwen-color.svg" }],
  ["deepseek/", { id: "deepseek", src: deepseek, asset: "deepseek-color.svg" }],
  ["x-ai/", { id: "grok", src: grok, asset: "grok.svg" }],
];

const familyBrands: Array<[string, KnownModelBrand]> = [
  ["meta", { id: "meta", src: meta, asset: "meta-color.svg" }],
  ["llama", { id: "meta", src: meta, asset: "meta-color.svg" }],
  ["ai21", { id: "ai21", src: ai21, asset: "ai21-brand-color.svg" }],
  ["jamba", { id: "ai21", src: ai21, asset: "ai21-brand-color.svg" }],
  ["baai", { id: "baai", src: baai, asset: "baai.svg" }],
  ["gemma", { id: "gemini", src: gemini, asset: "gemini-color.svg" }],
  ["gemini", { id: "gemini", src: gemini, asset: "gemini-color.svg" }],
  ["mistral", { id: "mistral", src: mistral, asset: "mistral-color.svg" }],
  ["qwen", { id: "qwen", src: qwen, asset: "qwen-color.svg" }],
  ["deepseek", { id: "deepseek", src: deepseek, asset: "deepseek-color.svg" }],
  ["grok", { id: "grok", src: grok, asset: "grok.svg" }],
];

function hasDelimitedToken(modelId: string, token: string): boolean {
  return new RegExp(`(?:^|[\\/_-])${token}(?=$|[\\/_-])`).test(modelId);
}

export function modelBrandFor(modelId: string): ModelBrand {
  const normalizedId = modelId.toLowerCase();
  // Specific creator prefixes intentionally precede all generic model-family matches.
  const vendorBrand = vendorBrands.find(([prefix]) => normalizedId.startsWith(prefix));
  if (vendorBrand) return vendorBrand[1];

  const familyBrand = familyBrands.find(([token]) => hasDelimitedToken(normalizedId, token));
  return familyBrand?.[1] ?? { id: "fallback", src: null, asset: null };
}
