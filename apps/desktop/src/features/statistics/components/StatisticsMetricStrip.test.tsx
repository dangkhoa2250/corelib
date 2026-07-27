import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { StatisticsMetricStrip } from "./StatisticsMetricStrip";

test("renders semantic icon-free primary and secondary metrics", () => {
  render(
    <StatisticsMetricStrip
      ariaLabel="Reading summary"
      metrics={[
        { id: "active", label: "Active time", value: "3m", emphasis: "primary" },
        { id: "sessions", label: "Sessions", value: "10", emphasis: "secondary" },
      ]}
    />,
  );

  expect(screen.getByRole("list", { name: "Reading summary" })).toBeInTheDocument();
  expect(screen.getByText("Active time").tagName).toBe("DT");
  expect(screen.getByText("3m").tagName).toBe("DD");
  expect(document.querySelector(".statistics-kpi-card__icon")).toBeNull();
});
