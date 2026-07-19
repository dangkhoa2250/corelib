import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { StatisticsPeriodPicker } from "./StatisticsPeriodPicker";

test("navigates periods and prevents moving past the current period", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(<StatisticsPeriodPicker period={{ unit: "month", anchorLocalDay: "2026-07-01" }} onChange={onChange} today="2026-07-19" />);
  expect(screen.getByRole("button", { name: "Next month" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Previous month" }));
  expect(onChange).toHaveBeenCalledWith({ unit: "month", anchorLocalDay: "2026-06-01" });
});

test("switching units resets to the matching current calendar period", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(<StatisticsPeriodPicker period={{ unit: "month", anchorLocalDay: "2026-06-01" }} onChange={onChange} today="2026-07-19" />);
  await user.click(screen.getByRole("button", { name: "Week" }));
  expect(onChange).toHaveBeenCalledWith({ unit: "week", anchorLocalDay: "2026-07-13" });
});
