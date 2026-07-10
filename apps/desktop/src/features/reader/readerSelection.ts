import type { CardSource } from "../../domain/learning";

export type { CardSource, SelectionRect } from "../../domain/learning";

/**
 * Turns a DOM selection captured from one PDF page into a card source.
 * The caller supplies the page containing the selection's focus so a
 * cross-page selection can be rejected before opening the composer.
 */
export function selectionDraft(source: CardSource, focusPage = source.page): CardSource | null {
  if (!source.quote.trim() || !Number.isInteger(source.page) || source.page <= 0) {
    return null;
  }

  if (!Number.isInteger(focusPage) || focusPage <= 0 || focusPage !== source.page) {
    return null;
  }

  return source;
}
