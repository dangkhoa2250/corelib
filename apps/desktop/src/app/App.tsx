import { open } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useRef, useState, useMemo } from "react";

import type { LibraryDocument } from "../domain/document";
import {
  importLocalDocuments,
  listDocuments,
  DriveEntry,
  listDrive,
  connectDrive,
  importDrive,
  clearDriveCache,
  getDocument as nativeGetDocument,
  getDocumentFileUrl as nativeGetDocumentFileUrl,
  saveReadPage as nativeSaveReadPage,
  deleteDocument as nativeDeleteDocument,
} from "../lib/desktop";
import { LibraryPage } from "../features/library/LibraryPage";
import { ReaderPage } from "../features/reader/ReaderPage";
import { CommandPalette, type CommandPaletteHandle } from "../features/search/CommandPalette";
import { DrivePicker } from "../features/drive/DrivePicker";
import { ReviewPage } from "../features/review/ReviewPage";
import { CardComposer, type CardSaveInput } from "../features/cards/CardComposer";
import { MemoraPage } from "../features/memora/MemoraPage";
import { AppSidebar, type AppSection } from "./AppSidebar";
import { CardBrowser } from "../features/cards/CardBrowser";
import { TrashPage } from "../features/cards/TrashPage";
import { createCard as nativeCreateCard, createDeck as nativeCreateDeck, renameDeck as nativeRenameDeck, deleteDeck as nativeDeleteDeck, countDeckCards as nativeCountDeckCards, listDeckCards as nativeListDeckCards, deleteCard as nativeDeleteCard, listDecks as nativeListDecks, listDueCards as nativeListDueCards, previewCardReview as nativePreviewCardReview, rateCard as nativeRateCard, getCard as nativeGetCard, searchEverything as nativeSearchEverything, getCardSource as nativeGetCardSource, listActiveTags as nativeListActiveTags, queryDeckCards as nativeQueryDeckCards, trashCards as nativeTrashCards, updateCard as nativeUpdateCard, updateAndMoveCard as nativeUpdateAndMoveCard, moveCards as nativeMoveCards, setCardsSuspended as nativeSetCardsSuspended } from "../lib/learning";
import type { BulkResult, CardBrowserQuery, CardPage, CardSource, Deck, LearningCard, ReviewPreview, ReviewRating, UpdateCardInput, UpdateAndMoveCardInput } from "../domain/learning";
import type { CreateCardInput, SearchResult } from "../lib/learning";

export interface LibraryApi {
  list: () => Promise<LibraryDocument[]>;
  pick: () => Promise<string[] | null>;
  importDocuments: (paths: string[]) => Promise<LibraryDocument[]>;
  search?: (query: string) => Promise<SearchResult[]>;
  getDocumentFileUrl?: (id: string) => Promise<string>;
  saveReadPage?: (id: string, page: number) => Promise<LibraryDocument>;
  deleteDocument?: (id: string) => Promise<void>;
  connectDrive?: () => Promise<void>;
  listDrive?: (folderId?: string) => Promise<DriveEntry[]>;
  importDrive?: (ids: string[]) => Promise<LibraryDocument[]>;
  clearDriveCache?: () => Promise<void>;
  getDocument?: (id: string) => Promise<LibraryDocument>;
}

async function pickLocalPdfs(): Promise<string[] | null> {
  const selection = await open({
    title: "Import PDFs",
    multiple: true,
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });

  if (selection === null) {
    return null;
  }

  return Array.isArray(selection) ? selection : [selection];
}

