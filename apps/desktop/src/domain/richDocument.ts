/**
 * Rich flashcard document contracts.
 *
 * Each flashcard face may be stored as a Tiptap JSON document. This module
 * defines the exact JSON shape the desktop and server allow and provides a
 * structural validator plus a deterministic plain-text derivation used to keep
 * the legacy `front`/`back` columns in sync.
 *
 * The allowlist mirrors the Tiptap extensions configured for the editor
 * (StarterKit, underline, text-style/color, highlight, text-align, image) but
 * does not import Tiptap, so the same contract can be enforced client- and
 * server-side. The image node is intentionally custom: it carries only a
 * `mediaId`, `alt`, and `widthPercent` — never a source URL.
 */

export type TextAlignValue = "left" | "center" | "right" | "justify";

export interface BoldMark {
  type: "bold";
}
export interface ItalicMark {
  type: "italic";
}
export interface StrikeMark {
  type: "strike";
}
export interface UnderlineMark {
  type: "underline";
}
export interface TextStyleMark {
  type: "textStyle";
  attrs?: { color: string };
}
export interface HighlightMark {
  type: "highlight";
  attrs?: { color: string };
}

export type SimpleMark = BoldMark | ItalicMark | StrikeMark | UnderlineMark;
export type RichTextMark = SimpleMark | TextStyleMark | HighlightMark;

export interface TextNode {
  type: "text";
  text: string;
  marks?: RichTextMark[];
}

export interface HardBreakNode {
  type: "hardBreak";
}

export type RichInline = TextNode | HardBreakNode;

export interface ImageNode {
  type: "image";
  attrs: {
    mediaId: string;
    alt: string;
    widthPercent: number;
  };
}

export interface ParagraphNode {
  type: "paragraph";
  attrs?: { textAlign: TextAlignValue };
  content: RichInline[];
}

export interface HeadingNode {
  type: "heading";
  attrs: {
    level: 1 | 2 | 3;
    textAlign?: TextAlignValue;
  };
  content: RichInline[];
}

export interface ListItemNode {
  type: "listItem";
  content: RichBlock[];
}

export interface BulletListNode {
  type: "bulletList";
  content: ListItemNode[];
}

export interface OrderedListNode {
  type: "orderedList";
  content: ListItemNode[];
}

export type RichBlock =
  | ParagraphNode
  | HeadingNode
  | BulletListNode
  | OrderedListNode
  | ImageNode;

export interface RichDocument {
  type: "doc";
  content: RichBlock[];
}

export type RichNode = RichDocument | RichBlock | ListItemNode | RichInline;

export type RichDocumentResult =
  | { ok: true; doc: RichDocument }
  | { ok: false; error: string };

const TEXT_ALIGNMENTS = new Set<string>(["left", "center", "right", "justify"]);
const HEADING_LEVELS = new Set<number>([1, 2, 3]);
const MIN_WIDTH_PERCENT = 10;
const MAX_WIDTH_PERCENT = 100;
const MAX_IMAGES = 10;
const MAX_DEPTH = 10;
const MAX_NODES = 2000;

const BLOCK_TYPES = new Set<string>([
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "image",
]);
const INLINE_TYPES = new Set<string>(["text", "hardBreak"]);
const IMAGE_ATTR_KEYS = ["mediaId", "alt", "widthPercent"].sort();

type VResult<T> = { ok: true; value: T } | { ok: false; error: string };
interface ValidationContext {
  images: number;
  nodes: number;
}

const ok = <T>(value: T): VResult<T> => ({ ok: true, value });
const err = (error: string): { ok: false; error: string } => ({ ok: false, error });

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function forbidAttrs(
  attrs: unknown,
  nodeName: string,
): { ok: false; error: string } | null {
  if (attrs === undefined) return null;
  if (isRecord(attrs) && Object.keys(attrs).length === 0) return null;
  return err(`${nodeName} must not carry attributes`);
}

/**
 * Validates an arbitrary value as a rich flashcard document. Rejects unknown
 * nodes, marks, and attributes, malformed text, arbitrary image keys or URLs,
 * out-of-range widths, more than ten images, and unbounded depth or size.
 */
