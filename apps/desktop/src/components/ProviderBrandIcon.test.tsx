import { render } from "@testing-library/react";
import { expect, test } from "vitest";

import { ProviderBrandIcon } from "./ProviderBrandIcon";

test("renders the monochrome OpenRouter mark as a theme-aware mask", () => {
  const { container } = render(<ProviderBrandIcon providerId="openrouter" />);

  expect(container.querySelector(".provider-brand-icon--mask")).toHaveAttribute("data-brand", "openrouter");
});
