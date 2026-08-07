import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { useAccount } from "../features/account/AccountGate";
import type {
  PluginLifecycle,
  PluginLifecycleChange,
  PluginLifecyclePlan,
  PluginLifecycleSnapshot,
} from "../plugins/lifecycle";

export interface PluginLifecycleContextValue {
  readonly snapshot: PluginLifecycleSnapshot;
  readonly applying: boolean;
  plan(change: PluginLifecycleChange): PluginLifecyclePlan;
  apply(plan: PluginLifecyclePlan): Promise<PluginLifecycleSnapshot>;
}

const PluginLifecycleContext = createContext<PluginLifecycleContextValue | null>(null);

export function usePluginLifecycle(): PluginLifecycleContextValue {
  const context = useContext(PluginLifecycleContext);
  if (!context) {
    throw new Error("usePluginLifecycle must be used within PluginLifecycleProvider.");
  }
  return context;
}

export function PluginLifecycleProvider({
  lifecycle,
  children,
}: {
  lifecycle: PluginLifecycle;
  children: ReactNode;
}) {
  const account = useAccount();
  const accountId = account.session?.profile.id;
  const activeAccountId = useRef(accountId);
  const [snapshot, setSnapshot] = useState<PluginLifecycleSnapshot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadGeneration, setLoadGeneration] = useState(0);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    activeAccountId.current = accountId;
    setSnapshot(null);
    setLoadError(null);
    setApplying(false);
    let active = true;
    if (!accountId) {
      setLoadError("Approved account ID is unavailable.");
      return () => {
        active = false;
      };
    }
    void lifecycle.load(accountId).then(
      (loaded) => {
        if (active && activeAccountId.current === loaded.accountId) setSnapshot(loaded);
      },
      (error: unknown) => {
        if (active && activeAccountId.current === accountId) {
          setLoadError(error instanceof Error ? error.message : String(error));
        }
      },
    );
    return () => {
      active = false;
    };
  }, [accountId, lifecycle, loadGeneration]);

  const plan = useCallback((change: PluginLifecycleChange) => lifecycle.plan(change), [lifecycle]);
  const apply = useCallback(
    async (lifecyclePlan: PluginLifecyclePlan) => {
      setApplying(true);
      try {
        const next = await lifecycle.apply(lifecyclePlan);
        if (activeAccountId.current === next.accountId) setSnapshot(next);
        return next;
      } finally {
        if (activeAccountId.current === lifecyclePlan.accountId) setApplying(false);
      }
    },
    [lifecycle],
  );
  const context = useMemo<PluginLifecycleContextValue | null>(
    () => (snapshot ? { snapshot, applying, plan, apply } : null),
    [apply, applying, plan, snapshot],
  );

  if (loadError) {
    return (
      <div role="alert">
        <p>Could not load plugins: {loadError}</p>
        <button type="button" onClick={() => setLoadGeneration((value) => value + 1)}>
          Retry
        </button>
      </div>
    );
  }
  if (!context) return <p role="status">Loading plugins…</p>;
  return <PluginLifecycleContext.Provider value={context}>{children}</PluginLifecycleContext.Provider>;
}
