import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useRef, useState, useMemo } from "react";

import { useTheme } from "../contexts/ThemeContext";
import type { LibraryDocument, PageTag } from "../domain/document";
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
  renameDocument as nativeRenameDocument,
  listPageTags as nativeListPageTags,
  togglePageTag as nativeTogglePageTag,
  saveGoogleDriveCredentials,
  loadGoogleDriveCredentials,
  clearGoogleDriveCredentials,
} from "../lib/desktop";
import { LibraryPage } from "../features/library/LibraryPage";
import { ReaderPage } from "../features/reader/ReaderPage";
import { CommandPalette, type CommandPaletteHandle } from "../features/search/CommandPalette";
import { DrivePicker } from "../features/drive/DrivePicker";
import { ReviewPage } from "../features/review/ReviewPage";
import type { CardSaveInput } from "../features/cards/CardComposer";
import { MemoraPage } from "../features/memora/MemoraPage";
import { DeckDetailPage } from "../features/memora/DeckDetailPage";
import { AppSidebar, type AppSection } from "./AppSidebar";
import type { PendingImport } from "./ImportProgress";
import { CardBrowser } from "../features/cards/CardBrowser";
import { TrashPage } from "../features/cards/TrashPage";
import { SettingsPage, readTranslationPreference, type SettingsSection } from "../features/settings/SettingsPage";
import { appleTranslationAvailable, clearAiApiKey, hasAiApiKey, listAiModels, saveAiApiKey, translateText } from "../lib/ai";
import type { AiModel, AiProviderId } from "../domain/ai";
import type { TranslationEngineId } from "../domain/translation";
import { createCard as nativeCreateCard, createDeck as nativeCreateDeck, renameDeck as nativeRenameDeck, deleteDeck as nativeDeleteDeck, countDeckCards as nativeCountDeckCards, listDeckCards as nativeListDeckCards, deleteCard as nativeDeleteCard, listDecks as nativeListDecks, listDueCards as nativeListDueCards, previewCardReview as nativePreviewCardReview, rateCard as nativeRateCard, getCard as nativeGetCard, searchEverything as nativeSearchEverything, getCardSource as nativeGetCardSource, listActiveTags as nativeListActiveTags, queryDeckCards as nativeQueryDeckCards, trashCards as nativeTrashCards, listTrashedCards as nativeListTrashedCards, updateCard as nativeUpdateCard, updateAndMoveCard as nativeUpdateAndMoveCard, moveCards as nativeMoveCards, setCardsSuspended as nativeSetCardsSuspended, getDeckStatistics as nativeGetDeckStatistics, startStudySession as nativeStartStudySession, refreshStudySession as nativeRefreshStudySession, rateStudyCard as nativeRateStudyCard, getMemoraSettings as nativeGetMemoraSettings, updateMemoraSettings as nativeUpdateMemoraSettings, getDeckLearningSettings as nativeGetDeckLearningSettings, updateDeckLearningSettings as nativeUpdateDeckLearningSettings } from "../lib/learning";
import { type BulkResult, type CardBrowserQuery, type CardPage, type CardSource, type Deck, type DeckStatistics, type LearningCard, type ReviewPreview, type ReviewRating, type UpdateCardInput, type UpdateAndMoveCardInput, type StudyScope, type StudySession, type StudyRatingInput, type StudyRatingResult, type StudyGrant, type MemoraSettings, type DeckLearningSettings } from "../domain/learning";
import type { CreateCardInput, SearchResult } from "../lib/learning";
import { AccountGate, useAccount } from "../features/account/AccountGate";
import { PocketBaseAccountApiClient } from "../lib/account";
import type { AccountApi } from "../domain/account";
import { AdminPage } from "../features/admin/AdminPage";
import { AnalyticsClient } from "../lib/analytics";

export interface LibraryApi {
  list: () => Promise<LibraryDocument[]>;
  pick: () => Promise<string[] | null>;
  importDocuments: (paths: string[]) => Promise<LibraryDocument[]>;

