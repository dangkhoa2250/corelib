import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";

import type { CardSource, NewCardSource } from "../reader/readerSelection";
import { derivePlainText } from "../../domain/richDocument";
import { CardComposer } from "./CardComposer";

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

const draft: NewCardSource = {
  documentId: "linear-algebra",
  page: 12,
  quote: "A vector space is closed under addition.",
  rects: [{ x: 12, y: 24, width: 180, height: 16 }],
};

const decks = [
  {
    id: "math",
    name: "Mathematics",
    description: "Linear algebra notes",
    color: "#007aff",
    archived: false,
  },
  {
    id: "language",
    name: "Language",
    description: null,
    color: null,
    archived: false,
  },
];

function renderComposer(overrides: Partial<React.ComponentProps<typeof CardComposer>> = {}) {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const onCancel = vi.fn();
  const user = userEvent.setup();
  const props: React.ComponentProps<typeof CardComposer> = {
    draft,
    decks,
    onSave,
    onCancel,
    stageCardMedia: vi.fn().mockResolvedValue({
      id: "media-1",
      cardId: null,
      mimeType: "image/png",
      relativePath: "media/media-1.png",
      sourceType: "file",
      pixabayAttribution: null,
      createdAt: "",
      updatedAt: "",
    }),
    discardMediaDraft: vi.fn().mockResolvedValue(undefined),
    checkPixabayKey: vi.fn().mockResolvedValue(false),
    searchPixabayImages: vi.fn().mockResolvedValue([]),
    downloadPixabayPreview: vi.fn().mockResolvedValue("aGVsbG8="),
    ...overrides,
  };
  render(<CardComposer {...props} />);
  return { onSave, onCancel, user, props };
}

const pixabayImage = {
  id: 1,
  pageUrl: "https://pixabay.com/photos/1",
  previewUrl: "https://cdn.pixabay.com/preview-1.jpg",
  imageUrl: "https://cdn.pixabay.com/full-1.jpg",
  previewWidth: 150,
  previewHeight: 100,
  width: 640,
  height: 427,
  tags: "algebra, board",
  user: "JaneDoe",
  userId: 42,
  mediaType: "photo",
};

