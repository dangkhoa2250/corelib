import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { App } from "./App";
import type { AccountApi } from "../domain/account";

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
          getAnnotations: vi.fn().mockResolvedValue([]),
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

import { beforeAll, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";

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
if (
  typeof globalThis.document !== "undefined" &&
  typeof globalThis.document.elementFromPoint !== "function"
) {
  (globalThis.document as any).elementFromPoint = () => globalThis.document.body;
}

beforeEach(() => {
  vi.mocked(invoke).mockImplementation(async (cmd, _args) => {
    if (cmd === "account_session") {
      return {
        profile: {
          id: "u-12",
          displayName: "Mai",
          email: "mai@example.test",
          status: "approved",
          role: "member",
          analyticsEnabled: true,
        },
        entitlements: {
          featureKeys: [],
          refreshedAt: "2026-07-13T21:00:00Z",
        },
      };
    }
    if (cmd === "get_daily_statistics_snapshots") {
      return [];
    }
    return undefined as any;
  });
});

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
  numPages: null,
};

const emptyDeckStatistics = {
  totalCards: 0,
  newCards: 0,
  learningCards: 0,
  reviewCards: 0,
  dueCards: 0,
};

function anonymousAccountApi(): AccountApi {
  return {
    register: vi.fn(),
    signIn: vi.fn(),
    currentSession: vi.fn().mockRejectedValue(new Error("No session")),
    signOut: vi.fn(),
    setAnalyticsEnabled: vi.fn(),
    sendAnalytics: vi.fn(),
    adminListUsers: vi.fn(),
    adminSetStatus: vi.fn(),
    adminSetGroups: vi.fn(),
    adminListGroups: vi.fn(),
    adminCreateGroup: vi.fn(),
    adminListFeatures: vi.fn(),
    adminCreateFeature: vi.fn(),
    adminSetFeatureAssignment: vi.fn(),
    adminMetrics: vi.fn(),
    adminDeleteUser: vi.fn(),
    upsertDailyStatistics: vi.fn(),
    adminStatistics: vi.fn(),
  };
}

const englishDeck = {
  id: "deck-1",
  name: "English",
  description: null,
  color: "#ff9500",
  archived: false,
};

function studyCard(overrides: Record<string, unknown> = {}) {
  return {
    id: "card-1",
    deckId: "deck-1",
    front: "Question",
    back: "Answer",
    state: "review" as const,
    dueAt: "2026-07-16T09:00:00.000Z",
    reps: 1,
    lapses: 0,
    stability: 1,
    difficulty: 1,
    lastReviewAt: null,
    learningStep: null,
    source: null,
    tags: [],
    frontLanguage: null,
    ...overrides,
  };
}

function studyGrant(overrides: Record<string, unknown> = {}) {
  return {
    grantToken: "grant-1",
    expectedState: "review" as const,
    expectedDueAt: "2026-07-16T09:00:00.000Z",
    card: studyCard(),
    preview: {
      again: { dueAt: "2026-07-16T09:10:00.000Z", intervalLabel: "10m" },
      hard: { dueAt: "2026-07-17T09:00:00.000Z", intervalLabel: "1d" },
      good: { dueAt: "2026-07-19T09:00:00.000Z", intervalLabel: "3d" },
      easy: { dueAt: "2026-07-23T09:00:00.000Z", intervalLabel: "7d" },
    },
    ...overrides,
  };
}

