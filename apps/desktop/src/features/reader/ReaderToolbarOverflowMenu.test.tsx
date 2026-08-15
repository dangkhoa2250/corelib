import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { ReaderToolbarOverflowMenu } from "./ReaderToolbarOverflowMenu";

test("opens a menu exposing Tag and Zoom controls", async () => {
  const user = userEvent.setup();
  const onToggleTag = vi.fn();
  const onZoomBy = vi.fn();
  render(
    <ReaderToolbarOverflowMenu
      zoomPercent={120}
      onZoomBy={onZoomBy}
      currentTagged
      currentPage={3}
      pageTags={[{ id: "t1", documentId: "doc-1", page: 3 }]}
      onToggleTag={onToggleTag}
      onSelectTaggedPage={vi.fn()}
    />,
  );

  await user.click(screen.getByRole("button", { name: "More actions" }));
  expect(screen.getByText("✓ Page 3 tagged")).toBeInTheDocument();
  expect(screen.getByText("120%")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Zoom in" }));
  expect(onZoomBy).toHaveBeenCalledWith(0.1);

  await user.click(screen.getByText("✓ Page 3 tagged"));
  expect(onToggleTag).toHaveBeenCalledOnce();
});
