

export function PendingAccountPage({ onSignOut }: { onSignOut: () => void }) {
  return (
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
      <button className="account-gate-btn" type="button" onClick={onSignOut}>
        Back to Sign In
      </button>
    </div>
  );
}
