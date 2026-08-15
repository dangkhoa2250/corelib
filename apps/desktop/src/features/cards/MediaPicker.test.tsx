import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import type { ImageSearchResult, MultiImageSearchPage, ProviderWarning } from "../../domain/media";
import { MediaPicker } from "./MediaPicker";

const normalizeNewlines = (value: string) => value.replace(/\r\n?/g, "\n");

vi.mock("./RemoteImagePreview", () => ({ RemoteImagePreview: ({ alt }: { alt: string }) => <img alt={alt} /> }));

const image = (overrides: Partial<ImageSearchResult> = {}): ImageSearchResult => ({
  id: "1", source: "wikimedia", title: "Fox", previewUrl: "https://example.test/preview", imageUrl: "https://example.test/full", sourceUrl: "https://example.test/source", attribution: "Jane Doe", license: "CC BY", width: 640, height: 427, ...overrides,
});
const page = (results: ImageSearchResult[], warnings: ProviderWarning[] = []): MultiImageSearchPage => ({ results, warnings });
const interleaved = Array.from({ length: 15 }, (_, index) => image({
  id: String(index + 1),
  source: (["wikimedia", "duckduckgo", "openverse"] as const)[index % 3],
  title: `Result ${index + 1}`,
}));

function renderPicker(onSearch = vi.fn().mockResolvedValue(page([image()])), onStage = vi.fn().mockResolvedValue({ mediaId: "m1", alt: "Fox" })) {
  const utils = render(<MediaPicker frontText="algebra" onSearch={onSearch} onStage={onStage} />);
  return { onSearch, onStage, user: userEvent.setup(), ...utils };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

test("renders an accessible image-only result grid", async () => {
  const { container, onSearch } = renderPicker();
  await waitFor(() => expect(onSearch).toHaveBeenCalledWith("algebra", 1));
  const result = await screen.findByRole("button", { name: "Fox" });
  expect(result.querySelector("img")).toHaveAttribute("alt", "Fox");
  expect(result).not.toHaveTextContent("Wikimedia");
  expect(result).not.toHaveTextContent("Jane Doe");
  expect(result).not.toHaveTextContent("CC BY");
  expect(container.querySelector(".media-picker__results")).toBeInTheDocument();
  expect(container.querySelector(".media-picker__result")).toBeInTheDocument();
  expect(container.querySelector(".media-picker__result-button")).toBeInTheDocument();
  expect(container.querySelector(".media-picker__result-copy")).not.toBeInTheDocument();
});

test("keeps picker controls and result content within the parent scroll surface", () => {
  const source = normalizeNewlines(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "MediaPicker.tsx"), "utf8"));
  const preview = normalizeNewlines(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "RemoteImagePreview.tsx"), "utf8"));
  const styles = normalizeNewlines(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "cards.css"), "utf8"));

  expect(source).toContain('className="media-picker__search-input"');
  expect(source).toContain('className="media-picker__results"');
  expect(source).toContain('className="media-picker__result-button"');
  expect(source).not.toContain('className="media-picker__provider"');
  expect(source).not.toContain('className="media-picker__attribution"');
  expect(source).not.toContain('className="media-picker__result-copy"');
  expect(preview).toContain('className="remote-image-preview remote-image-preview--fallback"');
  expect(styles).toMatch(/\.media-picker__results\s*\{[^}]*min-width:\s*0;/s);
  expect(styles).toMatch(/\.media-picker__result\s*\{[^}]*min-width:\s*0;/s);
  expect(styles).toMatch(/\.remote-image-preview--fallback\s*\{[^}]*font-size:\s*12px;/s);
});

test("shows partial provider warnings without hiding results", async () => {
  renderPicker(vi.fn().mockResolvedValue(page([image()], [{ provider: "openverse", message: "Unavailable" }])));
  expect(await screen.findByText(/Openverse: Unavailable/)).toBeInTheDocument();
  expect(await screen.findByRole("button", { name: "Fox" })).toBeInTheDocument();
});

test("appends page two and deduplicates source:id", async () => {
  const onSearch = vi.fn().mockResolvedValueOnce(page([image()])).mockResolvedValueOnce(page([image(), image({ id: "2", source: "duckduckgo", title: "River" })]));
  const { user } = renderPicker(onSearch);
  await user.click(await screen.findByRole("button", { name: "Load more" }));
  await waitFor(() => expect(onSearch).toHaveBeenLastCalledWith("algebra", 2));
  expect(screen.getByRole("button", { name: "Fox" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "River" })).toBeInTheDocument();
});

