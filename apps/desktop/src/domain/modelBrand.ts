import ai21 from "@lobehub/icons-static-svg/icons/ai21-brand-color.svg?no-inline";
import baai from "@lobehub/icons-static-svg/icons/baai.svg?no-inline";
import chatglm from "@lobehub/icons-static-svg/icons/chatglm-color.svg?no-inline";
import deepseek from "@lobehub/icons-static-svg/icons/deepseek-color.svg?no-inline";
import gemini from "@lobehub/icons-static-svg/icons/gemini-color.svg?no-inline";
import grok from "@lobehub/icons-static-svg/icons/grok.svg?no-inline";
import hunyuan from "@lobehub/icons-static-svg/icons/hunyuan-color.svg?no-inline";
import kimi from "@lobehub/icons-static-svg/icons/kimi-color.svg?no-inline";
import meta from "@lobehub/icons-static-svg/icons/meta-color.svg?no-inline";
import mimo from "@lobehub/icons-static-svg/icons/xiaomimimo.svg?no-inline";
import minimax from "@lobehub/icons-static-svg/icons/minimax-color.svg?no-inline";
import mistral from "@lobehub/icons-static-svg/icons/mistral-color.svg?no-inline";
import openai from "@lobehub/icons-static-svg/icons/openai.svg?no-inline";
import qwen from "@lobehub/icons-static-svg/icons/qwen-color.svg?no-inline";
import zeroone from "@lobehub/icons-static-svg/icons/zeroone-color.svg?no-inline";

export type ModelBrand =
  | { id: "zeroone" | "meta" | "ai21" | "gemini" | "mistral" | "qwen" | "deepseek" | "minimax" | "kimi" | "chatglm" | "hunyuan"; src: string; asset: string; variant?: "image" }
  // Monochrome marks rely on `currentColor`, so they are painted as a mask to
  // stay legible in both themes.
  | { id: "baai" | "grok" | "mimo" | "openai"; src: string; asset: string; variant: "mask" }
  | { id: "fallback"; src: null; asset: null };

type KnownModelBrand = Exclude<ModelBrand, { id: "fallback" }>;

// Keep vendor prefixes first so an explicit creator is never overridden by a generic token.
const vendorBrands: Array<[string, KnownModelBrand]> = [
  ["01-ai/", { id: "zeroone", src: zeroone, asset: "zeroone-color.svg" }],
  ["meta/", { id: "meta", src: meta, asset: "meta-color.svg" }],
  ["ai21labs/", { id: "ai21", src: ai21, asset: "ai21-brand-color.svg" }],
  ["ai21/", { id: "ai21", src: ai21, asset: "ai21-brand-color.svg" }],
  ["baai/", { id: "baai", src: baai, asset: "baai.svg", variant: "mask" }],
  ["google/", { id: "gemini", src: gemini, asset: "gemini-color.svg" }],
  ["mistralai/", { id: "mistral", src: mistral, asset: "mistral-color.svg" }],
  ["qwen/", { id: "qwen", src: qwen, asset: "qwen-color.svg" }],
  ["deepseek/", { id: "deepseek", src: deepseek, asset: "deepseek-color.svg" }],
  ["x-ai/", { id: "grok", src: grok, asset: "grok.svg", variant: "mask" }],
];

const familyBrands: Array<[string, KnownModelBrand]> = [
  ["meta", { id: "meta", src: meta, asset: "meta-color.svg" }],
  ["llama", { id: "meta", src: meta, asset: "meta-color.svg" }],
  ["ai21", { id: "ai21", src: ai21, asset: "ai21-brand-color.svg" }],
  ["jamba", { id: "ai21", src: ai21, asset: "ai21-brand-color.svg" }],
  ["baai", { id: "baai", src: baai, asset: "baai.svg", variant: "mask" }],
  ["gemma", { id: "gemini", src: gemini, asset: "gemini-color.svg" }],
  ["gemini", { id: "gemini", src: gemini, asset: "gemini-color.svg" }],
  ["mistral", { id: "mistral", src: mistral, asset: "mistral-color.svg" }],
  ["qwen", { id: "qwen", src: qwen, asset: "qwen-color.svg" }],
  ["deepseek", { id: "deepseek", src: deepseek, asset: "deepseek-color.svg" }],
  ["grok", { id: "grok", src: grok, asset: "grok.svg", variant: "mask" }],
  // Creators reachable through OpenCode Go.
  ["minimax", { id: "minimax", src: minimax, asset: "minimax-color.svg" }],
  ["kimi", { id: "kimi", src: kimi, asset: "kimi-color.svg" }],
  ["moonshot", { id: "kimi", src: kimi, asset: "kimi-color.svg" }],
  ["glm", { id: "chatglm", src: chatglm, asset: "chatglm-color.svg" }],
  ["mimo", { id: "mimo", src: mimo, asset: "xiaomimimo.svg", variant: "mask" }],
  ["hunyuan", { id: "hunyuan", src: hunyuan, asset: "hunyuan-color.svg" }],
  ["hy", { id: "hunyuan", src: hunyuan, asset: "hunyuan-color.svg" }],
  ["gpt", { id: "openai", src: openai, asset: "openai.svg", variant: "mask" }],
  ["o1", { id: "openai", src: openai, asset: "openai.svg", variant: "mask" }],
];

// A creator token ends at a delimiter or at the version digits that follow it,
// so `qwen3.7-max` and `hy3` resolve just like `qwen-max` and `hy-3` would.
function hasDelimitedToken(modelId: string, token: string): boolean {
  return new RegExp(`(?:^|[\\/_-])${token}(?=$|[\\/_.-]|\\d)`).test(modelId);
}

export function modelBrandFor(modelId: string): ModelBrand {
  const normalizedId = modelId.toLowerCase();
  // Specific creator prefixes intentionally precede all generic model-family matches.
  const vendorBrand = vendorBrands.find(([prefix]) => normalizedId.startsWith(prefix));
  if (vendorBrand) return vendorBrand[1];

  const familyBrand = familyBrands.find(([token]) => hasDelimitedToken(normalizedId, token));
  return familyBrand?.[1] ?? { id: "fallback", src: null, asset: null };
}