function studySession(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: "session-1",
    scope: { kind: "all" as const },
    cards: [studyGrant()],
    counts: { learning: 0, review: 1, new: 0 },
    nextLearningDueAt: null,
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
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
        getStudyReadyCounts: vi.fn().mockResolvedValue({ learning: 0, review: 0, new: 0, total: 0 }),
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

async function selectNewTextOnPage(text: string) {
  const layer = await waitFor(() => {
    const candidate = globalThis.document.querySelector<HTMLElement>("#pdf-page-1 .textLayer");
    if (!candidate) throw new Error("PDF text layer did not render");
    return candidate;
  });
  const span = globalThis.document.createElement("span");
  span.textContent = text;
  layer.append(span);
  const range = globalThis.document.createRange();
  range.selectNodeContents(span);
  Object.defineProperty(range, "getClientRects", {
    value: () => [new DOMRect(0, 0, 100, 16)],
  });
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  fireEvent.mouseUp(layer);
}

/** The Tiptap contenteditable backing a labeled editor face. */
function editor(name: string): HTMLElement {
  const found = screen
    .getAllByLabelText(name)
    .find((el) => el.hasAttribute("contenteditable"));
  if (!found) throw new Error(`No rich editor contenteditable found for label "${name}"`);
  return found;
}

test("renders the Library heading", () => {
  render(<App />);

  expect(
    screen.getByRole("heading", { level: 1, name: "Library" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Clear downloaded Drive files" }),
  ).not.toBeInTheDocument();
});

test("disables native suggestions on sign-in fields before the account gate renders app routes", async () => {
  render(<App accountApi={anonymousAccountApi()} />);

  const email = await screen.findByLabelText("Email Address");
  expect(email).toHaveAttribute("autocomplete", "off");
  expect(email).toHaveAttribute("autocorrect", "off");
  expect(email).toHaveAttribute("autocapitalize", "off");
  expect(email).toHaveAttribute("spellcheck", "false");
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

  await user.click(screen.getByRole("button", { name: "Import" }));
  await user.click(screen.getByRole("menuitem", { name: "Upload file" }));

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
  await user.click(screen.getByRole("button", { name: "Import" }));
  await user.click(screen.getByRole("menuitem", { name: "Upload file" }));

  expect(importDocuments).not.toHaveBeenCalled();
});

test("imports selected files concurrently and removes only the completed placeholder", async () => {
  const user = userEvent.setup();
  const firstImport = deferred<typeof document[]>();
  const secondImport = deferred<typeof document[]>();
  const importDocuments = vi.fn((paths: string[]) =>
    paths[0] === "/chosen/first.pdf" ? firstImport.promise : secondImport.promise,
  );

  render(
    <App
      libraryApi={{
        list: vi.fn().mockResolvedValue([]),
        pick: vi.fn().mockResolvedValue(["/chosen/first.pdf", "/chosen/second.pdf"]),
        importDocuments,
      }}
    />,
  );

  await screen.findByText("Your books will appear here.");
  await user.click(screen.getByRole("button", { name: "Import" }));
  await user.click(screen.getByRole("menuitem", { name: "Upload file" }));

  await waitFor(() => {
    expect(importDocuments).toHaveBeenCalledTimes(2);
  });
  expect(importDocuments).toHaveBeenNthCalledWith(1, ["/chosen/first.pdf"]);
  expect(importDocuments).toHaveBeenNthCalledWith(2, ["/chosen/second.pdf"]);
  expect(screen.getByLabelText("Importing first")).toBeInTheDocument();
  expect(screen.getByLabelText("Importing second")).toBeInTheDocument();

  await act(async () => {
    firstImport.resolve([{ ...document, id: "first", title: "First" }]);
    await firstImport.promise;
  });

  await waitFor(() => {
    expect(screen.queryByLabelText("Importing first")).not.toBeInTheDocument();
  });
  expect(screen.getByLabelText("Importing second")).toBeInTheDocument();

  await act(async () => {
    secondImport.resolve([{ ...document, id: "second", title: "Second" }]);
    await secondImport.promise;
  });
});

test("ignores an initial load failure after a selected import begins", async () => {
  const user = userEvent.setup();
  const initialList = deferred<typeof document[]>();
  const importResult = deferred<typeof document[]>();

  render(
    <App
      libraryApi={{
        list: vi.fn().mockReturnValue(initialList.promise),
        pick: vi.fn().mockResolvedValue(["/chosen/linear-algebra.pdf"]),
        importDocuments: vi.fn().mockReturnValue(importResult.promise),
      }}
    />,
  );

  await user.click(screen.getByRole("button", { name: "Import" }));
  await user.click(screen.getByRole("menuitem", { name: "Upload file" }));
  await waitFor(() => expect(screen.getByLabelText("Importing linear-algebra")).toBeInTheDocument());

  await act(async () => {
    initialList.reject(new Error("Library loading failed"));
    await Promise.resolve();
  });

  await act(async () => {
    importResult.resolve([document]);
    await importResult.promise;
  });

  expect(await screen.findByRole("button", { name: "Open Linear Algebra" })).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("keeps a successful import when a retry load began while another file was pending", async () => {
  const user = userEvent.setup();
  const retryList = deferred<typeof document[]>();
  const secondImport = deferred<typeof document[]>();
  const importDocuments = vi.fn((paths: string[]) =>
    paths[0] === "/chosen/first.pdf"
      ? Promise.reject(new Error("First import failed"))
      : secondImport.promise,
  );

  render(
    <App
      libraryApi={{
        list: vi.fn()
          .mockResolvedValueOnce([])
          .mockReturnValueOnce(retryList.promise),
        pick: vi.fn().mockResolvedValue(["/chosen/first.pdf", "/chosen/second.pdf"]),
        importDocuments,
      }}
    />,
  );

  await screen.findByText("Your books will appear here.");
  await user.click(screen.getByRole("button", { name: "Import" }));
  await user.click(screen.getByRole("menuitem", { name: "Upload file" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("First import failed");
  expect(screen.getByLabelText("Importing second")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Retry" }));

  await act(async () => {
    secondImport.resolve([document]);
    await secondImport.promise;
  });
  expect(await screen.findByRole("button", { name: "Open Linear Algebra" })).toBeInTheDocument();

  await act(async () => {
    retryList.resolve([]);
    await retryList.promise;
  });

  expect(screen.getByRole("button", { name: "Open Linear Algebra" })).toBeInTheDocument();
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

test("renames a document from the library actions menu", async () => {
  const user = userEvent.setup();
  const renameDocument = vi.fn().mockResolvedValue({
    ...document,
    title: "Linear Algebra 2",
  });

  render(
    <App
      libraryApi={{
        list: vi.fn().mockResolvedValue([document]),
        pick: vi.fn(),
        importDocuments: vi.fn(),
        deleteDocument: vi.fn().mockResolvedValue(undefined),
        renameDocument,
      }}
    />,
  );

  await screen.findByRole("button", { name: "Open Linear Algebra" });
  await user.click(screen.getByRole("button", { name: "Actions for Linear Algebra" }));
  await user.click(screen.getByRole("button", { name: "Rename" }));
  const renameInput = await screen.findByRole("textbox", { name: "Rename document title" });
  await user.clear(renameInput);
  await user.type(renameInput, "Linear Algebra 2");
  await user.click(screen.getByRole("button", { name: "Save title" }));

  await waitFor(() => {
    expect(renameDocument).toHaveBeenCalledWith("linear-algebra", "Linear Algebra 2");
  });
});



test("keeps imported documents when an older initial load resolves last", async () => {
  const user = userEvent.setup();
  const initialList = deferred<typeof document[]>();
  const list = vi.fn().mockReturnValue(initialList.promise);
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

  await user.click(screen.getByRole("button", { name: "Import" }));
  await user.click(screen.getByRole("menuitem", { name: "Upload file" }));
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

  await user.click(await screen.findByRole("button", { name: "Import" }));
  await user.click(await screen.findByRole("menuitem", { name: "Google Drive" }));
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
  expect(editor("Front")).toHaveTextContent("selected source text");
  expect(editor("Back")).toHaveTextContent("");
  expect(listDecks).toHaveBeenCalledTimes(1);
});

test("replaces the front when creating a card from a newer selection while the composer is open", async () => {
  const user = userEvent.setup();
  const listDecks = vi.fn().mockResolvedValue([{ id: "english", name: "English", description: null, color: null, archived: false }]);
  const createCard = vi.fn().mockResolvedValue({});
  await openReaderAndSelectText(user, undefined, { listDecks, createCard });

  await user.click(screen.getByRole("button", { name: "Create flashcard" }));
  expect(await screen.findByRole("dialog", { name: "Create flashcard" })).toBeInTheDocument();
  expect(editor("Front")).toHaveTextContent("selected source text");

  await selectNewTextOnPage("A basis spans the space.");
  await user.click(screen.getByRole("button", { name: "Create flashcard" }));

  expect(await screen.findByRole("dialog", { name: "Create flashcard" })).toBeInTheDocument();
  expect(editor("Front")).toHaveTextContent("A basis spans the space.");
});

test("auto-translates again when a newer selection replaces the front", async () => {
  const platform = vi.spyOn(window.navigator, "platform", "get").mockReturnValue("MacIntel");
  const userAgent = vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (Macintosh)");
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
  await waitFor(() => {
    expect(translate).toHaveBeenCalledTimes(1);
  });

  await selectNewTextOnPage("A basis spans the space.");
  await user.click(screen.getByRole("button", { name: "Create flashcard" }));

  await waitFor(() => {
    expect(translate).toHaveBeenLastCalledWith("apple-translation", "A basis spans the space.", "Vietnamese", "en");
  });
  await waitFor(() => {
    expect(editor("Front")).toHaveTextContent("A basis spans the space.");
  });
  await waitFor(() => {
    expect(editor("Back")).toHaveTextContent("Văn bản nguồn đã chọn");
  });
  userAgent.mockRestore();
  platform.mockRestore();
});

test("uses Apple Translation by default for a new installation", async () => {
  const platform = vi.spyOn(window.navigator, "platform", "get").mockReturnValue("MacIntel");
  const userAgent = vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (Macintosh)");
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

  await waitFor(() => {
    expect(translate).toHaveBeenCalledWith("apple-translation", "selected source text", "Vietnamese", "en");
  });
  await waitFor(() => {
    expect(editor("Back")).toHaveTextContent("Văn bản nguồn đã chọn");
  });
  userAgent.mockRestore();
  platform.mockRestore();
});

test("auto-translates a new card into the configured language", async () => {
  const platform = vi.spyOn(window.navigator, "platform", "get").mockReturnValue("MacIntel");
  const userAgent = vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (Macintosh)");
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

  await waitFor(() => {
    expect(translate).toHaveBeenCalledWith("apple-translation", "selected source text", "Vietnamese", "en");
  });
  await waitFor(() => {
    expect(editor("Back")).toHaveTextContent("Văn bản nguồn đã chọn");
  });
  userAgent.mockRestore();
  platform.mockRestore();
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
  await user.click(editor("Back"));
  await user.keyboard("definition");
  await user.click(screen.getByRole("combobox", { name: "Deck" }));
  await user.click(screen.getByRole("option", { name: "English" }));
  await user.click(screen.getByRole("button", { name: "Save" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Card save failed");  expect(screen.getByRole("dialog", { name: "Create flashcard" })).toBeInTheDocument();
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
  await user.click(editor("Back"));
  await user.keyboard("definition");
  await user.click(screen.getByRole("combobox", { name: "Deck" }));
  await user.click(screen.getByRole("option", { name: "English" }));
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
        getStudyReadyCounts: vi.fn().mockResolvedValue({ learning: 0, review: 0, new: 0, total: 0 }),
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
        getStudyReadyCounts: vi.fn().mockResolvedValue({ learning: 0, review: 0, new: 0, total: 0 }),
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
        getStudyReadyCounts: vi.fn().mockResolvedValue({ learning: 0, review: 0, new: 0, total: 0 }),
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
  const frontInput = await waitFor(() => editor("Front"));
  await user.click(frontInput);
  await user.keyboard("What is a mitochondrion?");
  await user.click(editor("Back"));
  await user.keyboard("The powerhouse of the cell");

  // Mock returning the new card on next query
  queryDeckCards.mockResolvedValue({
    rows: [newCard],
    total: 1,
    nextCursor: null,
  });

  // Click Save/Add Card button in form
  const panel = screen.getByRole("dialog", { name: "Add Card" });
  await user.click(within(panel).getByRole("button", { name: "Save" }));

  const createInput = vi.mocked(createCard).mock.calls[0][0];
  expect(createInput).toMatchObject({
    deckName: "Biology",
    front: "What is a mitochondrion?",
    back: "The powerhouse of the cell",
    tags: [],
    frontLanguage: "en",
    frontDoc: expect.any(Object),
    backDoc: expect.any(Object),
    mediaDraftId: expect.any(String),
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
        getStudyReadyCounts: vi.fn().mockResolvedValue({ learning: 0, review: 0, new: 0, total: 0 }),
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
        getStudyReadyCounts: vi.fn().mockResolvedValue({ learning: 0, review: 0, new: 0, total: 0 }),
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
        getStudyReadyCounts: vi.fn().mockResolvedValue({ learning: 0, review: 0, new: 0, total: 0 }),
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
        getStudyReadyCounts: vi.fn().mockResolvedValue({ learning: 0, review: 0, new: 0, total: 0 }),
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
        getStudyReadyCounts: vi.fn().mockResolvedValue({ learning: 0, review: 0, new: 0, total: 0 }),
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

test("navigates to Statistics via sidebar button", async () => {
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

  const sidebar = screen.getByRole("navigation", { name: "Primary" });
  expect(within(sidebar).getByRole("button", { name: "Statistics" })).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Statistics" }));
  expect(await screen.findByRole("heading", { level: 1, name: "Statistics" })).toBeInTheDocument();
  expect(screen.getByRole("navigation", { name: "Primary" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Statistics" })).toHaveAttribute(
    "aria-current",
    "page",
  );
});

test("Quick Open resolves insights alias to the statistics route", async () => {
  const user = userEvent.setup();
  vi.mocked(invoke).mockImplementation(async (cmd) => {
    if (cmd === "search_everything") return [] as any;
    if (cmd === "list_trashed_cards") return { rows: [], total: 0, nextCursor: null } as any;
    return undefined as any;
  });

  render(
    <App
      libraryApi={{ list: vi.fn().mockResolvedValue([]), pick: vi.fn(), importDocuments: vi.fn() }}
      learningApi={{
        listDecks: vi.fn().mockResolvedValue([]),
        createCard: vi.fn(),
        getStudyReadyCounts: vi.fn().mockResolvedValue({ learning: 0, review: 0, new: 0, total: 0 }),
        getDeckStatistics: vi.fn().mockResolvedValue(emptyDeckStatistics),
      }}
    />,
  );

  const searchButton = screen.getByRole("button", { name: "Search (Ctrl+K)" });
  await user.click(searchButton);
  await screen.findByRole("searchbox", { name: "Quick Open" });
  const searchbox = screen.getByRole("searchbox", { name: "Quick Open" });
  await user.type(searchbox, "insights");

  const entry = await screen.findByRole("button", { name: /Open Statistics/ });
  expect(entry).toBeInTheDocument();
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

  await user.click(screen.getByRole("button", { name: "Search (Ctrl+K)" }));
  expect(await screen.findByRole("dialog")).toBeInTheDocument();
  expect(screen.getByRole("searchbox", { name: "Quick Open" })).toHaveFocus();
});

test("keeps Quick Open and Command Palette available from Settings", async () => {
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

  await user.click(screen.getByRole("button", { name: "Settings" }));
  await screen.findByLabelText("Search settings");

  fireEvent.keyDown(window, { key: "k", ctrlKey: true });
  expect(await screen.findByRole("dialog", { name: "Quick Open" })).toBeInTheDocument();
  fireEvent.keyDown(window, { key: "Escape" });

  fireEvent.keyDown(window, { key: "k", ctrlKey: true, shiftKey: true });
  expect(await screen.findByRole("dialog", { name: "Command Palette" })).toBeInTheDocument();
});

test("Quick Open surfaces Settings → Memora and deep-links its section", async () => {
  const user = userEvent.setup();
  vi.mocked(invoke).mockImplementation(async (cmd) => {
    if (cmd === "search_everything") return [] as any;
    if (cmd === "list_trashed_cards") return { rows: [], total: 0, nextCursor: null } as any;
    return undefined as any;
  });
  const getMemoraSettings = vi.fn().mockResolvedValue({ newCardsPerDay: 20, desiredRetention: 0.9 });
  render(
    <App
      libraryApi={{ list: vi.fn().mockResolvedValue([]), pick: vi.fn(), importDocuments: vi.fn() }}
      learningApi={{
        listDecks: vi.fn().mockResolvedValue([]),
        createCard: vi.fn(),
        getDeckStatistics: vi.fn().mockResolvedValue(emptyDeckStatistics),
        getMemoraSettings,
        updateMemoraSettings: vi.fn().mockResolvedValue({ newCardsPerDay: 20, desiredRetention: 0.9 }),
      }}
    />,
  );

  await user.click(screen.getByRole("button", { name: "Search (Ctrl+K)" }));
  await user.type(await screen.findByRole("searchbox", { name: "Quick Open" }), "Settings Memora");
  await user.click(await screen.findByRole("button", { name: /Open Memora/ }));

  expect(await screen.findByRole("heading", { name: "Memora" })).toBeInTheDocument();
  expect(await screen.findByLabelText("New cards per day")).toBeInTheDocument();
  expect(getMemoraSettings).toHaveBeenCalled();
});

test("Review Today starts a backend study session", async () => {
  const user = userEvent.setup();
  const startStudySession = vi.fn().mockResolvedValue(studySession());
  render(
    <App
      libraryApi={{ list: vi.fn().mockResolvedValue([]), pick: vi.fn(), importDocuments: vi.fn() }}
      learningApi={{
        listDecks: vi.fn().mockResolvedValue([englishDeck]),
        createCard: vi.fn(),
        getStudyReadyCounts: vi.fn(() => { throw new Error("legacy due query must not be used"); }),
        startStudySession,
        refreshStudySession: vi.fn().mockResolvedValue(studySession()),
        rateStudyCard: vi.fn(),
        getDeckStatistics: vi.fn().mockResolvedValue(emptyDeckStatistics),
      }}
    />,
  );

  await user.click(screen.getByRole("button", { name: "Memora" }));
  await user.click(await screen.findByRole("button", { name: /Review/ }));

  expect(startStudySession).toHaveBeenCalledWith({ kind: "all" });
  expect(await screen.findAllByText("Question")).toHaveLength(2);
});

test("Study a deck starts a deck-scoped study session", async () => {
  const user = userEvent.setup();
  const startStudySession = vi.fn().mockResolvedValue(studySession({ scope: { kind: "deck", deckId: "deck-1" } }));
  render(
    <App
      libraryApi={{ list: vi.fn().mockResolvedValue([]), pick: vi.fn(), importDocuments: vi.fn() }}
      learningApi={{
        listDecks: vi.fn().mockResolvedValue([englishDeck]),
        createCard: vi.fn(),
        getStudyReadyCounts: vi.fn().mockResolvedValue({ learning: 0, review: 0, new: 0, total: 0 }),
        startStudySession,
        refreshStudySession: vi.fn().mockResolvedValue(studySession()),
        rateStudyCard: vi.fn(),
        getDeckStatistics: vi.fn().mockResolvedValue({ ...emptyDeckStatistics, newCards: 1 }),
      }}
    />,
  );

  await user.click(screen.getByRole("button", { name: "Memora" }));
  await user.click(await screen.findByRole("button", { name: "Study English" }));
  await user.click(await screen.findByRole("menuitem", { name: "Review Due" }));

  expect(startStudySession).toHaveBeenCalledWith({ kind: "deck", deckId: "deck-1" });
  expect(await screen.findAllByText("Question")).toHaveLength(2);
});

test("an expired refresh starts a replacement session with the same scope", async () => {
  const user = userEvent.setup();
  const expired = studySession({
    cards: [],
    nextLearningDueAt: new Date(Date.now() - 1).toISOString(),
  });
  const replacement = { ...studySession(), sessionId: "session-2" };
  const refreshStudySession = vi.fn()
    .mockRejectedValueOnce(new Error("study session expired"))
    .mockResolvedValue({ ...replacement, cards: [] });
  const startStudySession = vi.fn().mockResolvedValueOnce(expired).mockResolvedValueOnce(replacement);
  const rateStudyCard = vi.fn().mockResolvedValue({ card: replacement.cards[0].card, reviewLogId: "log-2" });
  render(
    <App
      libraryApi={{ list: vi.fn().mockResolvedValue([]), pick: vi.fn(), importDocuments: vi.fn() }}
      learningApi={{
        listDecks: vi.fn().mockResolvedValue([englishDeck]),
        createCard: vi.fn(),
        getStudyReadyCounts: vi.fn().mockResolvedValue({ learning: 0, review: 0, new: 0, total: 0 }),
        startStudySession,
        refreshStudySession,
        rateStudyCard,
        getDeckStatistics: vi.fn().mockResolvedValue(emptyDeckStatistics),
      }}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Memora" }));
  await user.click(await screen.findByRole("button", { name: /Review/ }));
  await user.click(await screen.findByRole("button", { name: /Flashcard/i }));
  await user.click(screen.getByRole("button", { name: "Good" }));
  expect(startStudySession).toHaveBeenLastCalledWith({ kind: "all" });
  expect(rateStudyCard).toHaveBeenCalledWith(expect.objectContaining({ sessionId: "session-2" }));
});