  getDocumentFileUrl?: (id: string) => Promise<string>;
  saveReadPage?: (id: string, page: number, numPages?: number) => Promise<LibraryDocument>;
  deleteDocument?: (id: string) => Promise<void>;
  renameDocument?: (id: string, title: string) => Promise<LibraryDocument>;
  connectDrive?: () => Promise<void>;
  listDrive?: (folderId?: string) => Promise<DriveEntry[]>;
  importDrive?: (ids: string[]) => Promise<LibraryDocument[]>;
  clearDriveCache?: () => Promise<void>;
  getDocument?: (id: string) => Promise<LibraryDocument>;
  listPageTags?: (id: string) => Promise<PageTag[]>;
  togglePageTag?: (documentId: string, page: number) => Promise<PageTag[]>;
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
  getDocumentFileUrl: nativeGetDocumentFileUrl,
  saveReadPage: nativeSaveReadPage,
  deleteDocument: nativeDeleteDocument,
  renameDocument: nativeRenameDocument,
  connectDrive,
  listDrive,
  importDrive,
  clearDriveCache,
  getDocument: nativeGetDocument,
  listPageTags: nativeListPageTags,
  togglePageTag: nativeTogglePageTag,
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function fuzzyMatch(text: string, query: string): boolean {
  const lower = text.toLowerCase();
  let qi = 0;
  for (let i = 0; i < lower.length && qi < query.length; i++) {
    if (lower[i] === query[qi]) qi++;
  }
  return qi === query.length;
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
  getDeckStatistics?: (deckId: string) => Promise<DeckStatistics>;
  startStudySession?: (scope: StudyScope) => Promise<StudySession>;
  refreshStudySession?: (sessionId: string) => Promise<StudySession>;
  rateStudyCard?: (payload: StudyRatingInput) => Promise<StudyRatingResult>;
  getMemoraSettings?: () => Promise<MemoraSettings>;
  updateMemoraSettings?: (settings: MemoraSettings) => Promise<MemoraSettings>;
  getDeckLearningSettings?: (deckId: string) => Promise<DeckLearningSettings>;
  updateDeckLearningSettings?: (deckId: string, newCardsPerDay: number | null) => Promise<DeckLearningSettings>;
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
  getDeckStatistics: nativeGetDeckStatistics,
  startStudySession: nativeStartStudySession,
  refreshStudySession: nativeRefreshStudySession,
  rateStudyCard: nativeRateStudyCard,
  getMemoraSettings: nativeGetMemoraSettings,
  updateMemoraSettings: nativeUpdateMemoraSettings,
  getDeckLearningSettings: nativeGetDeckLearningSettings,
  updateDeckLearningSettings: nativeUpdateDeckLearningSettings,
};

interface AppProps {
  libraryApi?: LibraryApi;
  learningApi?: LearningApi;
  aiApi?: AiApi;
  accountApi?: AccountApi;
}

type AppRoute =
  | { name: "library" }
  | { name: "memora" }
  | { name: "reader"; document: LibraryDocument }
  | { name: "review"; session: StudySession; sourceDeck?: Deck; mode: "study" }
  | { name: "review"; cards: LearningCard[]; sourceDeck: Deck; mode: "practice" }
  | { name: "cardBrowser"; deckId: string }
  | { name: "deckDetail"; deck: Deck; searchQuery?: string }
  | { name: "trash" }
  | { name: "settings"; section?: SettingsSection }
  | { name: "admin" };

const ROUTE_FEATURE_KEYS: Partial<Record<AppRoute["name"], string>> = {
  library: "library",
  memora: "memora",
  deckDetail: "memora",
  cardBrowser: "memora",
  trash: "trash",
  admin: "admin",
};

interface AiApi {
  hasApiKey: (provider: AiProviderId) => Promise<boolean>;
  saveApiKey: (provider: AiProviderId, apiKey: string) => Promise<void>;
  clearApiKey: (provider: AiProviderId) => Promise<void>;
  listModels: (provider: AiProviderId) => Promise<AiModel[]>;
  appleTranslationAvailable: () => Promise<boolean>;
  translate: (engineId: TranslationEngineId, text: string, targetLanguage: string) => Promise<{ translation: string }>;
}

const nativeAiApi: AiApi = {
  hasApiKey: hasAiApiKey,
  saveApiKey: saveAiApiKey,
  clearApiKey: clearAiApiKey,
  listModels: listAiModels,
  appleTranslationAvailable,
  translate: translateText,
};

const defaultAccountApi = new PocketBaseAccountApiClient();

function AnalyticsInstrumentation({
  client,
  route,
}: {
  client: AnalyticsClient;
  route: AppRoute;
}) {
  const account = useAccount();
  const analyticsEnabled = account?.session?.profile.analyticsEnabled ?? false;

  useEffect(() => {
    client.setAnalyticsEnabled(analyticsEnabled);
    if (analyticsEnabled) {
      client.track("app_opened", { source: "launch" });
      void client.flush();
    }
  }, [client, analyticsEnabled]);

  useEffect(() => {
    if (!analyticsEnabled) return;
    const featureKey = ROUTE_FEATURE_KEYS[route.name];
    if (featureKey) {
      client.track("feature_opened", { featureKey });
      void client.flush();
    }
  }, [client, route.name, analyticsEnabled]);

  useEffect(() => {
    const stop = client.startAutoFlush();
    return stop;
  }, [client]);

  return null;
}

export function App({
  libraryApi = nativeLibraryApi,
  learningApi = nativeLearningApi,
  aiApi = nativeAiApi,
  accountApi = defaultAccountApi,
}: AppProps) {
  const { resolvedTheme } = useTheme();
  const analyticsClient = useMemo(() => new AnalyticsClient(accountApi, false), [accountApi]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolvedTheme);
    // Keep the native window appearance (and therefore sidebar vibrancy) in sync with
    // the app theme, since it otherwise follows the OS appearance instead. Guarded
    // because getCurrentWindow() throws outside a real Tauri window (browser/tests).
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      getCurrentWindow()
        .setTheme(resolvedTheme)
        .catch((error) => console.error("Failed to sync native window theme:", error));
    }
  }, [resolvedTheme]);

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
    getDeckStatistics: learningApi.getDeckStatistics ?? nativeGetDeckStatistics,
    startStudySession: learningApi.startStudySession ?? nativeStartStudySession,
    refreshStudySession: learningApi.refreshStudySession ?? nativeRefreshStudySession,
    rateStudyCard: learningApi.rateStudyCard ?? nativeRateStudyCard,
    getMemoraSettings: learningApi.getMemoraSettings ?? nativeGetMemoraSettings,
    updateMemoraSettings: learningApi.updateMemoraSettings ?? nativeUpdateMemoraSettings,
    getDeckLearningSettings: learningApi.getDeckLearningSettings ?? nativeGetDeckLearningSettings,
    updateDeckLearningSettings: learningApi.updateDeckLearningSettings ?? nativeUpdateDeckLearningSettings,
  }), [learningApi]);
  const [documents, setDocuments] = useState<LibraryDocument[] | null>(null);
  const [route, setRoute] = useState<AppRoute>({ name: "library" });
  const [loading, setLoading] = useState(true);
  const [pendingImports, setPendingImports] = useState<PendingImport[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [composerSource, setComposerSource] = useState<CardSource | null>(null);
  const [composerDecks, setComposerDecks] = useState<Deck[]>([]);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [drivePickerOpen, setDrivePickerOpen] = useState(false);
  const [driveSetupModalOpen, setDriveSetupModalOpen] = useState(false);
  const [driveEntries, setDriveEntries] = useState<DriveEntry[]>([]);
  const [driveFolderStack, setDriveFolderStack] = useState<string[]>([]);
  const [driveCurrentFolderId, setDriveCurrentFolderId] = useState<string | undefined>();
  const requestId = useRef(0);
  const pendingImportId = useRef(0);
  const paletteRef = useRef<CommandPaletteHandle>(null);
  const [decks, setDecks] = useState<Deck[]>([]);
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(new Set());
  const [browserRefreshTrigger, setBrowserRefreshTrigger] = useState(0);
  const [isBrowserDirty, setIsBrowserDirty] = useState(false);
  const [sourceHighlight, setSourceHighlight] = useState<CardSource | null>(null);
  const [translationPreference, setTranslationPreference] = useState(readTranslationPreference);

  const reloadDecks = useCallback(async () => {
    try {
      const d = await learning.listDecks();
      setDecks(d);
    } catch (_) {}
  }, [learning]);

  useEffect(() => {
    if (route.name === "deckDetail" || route.name === "cardBrowser" || route.name === "trash") {
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
    setRoute({ name: "deckDetail", deck });
  }, [isBrowserDirty]);

  const handleStudyDeck = useCallback(async (deckId: string) => {
    try {
      const deck = decks.find((candidate) => candidate.id === deckId);
      if (!deck) return;
      const session = await learning.startStudySession({ kind: "deck", deckId });
      setRoute({ name: "review", session, sourceDeck: deck, mode: "study" });
    } catch (reviewError) { setError(errorMessage(reviewError)); }
  }, [learning, decks]);

  const handlePracticeAll = useCallback(async (deckId: string) => {
    try {
      const deck = decks.find((candidate) => candidate.id === deckId);
      if (!deck) return;
      const cards = (await learning.listDeckCards(deckId)).filter((card) => card.state !== "suspended");
      setRoute({ name: "review", cards, sourceDeck: deck, mode: "practice" });
    } catch (reviewError) { setError(errorMessage(reviewError)); }
  }, [learning, decks]);
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
    void reloadDecks();
  }, [load, reloadDecks]);

  const handleImport = useCallback(async () => {
    setError(null);
    try {
      const paths = await libraryApi.pick();
      if (!paths || paths.length === 0) {
        return;
      }

      requestId.current += 1;
      setLoading(false);
      const items: PendingImport[] = paths.map((p, i) => ({
        id: `pending-${Date.now()}-${pendingImportId.current++}-${i}`,
        name: p.split("/").pop()?.replace(/\.pdf$/i, "") ?? p,
      }));
      setPendingImports((current) => [...current, ...items]);

      await Promise.all(paths.map(async (path, index) => {
        const item = items[index];
        try {
          const imported = await libraryApi.importDocuments([path]);
          requestId.current += 1;
          setDocuments((current) => mergeDocuments(current, imported));
        } catch (fileError) {
          const message = `${item.name}: ${errorMessage(fileError)}`;
          setError((current) => current ? `${current}\n${message}` : message);
        } finally {
          setPendingImports((current) => current.filter((pending) => pending.id !== item.id));
        }
      }));
    } catch (importError) {
      setError(errorMessage(importError));
    }
  }, [libraryApi, requestId]);

  const handleOpen = useCallback((document: LibraryDocument) => {
    setSourceHighlight(null);
    setRoute({ name: "reader", document });
  }, []);

  const handleCreateCard = useCallback((source: CardSource) => {
    const readerDocument = documents?.find((candidate) => candidate.id === source.documentId);
    if (!readerDocument) {
      setError("This source document is no longer available.");
      return;
    }
    setComposerError(null);
    setComposerSource(source);
    void learning.listDecks()
      .then((decks) => setComposerDecks(decks))
      .catch((loadError) => setComposerError(errorMessage(loadError)));
  }, [documents, learning]);

  const handleSaveCard = useCallback(async (input: CardSaveInput) => {
    await learning.createCard(input);
    setComposerSource(null);
  }, [learning]);

  const handleCloseComposer = useCallback(() => {
    setComposerSource(null);
  }, []);

  const handleTranslate = useCallback(async (text: string) => {
    if (!translationPreference.engineId) {
      throw new Error("Choose a translation engine in Settings first.");
    }
    const result = await aiApi.translate(
      translationPreference.engineId,
      text,
      translationPreference.targetLanguage,
    );
    return result.translation;
  }, [aiApi, translationPreference]);

  const handleTranslationDefaultChange = useCallback((_engineId: TranslationEngineId | null) => {
    setTranslationPreference(readTranslationPreference());
  }, []);



  const search = useCallback(
    async (query: string) => {
      const q = query.toLowerCase();
      const navResults: SearchResult[] = [
        { kind: "nav", id: "library", title: "Library", subtitle: null },
        { kind: "nav", id: "memora", title: "Memora", subtitle: null },
        { kind: "nav", id: "trash", title: "Trash", subtitle: null },
        { kind: "nav", id: "settings", title: "Settings", subtitle: null },
        { kind: "nav", id: "settings-model", title: "Settings \u2192 Model", subtitle: "AI providers, API keys, translate model" },
        { kind: "nav", id: "settings-memora", title: "Settings \u2192 Memora", subtitle: "Learning limits, FSRS retention, study steps" },
      ];
      const docResults: SearchResult[] = (documents ?? [])
        .filter((d) => fuzzyMatch(d.title, q))
        .map((d) => ({ kind: "document" as const, id: d.id, title: d.title, subtitle: d.author }));
      const deckResults: SearchResult[] = decks
        .filter((d) => fuzzyMatch(d.name, q))
        .map((d) => ({ kind: "deck" as const, id: d.id, title: d.name, subtitle: null }));
      const [backendCards, trashPage] = await Promise.all([
        nativeSearchEverything(query).catch(() => [] as SearchResult[]),
        nativeListTrashedCards(query, "deletedAt", null, 10).catch(() => ({ rows: [], total: 0, nextCursor: null } as CardPage)),
      ]);
      const cardResults = backendCards.filter((r) => r.kind === "card");
      const trashResults: SearchResult[] = trashPage.rows.map((card) => ({
        kind: "trash" as const,
        id: card.id,
        title: card.front,
        subtitle: card.deckName,
      }));
      return [...navResults, ...docResults, ...deckResults, ...cardResults, ...trashResults];
    },
    [documents, decks],
  );

  const handleOpenSearchResult = useCallback(async (result: SearchResult) => {
    if (result.kind === "nav") {
      setRoute(
        result.id === "memora" ? { name: "memora" }
        : result.id === "trash" ? { name: "trash" }
        : result.id === "settings-memora" ? { name: "settings", section: "memora" }
        : result.id === "settings" || result.id === "settings-model" ? { name: "settings" }
        : { name: "library" },
      );
      return;
    }
    if (result.kind === "document") {
      const doc = documents?.find((d) => d.id === result.id);
      if (doc) handleOpen(doc);
      return;
    }
    if (result.kind === "deck") {
      const deck = decks.find((d) => d.id === result.id);
      if (deck) setRoute({ name: "deckDetail", deck });
      return;
    }
    if (result.kind === "card") {
      try {
        const card = await learning.getCard(result.id);
        const deck = decks.find((d) => d.id === card.deckId);
        if (deck) setRoute({ name: "deckDetail", deck, searchQuery: result.title });
      } catch (e) { setError(errorMessage(e)); }
      return;
    }
    if (result.kind === "trash") {
      setRoute({ name: "trash" });
    }
  }, [documents, handleOpen, decks, learning]);

  const handleReviewToday = useCallback(async () => {
    try {
      const session = await learning.startStudySession({ kind: "all" });
      setRoute({ name: "review", session, mode: "study" });
    } catch (reviewError) { setError(errorMessage(reviewError)); }
  }, [learning]);

  const loadDriveFolder = useCallback(async (folderId?: string) => {
    const list = libraryApi.listDrive ?? listDrive;
    const connect = libraryApi.connectDrive ?? connectDrive;
    try {
      const entries = await list(folderId);
      setDriveEntries(entries);
      setDriveCurrentFolderId(folderId);
    } catch (e) {
      console.error("loadDriveFolder initial try error:", e);
      const msg = errorMessage(e);
      if (msg.includes("not configured") || msg.includes("not found")) {
        setDriveSetupModalOpen(true);
        throw e;
      } else if (msg.includes("not connected") || msg.includes("revoked")) {
        try {
          await connect();
          const entries = await list(folderId);
          setDriveEntries(entries);
          setDriveCurrentFolderId(folderId);
        } catch (connectErr) {
          console.error("loadDriveFolder connect try error:", connectErr);
          const connectMsg = errorMessage(connectErr);
          if (connectMsg.includes("not configured") || connectMsg.includes("not found")) {
            setDriveSetupModalOpen(true);
          } else {
            setError(connectMsg);
          }
          throw connectErr;
        }
      } else {
        setError(msg);
        throw e;
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
      console.error("handleOpenDrive outer error:", e);
      const msg = errorMessage(e);
      if (!msg.includes("not configured") && !msg.includes("not found")) {
        setError(msg);
      }
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

  const handleDelete = useCallback(async (id: string) => {
    setError(null);
    try {
      await (libraryApi.deleteDocument ?? nativeDeleteDocument)(id);
      await load();
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [libraryApi, load]);

  const handleRename = useCallback(async (id: string, title: string) => {
    setError(null);
    try {
      await (libraryApi.renameDocument ?? nativeRenameDocument)(id, title);
      await load();
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [libraryApi, load]);

  const handlePageChange = useCallback(async (id: string, page: number, numPages?: number) => {
    try {
      const updated = await (libraryApi.saveReadPage ?? nativeSaveReadPage)(id, page, numPages);
      if (updated) {
        setDocuments((current) => mergeDocuments(current, [updated]));
      }
    } catch (_) {}
  }, [libraryApi]);

  const palette = <CommandPalette ref={paletteRef} search={search} onOpen={(result) => void handleOpenSearchResult(result)} />;

  if (route.name === "review") {
    const onBack = () => setRoute(route.sourceDeck ? { name: "deckDetail", deck: route.sourceDeck } : { name: "memora" });
    if (route.mode === "practice") {
      return <><ReviewPage mode="practice" cards={route.cards} onBack={onBack} />{palette}</>;
    }
    const session = route.session;
    return (
      <>
        <ReviewPage
          mode="study"
          session={session}
          onBack={onBack}
          onRate={(grant: StudyGrant, rating: ReviewRating, elapsedMs: number) =>
            learning.rateStudyCard({
              sessionId: session.sessionId,
              cardId: grant.card.id,
              grantToken: grant.grantToken,
              expectedState: grant.expectedState,
              expectedDueAt: grant.expectedDueAt,
              rating,
              elapsedMs,
            })
          }
          onRefresh={async () => {
            try {
              return await learning.refreshStudySession(session.sessionId);
            } catch (refreshError) {
              if (errorMessage(refreshError) !== "study session expired") throw refreshError;
              return learning.startStudySession(session.scope);
            }
          }}
        />
        {palette}
      </>
    );
  }

  if (route.name === "reader") {
    return (
      <>
        <ReaderPage
          document={route.document}
          onBack={() => {
            setSourceHighlight(null);
            setRoute({ name: "library" });
          }}
          getDocumentFileUrl={libraryApi.getDocumentFileUrl ?? nativeGetDocumentFileUrl}
          onPageChange={handlePageChange}
          onCreateCard={handleCreateCard}
          composerSource={composerSource}
          composerDecks={composerDecks}
          composerError={composerError}
          onSaveCard={handleSaveCard}
          onTranslate={handleTranslate}
          onCloseComposer={handleCloseComposer}
          sourceHighlight={sourceHighlight}
          listPageTags={async (id) => {
            const fn = libraryApi.listPageTags ?? nativeListPageTags;
            return (await fn?.(id)) ?? [];
          }}
          togglePageTag={async (id, page) => {
            const fn = libraryApi.togglePageTag ?? nativeTogglePageTag;
            return (await fn?.(id, page)) ?? [];
          }}
        />
        {palette}
      </>
    );
  }

  if (route.name === "settings") {
    return (
      <SettingsPage
        hasApiKey={aiApi.hasApiKey}
        saveApiKey={aiApi.saveApiKey}
        clearApiKey={aiApi.clearApiKey}
        listModels={aiApi.listModels}
        getMemoraSettings={learning.getMemoraSettings}
        updateMemoraSettings={learning.updateMemoraSettings}
        initialSection={route.section}
        appleTranslationAvailable={aiApi.appleTranslationAvailable}
        onDefaultChange={handleTranslationDefaultChange}
        onBack={() => setRoute({ name: "library" })}
        saveDriveCredentials={saveGoogleDriveCredentials}
        loadDriveCredentials={loadGoogleDriveCredentials}
        clearDriveCredentials={clearGoogleDriveCredentials}
      />
    );
  }

  const activeSection: AppSection =
    route.name === "memora" || route.name === "deckDetail"
      ? "memora"
      : route.name === "cardBrowser"
      ? "memora"
      : route.name === "trash"
      ? "trash"
      : route.name === "admin"
      ? "admin"
      : "library";

  return (
    <AccountGate api={accountApi}>
      <AnalyticsInstrumentation client={analyticsClient} route={route} />
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
        onSettingsClick={() => setRoute({ name: "settings" })}
        onAdminClick={() => setRoute({ name: "admin" })}
      />
      <div className="app-shell__content">
        {route.name === "memora" ? (
          <MemoraPage
            listDecks={learning.listDecks}
            listDueCards={learning.listDueCards}
            onReviewToday={handleReviewToday}
            onStudyDeck={handleStudyDeck}
            onPracticeAll={handlePracticeAll}
            createDeck={handleCreateDeck}
            renameDeck={handleRenameDeck}
            deleteDeck={handleDeleteDeck}
            countDeckCards={learning.countDeckCards}
            getDeckStatistics={learning.getDeckStatistics}
            getDeckLearningSettings={learning.getDeckLearningSettings}
            updateDeckLearningSettings={learning.updateDeckLearningSettings}
            onOpenDeck={handleOpenDeck}
          />
        ) : route.name === "deckDetail" ? (
          <DeckDetailPage
            deck={route.deck}
            decks={decks}
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
            onStudyDeck={handleStudyDeck}
            onPracticeAll={handlePracticeAll}
            onDirtyStateChange={setIsBrowserDirty}
            getDocumentFileUrl={libraryApi.getDocumentFileUrl ?? nativeGetDocumentFileUrl}
            getDeckStatistics={learning.getDeckStatistics}
            queryDeckCards={learning.queryDeckCards}
            moveCards={learning.moveCards}
            setCardsSuspended={learning.setCardsSuspended}
            trashCards={learning.trashCards}
            listActiveTags={learning.listActiveTags}
            createCard={learning.createCard}
            updateAndMoveCard={learning.updateAndMoveCard}
            initialSearch={route.searchQuery}
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
            getDocumentFileUrl={libraryApi.getDocumentFileUrl ?? nativeGetDocumentFileUrl}
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
        ) : route.name === "admin" ? (
          <AdminPage api={accountApi} />
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
              onOpenDrive={() => void handleOpenDrive()}
              onDelete={(id) => void handleDelete(id)}
              onRename={(id, title) => void handleRename(id, title)}
              getDocumentFileUrl={libraryApi.getDocumentFileUrl ?? nativeGetDocumentFileUrl}
              pendingImports={pendingImports}
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
      {driveSetupModalOpen && (
        <div className="drive-setup-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="drive-setup-title">
          <div className="drive-setup-modal">
            <div className="drive-setup-modal__header">
              <h2 id="drive-setup-title">Configure Google Drive</h2>
              <button
                className="drive-setup-modal__close-btn"
                onClick={() => setDriveSetupModalOpen(false)}
                aria-label="Close setup modal"
                type="button"
              >
                ×
              </button>
            </div>
            <div className="drive-setup-modal__body">
              <p>To connect Google Drive, you need to configure your own Google Cloud OAuth credentials:</p>
              <ol className="drive-setup-modal__steps">
                <li>Go to the <strong>Google Cloud Console</strong>.</li>
                <li>Enable the <strong>Google Drive API</strong>.</li>
                <li>Configure the <strong>OAuth consent screen</strong> and add test users.</li>
                <li>Create an OAuth Client ID for a <strong>Desktop app</strong>.</li>
                <li>Go to <strong>Settings &gt; Google Drive</strong> to save your Client ID and Client Secret.</li>
              </ol>
            </div>
            <div className="drive-setup-modal__footer">
              <button
                type="button"
                className="drive-setup-modal__settings-btn"
                onClick={() => {
                  setDriveSetupModalOpen(false);
                  setRoute({ name: "settings" });
                }}
              >
                Configure in Settings
              </button>
              <button
                type="button"
                className="drive-setup-modal__cancel-btn"
                onClick={() => setDriveSetupModalOpen(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </AccountGate>
  );
}
