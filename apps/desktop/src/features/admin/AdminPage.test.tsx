import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdminPage } from "./AdminPage";
import type { AccountApi, AdminMetrics, AccountProfile } from "../../domain/account";

const mockMetrics: AdminMetrics = {
  approvedUsers: 12,
  pendingUsers: 2,
  activeUsersLast30Days: 8,
  eventsByName: [{ name: "app_opened", count: 120 }],
  versions: [{ appVersion: "0.1.0", count: 14 }],
  errorsByCode: [{ code: "expired", count: 3 }],
};

const mockUsers: AccountProfile[] = [
  {
    id: "u-pending-1",
    displayName: "Mai Pending",
    email: "pending@example.test",
    status: "pending",
    role: "member",
    analyticsEnabled: false,
  },
  {
    id: "u-approved-1",
    displayName: "Alice Approved",
    email: "alice@example.test",
    status: "approved",
    role: "member",
    analyticsEnabled: true,
  },
];

const mockApi = (overrides: Partial<AccountApi> = {}): AccountApi => ({
  register: vi.fn(),
  signIn: vi.fn(),
  currentSession: vi.fn(),
  signOut: vi.fn(),
  setAnalyticsEnabled: vi.fn(),
  sendAnalytics: vi.fn(),
  adminListUsers: vi.fn().mockResolvedValue(mockUsers),
  adminSetStatus: vi.fn().mockResolvedValue({
    id: "u-pending-1",
    displayName: "Mai Pending",
    email: "pending@example.test",
    status: "approved",
    role: "member",
    analyticsEnabled: false,
  }),
  adminSetGroups: vi.fn(),
  adminListGroups: vi.fn().mockResolvedValue([]),
  adminCreateGroup: vi.fn(),
  adminListFeatures: vi.fn().mockResolvedValue([]),
  adminCreateFeature: vi.fn(),
  adminSetFeatureAssignment: vi.fn(),
  adminMetrics: vi.fn().mockResolvedValue(mockMetrics),
  ...overrides,
});

describe("AdminPage Dashboard", () => {
  it("renders pending and approved users, overview metrics, and triggers approval/rejection", async () => {
    const api = mockApi();
    const windowConfirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<AdminPage api={api} />);

    // Renders Title
    expect(await screen.findByText("Administration")).toBeInTheDocument();

    // Renders Pending and Approved lists
    await waitFor(() => {
      expect(screen.getByText("Mai Pending")).toBeInTheDocument();
      expect(screen.getByText("Alice Approved")).toBeInTheDocument();
    });

    // Renders Metric counts
    expect(screen.getByText("Approved Users")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("Pending Users")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();

    // Handles Approve action
    const approveBtn = screen.getByRole("button", { name: "Approve" });
    fireEvent.click(approveBtn);

    expect(windowConfirmSpy).toHaveBeenCalledWith("Are you sure you want to approve this user?");
    expect(api.adminSetStatus).toHaveBeenCalledWith("u-pending-1", "approved");

    windowConfirmSpy.mockRestore();
  });
});
