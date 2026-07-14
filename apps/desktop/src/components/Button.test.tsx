import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "./Button";

describe("Button", () => {
  it("renders a semantic secondary button", () => {
    render(<Button variant="secondary">Practice All</Button>);

    expect(screen.getByRole("button", { name: "Practice All" })).toHaveClass("ui-button--secondary");
  });
});
