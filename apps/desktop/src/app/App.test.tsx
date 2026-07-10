import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { App } from "./App";

// Mock pdfjs-dist globally for App tests
vi.mock("pdfjs-dist", () => {
  return {
    GlobalWorkerOptions: { workerSrc: "" },
    getDocument: vi.fn().mockReturnValue({
      promise: Promise.resolve({
        numPages: 5,
        getPage: vi.fn().mockResolvedValue({
          getViewport: vi.fn().mockReturnValue({ width: 200, height: 300 }),
          render: vi.fn().mockReturnValue({ promise: Promise.resolve(), cancel: vi.fn() }),
          getTextContent: vi.fn().mockResolvedValue({ items: [] }),
          streamTextContent: vi.fn().mockReturnValue({
            getReader: vi.fn().mockReturnValue({
              read: vi.fn()
                .mockResolvedValueOnce({
                  value: {
                    items: [],
                    styles: {},
                  },
                  done: false,
                })
                .mockResolvedValueOnce({
                  done: true,
                }),
            }),
          }),
        }),
      }),
    }),
    TextLayer: vi.fn().mockImplementation(function (options: { container: HTMLElement }) {
      return {
        render: vi.fn().mockImplementation(async () => {
          const span = globalThis.document.createElement("span");
          span.textContent = "selected source text";
          options.container.append(span);
        }),
        cancel: vi.fn(),
      };
    }),
    AnnotationLayer: vi.fn().mockImplementation(function () {
      return {
        render: vi.fn().mockResolvedValue(undefined),
      };
    }),
  };
});

import { beforeAll } from "vitest";

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
    fillRect: () => {},
    clearRect: () => {},
    getImageData: () => {},
    putImageData: () => {},
    createImageData: () => {},
    setTransform: () => {},
    drawImage: () => {},
    save: () => {},
    restore: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    stroke: () => {},
    fill: () => {},
    scale: () => {},
    translate: () => {},
    rotate: () => {},
    arc: () => {},
    rect: () => {},
  });
});

const document = {
  id: "linear-algebra",
  title: "Linear Algebra",
  author: "Gilbert Strang",
  source: "local_managed" as const,
  coverUrl: null,
  indexed: true,
  status: "ready" as const,
  lastReadPage: null,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

async function openReaderAndSelectText(
  user: ReturnType<typeof userEvent.setup>,
  list = vi.fn().mockResolvedValue([document]),
  learningApi?: { listDecks: () => Promise<any[]>; createCard: (input: any) => Promise<any> },
) {
  render(
    <App
      libraryApi={{
        list,
        pick: vi.fn(),
        importDocuments: vi.fn(),
        getDocumentFileUrl: vi.fn().mockResolvedValue("/mocked/path.pdf"),
        deleteDocument: vi.fn().mockResolvedValue(undefined),
      }}
      learningApi={learningApi}
    />,
  );
  await user.click(await screen.findByRole("button", { name: "Open Linear Algebra" }));
  await screen.findByText("Page 1 of 5");
  await selectTextOnPage();
}

async function selectTextOnPage() {
  const layer = await waitFor(() => {
    const candidate = globalThis.document.querySelector<HTMLElement>("#pdf-page-1 .textLayer");
    if (!candidate?.firstChild) throw new Error("PDF text layer did not render");
    return candidate;
  });
  const range = globalThis.document.createRange();
  range.selectNodeContents(layer.firstChild!);
  Object.defineProperty(range, "getClientRects", {
    value: () => [new DOMRect(0, 0, 100, 16)],
  });
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  fireEvent.mouseUp(layer);
}

test("renders the Library heading", () => {
  render(<App />);

  expect(
    screen.getByRole("heading", { level: 1, name: "Library" }),
  ).toBeInTheDocument();
});

test("loads documents asynchronously and preserves them after a failed import", async () => {
  const user = userEvent.setup();
  const list = vi.fn().mockResolvedValue([document]);
  const pick = vi.fn().mockResolvedValue(["/chosen/linear-algebra.pdf"]);
  const importDocuments = vi.fn().mockRejectedValue(new Error("Import failed"));

  render(
    <App
      libraryApi={{
        list,
        pick,
        importDocuments,
        getDocumentFileUrl: vi.fn().mockResolvedValue("/mocked/path.pdf"),
        deleteDocument: vi.fn().mockResolvedValue(undefined),
      }}
    />,
  );

  expect(screen.getByRole("status", { name: "Loading library" })).toBeInTheDocument();
  expect(await screen.findByRole("button", { name: "Open Linear Algebra" })).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Import from Mac" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Import failed");
  expect(screen.getByRole("button", { name: "Open Linear Algebra" })).toBeInTheDocument();
});

