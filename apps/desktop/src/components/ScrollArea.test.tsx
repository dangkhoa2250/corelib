import { fireEvent, render, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { ScrollArea } from "./ScrollArea";

function makeVerticallyScrollable(element: HTMLDivElement) {
  let scrollTop = 0;
  Object.defineProperties(element, {
    clientHeight: { configurable: true, value: 200 },
    scrollHeight: { configurable: true, value: 1_000 },
    scrollLeft: { configurable: true, value: 0, writable: true },
    scrollTop: {
      configurable: true,
      get: () => scrollTop,
      set: (value: number) => { scrollTop = value; },
    },
  });
  element.getBoundingClientRect = () => new DOMRect(100, 20, 300, 200);
}

test("hides the native scrollbar and renders a floating thumb", async () => {
  const { getByTestId } = render(
    <ScrollArea data-testid="scroll-area"><div style={{ height: 1_000 }} /></ScrollArea>,
  );
  const area = getByTestId("scroll-area") as HTMLDivElement;
  makeVerticallyScrollable(area);

  fireEvent.scroll(area);

  expect(area).toHaveStyle({ overflow: "hidden" });
  const thumb = document.querySelector<HTMLElement>(".scroll-area__thumb--vertical");
  expect(thumb).not.toBeNull();
  await waitFor(() => {
    expect(thumb).toHaveStyle({ display: "block", top: "24px", left: "388px" });
    expect(Number.parseFloat(thumb!.style.height)).toBeCloseTo(38.4);
  });
});

test("scrolls the clipped content in response to a wheel gesture", () => {
  const { getByTestId } = render(
    <ScrollArea data-testid="scroll-area"><div style={{ height: 1_000 }} /></ScrollArea>,
  );
  const area = getByTestId("scroll-area") as HTMLDivElement;
  makeVerticallyScrollable(area);

  fireEvent.wheel(area, { deltaY: 120 });

  expect(area.scrollTop).toBe(120);
});

test("contains wheel gestures at both vertical scroll boundaries", () => {
  const { getByTestId } = render(
    <ScrollArea data-testid="scroll-area"><div style={{ height: 1_000 }} /></ScrollArea>,
  );
  const area = getByTestId("scroll-area") as HTMLDivElement;
  makeVerticallyScrollable(area);

  const upwardAtTop = new WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    deltaY: -120,
  });
  fireEvent(area, upwardAtTop);
  expect(upwardAtTop.defaultPrevented).toBe(true);
  expect(area.scrollTop).toBe(0);

  area.scrollTop = 800;
  const downwardAtBottom = new WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    deltaY: 120,
  });
  fireEvent(area, downwardAtBottom);
  expect(downwardAtBottom.defaultPrevented).toBe(true);
  expect(area.scrollTop).toBe(800);
});

test("lets only the innermost scrollable area consume a nested wheel gesture", () => {
  const { getByTestId } = render(
    <ScrollArea data-testid="outer-scroll-area">
      <ScrollArea data-testid="inner-scroll-area">
        <div style={{ height: 1_000 }} />
      </ScrollArea>
    </ScrollArea>,
  );
  const outer = getByTestId("outer-scroll-area") as HTMLDivElement;
  const inner = getByTestId("inner-scroll-area") as HTMLDivElement;
  makeVerticallyScrollable(outer);
  makeVerticallyScrollable(inner);

  const wheel = new WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    deltaY: 120,
  });
  fireEvent(inner, wheel);

  expect(wheel.defaultPrevented).toBe(true);
  expect(inner.scrollTop).toBe(120);
  expect(outer.scrollTop).toBe(0);
});

test("hands a nested boundary wheel gesture to the outer scroll area", () => {
  const { getByTestId } = render(
    <ScrollArea data-testid="outer-scroll-area">
      <ScrollArea data-testid="inner-scroll-area">
        <div style={{ height: 1_000 }} />
      </ScrollArea>
    </ScrollArea>,
  );
  const outer = getByTestId("outer-scroll-area") as HTMLDivElement;
  const inner = getByTestId("inner-scroll-area") as HTMLDivElement;
  makeVerticallyScrollable(outer);
  makeVerticallyScrollable(inner);
  inner.scrollTop = 800;

  const wheel = new WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    deltaY: 120,
  });
  fireEvent(inner, wheel);

  expect(wheel.defaultPrevented).toBe(true);
  expect(inner.scrollTop).toBe(800);
  expect(outer.scrollTop).toBe(120);
});