export function validateRichDocument(value: unknown): RichDocumentResult {
  if (!isRecord(value)) return { ok: false, error: "document must be an object" };
  if (value.type !== "doc") {
    return { ok: false, error: "document root must be type 'doc'" };
  }
  const badDocAttrs = forbidAttrs(value.attrs, "doc");
  if (badDocAttrs) return badDocAttrs;
  const ctx: ValidationContext = { images: 0, nodes: 0 };
  const content = validateChildren(value.content, 1, ctx, "block");
  if (!content.ok) return content;
  return { ok: true, doc: { type: "doc", content: content.value as RichBlock[] } };
}

function validateChildren(
  content: unknown,
  parentDepth: number,
  ctx: ValidationContext,
  allow: "block" | "inline" | "listItem",
): VResult<RichNode[]> {
  if (content === undefined) return ok([]);
  if (!Array.isArray(content)) return err("content must be an array");
  const out: RichNode[] = [];
  for (const child of content) {
    const result = validateNode(child, parentDepth + 1, ctx);
    if (!result.ok) return result;
    if (!isAllowedKind(result.value.type, allow)) {
      return err(`node '${result.value.type}' is not allowed here`);
    }
    out.push(result.value);
  }
  return ok(out);
}

function isAllowedKind(
  type: string,
  allow: "block" | "inline" | "listItem",
): boolean {
  if (allow === "block") return BLOCK_TYPES.has(type);
  if (allow === "inline") return INLINE_TYPES.has(type);
  return type === "listItem";
}

function validateNode(
  node: unknown,
  depth: number,
  ctx: ValidationContext,
): VResult<RichNode> {
  if (++ctx.nodes > MAX_NODES) {
    return err(`document exceeds ${MAX_NODES} nodes`);
  }
  if (depth > MAX_DEPTH) {
    return err(`document exceeds maximum depth of ${MAX_DEPTH}`);
  }
  if (!isRecord(node)) return err("node must be an object");
  const type = node.type;
  if (typeof type !== "string") return err("node is missing its type");
  if (type !== "text" && node.marks !== undefined) {
    return err("marks are only allowed on text nodes");
  }
  switch (type) {
    case "doc":
      return validateDoc(node, depth, ctx);
    case "paragraph":
      return validateParagraph(node, depth, ctx);
    case "heading":
      return validateHeading(node, depth, ctx);
    case "text":
      return validateText(node);
    case "bulletList":
    case "orderedList":
      return validateList(type, node, depth, ctx);
    case "listItem":
      return validateListItem(node, depth, ctx);
    case "hardBreak":
      return validateHardBreak(node);
    case "image":
      return validateImage(node, ctx);
    default:
      return err(`unknown node type '${type}'`);
  }
}

function validateDoc(
  node: Record<string, unknown>,
  depth: number,
  ctx: ValidationContext,
): VResult<RichDocument> {
  const badAttrs = forbidAttrs(node.attrs, "doc");
  if (badAttrs) return badAttrs;
  const content = validateChildren(node.content, depth, ctx, "block");
  if (!content.ok) return content;
  return ok({ type: "doc", content: content.value as RichBlock[] });
}

function validateParagraph(
  node: Record<string, unknown>,
  depth: number,
  ctx: ValidationContext,
): VResult<ParagraphNode> {
  const attrs = validateTextAlignAttrs(node.attrs, "paragraph");
  if (!attrs.ok) return attrs;
  const content = validateChildren(node.content, depth, ctx, "inline");
  if (!content.ok) return content;
  const paragraph: ParagraphNode = {
    type: "paragraph",
    content: content.value as RichInline[],
  };
  if (attrs.value) paragraph.attrs = attrs.value;
  return ok(paragraph);
}

