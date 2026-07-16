import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";

import { MemoraSettingsSection } from "./MemoraSettingsSection";

test("edits the new-card limit and keeps advanced settings collapsed", async () => {
  const user = userEvent.setup();
  const save = vi.fn().mockResolvedValue({
    newCardsPerDay: 0,
    desiredRetention: 0.90,
  });
  render(
    <MemoraSettingsSection
      load={vi.fn().mockResolvedValue({
        newCardsPerDay: 20,
        desiredRetention: 0.90,
      })}
      save={save}
    />,
  );

  const limit = await screen.findByLabelText("New cards per day");
  expect(limit).toHaveValue(20);
  expect(screen.queryByLabelText("Desired retention")).not.toBeInTheDocument();
  await user.clear(limit);
  await user.type(limit, "0");
  await user.click(screen.getByRole("button", { name: "Save Memora settings" }));
  expect(save).toHaveBeenCalledWith({
    newCardsPerDay: 0,
    desiredRetention: 0.90,
  });
});

test("shows safe advanced settings without a restore-defaults action", async () => {
  const user = userEvent.setup();
  const save = vi.fn().mockResolvedValue({
    newCardsPerDay: 20,
    desiredRetention: 0.90,
  });
  render(
    <MemoraSettingsSection
      load={vi.fn().mockResolvedValue({
        newCardsPerDay: 40,
        desiredRetention: 0.95,
      })}
      save={save}
    />,
  );

  await user.click(await screen.findByRole("button", { name: "Advanced" }));
  expect(screen.getByLabelText("Desired retention")).toHaveValue(95);
  expect(screen.getByText("1 minute → 10 minutes")).toBeInTheDocument();
  expect(screen.getByText("10 minutes")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Restore defaults" })).not.toBeInTheDocument();
});
