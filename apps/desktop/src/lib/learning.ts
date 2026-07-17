import { invoke } from "@tauri-apps/api/core";
import type { Invoke } from "./desktop";
import type { Deck, DeckStatistics, LearningCard, NewCardSource, CardSource, CardBrowserQuery, CardPage, UpdateCardInput, UpdateAndMoveCardInput, BulkResult, MemoraSettings, DeckLearningSettings, StudyScope, StudySession, StudyRatingInput, StudyRatingResult, StudyReadyCounts } from "../domain/learning";
import type { LibraryDocument } from "../domain/document";

export type SearchResult = { kind: "nav" | "document" | "card" | "deck" | "trash"; id: string; title: string; subtitle: string | null };
export type CreateCardInput = { deckName: string; front: string; back: string; source?: NewCardSource; tags?: string[]; frontLanguage?: string | null };

export function createCard(input: CreateCardInput, call: Invoke = invoke as Invoke): Promise<LearningCard> { return call("create_card", { input }); }
export function listDecks(call: Invoke = invoke as Invoke): Promise<Deck[]> { return call("list_decks"); }
export function createDeck(name: string, call: Invoke = invoke as Invoke): Promise<Deck> { return call("create_deck", { name }); }
export function renameDeck(id: string, name: string, call: Invoke = invoke as Invoke): Promise<Deck> { return call("rename_deck", { id, name }); }
export function deleteDeck(id: string, call: Invoke = invoke as Invoke): Promise<void> { return call("delete_deck", { id }); }
export function countDeckCards(id: string, call: Invoke = invoke as Invoke): Promise<number> { return call("count_deck_cards", { id }); }
export function listDeckCards(deckId: string, call: Invoke = invoke as Invoke): Promise<LearningCard[]> { return call("list_deck_cards", { deckId }); }
export function deleteCard(id: string, call: Invoke = invoke as Invoke): Promise<void> { return call("delete_card", { id }); }
export function getCard(id: string, call: Invoke = invoke as Invoke): Promise<LearningCard> { return call("get_card", { id }); }
export function getCardSource(id: string, call: Invoke = invoke as Invoke): Promise<CardSource | null> { return call("get_card_source", { id }); }
export function searchEverything(query: string, call: Invoke = invoke as Invoke): Promise<SearchResult[]> { return call("search_everything", { query }); }
export function getDocument(id: string, call: Invoke = invoke as Invoke): Promise<LibraryDocument> { return call("get_document", { id }); }

export function queryDeckCards(payload: CardBrowserQuery, call: Invoke = invoke as Invoke): Promise<CardPage> { return call("query_deck_cards", { payload }); }
export function updateCard(payload: UpdateCardInput, call: Invoke = invoke as Invoke): Promise<LearningCard> { return call("update_card", { payload }); }
export function updateAndMoveCard(payload: UpdateAndMoveCardInput, call: Invoke = invoke as Invoke): Promise<LearningCard> { return call("update_and_move_card", { payload }); }
export function moveCards(cardIds: string[], destinationDeckId: string, call: Invoke = invoke as Invoke): Promise<BulkResult> { return call("move_cards", { cardIds, destinationDeckId }); }
export function setCardsSuspended(cardIds: string[], suspended: boolean, call: Invoke = invoke as Invoke): Promise<BulkResult> { return call("set_cards_suspended", { cardIds, suspended }); }
export function trashCards(cardIds: string[], call: Invoke = invoke as Invoke): Promise<BulkResult> { return call("trash_cards", { cardIds }); }
export function listTrashedCards(query: string, sort: string, cursor: string | null, limit: number, call: Invoke = invoke as Invoke): Promise<CardPage> { return call("list_trashed_cards", { query, sort, cursor, limit }); }
export function restoreCards(cardIds: string[], destinationDeckId: string | null, call: Invoke = invoke as Invoke): Promise<BulkResult> { return call("restore_cards", { cardIds, destinationDeckId }); }
export function deleteCardsPermanently(cardIds: string[], call: Invoke = invoke as Invoke): Promise<BulkResult> { return call("delete_cards_permanently", { cardIds }); }
export function emptyTrash(call: Invoke = invoke as Invoke): Promise<BulkResult> { return call("empty_trash"); }
export function listActiveTags(deckId: string, call: Invoke = invoke as Invoke): Promise<string[]> { return call("list_active_tags", { deckId }); }

export function getDeckStatistics(deckId: string, call: Invoke = invoke as Invoke): Promise<DeckStatistics> {
  return call("get_deck_statistics", { deckId });
}

export function getMemoraSettings(call: Invoke = invoke as Invoke): Promise<MemoraSettings> { return call("get_memora_settings"); }
export function updateMemoraSettings(settings: MemoraSettings, call: Invoke = invoke as Invoke): Promise<MemoraSettings> { return call("update_memora_settings", { settings }); }
export function getDeckLearningSettings(deckId: string, call: Invoke = invoke as Invoke): Promise<DeckLearningSettings> { return call("get_deck_learning_settings", { deckId }); }
export function updateDeckLearningSettings(deckId: string, newCardsPerDay: number | null, call: Invoke = invoke as Invoke): Promise<DeckLearningSettings> { return call("update_deck_learning_settings", { payload: { deckId, newCardsPerDay } }); }

export function getStudyReadyCounts(call: Invoke = invoke as Invoke): Promise<StudyReadyCounts> { return call("get_study_ready_counts"); }
export function startStudySession(scope: StudyScope, call: Invoke = invoke as Invoke): Promise<StudySession> { return call("start_study_session", { scope }); }
export function refreshStudySession(sessionId: string, call: Invoke = invoke as Invoke): Promise<StudySession> { return call("refresh_study_session", { sessionId }); }
export function rateStudyCard(payload: StudyRatingInput, call: Invoke = invoke as Invoke): Promise<StudyRatingResult> { return call("rate_study_card", { payload }); }
