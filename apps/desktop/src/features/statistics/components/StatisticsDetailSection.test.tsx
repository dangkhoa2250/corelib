import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { StatisticsDetailSection } from "./StatisticsDetailSection";

test("keeps loading and errors inside an embedded detail section", async () => {
  const onRetry = vi.fn();
  const { rerender } = render(
    <StatisticsDetailSection title="Activity" state="loading" />,
  );
  expect(screen.getByRole("status")).toBeInTheDocument();

  rerender(
    <StatisticsDetailSection
      title="Activity"
      state="error"
      errorMessage="Unable to load"
      onRetry={onRetry}
    />,
  );
  await userEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(onRetry).toHaveBeenCalledOnce();
  expect(screen.getByText("Activity").closest("section")).toHaveClass(
    "statistics-detail-section",
  );
});
