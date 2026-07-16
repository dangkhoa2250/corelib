import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AccountGate } from "./AccountGate";
import type { AccountApi, SessionSnapshot } from "../../domain/account";

const mockApi = (overrides: Partial<AccountApi> = {}): AccountApi => ({
  register: vi.fn(),
  signIn: vi.fn(),
  currentSession: vi.fn().mockRejectedValue(new Error("No session")),
  signOut: vi.fn(),
  setAnalyticsEnabled: vi.fn(),
  sendAnalytics: vi.fn(),
  adminListUsers: vi.fn(),
  adminSetStatus: vi.fn(),
  adminSetGroups: vi.fn(),
  adminListGroups: vi.fn(),
  adminCreateGroup: vi.fn(),
  adminListFeatures: vi.fn(),
  adminCreateFeature: vi.fn(),
  adminSetFeatureAssignment: vi.fn(),
  adminMetrics: vi.fn(),
  adminDeleteUser: vi.fn(),
  ...overrides,
});

const mockSession: SessionSnapshot = {
  profile: {
    id: "u-12",
    displayName: "Mai",
    email: "mai@example.test",
    status: "approved",
    role: "member",
    analyticsEnabled: true,
  },
  entitlements: {
    featureKeys: ["beta_reader"],
    refreshedAt: "2026-07-13T21:00:00Z",
  },
};

describe("AccountGate Component", () => {
  it("renders loading spinner on mount and does not render children", () => {
    const api = mockApi({
      currentSession: () => new Promise(() => {}), // never resolves
    });

    render(
      <AccountGate api={api} initialState={{ kind: "loading" }}>
        <div data-testid="child">Normal App Content</div>
      </AccountGate>
    );

    expect(screen.queryByTestId("child")).not.toBeInTheDocument();
  });

  it("renders children when session resolves to approved", async () => {
    const api = mockApi({
      currentSession: vi.fn().mockResolvedValue(mockSession),
    });

    render(
      <AccountGate api={api}>
        <div data-testid="child">Normal App Content</div>
      </AccountGate>
    );

    await waitFor(() => {
      expect(screen.getByTestId("child")).toBeInTheDocument();
      expect(screen.getByText("Normal App Content")).toBeInTheDocument();
    });
  });

  it("renders sign-in form when session fails to load", async () => {
    const api = mockApi({
      currentSession: vi.fn().mockRejectedValue(new Error("expired")),
    });

    render(
      <AccountGate api={api} initialState={{ kind: "loading" }}>
        <div data-testid="child">Normal App Content</div>
      </AccountGate>
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Email Address")).toBeInTheDocument();
      expect(screen.queryByTestId("child")).not.toBeInTheDocument();
    });
  });

  it("transitions to pending state when sign-in returns pending", async () => {
    const api = mockApi({
      currentSession: vi.fn().mockRejectedValue(new Error("expired")),
      signIn: vi.fn().mockResolvedValue("pending"),
    });

    const { container } = render(
      <AccountGate api={api} initialState={{ kind: "loading" }}>
        <div data-testid="child">Normal App Content</div>
      </AccountGate>
    );

    // Wait for form
    await waitFor(() => {
      expect(screen.getByLabelText("Email Address")).toBeInTheDocument();
    });

    // Fill form
    fireEvent.change(screen.getByLabelText("Email Address"), { target: { value: "user@example.test" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123456" } });
    
    const submitBtn = container.querySelector('button[type="submit"]');
    if (!submitBtn) throw new Error("Submit button not found");
    fireEvent.click(submitBtn);

    // Wait for pending view
    await waitFor(() => {
      expect(screen.getByText("Approval Pending")).toBeInTheDocument();
      expect(screen.getByText(/currently waiting for administrator approval/)).toBeInTheDocument();
      expect(screen.queryByTestId("child")).not.toBeInTheDocument();
    });
  });

  it("transitions to rejected state when sign-in returns rejected", async () => {
    const api = mockApi({
      currentSession: vi.fn().mockRejectedValue(new Error("expired")),
      signIn: vi.fn().mockResolvedValue("rejected"),
    });

    const { container } = render(
      <AccountGate api={api} initialState={{ kind: "loading" }}>
        <div data-testid="child">Normal App Content</div>
      </AccountGate>
    );

    // Wait for form
    await waitFor(() => {
      expect(screen.getByLabelText("Email Address")).toBeInTheDocument();
    });

    // Fill form
    fireEvent.change(screen.getByLabelText("Email Address"), { target: { value: "user@example.test" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123456" } });
    
    const submitBtn = container.querySelector('button[type="submit"]');
    if (!submitBtn) throw new Error("Submit button not found");
    fireEvent.click(submitBtn);

    // Wait for rejected view
    await waitFor(() => {
      expect(screen.getByText("Access Denied")).toBeInTheDocument();
      expect(screen.getByText(/rejected by an administrator/)).toBeInTheDocument();
      expect(screen.queryByTestId("child")).not.toBeInTheDocument();
    });
  });

  it("renders the original animated video as a muted looping background", () => {
    const { container } = render(
      <AccountGate api={mockApi()} initialState={{ kind: "anonymous" }}>
        <div>Protected app</div>
      </AccountGate>
    );

    const video = container.querySelector(".account-gate-video");
    expect(video?.tagName).toBe("VIDEO");
    expect(video).toHaveAttribute("src", "/corelib-login-page.mp4");
    expect(video).toHaveAttribute("autoplay");
    expect(video).toHaveProperty("muted", true);
    expect(video).toHaveAttribute("loop");
    expect(video).toHaveAttribute("playsinline");
    expect(container.querySelector(".account-gate-ascii")).toBeNull();
  });

  it("defines a responsive overlay treatment for the video background", () => {
    const { container } = render(
      <AccountGate api={mockApi()} initialState={{ kind: "anonymous" }}>
        <div>Protected app</div>
      </AccountGate>
    );

    const styles = container.querySelector("style")?.textContent;
    expect(styles).toContain(".account-gate-video-overlay");
    expect(styles).toContain("@media (max-width: 720px)");
    expect(styles).toContain("margin-right: 64px");
  });
});
