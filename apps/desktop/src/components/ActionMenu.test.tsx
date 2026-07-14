import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ActionMenu } from "./ActionMenu";

describe("ActionMenu", () => {
  it("runs an action then closes its menu", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();

    render(<ActionMenu label="Study" items={[{ label: "Review Due", onSelect }]} />);

    await user.click(screen.getByRole("button", { name: "Study" }));
    await user.click(screen.getByRole("menuitem", { name: "Review Due" }));

    expect(onSelect).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
