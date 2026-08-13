import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { derivePlainText, type RichDocument } from "../../domain/richDocument";
import { createCard, updateAndMoveCard } from "../../lib/learning";
import type { CardBrowserRow } from "../../domain/learning";
import type { MultiImageSearchPage } from "../../domain/media";
import { CardSidePanel } from "./CardSidePanel";

vi.mock("./RemoteImagePreview", () => ({ RemoteImagePreview: ({ alt }: { alt: string }) => <img alt={alt} /> }));

// ---------------------------------------------------------------------------
// jsdom shims. ProseMirror (and user-event) need APIs jsdom does not provide:
// Text/Range geometry queries and document.elementFromPoint.
// ---------------------------------------------------------------------------
function rectListPolyfill() {
  return { length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] };
}
function zeroRect() {
  return new DOMRect(0, 0, 0, 0);
}
if (typeof Text !== "undefined" && !(Text.prototype as any).getClientRects) {
  (Text.prototype as any).getClientRects = rectListPolyfill;
}
if (typeof Text !== "undefined" && !(Text.prototype as any).getBoundingClientRect) {
  (Text.prototype as any).getBoundingClientRect = zeroRect;
}
if (typeof Range !== "undefined" && !(Range.prototype as any).getClientRects) {
  (Range.prototype as any).getClientRects = rectListPolyfill;
}
if (typeof Range !== "undefined" && !(Range.prototype as any).getBoundingClientRect) {
  (Range.prototype as any).getBoundingClientRect = zeroRect;
}
if (typeof document !== "undefined" && typeof document.elementFromPoint !== "function") {
  (document as any).elementFromPoint = () => document.body;
}

vi.mock("../../lib/learning", () => ({
  createCard: vi.fn().mockResolvedValue({ id: "new-card" }),
  updateAndMoveCard: vi.fn().mockResolvedValue({ id: "c1" }),
}));

const decks = [
  { id: "d1", name: "Biology", description: null, color: null, archived: false },
];

function baseCard(overrides: Partial<CardBrowserRow> = {}): CardBrowserRow {
  return {
    id: "c1",
    deckId: "d1",
    deckName: "Biology",
    front: "ATP front",
    back: "ATP back",
    frontDoc: null,
    backDoc: null,
    state: "review",
    dueAt: "2026-07-10T12:00:00Z",
    reps: 5,
    lapses: 0,
    stability: 2.5,
    difficulty: 3.1,
    lastReviewAt: "2026-07-09T12:00:00Z",
    learningStep: null,
    source: null,
    tags: ["energy"],
    frontLanguage: null,
    createdAt: "2026-07-08T12:00:00Z",
    updatedAt: "2026-07-09T12:00:00Z",
    deletedAt: null,
    deletedFromDeckName: null,
    ...overrides,
  };
}

function renderPanel(card: CardBrowserRow | null, overrides: Partial<React.ComponentProps<typeof CardSidePanel>> = {}) {
  const onClose = vi.fn();
  const onSaveSuccess = vi.fn();
  const user = userEvent.setup();
  render(
    <CardSidePanel
      card={card}
      decks={decks}
      onClose={onClose}
      onSaveSuccess={onSaveSuccess}
      {...overrides}
    />,
  );
  return { onClose, onSaveSuccess, user };
}

/** The Tiptap contenteditable backing a labeled editor face. */
function editor(name: string): HTMLElement {
  const found = screen
    .getAllByLabelText(name)
    .find((el) => el.hasAttribute("contenteditable"));
  if (!found) throw new Error(`No rich editor contenteditable found for label "${name}"`);
  return found;
}

