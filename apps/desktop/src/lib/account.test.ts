import { expect, it, vi } from "vitest";
import { registerAccount, loadAccountSession } from "./account";

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
