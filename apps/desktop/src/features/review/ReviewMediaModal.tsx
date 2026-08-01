import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export const REVIEW_MEDIA_MODAL_FOCUSABLE_SELECTOR =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], iframe, [tabindex]:not([tabindex="-1"])';

type ReviewMediaModalProps = {
  children: React.ReactNode;
  kind: "pdf" | "video";
  onClose: () => void;
  title: string;
};

export function ReviewMediaModal({ children, kind, onClose, title }: ReviewMediaModalProps) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [closing, setClosing] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const backdropPointerDown = useRef(false);
  const openedFocus = useRef<HTMLElement | null>(document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const closeCalled = useRef(false);
  const titleId = `review-media-modal-title-${useId().replace(/:/g, "")}`;

  useEffect(() => {
    const element = document.createElement("div");
    element.className = "review-media-modal-root";
    document.body.append(element);
    setHost(element);
    return () => element.remove();
  }, []);

  useEffect(() => {
    if (!host) return;
    const siblings = Array.from(document.body.children).filter((child) => child !== host) as HTMLElement[];
    const original = siblings.map((element) => ({
      element,
      inert: element.hasAttribute("inert"),
      ariaHidden: element.getAttribute("aria-hidden"),
    }));
    siblings.forEach((element) => {
      element.setAttribute("inert", "true");
      element.setAttribute("aria-hidden", "true");
    });
    return () => {
      original.forEach(({ element, inert, ariaHidden }) => {
        if (inert) element.setAttribute("inert", "true");
        else element.removeAttribute("inert");
        if (ariaHidden === null) element.removeAttribute("aria-hidden");
        else element.setAttribute("aria-hidden", ariaHidden);
      });
    };
  }, [host]);

  useLayoutEffect(() => {
    if (host) dialogRef.current?.querySelector<HTMLButtonElement>(".review-media-modal__close")?.focus();
  }, [host]);

  useEffect(() => {
    return () => {
      const focusTarget = openedFocus.current?.isConnected
        ? openedFocus.current
        : document.querySelector<HTMLElement>(".review-page__card");
      focusTarget?.focus();
    };
  }, []);

  const finishClose = () => {
    if (closeCalled.current) return;
    closeCalled.current = true;
    onClose();
  };

  const close = () => {
    if (closing || closeCalled.current) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      finishClose();
      return;
    }
    setClosing(true);
    window.setTimeout(finishClose, 120);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab" || !dialogRef.current) return;
    const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(REVIEW_MEDIA_MODAL_FOCUSABLE_SELECTOR));
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  if (!host) return null;
  return createPortal(
    <div
      className={`review-media-modal__backdrop${closing ? " is-closing" : ""}`}
      data-testid="review-media-modal-backdrop"
      onPointerDown={(event) => {
        backdropPointerDown.current = event.target === event.currentTarget;
      }}
      onPointerUp={(event) => {
        if (backdropPointerDown.current && event.target === event.currentTarget) close();
        backdropPointerDown.current = false;
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`review-media-modal__dialog review-media-modal__dialog--${kind}`}
        onKeyDown={handleKeyDown}
      >
        <div className="review-media-modal__header">
          <h2 className="review-media-modal__header" id={titleId}>{title}</h2>
          <button className="review-media-modal__close" aria-label={`Close ${title}`} onClick={close} type="button">
            ×
          </button>
        </div>
        <div className="review-media-modal__body">{children}</div>
      </div>
    </div>,
    host,
  );
}
