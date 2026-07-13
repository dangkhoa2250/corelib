import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RejectedAccountPage } from "./RejectedAccountPage";

describe("RejectedAccountPage", () => {
  it("displays rejected status and only has sign out button", () => {
    const onSignOut = vi.fn();
    render(<RejectedAccountPage onSignOut={onSignOut} />);
    expect(screen.getByText("Access Denied")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Back to Sign In" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sign Out" }));
    expect(onSignOut).toHaveBeenCalled();
  });
});
