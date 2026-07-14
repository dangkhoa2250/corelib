import ai21 from "@lobehub/icons-static-svg/icons/ai21.svg";
import baai from "@lobehub/icons-static-svg/icons/baai.svg";
import deepseek from "@lobehub/icons-static-svg/icons/deepseek.svg";
import gemini from "@lobehub/icons-static-svg/icons/gemini.svg";
import grok from "@lobehub/icons-static-svg/icons/grok.svg";
import meta from "@lobehub/icons-static-svg/icons/meta.svg";
import mistral from "@lobehub/icons-static-svg/icons/mistral.svg";
import qwen from "@lobehub/icons-static-svg/icons/qwen.svg";
import zeroone from "@lobehub/icons-static-svg/icons/zeroone.svg";

export type ModelBrand =
  | { id: "zeroone" | "meta" | "ai21" | "baai" | "gemini" | "mistral" | "qwen" | "deepseek" | "grok"; src: string }
  | { id: "fallback"; src: null };

const vendorBrands: Array<[string, Exclude<ModelBrand, { id: "fallback" }>]> = [
  ["01-ai/", { id: "zeroone", src: zeroone }],
  ["meta/", { id: "meta", src: meta }],
  ["ai21labs/", { id: "ai21", src: ai21 }],
  ["ai21/", { id: "ai21", src: ai21 }],
  ["baai/", { id: "baai", src: baai }],
  ["google/", { id: "gemini", src: gemini }],
  ["mistralai/", { id: "mistral", src: mistral }],
  ["qwen/", { id: "qwen", src: qwen }],
  ["deepseek/", { id: "deepseek", src: deepseek }],
  ["x-ai/", { id: "grok", src: grok }],
];

const familyBrands: Array<[string, Exclude<ModelBrand, { id: "fallback" }>]> = [
  ["llama", { id: "meta", src: meta }],
  ["jamba", { id: "ai21", src: ai21 }],
  ["gemma", { id: "gemini", src: gemini }],
  ["gemini", { id: "gemini", src: gemini }],
  ["mistral", { id: "mistral", src: mistral }],
  ["qwen", { id: "qwen", src: qwen }],
  ["deepseek", { id: "deepseek", src: deepseek }],
  ["grok", { id: "grok", src: grok }],
];

export function modelBrandFor(modelId: string): ModelBrand {
  const normalizedId = modelId.toLowerCase();
  const vendorBrand = vendorBrands.find(([prefix]) => normalizedId.startsWith(prefix));
  if (vendorBrand) return vendorBrand[1];

  const familyBrand = familyBrands.find(([token]) => normalizedId.includes(token));
  return familyBrand?.[1] ?? { id: "fallback", src: null };
}
