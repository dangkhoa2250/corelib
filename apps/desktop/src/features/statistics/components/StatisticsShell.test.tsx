import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { StatisticsShell } from "./StatisticsShell";

test("renders title and children", () => {
  render(<StatisticsShell title="Statistics"><div>body content</div></StatisticsShell>);
  expect(screen.getByText("Statistics")).toBeInTheDocument();
  expect(screen.getByText("body content")).toBeInTheDocument();
});

test("uses ScrollArea and reserves the vertical thumb inset", () => {
  render(<StatisticsShell title="Statistics"><div>body</div></StatisticsShell>);
  expect(screen.getByTestId("statistics-scroll-area")).toHaveStyle({ overflow: "hidden" });
  expect(screen.getByTestId("statistics-scroll-content")).toHaveClass("statistics-shell__content");
});

test("calls onBack when back button is clicked", async () => {
  const user = userEvent.setup();
  const onBack = vi.fn();
  render(<StatisticsShell title="Statistics" onBack={onBack}><div>body</div></StatisticsShell>);
  await user.click(screen.getByRole("button"));
  expect(onBack).toHaveBeenCalledOnce();
});

test("content has correct padding for thumb inset", () => {
  render(<StatisticsShell title="Test"><span>child</span></StatisticsShell>);
  const content = screen.getByTestId("statistics-scroll-content");
  expect(content).toHaveStyle({ padding: "28px 20px 40px 28px" });
});
