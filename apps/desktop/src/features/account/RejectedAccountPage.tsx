

export function RejectedAccountPage({ onSignOut }: { onSignOut: () => void }) {
  return (
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
      <button className="account-gate-btn" type="button" onClick={onSignOut}>
        Sign Out
      </button>
    </div>
  );
}
