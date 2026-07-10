import type { CardSource, NewCardSource } from "../../domain/learning";

export type { CardSource, NewCardSource, SelectionRect } from "../../domain/learning";

function pageElementForNode(node: Node | null): HTMLElement | null {
  const element = node instanceof Element ? node : node?.parentElement;
  return element?.closest<HTMLElement>("[id^='pdf-page-']") ?? null;
}

/**
 * PDF.js renders every page as a separate text layer. A DOM selection can
 * begin on one page and end on another (including when the user drags in the
 * reverse direction), so both endpoints must belong to the page that owns
 * the selection handler.
 */
export function selectionIsWithinPage(selection: Selection, pageElement: HTMLElement): boolean {
  return (
    pageElementForNode(selection.anchorNode) === pageElement &&
    pageElementForNode(selection.focusNode) === pageElement
  );
}

function hasRequiredDocumentId(source: CardSource): source is NewCardSource {
  return typeof source.documentId === "string" && source.documentId.trim().length > 0;
}

/**
 * Turns a DOM selection captured from one PDF page into a card source.
 * The caller supplies the page containing the selection's focus so a
 * cross-page selection can be rejected before opening the composer.
 */
export function selectionDraft(
  source: CardSource,
  focusPage = source.page,
): NewCardSource | null {
  if (
    !hasRequiredDocumentId(source) ||
    !source.quote.trim() ||
    !Number.isInteger(source.page) ||
    source.page <= 0
  ) {
    return null;
  }

  if (!Number.isInteger(focusPage) || focusPage <= 0 || focusPage !== source.page) {
    return null;
  }

  return source;
}