const nativeLibraryApi: LibraryApi = {
  list: listDocuments,
  pick: pickLocalPdfs,
  importDocuments: importLocalDocuments,
  search: nativeSearchEverything,
  getDocumentFileUrl: nativeGetDocumentFileUrl,
  saveReadPage: nativeSaveReadPage,
  deleteDocument: nativeDeleteDocument,
  connectDrive,
  listDrive,
  importDrive,
  clearDriveCache,
  getDocument: nativeGetDocument,
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function mergeDocuments(
  current: LibraryDocument[] | null,
  imported: LibraryDocument[],
): LibraryDocument[] {
  const documents = new Map((current ?? []).map((document) => [document.id, document]));
  for (const document of imported) {
    documents.set(document.id, document);
  }
  return [...documents.values()];
}

interface LearningApi {
  listDecks: () => Promise<Deck[]>;
  createCard: (input: CreateCardInput) => Promise<LearningCard>;
  createDeck?: (name: string) => Promise<Deck>;
  renameDeck?: (id: string, name: string) => Promise<Deck>;
  deleteDeck?: (id: string) => Promise<void>;
  countDeckCards?: (id: string) => Promise<number>;
  listDeckCards?: (deckId: string) => Promise<LearningCard[]>;
  deleteCard?: (id: string) => Promise<void>;
  listDueCards?: (limit?: number) => Promise<LearningCard[]>;
  previewCardReview?: (id: string) => Promise<ReviewPreview>;
  rateCard?: (id: string, rating: ReviewRating, elapsedMs: number) => Promise<LearningCard>;
  getCard?: (id: string) => Promise<LearningCard>;
  getCardSource?: (id: string) => Promise<CardSource | null>;
  listActiveTags?: (deckId: string) => Promise<string[]>;
  queryDeckCards?: (payload: CardBrowserQuery) => Promise<CardPage>;
  updateCard?: (payload: UpdateCardInput) => Promise<LearningCard>;
  updateAndMoveCard?: (payload: UpdateAndMoveCardInput) => Promise<LearningCard>;
  moveCards?: (cardIds: string[], destinationDeckId: string) => Promise<BulkResult>;
  setCardsSuspended?: (cardIds: string[], suspended: boolean) => Promise<BulkResult>;
  trashCards?: (cardIds: string[]) => Promise<BulkResult>;
}

const nativeLearningApi: LearningApi = {
  listDecks: nativeListDecks,
  createCard: nativeCreateCard,
  createDeck: nativeCreateDeck,
  renameDeck: nativeRenameDeck,
  deleteDeck: nativeDeleteDeck,
  countDeckCards: nativeCountDeckCards,
  listDeckCards: nativeListDeckCards,
  deleteCard: nativeDeleteCard,
  listDueCards: nativeListDueCards,
  previewCardReview: nativePreviewCardReview,
  rateCard: nativeRateCard,
  getCard: nativeGetCard,
  getCardSource: nativeGetCardSource,
  listActiveTags: nativeListActiveTags,
  queryDeckCards: nativeQueryDeckCards,
  updateCard: nativeUpdateCard,
  updateAndMoveCard: nativeUpdateAndMoveCard,
  moveCards: nativeMoveCards,
  setCardsSuspended: nativeSetCardsSuspended,
  trashCards: nativeTrashCards,
};

interface AppProps {
  libraryApi?: LibraryApi;
  learningApi?: LearningApi;
}

type AppRoute =
  | { name: "library" }
  | { name: "memora" }
  | { name: "reader"; document: LibraryDocument }
  | { name: "composer"; document: LibraryDocument; source: CardSource }
  | { name: "review"; cards: LearningCard[]; previews: Record<string, ReviewPreview> }
  | { name: "cardBrowser"; deckId: string }
  | { name: "trash" };

export function App({ libraryApi = nativeLibraryApi, learningApi = nativeLearningApi }: AppProps) {
  const learning = useMemo(() => ({
    listDecks: learningApi.listDecks,
    createCard: learningApi.createCard,
    createDeck: learningApi.createDeck ?? nativeCreateDeck,
    renameDeck: learningApi.renameDeck ?? nativeRenameDeck,
    deleteDeck: learningApi.deleteDeck ?? nativeDeleteDeck,
    countDeckCards: learningApi.countDeckCards ?? nativeCountDeckCards,
    listDeckCards: learningApi.listDeckCards ?? nativeListDeckCards,
    deleteCard: learningApi.deleteCard ?? nativeDeleteCard,
    listDueCards: learningApi.listDueCards ?? nativeListDueCards,
    previewCardReview: learningApi.previewCardReview ?? nativePreviewCardReview,
    rateCard: learningApi.rateCard ?? nativeRateCard,
    getCard: learningApi.getCard ?? nativeGetCard,
    getCardSource: learningApi.getCardSource ?? nativeGetCardSource,
    listActiveTags: learningApi.listActiveTags ?? nativeListActiveTags,
    queryDeckCards: learningApi.queryDeckCards ?? nativeQueryDeckCards,
    updateCard: learningApi.updateCard ?? nativeUpdateCard,
    updateAndMoveCard: learningApi.updateAndMoveCard ?? nativeUpdateAndMoveCard,
    moveCards: learningApi.moveCards ?? nativeMoveCards,
    setCardsSuspended: learningApi.setCardsSuspended ?? nativeSetCardsSuspended,
    trashCards: learningApi.trashCards ?? nativeTrashCards,
  }), [learningApi]);
  const [documents, setDocuments] = useState<LibraryDocument[] | null>(null);
  const [route, setRoute] = useState<AppRoute>({ name: "library" });
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [composerDecks, setComposerDecks] = useState<Deck[]>([]);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [drivePickerOpen, setDrivePickerOpen] = useState(false);
  const [driveEntries, setDriveEntries] = useState<DriveEntry[]>([]);
  const [driveFolderStack, setDriveFolderStack] = useState<string[]>([]);
  const [driveCurrentFolderId, setDriveCurrentFolderId] = useState<string | undefined>();
  const requestId = useRef(0);
  const paletteRef = useRef<CommandPaletteHandle>(null);
  const [decks, setDecks] = useState<Deck[]>([]);
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(new Set());
  const [browserRefreshTrigger, setBrowserRefreshTrigger] = useState(0);
  const [isBrowserDirty, setIsBrowserDirty] = useState(false);

  const reloadDecks = useCallback(async () => {
    try {
      const d = await learning.listDecks();
      setDecks(d);
    } catch (_) {}
  }, [learning]);

  useEffect(() => {
    if (route.name === "cardBrowser" || route.name === "trash") {
      void reloadDecks();
    }
  }, [route.name, reloadDecks]);
  const handleCreateDeck = useCallback(async (name: string) => {
    const res = await learning.createDeck(name);
    void reloadDecks();
    return res;
  }, [learning, reloadDecks]);

  const handleRenameDeck = useCallback(async (id: string, name: string) => {
    const res = await learning.renameDeck(id, name);
    void reloadDecks();
    return res;
  }, [learning, reloadDecks]);

  const handleDeleteDeck = useCallback(async (id: string) => {
    await learning.deleteDeck(id);
    void reloadDecks();
  }, [learning, reloadDecks]);

  const handleOpenDeck = useCallback((deck: Deck) => {
    if (isBrowserDirty) {
      if (!window.confirm("You have unsaved changes. Discard changes?")) return;
    }
    setIsBrowserDirty(false);
    setRoute({ name: "cardBrowser", deckId: deck.id });
  }, [isBrowserDirty]);
  const load = useCallback(async () => {
    const currentRequestId = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const loadedDocuments = await libraryApi.list();
      if (currentRequestId === requestId.current) {
        setDocuments(loadedDocuments);
      }
    } catch (loadError) {
      if (currentRequestId === requestId.current) {
        setError(errorMessage(loadError));
      }
    } finally {
      if (currentRequestId === requestId.current) {
        setLoading(false);
      }
    }
  }, [libraryApi, requestId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleImport = useCallback(async () => {
    if (importing) {
      return;
    }

    setError(null);
    setImporting(true);
    try {
      const paths = await libraryApi.pick();
      if (!paths || paths.length === 0) {
        return;
      }

      const imported = await libraryApi.importDocuments(paths);
      requestId.current += 1;
      setDocuments((current) => mergeDocuments(current, imported));
      await load();
    } catch (importError) {
      setError(errorMessage(importError));
    } finally {
      setImporting(false);
    }
  }, [importing, libraryApi, load]);

  const handleOpen = useCallback((document: LibraryDocument) => {
    setRoute({ name: "reader", document });
  }, []);

  const handleCreateCard = useCallback((source: CardSource) => {
    const readerDocument = documents?.find((candidate) => candidate.id === source.documentId);
    if (!readerDocument) {
      setError("This source document is no longer available.");
      return;
    }
    setComposerError(null);
    setRoute({ name: "composer", document: readerDocument, source });
    void learning.listDecks()
      .then((decks) => setComposerDecks(decks))
      .catch((loadError) => setComposerError(errorMessage(loadError)));
  }, [documents, learning]);

  const handleSaveCard = useCallback(async (input: CardSaveInput) => {
    await learning.createCard(input);
    const sourceDocument = documents?.find((candidate) => candidate.id === input.source?.documentId);
    if (!sourceDocument) {
      throw new Error("This source document is no longer available.");
    }
    const readerDocument = { ...sourceDocument, lastReadPage: input.source!.page };
    setRoute({ name: "reader", document: readerDocument });
  }, [documents, learning]);



  const search = useCallback(
    async (query: string) => {
      return (libraryApi.search ?? nativeSearchEverything)(query);
    },
    [libraryApi],
  );

  const handleOpenSearchResult = useCallback(async (result: SearchResult) => {
    if ("source" in (result as object)) {
      handleOpen(result as unknown as LibraryDocument);
      return;
    }
    if (result.kind === "card") {
      try {
        const card = await learning.getCard(result.id);
        const preview = await learning.previewCardReview(card.id);
        setRoute({ name: "review", cards: [card], previews: { [card.id]: preview } });
      } catch (openError) { setError(errorMessage(openError)); }
      return;
    }
    try {
      const document = documents?.find((candidate) => candidate.id === result.id)
        ?? await (libraryApi.getDocument ?? nativeGetDocument)(result.id);
      setDocuments((current) => mergeDocuments(current, [document]));
      handleOpen(document);
    } catch (openError) { setError(errorMessage(openError)); }
  }, [documents, handleOpen, learning, libraryApi]);

  const handleReviewToday = useCallback(async () => {
    try {
      const cards = await learning.listDueCards();
      const pairs = await Promise.all(cards.map(async (card) => [card.id, await learning.previewCardReview(card.id)] as const));
      setRoute({ name: "review", cards, previews: Object.fromEntries(pairs) });
    } catch (reviewError) { setError(errorMessage(reviewError)); }
  }, [learning]);

  const handleRate = useCallback(async (card: LearningCard, rating: ReviewRating, elapsedMs: number) => {
    await learning.rateCard(card.id, rating, elapsedMs);
  }, [learning]);

  const handleShowSource = useCallback(async (card: LearningCard) => {
    const source = card.source ?? await learning.getCardSource(card.id);
    if (!source?.documentId) throw new Error("Source is unavailable.");
    let document: LibraryDocument;
    try {
      document = documents?.find((candidate) => candidate.id === source.documentId)
        ?? await (libraryApi.getDocument ?? nativeGetDocument)(source.documentId);
    } catch (sourceError) {
      throw new Error(errorMessage(sourceError));
    }
    setRoute({ name: "reader", document: { ...document, lastReadPage: source.page } });
    return true;
  }, [documents, learning, libraryApi]);

  const loadDriveFolder = useCallback(async (folderId?: string) => {
    const list = libraryApi.listDrive ?? listDrive;
    const connect = libraryApi.connectDrive ?? connectDrive;
    try {
      const entries = await list(folderId);
      setDriveEntries(entries);
      setDriveCurrentFolderId(folderId);
    } catch (e) {
      if (errorMessage(e).includes("not connected") || errorMessage(e).includes("revoked")) {
        await connect();
        const entries = await list(folderId);
        setDriveEntries(entries);
        setDriveCurrentFolderId(folderId);
      } else {
        setError(errorMessage(e));
      }
    }
  }, [libraryApi]);

  const handleOpenDrive = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      setDriveFolderStack([]);
      await loadDriveFolder(undefined);
      setDrivePickerOpen(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [loadDriveFolder]);

  const handleNavigateDrive = useCallback(
    (folderId?: string) => {
      const parentId = driveFolderStack[driveFolderStack.length - 1];
      const navigatingUp =
        driveFolderStack.length > 0 &&
        (folderId === parentId || (!folderId && parentId === "root"));
      if (navigatingUp) {
        setDriveFolderStack((stack) => stack.slice(0, -1));
        void loadDriveFolder(folderId === "root" ? undefined : folderId);
        return;
      }

      setDriveFolderStack((stack) => [...stack, driveCurrentFolderId ?? "root"]);
      void loadDriveFolder(folderId);
    },
    [driveCurrentFolderId, driveFolderStack, loadDriveFolder],
  );

  const handleAddDriveDocuments = useCallback(async (ids: string[]) => {
    setError(null);
    try {
      const imported = await (libraryApi.importDrive ?? importDrive)(ids);
      setDocuments((current) => mergeDocuments(current, imported));
      setDrivePickerOpen(false);
      await load();
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [libraryApi, load]);

  const handleClearCache = useCallback(async () => {
    setError(null);
    try {
      await (libraryApi.clearDriveCache ?? clearDriveCache)();
      await load();
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [libraryApi, load]);

  const handleDelete = useCallback(async (id: string) => {
    setError(null);
    try {
      await (libraryApi.deleteDocument ?? nativeDeleteDocument)(id);
      await load();
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [libraryApi, load]);

  const handlePageChange = useCallback(async (id: string, page: number) => {
    try {
      const updated = await (libraryApi.saveReadPage ?? nativeSaveReadPage)(id, page);
      if (updated) {
        setDocuments((current) => mergeDocuments(current, [updated]));
      }
    } catch (_) {}
  }, [libraryApi]);

  const palette = <CommandPalette ref={paletteRef} search={search} onOpen={(result) => void handleOpenSearchResult(result)} />;

  if (route.name === "review") {
    return <><ReviewPage cards={route.cards} previews={route.previews} onRate={handleRate} onShowSource={handleShowSource} onBack={() => setRoute({ name: "library" })} />{palette}</>;
  }

  if (route.name === "reader") {
    return (
      <>
        <ReaderPage
          document={route.document}
          onBack={() => setRoute({ name: "library" })}
          getDocumentFileUrl={libraryApi.getDocumentFileUrl ?? nativeGetDocumentFileUrl}
          onPageChange={handlePageChange}
          onCreateCard={handleCreateCard}
        />
        {palette}
      </>
    );
  }

  if (route.name === "composer") {
    return (
      <>
        {composerError ? <div role="alert">{composerError}</div> : null}
        <CardComposer
          draft={route.source}
          decks={composerDecks}
          onCancel={() => setRoute({ name: "reader", document: { ...route.document, lastReadPage: route.source.page } })}
          onSave={handleSaveCard}
        />
      </>
    );
  }

  const activeSection: AppSection =
    route.name === "memora"
      ? "memora"
      : route.name === "cardBrowser"
      ? "memora"
      : route.name === "trash"
      ? "trash"
      : "library";

  return (
    <div className="app-shell">
      <AppSidebar
        active={activeSection}
        onNavigate={(section) => {
          if (isBrowserDirty) {
            if (!window.confirm("You have unsaved changes. Discard changes?")) return;
          }
          setIsBrowserDirty(false);
          setRoute(
            section === "memora"
              ? { name: "memora" }
              : section === "trash"
              ? { name: "trash" }
              : { name: "library" }
          );
        }}
        onSearchClick={() => paletteRef.current?.open()}
      />
      <div className="app-shell__content">
        {route.name === "memora" ? (
          <MemoraPage
            listDecks={learning.listDecks}
            listDueCards={learning.listDueCards}
            onReviewToday={handleReviewToday}
            createDeck={handleCreateDeck}
            renameDeck={handleRenameDeck}
            deleteDeck={handleDeleteDeck}
            countDeckCards={learning.countDeckCards}
            onOpenDeck={handleOpenDeck}
          />
        ) : route.name === "cardBrowser" ? (
          <CardBrowser
            decks={decks}
            initialDeckId={route.deckId}
            selectedIds={selectedCardIds}
            setSelectedIds={setSelectedCardIds}
            refreshTrigger={browserRefreshTrigger}
            onBack={() => {
              if (isBrowserDirty) {
                if (!window.confirm("You have unsaved changes. Discard changes?")) return;
              }
              setIsBrowserDirty(false);
              setRoute({ name: "memora" });
            }}
            onDirtyStateChange={setIsBrowserDirty}
            queryDeckCards={learning.queryDeckCards}
            trashCards={learning.trashCards}
            listActiveTags={learning.listActiveTags}
            createCard={learning.createCard}
            updateAndMoveCard={learning.updateAndMoveCard}
            moveCards={learning.moveCards}
            setCardsSuspended={learning.setCardsSuspended}
          />
        ) : route.name === "trash" ? (
          <TrashPage
            decks={decks}
            refreshTrigger={browserRefreshTrigger}
            onRefreshNeeded={() => {
              setBrowserRefreshTrigger(prev => prev + 1);
              void reloadDecks();
            }}
          />
        ) : (
          <>
            <LibraryPage
              documents={documents ?? []}
              onOpen={(id) => {
                const document = documents?.find((candidate) => candidate.id === id);
                if (document) {
                  handleOpen(document);
                } else {
                  setError("This document is no longer available.");
                }
              }}
              onImport={() => void handleImport()}
              onReviewToday={() => void handleReviewToday()}
              onOpenDrive={() => void handleOpenDrive()}
              onClearCache={() => void handleClearCache()}
              onDelete={(id) => void handleDelete(id)}
              getDocumentFileUrl={libraryApi.getDocumentFileUrl ?? nativeGetDocumentFileUrl}
            />
            {loading ? <p role="status" aria-label="Loading library">Loading library…</p> : null}
            {error ? (
              <div role="alert">
                <p>{error}</p>
                <button type="button" onClick={() => void load()}>
                  Retry
                </button>
              </div>
            ) : null}
          </>
        )}
        {drivePickerOpen && (
          <DrivePicker
            entries={driveEntries}
            parentId={driveFolderStack.length > 0 ? driveFolderStack[driveFolderStack.length - 1] : undefined}
            onNavigateFolder={handleNavigateDrive}
            onAdd={handleAddDriveDocuments}
            onClose={() => setDrivePickerOpen(false)}
          />
        )}
      </div>
      {palette}
    </div>
  );
}
