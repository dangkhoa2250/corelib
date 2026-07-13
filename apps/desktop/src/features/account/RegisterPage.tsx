import React, { useState } from "react";

export function RegisterPage({
  onSubmit,
  onToggleTab,
  loading,
  error,
}: {
  onSubmit: (displayName: string, email: string, password: string) => void;
  onToggleTab: () => void;
  loading: boolean;
  error: string | null;
}) {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (password !== confirmPassword) {
      setLocalError("passwords_do_not_match");
      return;
    }
    onSubmit(displayName, email, password);
  };

  const displayError = error || localError;

  return (
    <div className="account-gate-card">
      <div className="account-gate-logo">
        <span className="account-gate-mark" aria-hidden="true">C</span>
        <h1>Corelib</h1>
        <p>Create your Corelib account</p>
      </div>

      <div className="account-gate-tabs">
        <button type="button" className="account-gate-tab" onClick={onToggleTab}>
          Sign In
        </button>
        <button type="button" className="account-gate-tab active">
          Register
        </button>
      </div>

      {displayError && <div className="account-gate-error">{displayError}</div>}

      <form className="account-gate-form" onSubmit={handleSubmit}>
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
        <button className="account-gate-btn" type="submit" disabled={loading}>
          {loading ? <div className="spinner" /> : "Register"}
        </button>
      </form>
    </div>
  );
}
