import React, { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";

type ScrollAreaProps = Omit<React.ComponentPropsWithoutRef<"div">, "onWheel">;
type Axis = "vertical" | "horizontal";

type ThumbMetrics = {
  length: number;
  offset: number;
};

const THUMB_THICKNESS = 8;
const THUMB_MARGIN = 4;
const MIN_THUMB_LENGTH = 32;

function setForwardedRef<T>(ref: React.ForwardedRef<T>, value: T | null) {
  if (typeof ref === "function") {
    ref(value);
  } else if (ref) {
    (ref as React.MutableRefObject<T | null>).current = value;
  }
}

function getThumbMetrics(viewportLength: number, contentLength: number, scrollOffset: number): ThumbMetrics | null {
  if (contentLength <= viewportLength + 1 || viewportLength <= 0) return null;

  const trackLength = Math.max(0, viewportLength - THUMB_MARGIN * 2);
  const length = Math.min(
    trackLength,
    Math.max(MIN_THUMB_LENGTH, trackLength * (viewportLength / contentLength)),
  );
  const scrollRange = contentLength - viewportLength;
  const travel = Math.max(0, trackLength - length);
  const progress = Math.min(1, Math.max(0, scrollOffset / scrollRange));

  return { length, offset: THUMB_MARGIN + travel * progress };
}

/**
 * A scrollbar-free scroll container with floating thumbs. Native WebKit
 * scrollers reserve and paint a white track in Tauri's macOS webview, even
 * when CSS makes the track transparent. This component clips content itself
 * and drives scrollTop/scrollLeft so the browser never creates that scroller.
 */
export const ScrollArea = React.forwardRef<HTMLDivElement, ScrollAreaProps>(function ScrollArea(
  { children, style, ...props },
  forwardedRef,
) {
  const elementRef = useRef<HTMLDivElement | null>(null);
  const verticalThumbRef = useRef<HTMLDivElement | null>(null);
  const horizontalThumbRef = useRef<HTMLDivElement | null>(null);
  const metricsFrameRef = useRef<number | null>(null);

  const updateMetrics = useCallback(() => {
    const element = elementRef.current;
    if (!element) return;

    const rect = element.getBoundingClientRect();
    const vertical = getThumbMetrics(element.clientHeight, element.scrollHeight, element.scrollTop);
    const horizontal = getThumbMetrics(element.clientWidth, element.scrollWidth, element.scrollLeft);

    const verticalThumb = verticalThumbRef.current;
    if (verticalThumb) {
      verticalThumb.style.display = vertical ? "block" : "none";
      if (vertical) {
        verticalThumb.style.height = `${vertical.length}px`;
        verticalThumb.style.left = `${rect.right - THUMB_MARGIN - THUMB_THICKNESS}px`;
        verticalThumb.style.top = `${rect.top + vertical.offset}px`;
      }
    }

    const horizontalThumb = horizontalThumbRef.current;
    if (horizontalThumb) {
      horizontalThumb.style.display = horizontal ? "block" : "none";
      if (horizontal) {
        horizontalThumb.style.left = `${rect.left + horizontal.offset}px`;
        horizontalThumb.style.top = `${rect.bottom - THUMB_MARGIN - THUMB_THICKNESS}px`;
        horizontalThumb.style.width = `${horizontal.length}px`;
      }
    }
  }, []);

  const scheduleMetricsUpdate = useCallback(() => {
    if (metricsFrameRef.current !== null) return;
    metricsFrameRef.current = window.requestAnimationFrame(() => {
      metricsFrameRef.current = null;
      updateMetrics();
    });
  }, [updateMetrics]);

  const setRef = useCallback((node: HTMLDivElement | null) => {
    elementRef.current = node;
    setForwardedRef(forwardedRef, node);
  }, [forwardedRef]);

  useLayoutEffect(() => {
    updateMetrics();
  }, [updateMetrics]);

  const handleWheel = useCallback((event: WheelEvent) => {
    const element = elementRef.current;
    if (!element || event.defaultPrevented) return;

    const multiplier = event.deltaMode === WheelEvent.DOM_DELTA_LINE
      ? 16
      : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
        ? element.clientHeight
        : 1;
    const deltaX = event.deltaX * multiplier + (event.shiftKey ? event.deltaY * multiplier : 0);
    const deltaY = event.shiftKey ? 0 : event.deltaY * multiplier;
    const nextLeft = Math.min(
      Math.max(0, element.scrollLeft + deltaX),
      Math.max(0, element.scrollWidth - element.clientWidth),
    );
    const nextTop = Math.min(
      Math.max(0, element.scrollTop + deltaY),
      Math.max(0, element.scrollHeight - element.clientHeight),
    );

    const canMove = nextLeft !== element.scrollLeft || nextTop !== element.scrollTop;
    if (!canMove) {
      const hasAncestorScrollArea = Boolean(
        element.parentElement?.closest("[data-scroll-area-root]"),
      );
      if (hasAncestorScrollArea) return;
    }

    // React delegates wheel handlers through a passive root listener in WebKit,
    // so owned gestures must be cancelled by this native non-passive handler.
    event.preventDefault();
    if (canMove) {
      element.scrollLeft = nextLeft;
      element.scrollTop = nextTop;
    }
  }, []);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    const parent = element.parentElement;

    const resizeObserver = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(scheduleMetricsUpdate);
    resizeObserver?.observe(element);
    if (parent) resizeObserver?.observe(parent);
    for (const child of element.children) resizeObserver?.observe(child);
    const mutationObserver = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node instanceof HTMLElement) resizeObserver?.observe(node);
        }
      }
      scheduleMetricsUpdate();
    });
    mutationObserver.observe(element, { childList: true });
    const parentMutationObserver = parent
      ? new MutationObserver(scheduleMetricsUpdate)
      : null;
    parentMutationObserver?.observe(parent!, { childList: true });

    element.addEventListener("scroll", scheduleMetricsUpdate, { passive: true });
    window.addEventListener("resize", scheduleMetricsUpdate);

    return () => {
      if (metricsFrameRef.current !== null) {
        window.cancelAnimationFrame(metricsFrameRef.current);
        metricsFrameRef.current = null;
      }
      resizeObserver?.disconnect();
      mutationObserver.disconnect();
      parentMutationObserver?.disconnect();
      element.removeEventListener("scroll", scheduleMetricsUpdate);
      window.removeEventListener("resize", scheduleMetricsUpdate);
    };
  }, [scheduleMetricsUpdate]);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    element.addEventListener("wheel", handleWheel, { passive: false });
    return () => element.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  const handleThumbPointerDown = useCallback((axis: Axis, event: React.PointerEvent<HTMLDivElement>) => {
    const element = elementRef.current;
    if (!element) return;

    event.preventDefault();
    event.stopPropagation();

    const viewportLength = axis === "vertical" ? element.clientHeight : element.clientWidth;
    const contentLength = axis === "vertical" ? element.scrollHeight : element.scrollWidth;
    const startingScroll = axis === "vertical" ? element.scrollTop : element.scrollLeft;
    const startingPointer = axis === "vertical" ? event.clientY : event.clientX;
    const thumb = getThumbMetrics(viewportLength, contentLength, startingScroll);
    if (!thumb) return;

    const trackLength = Math.max(1, viewportLength - THUMB_MARGIN * 2);
    const thumbTravel = Math.max(1, trackLength - thumb.length);
    const scrollRange = Math.max(0, contentLength - viewportLength);

    const onPointerMove = (moveEvent: PointerEvent) => {
      const pointer = axis === "vertical" ? moveEvent.clientY : moveEvent.clientX;
      const nextScroll = Math.min(
        scrollRange,
        Math.max(0, startingScroll + ((pointer - startingPointer) / thumbTravel) * scrollRange),
      );
      if (axis === "vertical") element.scrollTop = nextScroll;
      else element.scrollLeft = nextScroll;
    };
    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp, { once: true });
  }, []);

  const thumbLayer = typeof document === "undefined" ? null : createPortal(
    <>
      <div
        aria-hidden="true"
        className="scroll-area__thumb scroll-area__thumb--vertical"
        onPointerDown={(event) => handleThumbPointerDown("vertical", event)}
        ref={verticalThumbRef}
        style={{ display: "none" }}
      />
      <div
        aria-hidden="true"
        className="scroll-area__thumb scroll-area__thumb--horizontal"
        onPointerDown={(event) => handleThumbPointerDown("horizontal", event)}
        ref={horizontalThumbRef}
        style={{ display: "none" }}
      />
    </>,
    document.body,
  );

  return (
    <>
      <div
        {...props}
        data-scroll-area-root=""
        ref={setRef}
        style={{
          ...style,
          overflow: "hidden",
          overscrollBehavior: "contain",
          position: style?.position ?? "relative",
        }}
      >
        {children}
      </div>
      {thumbLayer}
    </>
  );
});
