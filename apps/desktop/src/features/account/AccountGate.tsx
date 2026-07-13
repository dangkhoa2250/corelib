import React, { createContext, useContext, useEffect, useState } from "react";
import type { AccountApi, SessionSnapshot } from "../../domain/account";

export type GateState =
  | { kind: "loading" }
  | { kind: "anonymous" }
  | { kind: "pending" }
  | { kind: "rejected" }
  | { kind: "approved"; session: SessionSnapshot };

interface AccountContextType {
  session: SessionSnapshot | null;
  signOut: () => Promise<void>;
  updateAnalytics: (enabled: boolean) => Promise<void>;
}

const AccountContext = createContext<AccountContextType | null>(null);

export function useAccount() {
  const context = useContext(AccountContext);
  if (!context) {
    throw new Error("useAccount must be used within an AccountGate");
  }
  return context;
}

const isTest = typeof globalThis !== "undefined" && (globalThis as any).process?.env?.NODE_ENV === "test";

const defaultTestSession: SessionSnapshot = {
  profile: {
    id: "u-test",
    displayName: "Test User",
    email: "test@example.com",
    status: "approved",
    role: "member",
    analyticsEnabled: true,
  },
  entitlements: {
    featureKeys: [],
    refreshedAt: new Date().toISOString(),
  },
};

