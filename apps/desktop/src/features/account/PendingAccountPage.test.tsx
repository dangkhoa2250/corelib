import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PendingAccountPage } from "./PendingAccountPage";

describe("PendingAccountPage", () => {
  it("displays pending status and has back to sign in button", () => {
    const onSignOut = vi.fn();
    render(<PendingAccountPage onSignOut={onSignOut} />);
    expect(screen.getByText("Approval Pending")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back to Sign In" }));
    expect(onSignOut).toHaveBeenCalled();
  });
});
