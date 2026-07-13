import { describe, expect, it, vi } from "vitest";
import { UpdaterClient } from "./updater";

describe("updater", () => {
  it("returns idle when check reports no update", async () => {
    const client = new UpdaterClient({
      check: vi.fn().mockResolvedValue(null),
      relaunch: vi.fn().mockResolvedValue(undefined),
    });
    expect(await client.check()).toEqual({ kind: "idle" });
  });

  it("exposes version and notes when an update is available", async () => {
    const client = new UpdaterClient({
      check: vi.fn().mockResolvedValue({ version: "0.2.0", body: "Bug fixes and performance improvements." }),
      relaunch: vi.fn().mockResolvedValue(undefined),
    });
    expect(await client.check()).toEqual({
      kind: "available",
      version: "0.2.0",
      notes: "Bug fixes and performance improvements.",
    });
  });

  it("reports download progress and requests relaunch after installation", async () => {
    const downloadAndInstall = vi.fn().mockImplementation(async (onEvent?: (e: any) => void) => {
      onEvent?.({ event: "Started", data: { contentLength: 100 } });
      onEvent?.({ event: "Progress", data: { chunkLength: 30 } });
      onEvent?.({ event: "Progress", data: { chunkLength: 70 } });
      onEvent?.({ event: "Finished", data: {} });
    });
    const relaunch = vi.fn().mockResolvedValue(undefined);
    const client = new UpdaterClient({
      check: vi.fn().mockResolvedValue({ version: "0.2.0", body: "Fixes", downloadAndInstall }),
      relaunch,
    });

    await client.check();

    const progress: number[] = [];
    const result = await client.install((fraction) => progress.push(fraction));

    expect(progress).toEqual([0.3, 1]);
    expect(relaunch).toHaveBeenCalledOnce();
    expect(result).toEqual({ kind: "installed" });
  });

  it("returns an error state instead of a raw error when the download fails", async () => {
    const downloadAndInstall = vi.fn().mockRejectedValue(new Error("network failure"));
    const relaunch = vi.fn().mockResolvedValue(undefined);
    const client = new UpdaterClient({
      check: vi.fn().mockResolvedValue({ version: "0.2.0", body: "Fixes", downloadAndInstall }),
      relaunch,
    });

    await client.check();
    const result = await client.install();

    expect(result).toEqual({ kind: "error", code: "update_failed" });
    expect(relaunch).not.toHaveBeenCalled();
  });
});