test("renders fifteen interleaved results and appends the next page", async () => {
  const next = image({ id: "next", source: "openverse", title: "Next result" });
  const onSearch = vi.fn().mockResolvedValueOnce(page(interleaved)).mockResolvedValueOnce(page([interleaved[0], next]));
  const { container, user } = renderPicker(onSearch);
  await waitFor(() => expect(container.querySelectorAll("[data-media-result]")).toHaveLength(15));
  expect(screen.queryByText("Wikimedia")).not.toBeInTheDocument();
  expect(screen.queryByText("DuckDuckGo")).not.toBeInTheDocument();
  expect(screen.queryByText("Openverse")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Load more" }));
  await waitFor(() => expect(container.querySelectorAll("[data-media-result]")).toHaveLength(16));
});

test("disables search and load-more while a request is pending", async () => {
  let resolve!: (value: MultiImageSearchPage) => void;
  const pending = new Promise<MultiImageSearchPage>((done) => { resolve = done; });
  const onSearch = vi.fn().mockResolvedValueOnce(page([image()])).mockReturnValueOnce(pending);
  const { user } = renderPicker(onSearch);
  await user.click(await screen.findByRole("button", { name: "Load more" }));
  expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  resolve(page([]));
});

test("latest explicit query wins over a stale auto-search resolution", async () => {
  const first = deferred<MultiImageSearchPage>();
  const second = deferred<MultiImageSearchPage>();
  const onSearch = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  const { user } = renderPicker(onSearch);
  await waitFor(() => expect(onSearch).toHaveBeenCalledWith("algebra", 1));
  const input = screen.getByRole("searchbox", { name: "Search images" });
  await user.clear(input);
  await user.type(input, "biology");
  await user.keyboard("{Enter}");
  await waitFor(() => expect(onSearch).toHaveBeenLastCalledWith("biology", 1));
  second.resolve(page([image({ id: "new", title: "Biology result" })]));
  expect(await screen.findByRole("button", { name: /Biology result/i })).toBeInTheDocument();
  first.resolve(page([image({ id: "old", title: "Stale result" })]));
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(screen.queryByRole("button", { name: /Stale result/i })).not.toBeInTheDocument();
});

test("ignores a search resolution after the picker unmounts", async () => {
  const pending = deferred<MultiImageSearchPage>();
  const onSearch = vi.fn().mockReturnValue(pending.promise);
  const { unmount } = renderPicker(onSearch);
  await waitFor(() => expect(onSearch).toHaveBeenCalledWith("algebra", 1));
  unmount();
  pending.resolve(page([image({ title: "After unmount" })]));
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(document.body).not.toHaveTextContent("After unmount");
});

test("keeps Deck/Front/Back and actions unscrolled, routing only the image picker through ScrollArea", () => {
  const source = normalizeNewlines(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "MediaPicker.tsx"), "utf8"));
  const composer = normalizeNewlines(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "CardComposer.tsx"), "utf8"));
  const panel = normalizeNewlines(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "CardSidePanel.tsx"), "utf8"));

  // MediaPicker itself never scrolls internally; its host wraps it in a
  // ScrollArea instead.
  expect(source).not.toContain("ScrollArea");
  expect(source).not.toMatch(/overflow[A-Za-z]*\s*:\s*(auto|scroll)/);
  expect(source).not.toContain("::-webkit-scrollbar");

  // Composer (both the reader-selection "Create flashcard" flow and, via
  // panel variant, the manual Add/Edit Card flow) scrolls only its image
  // picker, with a content inset that clears the ScrollArea's floating thumb.
  expect(composer).toContain("<ScrollArea");
  expect(composer).toMatch(/paddingRight:\s*["']20px["']/);
  expect(composer).not.toMatch(/overflowY:\s*["']auto["']/);
  expect(composer).not.toContain("::-webkit-scrollbar-track");

  // Add/Edit Card is a thin wrapper around CardComposer (same fields, same
  // layout, same scrolling) — it must not re-implement any scroll/layout
  // structure of its own, or the two can drift out of sync again.
  expect(panel).toContain("<CardComposer");
  expect(panel).not.toContain("ScrollArea");
  expect(panel).not.toMatch(/overflow[A-Za-z]*\s*:\s*(auto|scroll)/);
});

test("pads the panel image picker content so focus rings are not clipped", () => {
  const composer = normalizeNewlines(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "CardComposer.tsx"), "utf8"));

  // The panel's picker scroll content pads all four sides. A right-only inset
  // would let ScrollArea's overflow:hidden clip the search input's focus ring
  // (box-shadow 3px + 2px outline) on the top and left edges.
  expect(composer).toMatch(/padding:\s*["']4px 16px 4px 4px["']/);
});

test("keeps panel Front and Back content at a fixed 140px ScrollArea viewport", () => {
  const composer = normalizeNewlines(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "CardComposer.tsx"), "utf8"));
  const editorCss = normalizeNewlines(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "CardRichTextEditor.css"), "utf8"));

  expect(composer).toContain('className="card-composer--panel"');
  expect(editorCss).toMatch(
    /\.card-composer--panel\s+\.card-rich-text-editor__scroll-area\s*\{[\s\S]*?flex:\s*0 0 140px;[\s\S]*?height:\s*140px;/,
  );
  expect(editorCss).toContain(".card-rich-text-editor__scroll-content");
  expect(editorCss).toMatch(
    /\.card-composer--panel\s+\.card-rich-text-editor\s+\.tiptap\s*\{[\s\S]*?min-height:\s*104px;/,
  );
  // WKWebView measures a trailing block margin as scrollable overflow, so the
  // panel drops the last block's 8px bottom margin to keep a short face at
  // exactly 140px (scrollHeight == clientHeight).
  expect(editorCss).toMatch(
    /\.card-composer--panel\s+\.card-rich-text-editor\s+\.tiptap\s*>\s*:last-child\s*\{[\s\S]*?margin-bottom:\s*0;/,
  );
  expect(composer).not.toMatch(/overflowY:\s*["'](auto|scroll)["']/);
});