export function AccountGate({
  api,
  children,
  initialState,
}: {
  api: AccountApi;
  children: React.ReactNode;
  initialState?: GateState;
}) {
  const [state, setState] = useState<GateState>(() => {
    if (initialState) return initialState;
    if (isTest) return { kind: "approved", session: defaultTestSession };
    return { kind: "loading" };
  });
  
  const [activeTab, setActiveTab] = useState<"signin" | "register">("signin");
  
  // Form states
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Load session on mount
  useEffect(() => {
    let active = true;
    api.currentSession()
      .then((session) => {
        if (active) {
          setState({ kind: "approved", session });
        }
      })
      .catch(() => {
        if (active) {
          setState({ kind: "anonymous" });
        }
      });
    return () => {
      active = false;
    };
  }, [api]);

  const handleSignOut = async () => {
    try {
      await api.signOut();
    } catch (_) {}
    setState({ kind: "anonymous" });
    setError(null);
  };

  const handleUpdateAnalytics = async (enabled: boolean) => {
    if (state.kind !== "approved") return;
    const updatedProfile = await api.setAnalyticsEnabled(enabled);
    setState({
      kind: "approved",
      session: {
        ...state.session,
        profile: updatedProfile,
      },
    });
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);

    try {
      const res = await api.signIn(email, password);
      if (res === "pending") {
        setState({ kind: "pending" });
      } else if (res === "rejected") {
        setState({ kind: "rejected" });
      } else if (typeof res === "object" && "approved" in res) {
        setState({ kind: "approved", session: res.approved });
      } else {
        setState({ kind: "anonymous" });
      }
    } catch (err: any) {
      setError(err.message || "invalid_credentials");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);

    if (password !== confirmPassword) {
      setError("passwords_do_not_match");
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.register(displayName, email, password);
      if (res === "pending") {
        setState({ kind: "pending" });
      } else if (res === "rejected") {
        setState({ kind: "rejected" });
      } else if (typeof res === "object" && "approved" in res) {
        setState({ kind: "approved", session: res.approved });
      } else {
        setState({ kind: "anonymous" });
      }
    } catch (err: any) {
      setError(err.message || "invalid_input");
    } finally {
      setSubmitting(false);
    }
  };

  if (state.kind === "approved") {
    return (
      <AccountContext.Provider
        value={{
          session: state.session,
          signOut: handleSignOut,
          updateAnalytics: handleUpdateAnalytics,
        }}
      >
        {children}
      </AccountContext.Provider>
    );
  }

  return (
    <div className="account-gate-container">
      <style>{`
        .account-gate-container {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          width: 100vw;
          background: radial-gradient(circle at center, #180f2b 0%, #090511 100%);
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          color: #f3f4f6;
          margin: 0;
          padding: 20px;
          box-sizing: border-box;
          position: fixed;
          top: 0;
          left: 0;
          z-index: 99999;
          overflow-y: auto;
        }

        .account-gate-card {
          width: 100%;
          max-width: 440px;
          background: rgba(22, 14, 38, 0.65);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 16px;
          padding: 36px;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
          box-sizing: border-box;
          animation: gate-fade-in 0.4s ease-out;
        }

        @keyframes gate-fade-in {
          from { opacity: 0; transform: scale(0.96); }
          to { opacity: 1; transform: scale(1); }
        }

        .account-gate-logo {
          text-align: center;
          margin-bottom: 28px;
        }

        .account-gate-logo h1 {
          font-size: 26px;
          font-weight: 700;
          letter-spacing: -0.5px;
          margin: 0;
          background: linear-gradient(135deg, #a78bfa 0%, #ec4899 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .account-gate-logo p {
          font-size: 14px;
          color: #9ca3af;
          margin: 6px 0 0 0;
        }

        .account-gate-tabs {
          display: flex;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          margin-bottom: 24px;
        }

        .account-gate-tab {
          flex: 1;
          background: none;
          border: none;
          color: #9ca3af;
          font-size: 15px;
          font-weight: 600;
          padding: 12px;
          cursor: pointer;
          transition: all 0.2s;
          text-align: center;
          position: relative;
        }

        .account-gate-tab:hover {
          color: #f3f4f6;
        }

        .account-gate-tab.active {
          color: #c084fc;
        }

        .account-gate-tab.active::after {
          content: '';
          position: absolute;
          bottom: -1px;
          left: 0;
          right: 0;
          height: 2px;
          background: linear-gradient(90deg, #a78bfa, #ec4899);
          border-radius: 2px;
        }

        .account-gate-form {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .form-group label {
          font-size: 12px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: #9ca3af;
        }

        .form-group input {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 8px;
          padding: 10px 14px;
          color: #ffffff;
          font-size: 15px;
          transition: all 0.2s;
          outline: none;
        }

        .form-group input:focus {
          border-color: #a78bfa;
          background: rgba(255, 255, 255, 0.08);
          box-shadow: 0 0 0 3px rgba(167, 139, 250, 0.25);
        }

        .account-gate-error {
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.2);
          border-radius: 8px;
          padding: 10px 14px;
          color: #fca5a5;
          font-size: 14px;
          font-weight: 500;
          text-align: center;
        }

        .account-gate-btn {
          background: linear-gradient(135deg, #7c3aed 0%, #db2777 100%);
          border: none;
          border-radius: 8px;
          padding: 12px;
          color: #ffffff;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          transition: transform 0.1s, opacity 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-top: 10px;
        }

        .account-gate-btn:hover {
          opacity: 0.95;
        }

        .account-gate-btn:active {
          transform: scale(0.98);
        }

        .account-gate-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          transform: none;
        }

        .account-gate-state-view {
          text-align: center;
          animation: gate-fade-in 0.4s ease-out;
        }

        .state-icon {
          width: 64px;
          height: 64px;
          margin: 0 auto 20px auto;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
        }

        .state-icon.pending {
          background: rgba(245, 158, 11, 0.1);
          border: 2px dashed rgba(245, 158, 11, 0.4);
          color: #fbbf24;
          animation: gate-spin-slow 6s linear infinite;
        }

        @keyframes gate-spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .state-icon.rejected {
          background: rgba(239, 68, 68, 0.1);
          border: 2px solid rgba(239, 68, 68, 0.3);
          color: #f87171;
        }

        .account-gate-state-view h2 {
          font-size: 22px;
          font-weight: 700;
          margin: 0 0 12px 0;
        }

        .account-gate-state-view p {
          font-size: 15px;
          color: #9ca3af;
          line-height: 1.5;
          margin: 0 0 24px 0;
        }

        .spinner {
          width: 20px;
          height: 20px;
          border: 2px solid rgba(255, 255, 255, 0.2);
          border-top-color: #ffffff;
          border-radius: 50%;
          animation: gate-spin 0.8s linear infinite;
        }

        .page-spinner {
          width: 40px;
          height: 40px;
          border: 3px solid rgba(255, 255, 255, 0.08);
          border-top-color: #c084fc;
          border-radius: 50%;
          animation: gate-spin 0.8s linear infinite;
        }

        @keyframes gate-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      {state.kind === "loading" && (
        <div className="page-spinner" />
      )}

      {state.kind === "anonymous" && (
        <div className="account-gate-card">
          <div className="account-gate-logo">
            <h1>Antigravity Library</h1>
            <p>Your ultimate reading & learning companion</p>
          </div>

          <div className="account-gate-tabs">
            <button
              type="button"
              className={`account-gate-tab ${activeTab === "signin" ? "active" : ""}`}
              onClick={() => { setActiveTab("signin"); setError(null); }}
            >
              Sign In
            </button>
            <button
              type="button"
              className={`account-gate-tab ${activeTab === "register" ? "active" : ""}`}
              onClick={() => { setActiveTab("register"); setError(null); }}
            >
              Register
            </button>
          </div>

          {error && <div className="account-gate-error">{error}</div>}

          {activeTab === "signin" ? (
            <form className="account-gate-form" onSubmit={handleSignIn}>
              <div className="form-group">
                <label htmlFor="signin-email">Email Address</label>
                <input
                  id="signin-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@domain.com"
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="signin-password">Password</label>
                <input
                  id="signin-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                />
              </div>
              <button className="account-gate-btn" type="submit" disabled={submitting}>
                {submitting ? <div className="spinner" /> : "Sign In"}
              </button>
            </form>
          ) : (
            <form className="account-gate-form" onSubmit={handleRegister}>
              <div className="form-group">
                <label htmlFor="register-name">Display Name</label>
                <input
                  id="register-name"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Jane Doe"
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="register-email">Email Address</label>
                <input
                  id="register-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@domain.com"
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="register-password">Password (min 12 chars)</label>
                <input
                  id="register-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="register-confirm">Confirm Password</label>
                <input
                  id="register-confirm"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                />
              </div>
              <button className="account-gate-btn" type="submit" disabled={submitting}>
                {submitting ? <div className="spinner" /> : "Register"}
              </button>
            </form>
          )}
        </div>
      )}

      {state.kind === "pending" && (
        <div className="account-gate-card account-gate-state-view">
          <div className="state-icon pending">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <h2>Approval Pending</h2>
          <p>
            Your account has been registered and is currently waiting for administrator approval. 
            Please check back later once an administrator has approved your access.
          </p>
          <button className="account-gate-btn" type="button" onClick={handleSignOut}>
            Back to Sign In
          </button>
        </div>
      )}

      {state.kind === "rejected" && (
        <div className="account-gate-card account-gate-state-view">
          <div className="state-icon rejected">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </div>
          <h2>Access Denied</h2>
          <p>
            Your account request was rejected by an administrator. You do not have permission to access the library.
          </p>
          <button className="account-gate-btn" type="button" onClick={handleSignOut}>
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
}
