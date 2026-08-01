import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { YouGlishPanel } from "./YouGlishPanel";

test("renders the official embedded player URL without waiting for the widget handshake", () => {
  render(<YouGlishPanel word="Algorithms" frontLanguage="en" />);

  const player = screen.getByTitle("YouGlish pronunciation for Algorithms");
  expect(player).toHaveAttribute(
    "src",
    expect.stringContaining("https://youglish.com/pronounce/Algorithms/english/all/emb=1&e_id="),
  );
  expect(player).toHaveAttribute("src", expect.stringContaining("&e_comp=8&e_notif_h=1"));
});

test("uses the same surface color as the flashcard and source viewer", () => {
  const { container } = render(<YouGlishPanel word="Algorithms" frontLanguage="en" />);

  expect(container.firstElementChild).toHaveStyle({ background: "var(--main-bg)" });
});

test("keeps only a small inset around the embedded viewer", () => {
  const { container } = render(<YouGlishPanel word="Algorithms" frontLanguage="en" />);

  expect(container.firstElementChild).toHaveStyle({ marginTop: "0px", padding: "8px" });
  expect((container.firstElementChild as HTMLElement).style.borderStyle).toBe("none");
});

test("starts with a viewer that is 20px taller than the previous default", () => {
  render(<YouGlishPanel word="Algorithms" frontLanguage="en" />);

  expect(screen.getByTestId("youglish-video-viewport")).toHaveStyle({ height: "660px" });
});

test("keeps enough caption height at the first resize after a caption change", () => {
  render(<YouGlishPanel word="Algorithms" frontLanguage="en" />);

  const player = screen.getByTitle("YouGlish pronunciation for Algorithms");
  const widgetId = player.getAttribute("data-youglish-id");
  const send = (action: number, height?: number) => fireEvent(window, new MessageEvent("message", {
    origin: "https://youglish.com",
    data: JSON.stringify({ wid: widgetId, action, height }),
  }));

  send(22);
  send(2, 690);
  send(2, 980);

  expect(screen.getByTestId("youglish-video-viewport")).toHaveStyle({ height: "560px" });
});

test("renders as a chrome-free panel with attribution", () => {
  const { container } = render(<YouGlishPanel word="Algorithms" frontLanguage="en" />);

  expect(container.querySelector(".youglish-panel")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Close YouGlish panel" })).toBeNull();
  expect(container.querySelector(".youglish-panel__attribution")).toBeTruthy();
});
