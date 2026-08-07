import { useState } from "react";

import { usePluginLifecycle } from "../../app/PluginLifecycleProvider";
import { ScrollArea } from "../../components/ScrollArea";
import type { PluginLifecyclePluginStatus } from "../../plugins/lifecycle";
import "./home.css";

function dependencySummary(plugin: PluginLifecyclePluginStatus) {
  const required = plugin.manifest.dependencies.filter((dependency) => !dependency.optional);
  const optional = plugin.manifest.dependencies.filter((dependency) => dependency.optional);
  if (required.length === 0 && optional.length === 0) return "Works independently";
  return [
    required.length > 0
      ? `Requires ${required.map((dependency) => dependency.pluginId.replace("corelib.", "")).join(", ")}`
      : null,
    optional.length > 0
      ? `Connects with ${optional.map((dependency) => dependency.pluginId.replace("corelib.", "")).join(", ")}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function primarySurfaceId(plugin: PluginLifecyclePluginStatus) {
  return plugin.manifest.contributions.surfaces.find((surface) => surface.quickOpen)?.id ?? null;
}

export function HomePage({ onLaunch }: { onLaunch: (surfaceId: string) => void }) {
  const { snapshot, applying, plan, apply } = usePluginLifecycle();
  const [operationError, setOperationError] = useState<string | null>(null);

  const toggle = async (plugin: PluginLifecyclePluginStatus) => {
    setOperationError(null);
    try {
      if (plugin.status === "enabled") {
        const initialPlan = plan({
          kind: "disable-plugin",
          pluginId: plugin.manifest.id,
        });
        let selectedPlan = initialPlan;
        if (initialPlan.confirmationReasons.length > 0) {
          const affectedNames = initialPlan.affectedPluginIds
            .map((pluginId) =>
              snapshot.installedPlugins.find(({ manifest }) => manifest.id === pluginId)?.manifest
                .name ?? pluginId,
            )
            .join(", ");
          if (!window.confirm(`Disable ${affectedNames}? Dependent features will also stop.`)) {
            return;
          }
          selectedPlan = plan({
            kind: "disable-plugin",
            pluginId: plugin.manifest.id,
            confirmationGranted: true,
          });
        }
        await apply(selectedPlan);
      } else {
        await apply(plan({ kind: "enable-plugin", pluginId: plugin.manifest.id }));
      }
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <ScrollArea aria-label="Corelib Home" className="home-page">
      <div
        className="home-page__content"
        data-testid="home-scroll-content"
        style={{ paddingRight: 20 }}
      >
        <header className="home-page__header">
          <p className="home-page__eyebrow">Your workspace</p>
          <h1>Corelib Home</h1>
          <p>Choose the bundled features you want Corelib to run. Turning one off keeps its data.</p>
        </header>

        {snapshot.notices.length > 0 ? (
          <div className="home-page__notice" role="alert">
            {snapshot.notices.map((notice) => (
              <p key={`${notice.code}:${notice.message}`}>{notice.message}</p>
            ))}
          </div>
        ) : null}
        {operationError ? <p className="home-page__error" role="alert">{operationError}</p> : null}

        <section aria-labelledby="home-plugins-heading">
          <div className="home-page__section-heading">
            <div>
              <h2 id="home-plugins-heading">Your plugins</h2>
              <p>{snapshot.installedPlugins.length} bundled features</p>
            </div>
          </div>
          <div className="home-page__grid">
            {snapshot.installedPlugins.map((plugin) => {
              const enabled = plugin.status === "enabled";
              const surfaceId = primarySurfaceId(plugin);
              const pinned = surfaceId ? snapshot.pinnedSurfaceIds.includes(surfaceId) : false;
              const statusLabel = plugin.status === "new" ? "New" : enabled ? "Enabled" : "Disabled";
              return (
                <article className="home-plugin-card" key={plugin.manifest.id}>
                  <div className="home-plugin-card__heading">
                    <div>
                      <h3>{plugin.manifest.name}</h3>
                      <p className="home-plugin-card__publisher">{plugin.manifest.publisher}</p>
                    </div>
                    <span className={`home-plugin-card__status is-${plugin.status}`}>{statusLabel}</span>
                  </div>
                  <p className="home-plugin-card__description">{plugin.manifest.description}</p>
                  <p className="home-plugin-card__dependencies">{dependencySummary(plugin)}</p>
                  <div className="home-plugin-card__actions">
                    {surfaceId ? (
                      <button
                        type="button"
                        disabled={applying}
                        onClick={() =>
                          void apply(
                            plan({
                              kind: pinned ? "unpin-surface" : "pin-surface",
                              surfaceId,
                            }),
                          ).catch((error: unknown) =>
                            setOperationError(error instanceof Error ? error.message : String(error)),
                          )
                        }
                      >
                        {pinned ? "Unpin" : "Pin"}
                      </button>
                    ) : null}
                    {enabled && surfaceId ? (
                      <button type="button" className="home-plugin-card__launch" onClick={() => onLaunch(surfaceId)}>
                        Open
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="home-plugin-card__toggle"
                      disabled={applying}
                      onClick={() => void toggle(plugin)}
                    >
                      {enabled ? "Disable" : "Enable"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </ScrollArea>
  );
}
