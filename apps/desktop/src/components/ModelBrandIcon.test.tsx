import { render } from "@testing-library/react";
import { expect, test } from "vitest";

import { ModelBrandIcon } from "./ModelBrandIcon";

test("renders a colored model mark as an image", () => {
  const { container } = render(<ModelBrandIcon modelId="deepseek-v4-flash" />);

  expect(container.querySelector("img")).toHaveAttribute("data-brand", "deepseek");
});

test("renders monochrome model marks as theme-aware masks", () => {
  const { container } = render(<ModelBrandIcon modelId="gpt-5.6-luna" />);

  expect(container.querySelector(".model-brand-icon--mask")).toHaveAttribute("data-brand", "openai");
});

test("falls back to a generic mark for an unknown creator", () => {
  const { container } = render(<ModelBrandIcon modelId="unknown/vendor-model" />);

  expect(container.querySelector(".model-brand-icon--fallback")).toBeInTheDocument();
});