function validateHeading(
  node: Record<string, unknown>,
  depth: number,
  ctx: ValidationContext,
): VResult<HeadingNode> {
  const attrs = node.attrs;
  if (!isRecord(attrs)) return err("heading requires an attrs object");
  for (const key of Object.keys(attrs)) {
    if (key !== "level" && key !== "textAlign") {
      return err("heading only allows level and textAlign attributes");
    }
  }
  const level = attrs.level;
  if (typeof level !== "number" || !HEADING_LEVELS.has(level)) {
    return err("heading level must be 1, 2, or 3");
  }
  const headingAttrs: { level: 1 | 2 | 3; textAlign?: TextAlignValue } = {
    level: level as 1 | 2 | 3,
  };
  if (attrs.textAlign !== undefined) {
    if (
      typeof attrs.textAlign !== "string" ||
      !TEXT_ALIGNMENTS.has(attrs.textAlign)
    ) {
      return err("invalid textAlign value");
    }
    headingAttrs.textAlign = attrs.textAlign as TextAlignValue;
  }
  const content = validateChildren(node.content, depth, ctx, "inline");
  if (!content.ok) return content;
  return ok({
    type: "heading",
    attrs: headingAttrs,
    content: content.value as RichInline[],
  });
}

function validateText(node: Record<string, unknown>): VResult<TextNode> {
  if (typeof node.text !== "string") {
    return err("text node requires a string 'text' property");
  }
  if (node.content !== undefined) {
    return err("text node must not carry content");
  }
  const marks = validateMarks(node.marks);
  if (!marks.ok) return marks;
  const textNode: TextNode = { type: "text", text: node.text };
  if (marks.value) textNode.marks = marks.value;
  return ok(textNode);
}

function validateMarks(
  marks: unknown,
): VResult<RichTextMark[] | undefined> {
  if (marks === undefined) return ok(undefined);
  if (!Array.isArray(marks)) return err("marks must be an array");
  const out: RichTextMark[] = [];
  for (const mark of marks) {
    const result = validateMark(mark);
    if (!result.ok) return result;
    out.push(result.value);
  }
  return ok(out);
}

function validateMark(mark: unknown): VResult<RichTextMark> {
  if (!isRecord(mark)) return err("mark must be an object");
  const type = mark.type;
  if (typeof type !== "string") return err("mark is missing its type");
  if (type === "bold" || type === "italic" || type === "strike" || type === "underline") {
    if (mark.attrs !== undefined) {
      return err(`mark '${type}' must not carry attributes`);
    }
    return ok({ type } as SimpleMark);
  }
  if (type === "textStyle" || type === "highlight") {
    return validateColorMark(mark, type);
  }
  return err(`unknown mark type '${type}'`);
}

function validateColorMark(
  mark: Record<string, unknown>,
  type: "textStyle" | "highlight",
): VResult<RichTextMark> {
  const attrs = mark.attrs;
  if (attrs === undefined) return ok({ type });
  if (!isRecord(attrs)) {
    return err(`mark '${type}' attrs must be an object`);
  }
  const keys = Object.keys(attrs);
  if (keys.length === 0) return ok({ type });
  if (keys.length > 1 || keys[0] !== "color") {
    return err(`mark '${type}' only allows a color attribute`);
  }
  if (typeof attrs.color !== "string") {
    return err(`mark '${type}' color must be a string`);
  }
  return ok({ type, attrs: { color: attrs.color } });
}

function validateList(
  type: "bulletList" | "orderedList",
  node: Record<string, unknown>,
  depth: number,
  ctx: ValidationContext,
): VResult<BulletListNode | OrderedListNode> {
  const badAttrs = forbidAttrs(node.attrs, type);
  if (badAttrs) return badAttrs;
  const content = validateChildren(node.content, depth, ctx, "listItem");
  if (!content.ok) return content;
  return ok({
    type,
    content: content.value as ListItemNode[],
  } as BulletListNode | OrderedListNode);
}

function validateListItem(
  node: Record<string, unknown>,
  depth: number,
  ctx: ValidationContext,
): VResult<ListItemNode> {
  const badAttrs = forbidAttrs(node.attrs, "listItem");
  if (badAttrs) return badAttrs;
  const content = validateChildren(node.content, depth, ctx, "block");
  if (!content.ok) return content;
  return ok({ type: "listItem", content: content.value as RichBlock[] });
}

function validateHardBreak(node: Record<string, unknown>): VResult<HardBreakNode> {
  const badAttrs = forbidAttrs(node.attrs, "hardBreak");
  if (badAttrs) return badAttrs;
  if (node.content !== undefined) {
    return err("hardBreak must not carry content");
  }
  return ok({ type: "hardBreak" });
}

