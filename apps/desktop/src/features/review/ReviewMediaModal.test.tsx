import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ReviewMediaModal } from "./ReviewMediaModal";

const normalizeNewlines = (value: string) => value.replace(/\r\n?/g, "\n");

function Harness() {
  const [open, setOpen] = useState(false);

  return (
    <section className="review-page">
      <button onClick={() => setOpen(true)}>Open media</button>
      <button>Background action</button>
      {open && (
        <ReviewMediaModal kind="video" onClose={() => setOpen(false)} title="Pronunciation for algorithm">
          <button>First media action</button>
          <button>Last media action</button>
        </ReviewMediaModal>
      )}
    </section>
  );
}

beforeEach(() => {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === "(prefers-reduced-motion: reduce)",
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.querySelectorAll(".review-media-modal-root").forEach((node) => node.remove());
});

async function openModal() {
  const user = userEvent.setup();
  const openingTrigger = screen.getByRole("button", { name: "Open media" });
  await user.click(openingTrigger);
  return { user, openingTrigger };
}

test("opens an accessible video dialog and makes the original render inert", async () => {
  const { container } = render(<Harness />);

  await openModal();

  expect(screen.getByRole("dialog", { name: "Pronunciation for algorithm" })).toHaveClass(
    "review-media-modal__dialog",
    "review-media-modal__dialog--video",
  );
  expect(screen.getByRole("button", { name: "Close Pronunciation for algorithm" })).toHaveFocus();
  expect(screen.getByRole("button", { name: "First media action" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Last media action" })).toBeInTheDocument();
  expect(container).toHaveAttribute("inert");
  expect(container).toHaveAttribute("aria-hidden", "true");
  expect(document.querySelector(".review-media-modal-root")).toBeInTheDocument();
  expect(screen.getByTestId("review-media-modal-backdrop")).toHaveClass("review-media-modal__backdrop");
  expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "true");
  expect(screen.getByRole("dialog")).toHaveAttribute("aria-labelledby");
  const heading = screen.getByRole("heading", { name: "Pronunciation for algorithm" });
  expect(heading).not.toHaveClass("review-media-modal__header");
  expect(heading).toHaveClass("review-media-modal__title");
  expect(screen.getByText("First media action").parentElement).toHaveClass("review-media-modal__body");
});

test("wraps Tab focus within close, first action, and last action", async () => {
  render(<Harness />);
  const { user } = await openModal();
  const close = screen.getByRole("button", { name: "Close Pronunciation for algorithm" });
  const first = screen.getByRole("button", { name: "First media action" });
  const last = screen.getByRole("button", { name: "Last media action" });

  await user.tab();
  expect(first).toHaveFocus();
  await user.tab();
  expect(last).toHaveFocus();
  await user.tab();
  expect(close).toHaveFocus();
  await user.tab({ shift: true });
  expect(last).toHaveFocus();
});

test("Escape closes and restores the opening focus and body sibling state", async () => {
  const sibling = document.createElement("aside");
  sibling.setAttribute("inert", "true");
  sibling.setAttribute("aria-hidden", "false");
  document.body.append(sibling);
  const { container } = render(<Harness />);
  container.setAttribute("inert", "true");
  container.setAttribute("aria-hidden", "false");
  container.removeAttribute("inert");
  container.removeAttribute("aria-hidden");

  const { user, openingTrigger } = await openModal();
  await user.keyboard("{Escape}");

  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(openingTrigger).toHaveFocus();
  expect(container).not.toHaveAttribute("inert");
  expect(container).not.toHaveAttribute("aria-hidden");
  expect(sibling).toHaveAttribute("inert", "true");
  expect(sibling).toHaveAttribute("aria-hidden", "false");
  expect(document.querySelector(".review-media-modal-root")).not.toBeInTheDocument();
});

test("closes only when the complete pointer sequence is on the backdrop", async () => {
  render(<Harness />);
  await openModal();
  const backdrop = screen.getByTestId("review-media-modal-backdrop");
  const dialog = screen.getByRole("dialog");

  fireEvent.pointerDown(dialog);
  fireEvent.pointerUp(backdrop);
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  fireEvent.pointerDown(backdrop);
  fireEvent.pointerUp(dialog);
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "First media action" }));
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  fireEvent.pointerDown(backdrop);
  fireEvent.pointerUp(backdrop);
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});

test("keeps normal-motion closing dialog mounted for 120ms", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("matchMedia", () => ({ matches: false, media: "", addListener: vi.fn(), removeListener: vi.fn() }));
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "Open media" }));
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });

  expect(screen.getByRole("dialog")).toBeInTheDocument();
  expect(screen.getByTestId("review-media-modal-backdrop")).toHaveClass("is-closing");
  act(() => vi.advanceTimersByTime(119));
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  act(() => vi.advanceTimersByTime(1));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("closes immediately when reduced motion is preferred", async () => {
  vi.stubGlobal("matchMedia", () => ({ matches: true, media: "(prefers-reduced-motion: reduce)", addListener: vi.fn(), removeListener: vi.fn() }));
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "Open media" }));
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("gives review media dialogs a wider video surface and a balanced borderless header", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const css = normalizeNewlines(readFileSync(join(currentDir, "review.css"), "utf8"));
  const video = css.match(/\.review-media-modal__dialog--video \{([\s\S]*?)\n\}/)?.[1] ?? "";
  const header = css.match(/\.review-media-modal__header \{([\s\S]*?)\n\}/)?.[1] ?? "";
  const close = css.match(/\.review-media-modal__close \{([\s\S]*?)\n\}/)?.[1] ?? "";
  const viewport = css.match(/\.youglish-panel__viewport \{([\s\S]*?)\n\}/)?.[1] ?? "";

  expect(video).toContain("width: min(916px, calc(100vw - 48px));");
  expect(header).toContain("box-sizing: border-box;");
  expect(header).toContain("height: 48px;");
  expect(header).toContain("padding: 8px 16px;");
  expect(header).not.toContain("border-bottom");
  expect(close).toContain("display: grid;");
  expect(close).toContain("place-items: center;");
  expect(close).toContain("height: 28px;");
  expect(viewport).toContain("calc(100vh - 140px)");
  expect(viewport).toContain("min(560px, calc(100vh - 140px))");
});
