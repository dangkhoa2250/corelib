import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";

import { CardSelectionToolbar } from "./CardSelectionToolbar";

test("offers accessible controls for a selected passage", async () => {
  const user = userEvent.setup();
  const onCreate = vi.fn();
  const onDismiss = vi.fn();

  render(
    <CardSelectionToolbar
      quote="A vector space is closed under addition."
      onCreate={onCreate}
      onDismiss={onDismiss}
    />,
  );

  expect(screen.getByText("A vector space is closed under addition.")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Create flashcard" }));
  await user.click(screen.getByRole("button", { name: "Dismiss" }));

  expect(onCreate).toHaveBeenCalledExactlyOnceWith();
  expect(onDismiss).toHaveBeenCalledExactlyOnceWith();
});
