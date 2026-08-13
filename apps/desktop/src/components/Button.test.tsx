import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "./Button";

describe("Button", () => {
  it("renders a semantic secondary button", () => {
    render(<Button variant="secondary">Practice All</Button>);

    expect(screen.getByRole("button", { name: "Practice All" })).toHaveClass("ui-button--secondary");
  });

  it("supports destructive actions and native button semantics", () => {
    render(
      <Button disabled type="submit" variant="destructive">
        Remove key
      </Button>,
    );

    expect(screen.getByRole("button", { name: "Remove key" })).toHaveClass("ui-button", "ui-button--destructive");
    expect(screen.getByRole("button", { name: "Remove key" })).toHaveAttribute("type", "submit");
    expect(screen.getByRole("button", { name: "Remove key" })).toBeDisabled();
  });
});