describe("CardSidePanel rich documents", () => {
  test("opens the keyless image picker and stages a remote result into the focused face", async () => {
    const searchMultiSourceImages = vi.fn().mockResolvedValue({
      results: [{ id: "wiki-1", source: "wikimedia", title: "Cell", previewUrl: "preview", imageUrl: "full", sourceUrl: "source", attribution: "Ada", license: "CC BY", width: 10, height: 10 }],
      warnings: [],
      hasMore: false,
    } satisfies MultiImageSearchPage);
    const stageRemoteCardMedia = vi.fn().mockResolvedValue({ id: "media-1", relativePath: "media/media-1.png", attribution: "Ada" });
    const resolveStagedMedia = vi.fn().mockResolvedValue("/app-data/card-media/staging/draft/media-1.png");
    const { user } = renderPanel(baseCard(), { searchMultiSourceImages, stageRemoteCardMedia, resolveStagedMedia });

    await user.click(screen.getByRole("button", { name: "Images" }));
    await waitFor(() => expect(searchMultiSourceImages).toHaveBeenCalledWith("ATP front", 1));
    await user.click(await screen.findByRole("button", { name: "Cell" }));
    await waitFor(() => expect(stageRemoteCardMedia).toHaveBeenCalledWith(expect.any(String), "full", "Ada"));
    await waitFor(() => expect(resolveStagedMedia).toHaveBeenCalledWith(expect.any(String), "media-1"));
    expect(editor("Back").querySelector("[data-card-image] img")).toHaveAttribute("src", "/app-data/card-media/staging/draft/media-1.png");
  });

  test("create passes frontDoc, backDoc, and mediaDraftId to createCard", async () => {
    const newCard = baseCard({ id: "", front: "", back: "", tags: [] });
    const { user } = renderPanel(newCard);

    await user.click(editor("Front"));
    await user.keyboard("What is ATP?");
    await user.click(editor("Back"));
    await user.keyboard("Adenosine triphosphate.");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(createCard).toHaveBeenCalledTimes(1);
    });
    const input = vi.mocked(createCard).mock.calls[0][0];
    expect(input).toMatchObject({
      deckName: "Biology",
      front: "What is ATP?",
      back: "Adenosine triphosphate.",
      frontDoc: expect.any(Object),
      backDoc: expect.any(Object),
      mediaDraftId: expect.any(String),
    });
    expect(derivePlainText(input.frontDoc!)).toBe("What is ATP?");
    expect(derivePlainText(input.backDoc!)).toBe("Adenosine triphosphate.");
  });

  test("update passes rich docs and mediaDraftId and upgrades legacy plain text to rich docs", async () => {
    const { user } = renderPanel(baseCard());

    expect(editor("Front")).toHaveTextContent("ATP front");
    expect(editor("Back")).toHaveTextContent("ATP back");

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(updateAndMoveCard).toHaveBeenCalledTimes(1);
    });
    const payload = vi.mocked(updateAndMoveCard).mock.calls[0][0];
    expect(payload).toMatchObject({
      cardId: "c1",
      front: "ATP front",
      back: "ATP back",
      frontDoc: expect.any(Object),
      backDoc: expect.any(Object),
      mediaDraftId: expect.any(String),
      destinationDeckId: null,
      tags: ["energy"],
    });
    expect(derivePlainText(payload.frontDoc!)).toBe("ATP front");
    expect(derivePlainText(payload.backDoc!)).toBe("ATP back");
  });

  test("hides tags and creates a new card with no tags", async () => {
    const newCard = baseCard({ id: "", front: "", back: "", tags: ["legacy"] });
    vi.mocked(createCard).mockClear();
    const { user } = renderPanel(newCard);
    expect(screen.queryByRole("textbox", { name: "Tags" })).not.toBeInTheDocument();

    await user.click(editor("Front"));
    await user.keyboard("Question");
    await user.click(editor("Back"));
    await user.keyboard("Answer");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(createCard).toHaveBeenCalledTimes(1));
    expect(vi.mocked(createCard).mock.calls[0][0].tags).toEqual([]);
  });

  test("hides tags and preserves existing tags when editing", async () => {
    vi.mocked(updateAndMoveCard).mockClear();
    const { user } = renderPanel(baseCard({ tags: ["energy", "biology"] }));
    expect(screen.queryByRole("textbox", { name: "Tags" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(updateAndMoveCard).toHaveBeenCalledTimes(1));
    expect(vi.mocked(updateAndMoveCard).mock.calls[0][0].tags).toEqual(["energy", "biology"]);
  });

  test("initializes editors from existing rich documents", async () => {
    const frontDoc: RichDocument = {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "Rich Front" }],
        },
      ],
    };
    const backDoc: RichDocument = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Rich Back" }] }],
    };
    renderPanel(baseCard({ frontDoc, backDoc }));

    expect(editor("Front")).toHaveTextContent("Rich Front");
    expect(editor("Front").querySelector("h2")).not.toBeNull();
    expect(editor("Back")).toHaveTextContent("Rich Back");
  });

  test("resolves media already committed to the card when editing", async () => {
    const backDoc: RichDocument = {
      type: "doc",
      content: [
        {
          type: "image",
          attrs: { mediaId: "media-1", alt: "Cell diagram", widthPercent: 100 },
        },
      ],
    };
    const resolveCardMedia = vi.fn().mockResolvedValue("/app-data/card-media/c1/media-1.png");
    renderPanel(baseCard({
      backDoc,
      media: [{
        id: "media-1",
        cardId: "c1",
        mimeType: "image/png",
        relativePath: "c1/media-1.png",
        sourceType: "web",
        attribution: "Artist · CC BY",
        createdAt: "2026-07-09T12:00:00Z",
        updatedAt: "2026-07-09T12:00:00Z",
      }],
    }), { resolveCardMedia });

    await waitFor(() => expect(resolveCardMedia).toHaveBeenCalledWith("c1", "media-1"));
    await waitFor(() => {
      expect(editor("Back").querySelector("[data-card-image] img")).toHaveAttribute(
        "src",
        "/app-data/card-media/c1/media-1.png",
      );
    });
  });

  test("tracks dirty state from rich content changes", async () => {
    const onDirtyStateChange = vi.fn();
    const { user } = renderPanel(baseCard(), { onDirtyStateChange });

    await waitFor(() => {
      expect(onDirtyStateChange).toHaveBeenLastCalledWith(false);
    });

    await user.click(editor("Front"));
    await user.keyboard("! extra");

    await waitFor(() => {
      expect(onDirtyStateChange).toHaveBeenLastCalledWith(true);
    });
  });

  test("shared toolbar targets the focused face in the panel and renders only once", async () => {
    const { user } = renderPanel(baseCard());
    const front = editor("Front");
    const back = editor("Back");

    await user.click(front);
    await user.click(screen.getByRole("button", { name: "Paragraph style" }));
    await user.click(screen.getByRole("menuitemradio", { name: "Heading 2" }));
    await user.keyboard("Panel Heading");
    expect(front.querySelector("h2")?.textContent).toContain("Panel Heading");

    await user.click(back);
    await user.keyboard("plain ");
    expect(back.querySelector("h2")).toBeNull();
    expect(screen.getAllByRole("toolbar", { name: "Card formatting" })).toHaveLength(1);
  });

  test("shared toolbar in side panel is disabled when no face is focused", async () => {
    const { user } = renderPanel(baseCard());
    const deck = screen.getByRole("combobox", { name: "Deck" });

    await user.click(deck);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Text formatting" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
    });
  });
});
