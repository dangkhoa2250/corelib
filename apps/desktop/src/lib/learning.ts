import { invoke } from "@tauri-apps/api/core";
import type { Invoke } from "./desktop";
import type { Deck, LearningCard, NewCardSource, ReviewPreview, ReviewRating, CardSource, CardBrowserQuery, CardPage, UpdateCardInput, BulkResult } from "../domain/learning";
import type { LibraryDocument } from "../domain/document";

export type SearchResult = { kind: "document" | "card"; id: string; title: string; subtitle: string | null };
export type CreateCardInput = { deckName: string; front: string; back: string; source?: NewCardSource; tags?: string[] };

export function createCard(input: CreateCardInput, call: Invoke = invoke as Invoke): Promise<LearningCard> { return call("create_card", { input }); }
export function listDecks(call: Invoke = invoke as Invoke): Promise<Deck[]> { return call("list_decks"); }
export function createDeck(name: string, call: Invoke = invoke as Invoke): Promise<Deck> { return call("create_deck", { name }); }
export function renameDeck(id: string, name: string, call: Invoke = invoke as Invoke): Promise<Deck> { return call("rename_deck", { id, name }); }
export function deleteDeck(id: string, call: Invoke = invoke as Invoke): Promise<void> { return call("delete_deck", { id }); }
export function countDeckCards(id: string, call: Invoke = invoke as Invoke): Promise<number> { return call("count_deck_cards", { id }); }
export function listDeckCards(deckId: string, call: Invoke = invoke as Invoke): Promise<LearningCard[]> { return call("list_deck_cards", { deckId }); }
export function deleteCard(id: string, call: Invoke = invoke as Invoke): Promise<void> { return call("delete_card", { id }); }
export function listDueCards(limit?: number, call: Invoke = invoke as Invoke): Promise<LearningCard[]> { return call("list_due_cards", limit === undefined ? undefined : { limit }); }
export function previewCardReview(id: string, call: Invoke = invoke as Invoke): Promise<ReviewPreview> { return call("preview_card_review", { id }); }
export function rateCard(id: string, rating: ReviewRating, elapsedMs: number, call: Invoke = invoke as Invoke): Promise<LearningCard> { return call("rate_card", { id, rating, elapsedMs }); }
export function getCard(id: string, call: Invoke = invoke as Invoke): Promise<LearningCard> { return call("get_card", { id }); }
export function getCardSource(id: string, call: Invoke = invoke as Invoke): Promise<CardSource | null> { return call("get_card_source", { id }); }
export function searchEverything(query: string, call: Invoke = invoke as Invoke): Promise<SearchResult[]> { return call("search_everything", { query }); }
export function getDocument(id: string, call: Invoke = invoke as Invoke): Promise<LibraryDocument> { return call("get_document", { id }); }

export function queryDeckCards(payload: CardBrowserQuery, call: Invoke = invoke as Invoke): Promise<CardPage> { return call("query_deck_cards", { payload }); }
export function updateCard(payload: UpdateCardInput, call: Invoke = invoke as Invoke): Promise<LearningCard> { return call("update_card", { payload }); }
export function moveCards(cardIds: string[], destinationDeckId: string, call: Invoke = invoke as Invoke): Promise<BulkResult> { return call("move_cards", { cardIds, destinationDeckId }); }
export function setCardsSuspended(cardIds: string[], suspended: boolean, call: Invoke = invoke as Invoke): Promise<BulkResult> { return call("set_cards_suspended", { cardIds, suspended }); }
export function trashCards(cardIds: string[], call: Invoke = invoke as Invoke): Promise<BulkResult> { return call("trash_cards", { cardIds }); }
export function listTrashedCards(query: string, sort: string, cursor: string | null, limit: number, call: Invoke = invoke as Invoke): Promise<CardPage> { return call("list_trashed_cards", { query, sort, cursor, limit }); }
export function restoreCards(cardIds: string[], destinationDeckId: string | null, call: Invoke = invoke as Invoke): Promise<BulkResult> { return call("restore_cards", { cardIds, destinationDeckId }); }
export function deleteCardsPermanently(cardIds: string[], call: Invoke = invoke as Invoke): Promise<BulkResult> { return call("delete_cards_permanently", { cardIds }); }
export function emptyTrash(call: Invoke = invoke as Invoke): Promise<BulkResult> { return call("empty_trash"); }
export function listActiveTags(deckId: string, call: Invoke = invoke as Invoke): Promise<string[]> { return call("list_active_tags", { deckId }); }
