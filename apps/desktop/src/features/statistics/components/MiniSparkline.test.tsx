import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { MiniSparkline } from "./MiniSparkline";

test("renders a labelled SVG line for finite trend points", () => {
  render(<MiniSparkline label="Active time trend" points={[10, 16, 14, 24]} />);

  const sparkline = screen.getByRole("img", { name: "Active time trend" });
  expect(sparkline.tagName).toBe("svg");
  expect(sparkline.querySelector("path")).toHaveAttribute("fill", "none");
  expect(sparkline.querySelector("path")).toHaveAttribute("stroke", "var(--statistics-accent)");
});

test("renders an empty baseline when fewer than two points are usable", () => {
  render(<MiniSparkline label="Active days trend" points={[Number.NaN, 8]} />);

  expect(screen.getByRole("img", { name: "Active days trend" }).querySelector("line")).toBeInTheDocument();
});
