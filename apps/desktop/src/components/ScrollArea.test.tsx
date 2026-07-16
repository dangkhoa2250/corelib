import { fireEvent, render } from "@testing-library/react";
import { expect, test } from "vitest";
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

test("hides the native scrollbar and renders a floating thumb", () => {
  const { getByTestId } = render(
    <ScrollArea data-testid="scroll-area"><div style={{ height: 1_000 }} /></ScrollArea>,
  );
  const area = getByTestId("scroll-area") as HTMLDivElement;
  makeVerticallyScrollable(area);

  fireEvent.scroll(area);

  expect(area).toHaveStyle({ overflow: "hidden" });
  const thumb = document.querySelector<HTMLElement>(".scroll-area__thumb--vertical");
  expect(thumb).not.toBeNull();
  expect(thumb).toHaveStyle({ display: "block", top: "24px", left: "388px" });
  expect(Number.parseFloat(thumb!.style.height)).toBeCloseTo(38.4);
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
  expect(thumb).toHaveStyle({ left: "188px" });
});
