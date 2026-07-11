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

const emptyDeckStatistics = {
  totalCards: 0,
  newCards: 0,
  learningCards: 0,
  reviewCards: 0,
  dueCards: 0,
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
  aiApi?: {
    hasApiKey: (provider: string) => Promise<boolean>;
    saveApiKey: (provider: string, apiKey: string) => Promise<void>;
    clearApiKey: (provider: string) => Promise<void>;
    listModels: (provider: string) => Promise<any[]>;
    appleTranslationAvailable: () => Promise<boolean>;
    translate: (engineId: string, text: string, targetLanguage: string) => Promise<{ translation: string }>;
  },
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
      aiApi={aiApi}
    />,
  );
  await user.click(await screen.findByRole("button", { name: "Open Linear Algebra" }));
  await screen.findByText("Page 1 of 5");
  await selectTextOnPage();
}

test("keeps Card Browser inside Memora rather than in the application sidebar", async () => {
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
        listDueCards: vi.fn().mockResolvedValue([]),
        getDeckStatistics: vi.fn().mockResolvedValue(emptyDeckStatistics),
      }}
    />,
  );

  const sidebar = screen.getByRole("navigation", { name: "Primary" });
  expect(within(sidebar).getByRole("button", { name: "Library" })).toBeInTheDocument();
  expect(within(sidebar).getByRole("button", { name: "Memora" })).toBeInTheDocument();
  expect(within(sidebar).getByRole("button", { name: "Trash" })).toBeInTheDocument();
  expect(within(sidebar).queryByRole("button", { name: "Card Browser" })).not.toBeInTheDocument();
});

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



test("opens the card composer with the live source document and editable front/back", async () => {
  const user = userEvent.setup();
  const listDecks = vi.fn().mockResolvedValue([{ id: "english", name: "English", description: null, color: null, archived: false }]);
  const createCard = vi.fn().mockResolvedValue({});
  await openReaderAndSelectText(user, undefined, { listDecks, createCard });
  await waitFor(() => expect(listDecks).toHaveBeenCalled());
  listDecks.mockClear();

  await user.click(screen.getByRole("button", { name: "Create flashcard" }));

  expect(await screen.findByRole("dialog", { name: "Create flashcard" })).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Front" })).toHaveValue("selected source text");
  expect(screen.getByRole("textbox", { name: "Back" })).toHaveValue("");
  expect(listDecks).toHaveBeenCalledTimes(1);
});

test("uses Apple Translation by default for a new installation", async () => {
  const user = userEvent.setup();
  const translate = vi.fn().mockResolvedValue({ translation: "Văn bản nguồn đã chọn" });
  await openReaderAndSelectText(
    user,
    undefined,
    {
      listDecks: vi.fn().mockResolvedValue([{ id: "english", name: "English", description: null, color: null, archived: false }]),
      createCard: vi.fn(),
    },
    {
      hasApiKey: vi.fn().mockResolvedValue(false),
      saveApiKey: vi.fn().mockResolvedValue(undefined),
      clearApiKey: vi.fn().mockResolvedValue(undefined),
      listModels: vi.fn().mockResolvedValue([]),
      appleTranslationAvailable: vi.fn().mockResolvedValue(true),
      translate,
    },
  );

  await user.click(screen.getByRole("button", { name: "Create flashcard" }));
  await user.click(await screen.findByRole("button", { name: "Translate" }));

  expect(translate).toHaveBeenCalledWith(
    "apple-translation",
    "selected source text",
    "Vietnamese",
  );
  expect(screen.getByRole("textbox", { name: "Back" })).toHaveValue("Văn bản nguồn đã chọn");
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



test("navigates between Library and Memora via the sidebar", async () => {
  const user = userEvent.setup();
  const getDeckStatistics = vi.fn().mockResolvedValue(emptyDeckStatistics);

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
        getDeckStatistics,
      }}
    />,
  );

  expect(screen.getByRole("heading", { level: 1, name: "Library" })).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Memora" }));
  expect(await screen.findByRole("heading", { level: 1, name: "Memora" })).toBeInTheDocument();
  expect(await screen.findByText("English")).toBeInTheDocument();
  expect(getDeckStatistics).toHaveBeenCalledWith("deck-1");

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
        getDeckStatistics: vi.fn().mockResolvedValue(emptyDeckStatistics),
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
  const queryDeckCards = vi.fn().mockResolvedValue({
    rows: [],
    total: 0,
    nextCursor: null,
  });
  const listActiveTags = vi.fn().mockResolvedValue([]);

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
        queryDeckCards,
        listActiveTags,
        listDueCards: vi.fn().mockResolvedValue([]),
        getDeckStatistics: vi.fn().mockResolvedValue(emptyDeckStatistics),
      }}
    />,
  );

  await user.click(screen.getByRole("button", { name: "Memora" }));
  await user.click(await screen.findByRole("button", { name: "Biology" }));

  expect(queryDeckCards).toHaveBeenCalledWith({
    deckId: "deck-1",
    query: "",
    states: [],
    tags: [],
    sort: "updated_desc",
    cursor: null,
    limit: 50,
  });
  await screen.findByText("No cards found matching current filters.");

  // Click Add Card to open side panel
  await user.click(screen.getByRole("button", { name: "Add Card" }));

  // Inside side panel, enter details
  const frontInput = await screen.findByRole("textbox", { name: "Front" });
  await user.type(frontInput, "What is a mitochondrion?");
  await user.type(screen.getByRole("textbox", { name: "Back" }), "The powerhouse of the cell");
  await user.type(screen.getByRole("textbox", { name: "Tags" }), "biology");

  // Mock returning the new card on next query
  queryDeckCards.mockResolvedValue({
    rows: [newCard],
    total: 1,
    nextCursor: null,
  });

  // Click Save/Add Card button in form
  const panel = screen.getByRole("dialog", { name: "Add Card" });
  await user.click(within(panel).getByRole("button", { name: "Add Card" }));

  expect(createCard).toHaveBeenCalledWith({
    deckName: "Biology",
    front: "What is a mitochondrion?",
    back: "The powerhouse of the cell",
    tags: ["biology"],
    frontLanguage: "en",
  });

  // Verify it is listed in Card Browser table
  await screen.findByText("What is a mitochondrion?");
  await screen.findByText("The powerhouse of the cell");

  // Go back to Memora
  await user.click(screen.getByRole("button", { name: "← Back" }));
  expect(await screen.findByRole("heading", { level: 1, name: "Memora" })).toBeInTheDocument();
});

