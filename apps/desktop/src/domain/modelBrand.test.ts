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

test("uses the specific vendor rule before a generic family match", () => {
  expect(modelBrandFor("01-ai/yi-large").id).toBe("zeroone");
});