test("does not import when the picker is cancelled", async () => {
  const user = userEvent.setup();
  const list = vi.fn().mockResolvedValue([]);
  const pick = vi.fn().mockResolvedValue(null);
  const importDocuments = vi.fn();

  render(
    <App
      libraryApi={{
        list,
        pick,
        importDocuments,
        getDocumentFileUrl: vi.fn().mockResolvedValue("/mocked/path.pdf"),
        deleteDocument: vi.fn().mockResolvedValue(undefined),
      }}
    />,
  );

  await screen.findByText("Your books will appear here.");
  await user.click(screen.getByRole("button", { name: "Import from Mac" }));

  expect(importDocuments).not.toHaveBeenCalled();
});

test("opens a reader placeholder and returns to the library", async () => {
  const user = userEvent.setup();
  const list = vi.fn().mockResolvedValue([document]);

  render(
    <App
      libraryApi={{
        list,
        pick: vi.fn(),
        importDocuments: vi.fn(),
        getDocumentFileUrl: vi.fn().mockResolvedValue("/mocked/path.pdf"),
        deleteDocument: vi.fn().mockResolvedValue(undefined),
      }}
    />,
  );

  await user.click(await screen.findByRole("button", { name: "Open Linear Algebra" }));

  expect(screen.getByRole("heading", { name: "Linear Algebra" })).toBeInTheDocument();
  expect(await screen.findByText("Page 1 of 5")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Back to Library" }));

  expect(screen.getByRole("heading", { level: 1, name: "Library" })).toBeInTheDocument();
});

test("opens a search result in the reader from either application state", async () => {
  const user = userEvent.setup();
  const list = vi.fn().mockResolvedValue([document]);
  const search = vi.fn().mockResolvedValue([document]);

  render(
    <App
      libraryApi={{
        list,
        pick: vi.fn(),
        importDocuments: vi.fn(),
        search,
        getDocumentFileUrl: vi.fn().mockResolvedValue("/mocked/path.pdf"),
        deleteDocument: vi.fn().mockResolvedValue(undefined),
      }}
    />,
  );

  await screen.findByRole("button", { name: "Open Linear Algebra" });
  await user.keyboard("{Control>}k{/Control}");
  await user.type(screen.getByRole("searchbox"), "linear");
  await waitFor(() => expect(search).toHaveBeenCalledWith("linear"));
  await user.keyboard("{Enter}");
  expect(await screen.findByText("Page 1 of 5")).toBeInTheDocument();

  await user.keyboard("{Meta>}k{/Meta}");
  expect(screen.getByRole("searchbox", { name: "Search your library" })).toBeInTheDocument();
});

test("keeps imported documents when an older initial load resolves last", async () => {
  const user = userEvent.setup();
  const initialList = deferred<typeof document[]>();
  const refreshedList = deferred<typeof document[]>();
  const list = vi.fn().mockReturnValueOnce(initialList.promise).mockReturnValueOnce(refreshedList.promise);
  const importDocuments = vi.fn().mockResolvedValue([document]);

  render(
    <App
      libraryApi={{
        list,
        pick: vi.fn().mockResolvedValue(["/chosen/linear-algebra.pdf"]),
        importDocuments,
        getDocumentFileUrl: vi.fn().mockResolvedValue("/mocked/path.pdf"),
        deleteDocument: vi.fn().mockResolvedValue(undefined),
      }}
    />,
  );

  await user.click(screen.getByRole("button", { name: "Import from Mac" }));
  await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  refreshedList.resolve([document]);
  expect(await screen.findByRole("button", { name: "Open Linear Algebra" })).toBeInTheDocument();

  await act(async () => {
    initialList.resolve([]);
    await initialList.promise;
  });

  await waitFor(() => {
    expect(screen.getByRole("button", { name: "Open Linear Algebra" })).toBeInTheDocument();
  });
});

test("preserves the Drive parent stack for an empty nested folder", async () => {
  const user = userEvent.setup();
  const listDrive = vi.fn(async (folderId?: string) => {
    if (folderId === "folder-a") return [];
    return [{ id: "folder-a", name: "Folder A", kind: "folder" as const, parentId: "root" }];
  });

  render(
    <App
      libraryApi={{
        list: vi.fn().mockResolvedValue([]),
        pick: vi.fn(),
        importDocuments: vi.fn(),
        listDrive,
        connectDrive: vi.fn().mockResolvedValue(undefined),
        importDrive: vi.fn().mockResolvedValue([]),
        clearDriveCache: vi.fn().mockResolvedValue(undefined),
      }}
    />,
  );

  await user.click(await screen.findByRole("button", { name: "Google Drive" }));
  await user.click(await screen.findByRole("button", { name: "📁 Folder A" }));
  expect(await screen.findByText("No PDFs or folders found here.")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "← Up" }));

  await screen.findByRole("button", { name: "📁 Folder A" });
  expect(listDrive.mock.calls.map(([folderId]) => folderId)).toEqual([undefined, "folder-a", undefined]);
});

