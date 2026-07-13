import { expect, it, vi } from "vitest";
import { registerAccount, loadAccountSession } from "./account";
import { hasFeature } from "../domain/account";

it("sends a registration request through the typed native command", async () => {
  const call = vi.fn().mockResolvedValue({ status: "pending" });
  await registerAccount({ displayName: "Mai", email: "mai@example.test", password: "password-123" }, call);
  expect(call).toHaveBeenCalledWith("account_register", { displayName: "Mai", email: "mai@example.test", password: "password-123" });
});

it("loads the session through account_session", async () => {
  const call = vi.fn().mockResolvedValue({ profile: null, entitlements: null });
  await loadAccountSession(call);
  expect(call).toHaveBeenCalledWith("account_session");
});

it("hasFeature checks entitlements correctly", () => {
  expect(hasFeature(null, "beta_reader")).toBe(false);
  expect(hasFeature(undefined, "beta_reader")).toBe(false);
  expect(hasFeature({ featureKeys: [], refreshedAt: "" }, "beta_reader")).toBe(false);
  expect(hasFeature({ featureKeys: ["beta_reader"], refreshedAt: "" }, "beta_reader")).toBe(true);
});
