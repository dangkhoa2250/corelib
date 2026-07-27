import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { AdminAnalyticsRangePicker } from "./AdminAnalyticsRangePicker";

test("keeps server analytics ranges isolated", () => {
  render(<AdminAnalyticsRangePicker range="30d" onChange={vi.fn()} />);
  expect(screen.getByRole("button", { name: "30 days" })).toHaveAttribute("aria-pressed", "true");
});