test("opens the selected search result when an older library load resolves afterwards", async () => {
  const user = userEvent.setup();
  const initialList = deferred<typeof document[]>();
  const searchResult = { ...document, id: "search-result", title: "Search Result" };
  const search = vi.fn().mockResolvedValue([searchResult]);

  render(
    <App
      libraryApi={{
        list: vi.fn().mockReturnValue(initialList.promise),
        pick: vi.fn(),
        importDocuments: vi.fn(),
        search,
        getDocumentFileUrl: vi.fn().mockResolvedValue("/mocked/path.pdf"),
        deleteDocument: vi.fn().mockResolvedValue(undefined),
      }}
    />,
  );

  await user.keyboard("{Control>}k{/Control}");
  await user.type(screen.getByRole("searchbox"), "search");
  const palette = screen.getByRole("dialog");
  expect(await within(palette).findByRole("button", { name: "Open Search Result" })).toBeInTheDocument();
  await act(async () => {
    initialList.resolve([document]);
    await initialList.promise;
  });

  await user.keyboard("{Enter}");
  expect(screen.getByRole("heading", { name: "Search Result" })).toBeInTheDocument();
});

test("opens the card composer with the live source document and editable front/back", async () => {
  const user = userEvent.setup();
  const listDecks = vi.fn().mockResolvedValue([{ id: "english", name: "English", description: null, color: null, archived: false }]);
  const createCard = vi.fn().mockResolvedValue({});
  await openReaderAndSelectText(user, undefined, { listDecks, createCard });

  await user.click(screen.getByRole("button", { name: "Create flashcard" }));

  expect(await screen.findByRole("dialog", { name: "Create flashcard" })).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Front" })).toHaveValue("selected source text");
  expect(screen.getByRole("textbox", { name: "Back" })).toHaveValue("");
  expect(listDecks).toHaveBeenCalledTimes(1);
});