function validateImage(
  node: Record<string, unknown>,
  ctx: ValidationContext,
): VResult<ImageNode> {
  ctx.images += 1;
  if (ctx.images > MAX_IMAGES) {
    return err(`document must not contain more than ${MAX_IMAGES} images`);
  }
  if (node.content !== undefined) {
    return err("image node must not carry content");
  }
  const attrs = node.attrs;
  if (!isRecord(attrs)) return err("image attrs must be an object");
  const keys = Object.keys(attrs).sort();
  if (
    keys.length !== IMAGE_ATTR_KEYS.length ||
    !keys.every((key, index) => key === IMAGE_ATTR_KEYS[index])
  ) {
    return err("image attrs must be exactly mediaId, alt, and widthPercent");
  }
  const { mediaId, alt, widthPercent } = attrs;
  if (typeof mediaId !== "string" || mediaId.length === 0) {
    return err("image mediaId must be a non-empty string");
  }
  if (typeof alt !== "string") {
    return err("image alt must be a string");
  }
  if (
    typeof widthPercent !== "number" ||
    !Number.isFinite(widthPercent) ||
    widthPercent < MIN_WIDTH_PERCENT ||
    widthPercent > MAX_WIDTH_PERCENT
  ) {
    return err(
      `image widthPercent must be a number between ${MIN_WIDTH_PERCENT} and ${MAX_WIDTH_PERCENT}`,
    );
  }
  return ok({
    type: "image",
    attrs: { mediaId, alt, widthPercent },
  });
}

function validateTextAlignAttrs(
  attrs: unknown,
  nodeName: string,
): VResult<{ textAlign: TextAlignValue } | undefined> {
  if (attrs === undefined) return ok(undefined);
  if (!isRecord(attrs)) return err(`${nodeName} attrs must be an object`);
  const keys = Object.keys(attrs);
  if (keys.length === 0) return ok(undefined);
  if (keys.length > 1 || keys[0] !== "textAlign") {
    return err(`${nodeName} only allows a textAlign attribute`);
  }
  const textAlign = attrs.textAlign;
  if (typeof textAlign !== "string" || !TEXT_ALIGNMENTS.has(textAlign)) {
    return err("invalid textAlign value");
  }
  return ok({ textAlign: textAlign as TextAlignValue });
}

/**
 * Derives deterministic plain text from a validated rich document, mirroring
 * the Rust `plain_text` implementation in
 * `apps/desktop/src-tauri/src/rich_document.rs`. Paragraphs, headings, list
 * items, and hard breaks are separated by newlines; bullet list items are
 * prefixed with `• `, ordered list items with `{n}. `; images contribute their
 * alt text or `[image]` when the alt is empty; and consecutive blank lines are
 * collapsed to a single newline before the result is trimmed. The result stays
 * compatible with the legacy `front`/`back` columns used for full-text search,
 * translation, and YouGlish lookups.
 */
export function derivePlainText(doc: RichDocument): string {
  const rendered = docToText(doc);
  return collapseBlankLines(rendered).trim();
}

function docToText(node: RichNode): string {
  switch (node.type) {
    case "doc":
      return (node.content ?? []).map(docToText).join("\n");
    case "paragraph":
    case "heading":
      return inlineToText(node.content);
    case "bulletList":
      return listToText(node, false);
    case "orderedList":
      return listToText(node, true);
    case "listItem":
      return node.content.map(docToText).join("\n");
    case "image":
      return node.attrs.alt.length > 0 ? node.attrs.alt : "[image]";
    case "hardBreak":
      return "\n";
    case "text":
      return node.text;
  }
}

function listToText(
  node: BulletListNode | OrderedListNode,
  ordered: boolean,
): string {
  return node.content
    .map((item, index) => {
      const prefix = ordered ? `${index + 1}. ` : "• ";
      return `${prefix}${item.content.map(docToText).join("\n")}`;
    })
    .join("\n");
}

function collapseBlankLines(value: string): string {
  return value.replace(/\n{2,}/g, "\n");
}

function inlineToText(nodes: RichInline[]): string {
  let result = "";
  for (const node of nodes) {
    if (node.type === "text") {
      result += node.text;
    } else if (node.type === "hardBreak") {
      result += "\n";
    }
  }
  return result;
}
