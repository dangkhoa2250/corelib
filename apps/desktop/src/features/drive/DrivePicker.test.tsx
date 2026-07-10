import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import { DrivePicker } from "./DrivePicker";

it("lets a user add a selected PDF", async () => {
  const onAdd = vi.fn().mockResolvedValue(undefined);
  render(
    <DrivePicker
      entries={[{ id: "f1", name: "PGM.pdf", kind: "pdf", parentId: null }]}
      onAdd={onAdd}
      onClose={() => {}}
    />,
  );
  expect(screen.getByRole("button", { name: "Add PGM.pdf" })).toBeInTheDocument();
});

it("calls onAdd with multiple selected ids when clicking Add Selected", async () => {
  const onAdd = vi.fn().mockResolvedValue(undefined);
  render(
    <DrivePicker
      entries={[
        { id: "f1", name: "PDF1.pdf", kind: "pdf", parentId: null },
        { id: "f2", name: "PDF2.pdf", kind: "pdf", parentId: null },
      ]}
      onAdd={onAdd}
      onClose={() => {}}
    />,
  );

  const checkbox1 = screen.getByLabelText("📄 PDF1.pdf");
  const checkbox2 = screen.getByLabelText("📄 PDF2.pdf");

  await userEvent.click(checkbox1);
  await userEvent.click(checkbox2);

  const addButton = screen.getByRole("button", { name: "Add Selected (2)" });
  await userEvent.click(addButton);

  expect(onAdd).toHaveBeenCalledWith(["f1", "f2"]);
});

it("navigates up to the actual parent returned for a nested folder", async () => {
  const onNavigateFolder = vi.fn();
  render(
    <DrivePicker
      entries={[{ id: "nested", name: "Nested", kind: "folder", parentId: "actual-parent" }]}
      parentId="actual-parent"
      onNavigateFolder={onNavigateFolder}
      onAdd={vi.fn().mockResolvedValue(undefined)}
      onClose={() => {}}
    />,
  );

  await userEvent.click(screen.getByRole("button", { name: "← Up" }));
  expect(onNavigateFolder).toHaveBeenCalledWith("actual-parent");
});