test("deletes a card from a deck's card list", async () => {
  const user = userEvent.setup();
  const existingCard = {
    id: "card-1",
    deckId: "deck-1",
    deckName: "Biology",
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
    createdAt: "2026-07-10T00:00:00.000Z",
    updatedAt: "2026-07-10T00:00:00.000Z",
    deletedAt: null,
    deletedFromDeckName: null,
  };
  const trashCardsMock = vi.fn().mockResolvedValue({ successCount: 1, failedCount: 0, errors: [] });
  const queryDeckCards = vi.fn()
    .mockResolvedValueOnce({
      rows: [existingCard],
      total: 1,
      nextCursor: null,
    })
    .mockResolvedValue({
      rows: [],
      total: 0,
      nextCursor: null,
    });
  const listActiveTags = vi.fn().mockResolvedValue([]);

  // Mock window.confirm to approve
  const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

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
        queryDeckCards,
        trashCards: trashCardsMock,
        listActiveTags,
        listDueCards: vi.fn().mockResolvedValue([]),
        getDeckStatistics: vi.fn().mockResolvedValue(emptyDeckStatistics),
      }}
    />,
  );

  await user.click(screen.getByRole("button", { name: "Memora" }));
  await user.click(await screen.findByRole("button", { name: "Biology" }));
  await screen.findByText("What is ATP?");

  // Click the checkbox for this card (in the row select column)
  const checkboxes = screen.getAllByRole("checkbox");
  // The first checkbox is the 'select all' header checkbox. The second checkbox is for the card row!
  await user.click(checkboxes[1]);

  // Click bulk Trash button
  const bulkBanner = screen.getByText(/cards selected/).closest<HTMLElement>(".card-browser__bulk-banner");
  if (!bulkBanner) throw new Error("bulk action banner not found");
  await user.click(within(bulkBanner).getByRole("button", { name: "Trash" }));

  expect(confirmSpy).toHaveBeenCalledWith("Are you sure you want to move these 1 cards to Trash?");
  expect(trashCardsMock).toHaveBeenCalledWith(["card-1"]);



  // Simulate refresh reload trigger
  await waitFor(() => {
    expect(screen.queryByText("What is ATP?")).not.toBeInTheDocument();
  });
  await screen.findByText("No cards found matching current filters.");

  confirmSpy.mockRestore();
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
        getDeckStatistics: vi.fn().mockResolvedValue(emptyDeckStatistics),
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
        getDeckStatistics: vi.fn().mockResolvedValue(emptyDeckStatistics),
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
        getDeckStatistics: vi.fn().mockResolvedValue(emptyDeckStatistics),
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
        getDeckStatistics: vi.fn().mockResolvedValue(emptyDeckStatistics),
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
  expect(screen.getByRole("searchbox", { name: "Search everything" })).toHaveFocus();
});
