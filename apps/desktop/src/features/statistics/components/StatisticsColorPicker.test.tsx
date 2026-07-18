import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { StatisticsColorPicker } from "./StatisticsColorPicker";

test("renders preset color swatches", () => {
  render(<StatisticsColorPicker baseColor="#3778d4" onChange={vi.fn()} />);
  expect(screen.getByText(/Chart color/i)).toBeInTheDocument();
  expect(screen.getAllByRole("button")).toHaveLength(8);
});

test("clicking swatch calls onChange", async () => {
  const onChange = vi.fn();
  const user = userEvent.setup();
  render(<StatisticsColorPicker baseColor="#3778d4" onChange={onChange} />);
  await user.click(screen.getByLabelText(/Set chart color to #2ecc71/i));
  expect(onChange).toHaveBeenCalledWith("#2ecc71");
});

test("selected swatch has aria-pressed true", () => {
  render(<StatisticsColorPicker baseColor="#e84c3d" onChange={vi.fn()} />);
  expect(
    screen.getByLabelText(/Set chart color to #e84c3d/i),
  ).toHaveAttribute("aria-pressed", "true");
});
