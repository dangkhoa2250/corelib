export type UpdateState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "available"; version: string; notes: string }
  | { kind: "downloading"; progress: number }
  | { kind: "installed" }
  | { kind: "error"; code: string };

interface DownloadEvent {
  event: "Started" | "Progress" | "Finished";
  data: { contentLength?: number; chunkLength?: number };
}

interface RawUpdate {
  version: string;
  body?: string;
  downloadAndInstall(onEvent?: (event: DownloadEvent) => void): Promise<void>;
}

export interface UpdaterDeps {
  check: () => Promise<RawUpdate | null>;
  relaunch: () => Promise<void>;
}

const UPDATE_ERROR_CODE = "update_failed";

export class UpdaterClient {
  private update: RawUpdate | null = null;

  constructor(private deps: UpdaterDeps) {}

  async check(): Promise<UpdateState> {
    try {
      this.update = await this.deps.check();
      if (!this.update) return { kind: "idle" };
      return {
        kind: "available",
        version: this.update.version,
        notes: this.update.body ?? "",
      };
    } catch (_) {
      return { kind: "error", code: UPDATE_ERROR_CODE };
    }
  }

  async install(onProgress?: (fraction: number) => void): Promise<UpdateState> {
    if (!this.update) {
      return { kind: "error", code: UPDATE_ERROR_CODE };
    }
    try {
      let total = 0;
      let downloaded = 0;
      await this.update.downloadAndInstall((event) => {
        if (event.event === "Started" && typeof event.data.contentLength === "number") {
          total = event.data.contentLength;
        } else if (event.event === "Progress" && typeof event.data.chunkLength === "number") {
          downloaded += event.data.chunkLength;
          if (total > 0) {
            onProgress?.(Math.min(downloaded / total, 1));
          }
        }
      });
      await this.deps.relaunch();
      return { kind: "installed" };
    } catch (_) {
      return { kind: "error", code: UPDATE_ERROR_CODE };
    }
  }
}

export async function createUpdaterDeps(): Promise<UpdaterDeps> {
  const { check } = await import("@tauri-apps/plugin-updater");
  const { relaunch } = await import("@tauri-apps/plugin-process");
  return {
    check: async () => {
      const update = await check();
      if (!update) return null;
      return {
        version: update.version,
        body: update.body,
        downloadAndInstall: (onEvent?: (e: DownloadEvent) => void) =>
          update.downloadAndInstall(onEvent as never),
      };
    },
    relaunch: () => relaunch(),
  };
}
