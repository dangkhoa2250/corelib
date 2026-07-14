import React, { useState } from "react";

export function SignInPage({
  onSubmit,
  onToggleTab,
  loading,
  error,
}: {
  onSubmit: (email: string, password: string, remember: boolean) => void;
  onToggleTab: () => void;
  loading: boolean;
  error: string | null;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(email, password, remember);
  };

  return (
    <div className="account-gate-card">
      <div className="account-gate-logo">
        <h1>Corelib</h1>
        <p>Welcome back</p>
      </div>

      <div className="account-gate-tabs">
        <button type="button" className="account-gate-tab active">
          Sign In
        </button>
        <button type="button" className="account-gate-tab" onClick={onToggleTab}>
          Register
        </button>
      </div>

      {error && <div className="account-gate-error">{error}</div>}

      <form className="account-gate-form" onSubmit={handleSubmit}>
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
        <div className="form-group-row">
          <label className="remember-me">
            <input
              id="signin-remember"
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            <span>Remember me</span>
          </label>
        </div>
        <button className="account-gate-btn" type="submit" disabled={loading}>
          {loading ? <div className="spinner" /> : "Sign In"}
        </button>
      </form>
    </div>
  );
}
