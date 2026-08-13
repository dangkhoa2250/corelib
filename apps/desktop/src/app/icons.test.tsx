import { render } from "@testing-library/react";
import { test, expect } from "vitest";

import { IconMemora } from "./icons";

test("renders the generated Memora card mark at a more legible default size", () => {
  const { container } = render(<IconMemora />);

  const icon = container.firstElementChild;
  if (!icon) throw new Error("Memora icon did not render");

  expect(icon).toHaveStyle({ height: "18px", width: "18px" });
  expect(icon.getAttribute("style")).toContain("mask:");
  expect(icon).toHaveStyle({ filter: "brightness(1.25) contrast(1.12)" });
});