test("keeps the composer visible and reports deck loading errors", async () => {
  const user = userEvent.setup();
  const listDecks = vi.fn().mockRejectedValue(new Error("Deck service unavailable"));
  await openReaderAndSelectText(user, undefined, { listDecks, createCard: vi.fn() });

  await user.click(screen.getByRole("button", { name: "Create flashcard" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Deck service unavailable");
  expect(screen.getByRole("dialog", { name: "Create flashcard" })).toBeInTheDocument();
});

test("keeps the composer visible and reports card save errors", async () => {
  const user = userEvent.setup();
  const createCard = vi.fn().mockRejectedValue(new Error("Card save failed"));
  await openReaderAndSelectText(user, undefined, {
    listDecks: vi.fn().mockResolvedValue([{ id: "english", name: "English", description: null, color: null, archived: false }]),
    createCard,
  });
  await user.click(screen.getByRole("button", { name: "Create flashcard" }));
  await user.type(screen.getByRole("textbox", { name: "Back" }), "definition");
  await user.selectOptions(screen.getByRole("combobox", { name: "Deck" }), "english");
  await user.click(screen.getByRole("button", { name: "Save" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Card save failed");
  expect(screen.getByRole("dialog", { name: "Create flashcard" })).toBeInTheDocument();
  expect(createCard).toHaveBeenCalledWith(expect.objectContaining({
    front: "selected source text",
    back: "definition",
    source: expect.objectContaining({ documentId: "linear-algebra", page: 1 }),
  }));
});

test("returns to the source page after saving or cancelling a card", async () => {
  const user = userEvent.setup();
  const createCard = vi.fn().mockResolvedValue({});
  await openReaderAndSelectText(user, undefined, {
    listDecks: vi.fn().mockResolvedValue([{ id: "english", name: "English", description: null, color: null, archived: false }]),
    createCard,
  });
  await user.click(screen.getByRole("button", { name: "Create flashcard" }));
  await user.type(screen.getByRole("textbox", { name: "Back" }), "definition");
  await user.selectOptions(screen.getByRole("combobox", { name: "Deck" }), "english");
  await user.click(screen.getByRole("button", { name: "Save" }));
  expect(await screen.findByRole("heading", { name: "Linear Algebra" })).toBeInTheDocument();
  expect(screen.getByText("Page 1 of 5")).toBeInTheDocument();

  await selectTextOnPage();
  await user.click(screen.getByRole("button", { name: "Create flashcard" }));
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(await screen.findByText("Page 1 of 5")).toBeInTheDocument();
});

test("hydrates a missing card source without showing a false unavailable alert", async () => {
  const user = userEvent.setup();
  const card = {
    id: "card-1",
    deckId: "english",
    front: "selected source text",
    back: "definition",
    state: "new" as const,
    dueAt: "2026-07-10T00:00:00.000Z",
    reps: 0,
    lapses: 0,
    stability: null,
    difficulty: null,
    lastReviewAt: null,
    source: null,
    tags: [],
  };
  render(
    <App
      libraryApi={{
        list: vi.fn().mockResolvedValue([document]),
        pick: vi.fn(),
        importDocuments: vi.fn(),
        getDocumentFileUrl: vi.fn().mockResolvedValue("/mocked/path.pdf"),
        deleteDocument: vi.fn().mockResolvedValue(undefined),
      }}
      learningApi={{
        listDecks: vi.fn().mockResolvedValue([]),
        createCard: vi.fn(),
        listDueCards: vi.fn().mockResolvedValue([card]),
        previewCardReview: vi.fn().mockResolvedValue({
          again: { dueAt: "2026-07-10T00:01:00.000Z", intervalLabel: "1m" },
          hard: { dueAt: "2026-07-10T01:00:00.000Z", intervalLabel: "1h" },
          good: { dueAt: "2026-07-11T00:00:00.000Z", intervalLabel: "1d" },
          easy: { dueAt: "2026-07-14T00:00:00.000Z", intervalLabel: "4d" },
        }),
        rateCard: vi.fn(),
        getCardSource: vi.fn().mockResolvedValue({
          documentId: document.id,
          page: 3,
          quote: "selected source text",
          rects: [],
        }),
      }}
    />,
  );

  await user.click(await screen.findByRole("button", { name: "Review today" }));
  await user.click(await screen.findByRole("button", { name: "Show source" }));

  expect(await screen.findByRole("heading", { name: "Linear Algebra" })).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("navigates between Library and Memora via the sidebar", async () => {
  const user = userEvent.setup();

  render(
    <App
      libraryApi={{
        list: vi.fn().mockResolvedValue([]),
        pick: vi.fn(),
        importDocuments: vi.fn(),
      }}
      learningApi={{
        listDecks: vi.fn().mockResolvedValue([{ id: "deck-1", name: "English", description: null, color: "#ff9500", archived: false }]),
        createCard: vi.fn(),
        listDueCards: vi.fn().mockResolvedValue([]),
      }}
    />,
  );

  expect(screen.getByRole("heading", { level: 1, name: "Library" })).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Memora" }));
  expect(await screen.findByRole("heading", { level: 1, name: "Memora" })).toBeInTheDocument();
  expect(await screen.findByText("English")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Library" }));
  expect(screen.getByRole("heading", { level: 1, name: "Library" })).toBeInTheDocument();
});

test("creates a new deck from Memora", async () => {
  const user = userEvent.setup();
  const createDeck = vi.fn().mockResolvedValue({ id: "deck-2", name: "Spanish", description: null, color: null, archived: false });

  render(
    <App
      libraryApi={{
        list: vi.fn().mockResolvedValue([]),
        pick: vi.fn(),
        importDocuments: vi.fn(),
      }}
      learningApi={{
        listDecks: vi.fn().mockResolvedValue([]),
        createCard: vi.fn(),
        createDeck,
        listDueCards: vi.fn().mockResolvedValue([]),
      }}
    />,
  );

  await user.click(screen.getByRole("button", { name: "Memora" }));
  await screen.findByText("Your decks will appear here.");

  await user.click(screen.getByRole("button", { name: "New Deck" }));
  await user.type(screen.getByRole("textbox", { name: "New deck name" }), "Spanish");
  await user.click(screen.getByRole("button", { name: "Create" }));

  expect(createDeck).toHaveBeenCalledWith("Spanish");
  expect(await screen.findByText("Spanish")).toBeInTheDocument();
  expect(screen.queryByRole("textbox", { name: "New deck name" })).not.toBeInTheDocument();
});

test("opens a deck's cards from Memora and adds one manually", async () => {
  const user = userEvent.setup();
  const newCard = {
    id: "card-1",
    deckId: "deck-1",
    front: "What is a mitochondrion?",
    back: "The powerhouse of the cell",
    state: "new" as const,
    dueAt: "2026-07-10T00:00:00.000Z",
    reps: 0,
    lapses: 0,
    stability: null,
    difficulty: null,
    lastReviewAt: null,
    source: null,
    tags: ["biology"],
  };
  const createCard = vi.fn().mockResolvedValue(newCard);
  const listDeckCards = vi.fn().mockResolvedValue([]);

  render(
    <App
      libraryApi={{
        list: vi.fn().mockResolvedValue([]),
        pick: vi.fn(),
        importDocuments: vi.fn(),
      }}
      learningApi={{
        listDecks: vi.fn().mockResolvedValue([{ id: "deck-1", name: "Biology", description: null, color: "#ff9500", archived: false }]),
        createCard,
        listDeckCards,
        listDueCards: vi.fn().mockResolvedValue([]),
      }}
    />,
  );

  await user.click(screen.getByRole("button", { name: "Memora" }));
  await user.click(await screen.findByRole("button", { name: "Biology" }));

  expect(listDeckCards).toHaveBeenCalledWith("deck-1");
  await screen.findByText("This deck has no cards yet.");

  await user.click(screen.getByRole("button", { name: "Add Card" }));
  await user.type(screen.getByRole("textbox", { name: "Front" }), "What is a mitochondrion?");
  await user.type(screen.getByRole("textbox", { name: "Back" }), "The powerhouse of the cell");
  await user.type(screen.getByRole("textbox", { name: "Tags" }), "biology");
  await user.click(screen.getByRole("button", { name: "Save" }));

  expect(createCard).toHaveBeenCalledWith({
    deckName: "Biology",
    front: "What is a mitochondrion?",
    back: "The powerhouse of the cell",
    tags: ["biology"],
  });
  await screen.findByText("What is a mitochondrion?");
  expect(screen.queryByText("The powerhouse of the cell")).not.toBeInTheDocument();
  expect(screen.getByText("Tap to reveal")).toBeInTheDocument();

  await user.click(screen.getByText("What is a mitochondrion?"));
  expect(await screen.findByText("The powerhouse of the cell")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "‹ Memora" }));
  expect(await screen.findByRole("heading", { level: 1, name: "Memora" })).toBeInTheDocument();
});

test("deletes a card from a deck's card list", async () => {
  const user = userEvent.setup();
  const existingCard = {
    id: "card-1",
    deckId: "deck-1",
    front: "What is ATP?",
    back: "Adenosine triphosphate",
    state: "new" as const,
    dueAt: "2026-07-10T00:00:00.000Z",
    reps: 0,
    lapses: 0,
    stability: null,
    difficulty: null,
    lastReviewAt: null,
    source: null,
    tags: [],
  };
  const deleteCard = vi.fn().mockResolvedValue(undefined);

  render(
    <App
      libraryApi={{
        list: vi.fn().mockResolvedValue([]),
        pick: vi.fn(),
        importDocuments: vi.fn(),
      }}
      learningApi={{
        listDecks: vi.fn().mockResolvedValue([{ id: "deck-1", name: "Biology", description: null, color: "#ff9500", archived: false }]),
        createCard: vi.fn(),
        listDeckCards: vi.fn().mockResolvedValue([existingCard]),
        deleteCard,
        listDueCards: vi.fn().mockResolvedValue([]),
      }}
    />,
  );

  await user.click(screen.getByRole("button", { name: "Memora" }));
  await user.click(await screen.findByRole("button", { name: "Biology" }));
  await screen.findByText("What is ATP?");

  await user.click(screen.getByRole("button", { name: "Delete card" }));
  await user.click(screen.getByRole("button", { name: "Delete" }));

  expect(deleteCard).toHaveBeenCalledWith("card-1");
  await screen.findByText("This deck has no cards yet.");
});

test("renames a deck from Memora", async () => {
  const user = userEvent.setup();
  const renameDeck = vi.fn().mockResolvedValue({ id: "deck-1", name: "American English", description: null, color: "#ff9500", archived: false });

  render(
    <App
      libraryApi={{
        list: vi.fn().mockResolvedValue([]),
        pick: vi.fn(),
        importDocuments: vi.fn(),
      }}
      learningApi={{
        listDecks: vi.fn().mockResolvedValue([{ id: "deck-1", name: "English", description: null, color: "#ff9500", archived: false }]),
        createCard: vi.fn(),
        renameDeck,
        listDueCards: vi.fn().mockResolvedValue([]),
      }}
    />,
  );

  await user.click(screen.getByRole("button", { name: "Memora" }));
  await screen.findByText("English");

  await user.click(screen.getByRole("button", { name: "Actions for English" }));
  await user.click(screen.getByRole("button", { name: "Rename" }));

  const nameInput = screen.getByRole("textbox", { name: "Deck name" });
  await user.clear(nameInput);
  await user.type(nameInput, "American English");
  await user.click(screen.getByRole("button", { name: "Save" }));

  expect(renameDeck).toHaveBeenCalledWith("deck-1", "American English");
  expect(await screen.findByText("American English")).toBeInTheDocument();
  expect(screen.queryByText("English", { selector: ".memora-deck-list__name" })).not.toBeInTheDocument();
});

test("deletes an empty deck from Memora", async () => {
  const user = userEvent.setup();
  const deleteDeck = vi.fn().mockResolvedValue(undefined);
  const countDeckCards = vi.fn().mockResolvedValue(0);

  render(
    <App
      libraryApi={{
        list: vi.fn().mockResolvedValue([]),
        pick: vi.fn(),
        importDocuments: vi.fn(),
      }}
      learningApi={{
        listDecks: vi.fn().mockResolvedValue([{ id: "deck-1", name: "English", description: null, color: "#ff9500", archived: false }]),
        createCard: vi.fn(),
        deleteDeck,
        countDeckCards,
        listDueCards: vi.fn().mockResolvedValue([]),
      }}
    />,
  );

  await user.click(screen.getByRole("button", { name: "Memora" }));
  await screen.findByText("English");

  await user.click(screen.getByRole("button", { name: "Actions for English" }));
  await user.click(screen.getByRole("button", { name: "Delete" }));
  expect(countDeckCards).toHaveBeenCalledWith("deck-1");
  await screen.findByText('Delete "English"? This deck has no cards.');
  await user.click(screen.getByRole("button", { name: "Delete" }));

  expect(deleteDeck).toHaveBeenCalledWith("deck-1");
  await screen.findByText("Your decks will appear here.");
});

test("warns how many cards will be deleted before confirming a cascade delete", async () => {
  const user = userEvent.setup();
  const deleteDeck = vi.fn().mockResolvedValue(undefined);
  const countDeckCards = vi.fn().mockResolvedValue(5);

  render(
    <App
      libraryApi={{
        list: vi.fn().mockResolvedValue([]),
        pick: vi.fn(),
        importDocuments: vi.fn(),
      }}
      learningApi={{
        listDecks: vi.fn().mockResolvedValue([{ id: "deck-1", name: "English", description: null, color: "#ff9500", archived: false }]),
        createCard: vi.fn(),
        deleteDeck,
        countDeckCards,
        listDueCards: vi.fn().mockResolvedValue([]),
      }}
    />,
  );

  await user.click(screen.getByRole("button", { name: "Memora" }));
  await screen.findByText("English");

  await user.click(screen.getByRole("button", { name: "Actions for English" }));
  await user.click(screen.getByRole("button", { name: "Delete" }));
  await screen.findByText('Delete "English" and its 5 cards? This cannot be undone.');
  await user.click(screen.getByRole("button", { name: "Delete" }));

  expect(deleteDeck).toHaveBeenCalledWith("deck-1");
});

test("surfaces an error when a deck deletion fails", async () => {
  const user = userEvent.setup();
  const deleteDeck = vi.fn().mockRejectedValue(new Error("deck not found"));
  const countDeckCards = vi.fn().mockResolvedValue(0);

  render(
    <App
      libraryApi={{
        list: vi.fn().mockResolvedValue([]),
        pick: vi.fn(),
        importDocuments: vi.fn(),
      }}
      learningApi={{
        listDecks: vi.fn().mockResolvedValue([{ id: "deck-1", name: "English", description: null, color: "#ff9500", archived: false }]),
        createCard: vi.fn(),
        deleteDeck,
        countDeckCards,
        listDueCards: vi.fn().mockResolvedValue([]),
      }}
    />,
  );

  await user.click(screen.getByRole("button", { name: "Memora" }));
  await screen.findByText("English");

  await user.click(screen.getByRole("button", { name: "Actions for English" }));
  await user.click(screen.getByRole("button", { name: "Delete" }));
  await screen.findByText('Delete "English"? This deck has no cards.');
  await user.click(screen.getByRole("button", { name: "Delete" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("deck not found");
  expect(screen.getByText("English")).toBeInTheDocument();
});

test("opens the search palette from the sidebar search field", async () => {
  const user = userEvent.setup();

  render(
    <App
      libraryApi={{
        list: vi.fn().mockResolvedValue([]),
        pick: vi.fn(),
        importDocuments: vi.fn(),
      }}
    />,
  );

  await user.click(screen.getByRole("button", { name: "Search (Command K)" }));
  expect(await screen.findByRole("dialog")).toBeInTheDocument();
  expect(screen.getByRole("searchbox", { name: "Search your library" })).toHaveFocus();
});
