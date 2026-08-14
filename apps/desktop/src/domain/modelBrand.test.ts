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
