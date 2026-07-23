import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AccountGate, useAccount } from "./AccountGate";
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
  upsertDailyStatistics: vi.fn(),
  adminStatistics: vi.fn(),
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

const memberSession = (overrides: Partial<SessionSnapshot["profile"]> = {}): SessionSnapshot => ({
  ...mockSession,
  profile: {
    ...mockSession.profile,
    ...overrides,
  },
});

function AccountControls({ onAnalyticsStarted }: { onAnalyticsStarted?: (promise: Promise<void>) => void }) {
  const { session, signOut, updateAnalytics } = useAccount();
  if (!session) return null;

  return (
    <>
      <output data-testid="account-id">{session.profile.id}</output>
      <output data-testid="account-display-name">{session.profile.displayName}</output>
      <output data-testid="analytics-enabled">{String(session.profile.analyticsEnabled)}</output>
      <button
        type="button"
        onClick={() => {
          const update = updateAnalytics(false);
          onAnalyticsStarted?.(update);
        }}
      >
        Disable analytics
      </button>
      <button type="button" onClick={() => void signOut()}>
        Sign out
      </button>
    </>
  );
}

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

  it("applies a delayed analytics update for the current account", async () => {
    let resolveAnalytics!: (profile: SessionSnapshot["profile"]) => void;
    const delayedAnalytics = new Promise<SessionSnapshot["profile"]>((resolve) => {
      resolveAnalytics = resolve;
    });
    const accountA = memberSession({ id: "account-a", analyticsEnabled: true });
    const updatedProfile = {
      ...accountA.profile,
      displayName: "Updated Mai",
      analyticsEnabled: false,
    };
    const setAnalyticsEnabled = vi.fn().mockReturnValue(delayedAnalytics);
    const api = mockApi({
      currentSession: () => new Promise(() => {}),
      setAnalyticsEnabled,
    });
    let analyticsUpdate!: Promise<void>;

    render(
      <AccountGate api={api} initialState={{ kind: "approved", session: accountA }}>
        <AccountControls onAnalyticsStarted={(promise) => { analyticsUpdate = promise; }} />
      </AccountGate>
    );

    fireEvent.click(screen.getByRole("button", { name: "Disable analytics" }));
    expect(setAnalyticsEnabled).toHaveBeenCalledWith(false);

    await act(async () => {
      resolveAnalytics(updatedProfile);
      await analyticsUpdate;
    });

    expect(screen.getByTestId("account-id")).toHaveTextContent("account-a");
    expect(screen.getByTestId("account-display-name")).toHaveTextContent("Updated Mai");
    expect(screen.getByTestId("analytics-enabled")).toHaveTextContent("false");
  });

  it("does not restore the previous account when its delayed analytics update succeeds after another account signs in", async () => {
    let resolveAnalytics!: (profile: SessionSnapshot["profile"]) => void;
    const delayedAnalytics = new Promise<SessionSnapshot["profile"]>((resolve) => {
      resolveAnalytics = resolve;
    });
    const accountA = memberSession({ id: "account-a", analyticsEnabled: true });
    const accountB = memberSession({
      id: "account-b",
      displayName: "Bryn",
      email: "bryn@example.test",
      analyticsEnabled: false,
    });
    const api = mockApi({
      currentSession: () => new Promise(() => {}),
      signOut: vi.fn().mockResolvedValue(undefined),
      signIn: vi.fn().mockResolvedValue({ approved: accountB }),
      setAnalyticsEnabled: vi.fn().mockReturnValue(delayedAnalytics),
    });
    let analyticsUpdate!: Promise<void>;

    render(
      <AccountGate api={api} initialState={{ kind: "approved", session: accountA }}>
        <AccountControls onAnalyticsStarted={(promise) => { analyticsUpdate = promise; }} />
      </AccountGate>
    );

    fireEvent.click(screen.getByRole("button", { name: "Disable analytics" }));
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    await waitFor(() => expect(screen.getByLabelText("Email Address")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Email Address"), { target: { value: accountB.profile.email } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123456" } });
    fireEvent.submit(screen.getByLabelText("Password").closest("form")!);

    await waitFor(() => expect(screen.getByTestId("account-id")).toHaveTextContent("account-b"));
    await act(async () => {
      resolveAnalytics({ ...accountA.profile, analyticsEnabled: false });
      await analyticsUpdate;
    });

    expect(screen.getByTestId("account-id")).toHaveTextContent("account-b");
    expect(screen.getByTestId("analytics-enabled")).toHaveTextContent("false");
  });

  it("silently ignores a previous account's rejected analytics update after another account signs in", async () => {
    const staleError = new Error("analytics update failed");
    let rejectAnalytics!: (error: Error) => void;
    const delayedAnalytics = new Promise<SessionSnapshot["profile"]>((_, reject) => {
      rejectAnalytics = reject;
    });
    const accountA = memberSession({ id: "account-a", analyticsEnabled: true });
    const accountB = memberSession({
      id: "account-b",
      displayName: "Bryn",
      email: "bryn@example.test",
      analyticsEnabled: false,
    });
    const api = mockApi({
      currentSession: () => new Promise(() => {}),
      signOut: vi.fn().mockResolvedValue(undefined),
      signIn: vi.fn().mockResolvedValue({ approved: accountB }),
      setAnalyticsEnabled: vi.fn().mockReturnValue(delayedAnalytics),
    });
    let analyticsUpdate!: Promise<void>;

    render(
      <AccountGate api={api} initialState={{ kind: "approved", session: accountA }}>
        <AccountControls onAnalyticsStarted={(promise) => { analyticsUpdate = promise; }} />
      </AccountGate>
    );

    fireEvent.click(screen.getByRole("button", { name: "Disable analytics" }));
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    await waitFor(() => expect(screen.getByLabelText("Email Address")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Email Address"), { target: { value: accountB.profile.email } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123456" } });
    fireEvent.submit(screen.getByLabelText("Password").closest("form")!);

    await waitFor(() => expect(screen.getByTestId("account-id")).toHaveTextContent("account-b"));
    await act(async () => {
      rejectAnalytics(staleError);
      await expect(analyticsUpdate).resolves.toBeUndefined();
    });

    expect(screen.getByTestId("account-id")).toHaveTextContent("account-b");
    expect(screen.getByTestId("analytics-enabled")).toHaveTextContent("false");
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
