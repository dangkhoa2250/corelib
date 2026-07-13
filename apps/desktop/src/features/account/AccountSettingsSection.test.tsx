import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AccountSettingsSection } from "./AccountSettingsSection";
import type { SessionSnapshot } from "../../domain/account";

const mockSession: SessionSnapshot = {
  profile: {
    id: "u-1",
    displayName: "Mai",
    email: "mai@example.test",
    status: "approved",
    role: "member",
    analyticsEnabled: false,
  },
  entitlements: {
    featureKeys: [],
    refreshedAt: "2026-07-13T21:00:00Z",
  },
};

describe("AccountSettingsSection", () => {
  it("displays user profile and enables analytics toggle", () => {
    const onUpdateAnalytics = vi.fn();
    const onSignOut = vi.fn();

    render(
      <AccountSettingsSection
        session={mockSession}
        onUpdateAnalytics={onUpdateAnalytics}
        onSignOut={onSignOut}
      />
    );

    expect(screen.getByText("Mai")).toBeInTheDocument();
    expect(screen.getByText("mai@example.test")).toBeInTheDocument();

    const checkbox = screen.getByLabelText(/Help improve Library/);
    expect(checkbox).not.toBeChecked();

    fireEvent.click(checkbox);
    expect(onUpdateAnalytics).toHaveBeenCalledWith(true);
  });
});
