import type { SessionSnapshot } from "../../domain/account";

export function AccountSettingsSection({
  session,
  onUpdateAnalytics,
  onSignOut,
}: {
  session: SessionSnapshot;
  onUpdateAnalytics: (enabled: boolean) => Promise<void>;
  onSignOut: () => void;
}) {
  const profile = session.profile;
  const isAnalyticsEnabled = profile.analyticsEnabled;

  return (
    <div className="settings-section">
      <style>{`
        .settings-section {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          padding: 24px;
          margin-bottom: 24px;
        }
        .settings-section-title {
          font-size: 18px;
          font-weight: 700;
          margin: 0 0 16px 0;
          color: #c084fc;
        }
        .settings-user-info {
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          padding-bottom: 16px;
          margin-bottom: 20px;
        }
        .user-details h3 {
          font-size: 16px;
          font-weight: 600;
          margin: 0;
          color: #ffffff;
        }
        .user-details p {
          font-size: 13px;
          color: #9ca3af;
          margin: 4px 0 0 0;
        }
        .settings-signout-btn {
          background: rgba(239, 68, 68, 0.1);
          color: #f87171;
          border: 1px solid rgba(239, 68, 68, 0.2);
          border-radius: 6px;
          padding: 8px 14px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        .settings-signout-btn:hover {
          background: rgba(239, 68, 68, 0.2);
        }
        .settings-analytics-option {
          display: flex;
          gap: 12px;
          align-items: flex-start;
          font-size: 14px;
          line-height: 1.5;
          color: #d1d5db;
        }
        .settings-analytics-option input {
          margin-top: 4px;
          cursor: pointer;
        }
        .settings-analytics-option label {
          cursor: pointer;
        }
        .settings-analytics-option label span {
          display: block;
          font-weight: 600;
          color: #ffffff;
          margin-bottom: 4px;
        }
        .settings-analytics-option label p {
          margin: 0;
          color: #9ca3af;
          font-size: 12px;
        }
        .settings-app-version {
          font-size: 12px;
          color: #6b7280;
          margin-top: 20px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-top: 1px solid rgba(255, 255, 255, 0.06);
          padding-top: 16px;
        }
      `}</style>

      <h2 className="settings-section-title">Account</h2>
      <div className="settings-user-info">
        <div className="user-details">
          <h3>{profile.displayName}</h3>
          <p>{profile.email}</p>
        </div>
        <button className="settings-signout-btn" type="button" onClick={onSignOut}>
          Sign Out
        </button>
      </div>

      <div className="settings-analytics-option">
        <input
          id="analytics-toggle"
          type="checkbox"
          checked={isAnalyticsEnabled}
          onChange={(e) => void onUpdateAnalytics(e.target.checked)}
        />
        <label htmlFor="analytics-toggle">
          <span>Usage analytics</span>
          Help improve Library by sharing anonymous feature and error events.
          <p>You can change this at any time. Documents, cards, searches, and locations are never sent.</p>
        </label>
      </div>

      <div className="settings-app-version">
        <span>App Version: 0.1.0</span>
        <div id="update-status-placeholder" />
      </div>
    </div>
  );
}
