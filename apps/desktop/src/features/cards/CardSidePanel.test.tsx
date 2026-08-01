import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { derivePlainText, type RichDocument } from "../../domain/richDocument";
import { createCard, updateAndMoveCard } from "../../lib/learning";
import type { CardBrowserRow } from "../../domain/learning";
import { CardSidePanel } from "./CardSidePanel";

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
  test("create passes frontDoc, backDoc, and mediaDraftId to createCard", async () => {
    const newCard = baseCard({ id: "", front: "", back: "", tags: [] });
    const { user } = renderPanel(newCard);

    await user.click(editor("Front"));
    await user.keyboard("What is ATP?");
    await user.click(editor("Back"));
    await user.keyboard("Adenosine triphosphate.");
    await user.click(screen.getByRole("button", { name: "Add Card" }));

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

    await user.click(screen.getByRole("button", { name: "Save Changes" }));

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
});