test("coalesces repeated scrollbar metric work into one animation frame", () => {
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
  const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
  const callbacks = new Map<number, FrameRequestCallback>();
  let nextFrameId = 1;
  globalThis.requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
    const frameId = nextFrameId;
    nextFrameId += 1;
    callbacks.set(frameId, callback);
    return frameId;
  });
  globalThis.cancelAnimationFrame = vi.fn((frameId: number) => {
    callbacks.delete(frameId);
  });

  try {
    const { getByTestId } = render(
      <ScrollArea data-testid="scroll-area"><div style={{ height: 1_000 }} /></ScrollArea>,
    );
    const area = getByTestId("scroll-area") as HTMLDivElement;
    makeVerticallyScrollable(area);
    const getBoundingClientRect = vi.spyOn(area, "getBoundingClientRect");

    for (const callback of callbacks.values()) callback(0);
    callbacks.clear();
    getBoundingClientRect.mockClear();

    fireEvent.scroll(area);
    fireEvent.scroll(area);
    fireEvent.scroll(area);

    expect(globalThis.requestAnimationFrame).toHaveBeenCalledTimes(1);
    expect(callbacks.size).toBe(1);
    expect(getBoundingClientRect).not.toHaveBeenCalled();

    for (const callback of callbacks.values()) callback(16);
    expect(getBoundingClientRect).toHaveBeenCalledTimes(1);
  } finally {
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
    globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
  }
});

test("updates the thumb position when a split pane adds a sibling", async () => {
  const { getByTestId } = render(
    <div data-testid="split-pane">
      <ScrollArea data-testid="scroll-area"><div style={{ height: 1_000 }} /></ScrollArea>
    </div>,
  );
  const area = getByTestId("scroll-area") as HTMLDivElement;
  const splitPane = getByTestId("split-pane");
  makeVerticallyScrollable(area);

  let width = 300;
  area.getBoundingClientRect = () => new DOMRect(100, 20, width, 200);
  fireEvent.scroll(area);

  width = 100;
  splitPane.appendChild(document.createElement("aside"));
  await Promise.resolve();

  const thumb = document.querySelector<HTMLElement>(".scroll-area__thumb--vertical");
  await waitFor(() => expect(thumb).toHaveStyle({ left: "188px" }));
});

test("recomputes the vertical thumb when nested text length changes", async () => {
  let text = "short";
  const harness = (value: string) => (
    <ScrollArea data-testid="scroll-area">
      <div>
        <p>{value}</p>
      </div>
    </ScrollArea>
  );

  const { getByTestId, rerender } = render(harness(text));
  const area = getByTestId("scroll-area") as HTMLDivElement;

  Object.defineProperties(area, {
    clientHeight: { configurable: true, value: 200 },
    scrollHeight: {
      configurable: true,
      get: () => (text === "short" ? 200 : 1_000),
    },
    scrollTop: { configurable: true, value: 0, writable: true },
    scrollLeft: { configurable: true, value: 0, writable: true },
  });
  area.getBoundingClientRect = () => new DOMRect(100, 20, 300, 200);

  // Initialize metrics for short content (scrollHeight 200 === clientHeight
  // 200, so no thumb) via a scroll event. Drain the animation frame so no
  // stale scroll-triggered metric update can satisfy the "long" assertion
  // below without the observer firing.
  fireEvent.scroll(area);
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  const thumb = document.querySelector<HTMLElement>(".scroll-area__thumb--vertical");
  expect(thumb).not.toBeNull();
  await waitFor(() => expect(thumb).toHaveStyle({ display: "none" }));

  // Tiptap-style typing grows nested text nodes; the thumb must appear without
  // another scroll event. React updates the text node in place, so this is a
  // characterData mutation, not a direct child-list change.
  text = "long";
  rerender(harness("long"));
  await waitFor(
    () => expect(thumb).toHaveStyle({ display: "block" }),
    { timeout: 3_000 },
  );

  // Deleting back to short content must hide the thumb immediately, again
  // without a scroll event.
  text = "short";
  rerender(harness("short"));
  await waitFor(
    () => expect(thumb).toHaveStyle({ display: "none" }),
    { timeout: 3_000 },
  );
});
