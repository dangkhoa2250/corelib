import { expect, test } from "vitest";

import { modelBrandFor } from "./modelBrand";

test.each([
  ["01-ai/yi-large", "zeroone"],
  ["meta/llama-3.1-70b-instruct", "meta"],
  ["ai21labs/jamba-1.5-large-instruct", "ai21"],
  ["BAAI/bge-m3", "baai"],
  ["google/gemma-4-31b", "gemini"],
  ["unknown/vendor-model", "fallback"],
])("resolves %s to %s", (modelId, expected) => {
  expect(modelBrandFor(modelId).id).toBe(expected);
});

test("matches model IDs case-insensitively", () => {
  expect(modelBrandFor("META/LLAMA-3.1-70B-INSTRUCT").id).toBe("meta");
});

test("loads model icons from bundled files instead of data URLs", () => {
  expect(modelBrandFor("google/gemma-4-31b").src).not.toMatch(/^data:/);
});

test.each([
  ["community-meta-model", "meta"],
  ["Community-AI21-Model", "ai21"],
  ["embedding-baai-v2", "baai"],
])("recognizes generic creator token %s as %s", (modelId, expected) => {
  expect(modelBrandFor(modelId).id).toBe(expected);
});

test("uses the specific vendor rule before a generic family match", () => {
  expect(modelBrandFor("01-ai/yi-meta").id).toBe("zeroone");
});

test("does not match a creator token embedded in an unrelated word", () => {
  expect(modelBrandFor("metaphor-ai/v1").id).toBe("fallback");
});

// The exact catalogue returned by https://opencode.ai/zen/go/v1/models.
const OPENCODE_GO_MODEL_IDS = [
  "minimax-m3",
  "minimax-m2.7",
  "minimax-m2.5",
  "kimi-k3",
  "kimi-k2.7-code",
  "kimi-k2.6",
  "kimi-k2.5",
  "glm-5.2",
  "glm-5.3",
  "glm-5.1",
  "glm-5",
  "deepseek-v4-pro",
  "deepseek-v4-flash",
  "qwen3.7-max",
  "qwen3.8-max",
  "qwen3.7-plus",
  "qwen3.6-plus",
  "qwen3.5-plus",
  "mimo-v2-pro",
  "mimo-v2-omni",
  "mimo-v2.5-pro",
  "mimo-v2.5",
  "hy3",
  "hy3-preview",
  "gpt-5.6-luna",
  "grok-4.5",
];

test("gives every OpenCode Go model its own brand icon", () => {
  const unbranded = OPENCODE_GO_MODEL_IDS.filter((modelId) => modelBrandFor(modelId).id === "fallback");
  expect(unbranded).toEqual([]);
});

test.each([
  ["minimax-m3", "minimax"],
  ["kimi-k2.7-code", "kimi"],
  ["glm-5.2", "chatglm"],
  ["deepseek-v4-flash", "deepseek"],
  ["qwen3.7-max", "qwen"],
  ["mimo-v2.5-pro", "mimo"],
  ["hy3-preview", "hunyuan"],
  ["gpt-5.6-luna", "openai"],
  ["grok-4.5", "grok"],
])("resolves the OpenCode Go model %s to %s", (modelId, expected) => {
  expect(modelBrandFor(modelId).id).toBe(expected);
});

test.each([
  ["01-ai/yi-large", "zeroone-color.svg"],
  ["meta/llama-3.1-70b-instruct", "meta-color.svg"],
  ["ai21labs/jamba-1.5-large-instruct", "ai21-brand-color.svg"],
  ["google/gemma-4-31b", "gemini-color.svg"],
  ["mistralai/mistral-small", "mistral-color.svg"],
  ["qwen/qwen3", "qwen-color.svg"],
  ["deepseek/deepseek-v3", "deepseek-color.svg"],
])("uses the color asset for %s", (modelId, assetName) => {
  expect(modelBrandFor(modelId).asset).toBe(assetName);
});