/** The Tiptap contenteditable backing a labeled editor face. */
function editor(name: string): HTMLElement {
  const found = screen
    .getAllByLabelText(name)
    .find((el) => el.hasAttribute("contenteditable"));
  if (!found) throw new Error(`No rich editor contenteditable found for label "${name}"`);
  return found;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

test("prefills the front from the selection and lets both card sides be edited", async () => {
  const { user } = renderComposer();
  const front = editor("Front");
  const back = editor("Back");

  expect(front).toHaveTextContent(draft.quote);
  expect(back).toHaveTextContent("");

  await user.click(front);
  await user.keyboard("{Control>}a{/Control}");
  await user.keyboard("What is a vector space?");
  await user.click(back);
  await user.keyboard("A set closed under vector addition and scalar multiplication.");

  expect(front).toHaveTextContent("What is a vector space?");
  expect(back).toHaveTextContent("A set closed under vector addition and scalar multiplication.");
});

test("translates the derived plain text into a new back paragraph when the back is empty", async () => {
  const onTranslate = vi.fn().mockResolvedValue("Tôi đã định gọi cho bạn.");
  const { user } = renderComposer({ onTranslate });

  await user.click(screen.getByRole("button", { name: "Translate" }));

  // The translate call receives the plain text derived from the front document.
  expect(onTranslate).toHaveBeenCalledWith(draft.quote);
  const back = await waitFor(() => {
    const element = editor("Back");
    expect(element).toHaveTextContent("Tôi đã định gọi cho bạn.");
    return element;
  });
  // An empty back is replaced by a single new paragraph.
  expect(back.querySelectorAll("p")).toHaveLength(1);
});

test("inserts the translation at the current back selection without losing existing content", async () => {
  const onTranslate = vi.fn().mockResolvedValue("X");
  const { user } = renderComposer({ onTranslate });
  const back = editor("Back");

  await user.click(back);
  await user.keyboard("Hello world");
  await user.keyboard("{Control>}a{/Control}");
  await user.keyboard("{ArrowLeft}");

  await user.click(screen.getByRole("button", { name: "Translate" }));

  expect(onTranslate).toHaveBeenCalledWith(draft.quote);
  await waitFor(() => {
    expect(back).toHaveTextContent("XHello world");
  });
});

test("keeps the composer usable when translation fails", async () => {
  const { user } = renderComposer({ onTranslate: vi.fn().mockRejectedValue(new Error("No default AI provider")) });

  await user.click(screen.getByRole("button", { name: "Translate" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("No default AI provider");
  expect(editor("Back")).toHaveAttribute("contenteditable", "true");
});

test("hydrates the first loaded deck when the composer opened before decks resolved", async () => {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const onCancel = vi.fn();
  const user = userEvent.setup();
  const bridges = {
    stageCardMedia: vi.fn().mockResolvedValue({ id: "media-1" }),
    discardMediaDraft: vi.fn().mockResolvedValue(undefined),
    checkPixabayKey: vi.fn().mockResolvedValue(false),
    searchPixabayImages: vi.fn().mockResolvedValue([]),
    downloadPixabayPreview: vi.fn().mockResolvedValue("aGVsbG8="),
  };
  const view = render(
    <CardComposer
      draft={draft}
      decks={[]}
      onSave={onSave}
      onCancel={onCancel}
      {...bridges}
    />,
  );

  expect(screen.getByRole("combobox", { name: "Deck" })).toHaveTextContent("New deck…");

  view.rerender(
    <CardComposer
      draft={draft}
      decks={[decks[0]]}
      onSave={onSave}
      onCancel={onCancel}
      {...bridges}
    />,
  );

  await waitFor(() => {
    expect(screen.getByRole("combobox", { name: "Deck" })).toHaveTextContent("Mathematics");
  });
  await user.click(editor("Back"));
  await user.keyboard("A set with vector operations.");
  await user.click(screen.getByRole("button", { name: "Save" }));

  await waitFor(() => {
    expect(onSave).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        deckName: "Mathematics",
        front: draft.quote,
        back: "A set with vector operations.",
        source: draft,
        tags: [],
        frontLanguage: "en",
        frontDoc: expect.any(Object),
        backDoc: expect.any(Object),
        mediaDraftId: expect.any(String),
      }),
    );
  });
});

test("does not replace an explicit new deck choice when decks finish loading", async () => {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const onCancel = vi.fn();
  const user = userEvent.setup();
  const bridges = {
    stageCardMedia: vi.fn().mockResolvedValue({ id: "media-1" }),
    discardMediaDraft: vi.fn().mockResolvedValue(undefined),
    checkPixabayKey: vi.fn().mockResolvedValue(false),
    searchPixabayImages: vi.fn().mockResolvedValue([]),
    downloadPixabayPreview: vi.fn().mockResolvedValue("aGVsbG8="),
  };
  const view = render(
    <CardComposer
      draft={draft}
      decks={decks}
      onSave={onSave}
      onCancel={onCancel}
      {...bridges}
    />,
  );

  await user.click(screen.getByRole("combobox", { name: "Deck" }));
  await user.click(screen.getByText("New deck…"));
  view.rerender(
    <CardComposer
      draft={draft}
      decks={[decks[0]]}
      onSave={onSave}
      onCancel={onCancel}
      {...bridges}
    />,
  );

  expect(screen.getByRole("combobox", { name: "Deck" })).toHaveTextContent("New deck…");
  expect(screen.getByRole("textbox", { name: "New deck name" })).toBeInTheDocument();
});

test("requires both card sides before it saves", async () => {
  const { onSave, user } = renderComposer();

  await user.click(screen.getByRole("button", { name: "Save" }));

  expect(screen.getByRole("alert")).toHaveTextContent("Front and Back are required.");
  expect(onSave).not.toHaveBeenCalled();
});

test("disables saving and explains when the selected source is no longer available", () => {
  const missingSource: CardSource = { ...draft, documentId: null };
  const { onSave } = renderComposer({ draft: missingSource });

  expect(screen.getByRole("alert")).toHaveTextContent("Source document is no longer available.");
  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  expect(onSave).not.toHaveBeenCalled();
});

test("saves the selected source, chosen deck, tags, and rich documents", async () => {
  const { onSave, user } = renderComposer();

  await user.click(screen.getByRole("combobox", { name: "Deck" }));
  await user.click(screen.getByRole("option", { name: "Language" }));
  const front = editor("Front");
  await user.click(front);
  await user.keyboard("{Control>}a{/Control}");
  await user.keyboard("What is a vector space?");
  await user.click(editor("Back"));
  await user.keyboard("A set with vector operations.");
  await user.type(screen.getByRole("textbox", { name: "Tags" }), "algebra, definition, algebra");
  await user.click(screen.getByRole("button", { name: "Save" }));

  await waitFor(() => {
    expect(onSave).toHaveBeenCalledTimes(1);
  });
  const input = onSave.mock.calls[0][0];
  expect(input).toMatchObject({
    deckName: "Language",
    front: "What is a vector space?",
    back: "A set with vector operations.",
    source: draft,
    tags: ["algebra", "definition"],
    frontLanguage: "en",
    mediaDraftId: expect.any(String),
  });
  expect(derivePlainText(input.frontDoc)).toBe("What is a vector space?");
  expect(derivePlainText(input.backDoc)).toBe("A set with vector operations.");
});

test("hides the source preview but still sends the source when saving", async () => {
  const { onSave, user } = renderComposer();

  expect(screen.queryByLabelText("Source preview")).not.toBeInTheDocument();
  expect(screen.queryByText(/Document linear-algebra/i)).not.toBeInTheDocument();

  await user.click(editor("Back"));
  await user.keyboard("A set with vector operations.");
  await user.click(screen.getByRole("button", { name: "Save" }));

  await waitFor(() => {
    expect(onSave).toHaveBeenCalledTimes(1);
  });
  expect(onSave.mock.calls[0][0].source).toEqual(draft);
});

test("allows an image-only back face to save", async () => {
  const { onSave, user } = renderComposer();
  const back = editor("Back");
  const backRoot = back.closest(".card-rich-text-editor") as HTMLElement;
  const fileInput = backRoot.querySelector(
    '[data-testid="card-rich-text-editor-file-input"]',
  ) as HTMLInputElement;
  const imageFile = new File(["fake-image-bytes"], "diagram.png", { type: "image/png" });

  fireEvent.change(fileInput, { target: { files: [imageFile] } });

  await waitFor(() => {
    expect(backRoot.querySelector("[data-card-image]")).not.toBeNull();
  });

  await user.click(screen.getByRole("button", { name: "Save" }));

  await waitFor(() => {
    expect(onSave).toHaveBeenCalledTimes(1);
  });
  const input = onSave.mock.calls[0][0];
  expect(input.backDoc.content.some((block: any) => block.type === "image")).toBe(true);
  expect(input.front).toBe(draft.quote);
});

test("keeps the composer open and exposes a failure when saving is rejected", async () => {
  const onSave = vi.fn().mockRejectedValue(new Error("Card storage is unavailable"));
  const { user } = renderComposer({ onSave });

  await user.click(editor("Back"));
  await user.keyboard("A set with vector operations.");
  await user.click(screen.getByRole("button", { name: "Save" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Card storage is unavailable");
  expect(screen.getByRole("dialog", { name: "Create flashcard" })).toBeInTheDocument();
  expect(editor("Back")).toHaveTextContent("A set with vector operations.");
});

test("submits a new deck through the atomic card save transaction after a failed retry", async () => {
  const committedDecks: string[] = [];
  let attempts = 0;
  const onSave = vi.fn(async ({ deckName }: { deckName: string }) => {
    attempts += 1;
    if (attempts === 1) {
      throw new Error("Card storage is unavailable");
    }
    committedDecks.push(deckName);
  });
  const { onCancel, user } = renderComposer({ onSave });

  await user.click(screen.getByRole("combobox", { name: "Deck" }));
  await user.click(screen.getByText("New deck…"));
  await user.type(screen.getByRole("textbox", { name: "New deck name" }), "English vocabulary");
  await user.click(editor("Back"));
  await user.keyboard("A set with vector operations.");

  await user.click(screen.getByRole("button", { name: "Save" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Card storage is unavailable");
  expect(committedDecks).toEqual([]);

  await user.click(screen.getByRole("button", { name: "Save" }));

  await waitFor(() => {
    expect(onCancel).toHaveBeenCalledExactlyOnceWith();
  });
  expect(onSave).toHaveBeenCalledTimes(2);
  expect(committedDecks).toEqual(["English vocabulary"]);
});

test("closes through onCancel and cannot submit a successful card twice", async () => {
  const { onCancel, onSave, user } = renderComposer();

  await user.click(editor("Back"));
  await user.keyboard("A set with vector operations.");
  await user.click(screen.getByRole("button", { name: "Save" }));

  await waitFor(() => {
    expect(onCancel).toHaveBeenCalledExactlyOnceWith();
  });
  expect(screen.queryByRole("dialog", { name: "Create flashcard" })).not.toBeInTheDocument();
  expect(onSave).toHaveBeenCalledExactlyOnceWith(expect.any(Object));
});

test("keeps keyboard focus in the modal and cancels from Escape", async () => {
  const { onCancel, user } = renderComposer();
  const front = editor("Front");
  const deck = screen.getByRole("combobox", { name: "Deck" });
  const save = screen.getByRole("button", { name: "Save" });

  expect(front).toHaveFocus();

  save.focus();
  await user.tab();
  expect(deck).toHaveFocus();
  await user.tab({ shift: true });
  expect(save).toHaveFocus();

  await user.keyboard("{Escape}");
  expect(onCancel).toHaveBeenCalledExactlyOnceWith();
});

test("prevents a second save while the first one is pending", async () => {
  const pendingSave = deferred<void>();
  const onSave = vi.fn().mockReturnValue(pendingSave.promise);
  const { onCancel, user } = renderComposer({ onSave });

  await user.click(editor("Back"));
  await user.keyboard("A set with vector operations.");
  await user.click(screen.getByRole("button", { name: "Save" }));
  await user.click(screen.getByRole("button", { name: "Saving…" }));

  expect(onSave).toHaveBeenCalledTimes(1);

  pendingSave.resolve();
  await waitFor(() => {
    expect(onCancel).toHaveBeenCalledExactlyOnceWith();
  });
  expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
});

test("offers a pronunciation button beside the Front label", () => {
  renderComposer();
  expect(screen.getByRole("button", { name: "Play pronunciation" })).toBeInTheDocument();
});

test("stages a dropped file through the media bridge under the composer draft", async () => {
  const stageCardMedia = vi.fn().mockResolvedValue({
    id: "media-1",
    cardId: null,
    mimeType: "image/png",
    relativePath: "media/media-1.png",
    sourceType: "file",
    pixabayAttribution: null,
    createdAt: "",
    updatedAt: "",
  });
  renderComposer({ stageCardMedia });
  const back = editor("Back");
  const backRoot = back.closest(".card-rich-text-editor") as HTMLElement;
  const fileInput = backRoot.querySelector(
    '[data-testid="card-rich-text-editor-file-input"]',
  ) as HTMLInputElement;
  const imageFile = new File(["fake-image-bytes"], "diagram.png", { type: "image/png" });

  fireEvent.change(fileInput, { target: { files: [imageFile] } });

  await waitFor(() => {
    expect(backRoot.querySelector("[data-card-image]")).not.toBeNull();
  });
  expect(stageCardMedia).toHaveBeenCalledWith(
    expect.objectContaining({ draftId: expect.any(String), sourceType: "file" }),
  );
});

test("discards the media draft when the composer is cancelled", async () => {
  const discardMediaDraft = vi.fn().mockResolvedValue(undefined);
  const { user, onCancel } = renderComposer({ discardMediaDraft });

  await user.click(screen.getByRole("button", { name: "Cancel" }));

  await waitFor(() => expect(onCancel).toHaveBeenCalledExactlyOnceWith());
  expect(discardMediaDraft).toHaveBeenCalledExactlyOnceWith(expect.any(String));
});

test("discards the media draft after a successful save", async () => {
  const discardMediaDraft = vi.fn().mockResolvedValue(undefined);
  const { user } = renderComposer({ discardMediaDraft });

  await user.click(editor("Back"));
  await user.keyboard("A set with vector operations.");
  await user.click(screen.getByRole("button", { name: "Save" }));

  await waitFor(() => expect(discardMediaDraft).toHaveBeenCalledExactlyOnceWith(expect.any(String)));
});

test("toggles the Pixabay picker from the Back header", async () => {
  const { user } = renderComposer({
    checkPixabayKey: vi.fn().mockResolvedValue(true),
    searchPixabayImages: vi.fn().mockResolvedValue([pixabayImage]),
  });

  expect(screen.queryByText(/Photo by JaneDoe on Pixabay/i)).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Pixabay" }));
  expect(await screen.findByRole("button", { name: /Photo by JaneDoe on Pixabay/i })).toBeInTheDocument();
});

test("auto-searches the front text when the picker opens", async () => {
  const searchPixabayImages = vi.fn().mockResolvedValue([pixabayImage]);
  const { user } = renderComposer({
    checkPixabayKey: vi.fn().mockResolvedValue(true),
    searchPixabayImages,
  });

  await user.click(screen.getByRole("button", { name: "Pixabay" }));
  await waitFor(() => expect(searchPixabayImages).toHaveBeenCalledWith(draft.quote, 1));
});

test("shows the no-key CTA when no Pixabay key is configured", async () => {
  const searchPixabayImages = vi.fn().mockResolvedValue([]);
  const { user } = renderComposer({
    checkPixabayKey: vi.fn().mockResolvedValue(false),
    searchPixabayImages,
  });

  await user.click(screen.getByRole("button", { name: "Pixabay" }));
  expect(await screen.findByText(/Settings › Media/i)).toBeInTheDocument();
  expect(searchPixabayImages).not.toHaveBeenCalled();
});

test("stages a Pixabay result and inserts it into the back face", async () => {
  const downloadPixabayPreview = vi.fn().mockResolvedValue("aGVsbG8=");
  const stageCardMedia = vi.fn().mockResolvedValue({
    id: "media-9",
    cardId: null,
    mimeType: "image/jpeg",
    relativePath: "media/media-9.jpg",
    sourceType: "pixabay",
    pixabayAttribution: "Photo by JaneDoe on Pixabay",
    createdAt: "",
    updatedAt: "",
  });
  const { user, onSave } = renderComposer({
    checkPixabayKey: vi.fn().mockResolvedValue(true),
    searchPixabayImages: vi.fn().mockResolvedValue([pixabayImage]),
    downloadPixabayPreview,
    stageCardMedia,
  });

  await user.click(screen.getByRole("button", { name: "Pixabay" }));
  await user.click(await screen.findByRole("button", { name: /Photo by JaneDoe on Pixabay/i }));

  await waitFor(() => expect(downloadPixabayPreview).toHaveBeenCalledWith(pixabayImage.previewUrl));
  await waitFor(() => expect(stageCardMedia).toHaveBeenCalledWith(
    expect.objectContaining({
      draftId: expect.any(String),
      sourceType: "pixabay",
      bytesBase64: "aGVsbG8=",
      pixabayAttribution: "Photo by JaneDoe on Pixabay",
    }),
  ));

  const back = editor("Back");
  await waitFor(() => {
    expect(back.querySelector("[data-card-image]")).not.toBeNull();
  });

  await user.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  const input = onSave.mock.calls[0][0];
  const imageBlock = input.backDoc.content.find((block: any) => block.type === "image");
  expect(imageBlock).toEqual({
    type: "image",
    attrs: { mediaId: "media-9", alt: "algebra, board", widthPercent: 100 },
  });
});
