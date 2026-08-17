import { useEffect, useRef, useState } from "react";
import type { SessionSnapshot } from "../../domain/account";
import { UpdaterClient, createUpdaterDeps, type UpdateState } from "../../lib/updater";

const APP_VERSION = "0.1.2";

export function AccountSettingsSection({
  session,
  onUpdateAnalytics,
  onSignOut,
  updaterClient,
}: {
  session: SessionSnapshot;
  onUpdateAnalytics: (enabled: boolean) => Promise<void>;
  onSignOut: () => void;
  updaterClient?: UpdaterClient | null;
}) {
  const profile = session.profile;
  const isAnalyticsEnabled = profile.analyticsEnabled;

  const internalClient = useRef<UpdaterClient | null>(null);
  const [updateState, setUpdateState] = useState<UpdateState>({ kind: "idle" });
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (updaterClient) {
      void updaterClient.check().then(setUpdateState).catch(() => {});
      internalClient.current = updaterClient;
      return;
    }
    if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) return;
    let active = true;
    void createUpdaterDeps()
      .then((deps) => {
        if (!active) return;
        const client = new UpdaterClient(deps);
        internalClient.current = client;
        return client.check();
      })
      .then((state) => {
        if (active && state) setUpdateState(state);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [updaterClient]);

  const handleInstall = async () => {
    const client = updaterClient ?? internalClient.current;
    if (!client || installing) return;
    setInstalling(true);
    const result = await client.install((fraction) => {
      setUpdateState({ kind: "downloading", progress: fraction });
    });
    setUpdateState(result);
    setInstalling(false);
  };

  const renderUpdateStatus = () => {
    if (updateState.kind === "available" && !installing) {
      return (
        <button
          type="button"
          className="settings-update-btn"
          onClick={() => void handleInstall()}
        >
          Install v{updateState.version}
        </button>
      );
    }
    if (updateState.kind === "downloading" || (installing && updateState.kind === "available")) {
      const pct = updateState.kind === "downloading" ? Math.round(updateState.progress * 100) : 0;
      return <span className="settings-update-progress">Installing… {pct}%</span>;
    }
    if (updateState.kind === "installed") {
      return <span className="settings-update-progress">Restarting…</span>;
    }
    if (updateState.kind === "error") {
      return <span className="settings-update-error">Update failed</span>;
    }
    return null;
  };

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
        .settings-update-btn {
          background: rgba(34, 197, 94, 0.15);
          color: #4ade80;
          border: 1px solid rgba(34, 197, 94, 0.3);
          border-radius: 6px;
          padding: 6px 14px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        .settings-update-btn:hover {
          background: rgba(34, 197, 94, 0.25);
        }
        .settings-update-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .settings-update-progress {
          font-size: 12px;
          color: #9ca3af;
        }
        .settings-update-error {
          font-size: 12px;
          color: #f87171;
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
        <span>App Version: {APP_VERSION}</span>
        {renderUpdateStatus()}
      </div>
    </div>
  );
}
