import { act, fireEvent, render, screen } from "@testing-library/react";
import { useEffect, useState } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { useActiveTimer } from "./useActiveTimer";

function TimerHarness({ idleAfterMs, running }: { idleAfterMs?: number; running?: boolean }) {
  const timer = useActiveTimer({ idleAfterMs, running });
  return (
    <div>
      <span data-testid="elapsed">{timer.activeMs}</span>
      <button onClick={timer.markActivity}>Activity</button>
      <button onClick={timer.reset}>Reset</button>
    </div>
  );
}

function IntervalSnapshotHarness() {
  const timer = useActiveTimer({ idleAfterMs: 90_000 });
  const [sample, setSample] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setSample(timer.snapshot()), 1_000);
    return () => window.clearInterval(id);
  }, []); // Deliberately models a long-lived instrumentation interval.

  return <span data-testid="snapshot">{sample}</span>;
}

afterEach(() => {
  delete (document as any).visibilityState;
  vi.useRealTimers();
});

test("pauses after 90 seconds and resumes on activity", () => {
  vi.useFakeTimers();
  render(<TimerHarness idleAfterMs={90_000} />);
  act(() => vi.advanceTimersByTime(120_000));
  expect(screen.getByTestId("elapsed")).toHaveTextContent("90000");
  fireEvent.pointerDown(window);
  act(() => vi.advanceTimersByTime(10_000));
  expect(screen.getByTestId("elapsed")).toHaveTextContent("100000");
});

test("pauses while document is hidden", () => {
  vi.useFakeTimers();
  render(<TimerHarness idleAfterMs={90_000} />);

  act(() => vi.advanceTimersByTime(5_000));
  expect(screen.getByTestId("elapsed")).toHaveTextContent("5000");

  act(() => {
    Object.defineProperty(document, "visibilityState", {
      value: "hidden",
      configurable: true,
      writable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });

  act(() => vi.advanceTimersByTime(30_000));
  expect(screen.getByTestId("elapsed")).toHaveTextContent("5000");

  act(() => {
    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
      writable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });

  act(() => vi.advanceTimersByTime(5_000));
  expect(screen.getByTestId("elapsed")).toHaveTextContent("10000");
});

test("explicit reset sets elapsed back to zero", () => {
  vi.useFakeTimers();
  render(<TimerHarness idleAfterMs={90_000} />);
  act(() => vi.advanceTimersByTime(10_000));
  expect(screen.getByTestId("elapsed")).toHaveTextContent("10000");
  fireEvent.click(screen.getByRole("button", { name: "Reset" }));
  expect(screen.getByTestId("elapsed")).toHaveTextContent("0");
});

test("does not accumulate when running is false", () => {
  vi.useFakeTimers();
  render(<TimerHarness idleAfterMs={90_000} running={false} />);
  act(() => vi.advanceTimersByTime(60_000));
  expect(screen.getByTestId("elapsed")).toHaveTextContent("0");
});

test("a long-lived interval reads the current snapshot instead of the first render", () => {
  vi.useFakeTimers();
  render(<IntervalSnapshotHarness />);

  act(() => vi.advanceTimersByTime(5_000));

  expect(screen.getByTestId("snapshot")).toHaveTextContent("5000");
});

test("cleans up global event listeners on unmount", () => {
  const addSpy = vi.spyOn(window, "addEventListener");
  const removeSpy = vi.spyOn(window, "removeEventListener");

  const { unmount } = render(<TimerHarness idleAfterMs={90_000} />);
  expect(addSpy).toHaveBeenCalled();
  addSpy.mockClear();

  unmount();
  expect(removeSpy).toHaveBeenCalled();
});
