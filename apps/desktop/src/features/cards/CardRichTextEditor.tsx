import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import { mergeAttributes } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import TextAlign from "@tiptap/extension-text-align";
import Image, { type ImageOptions } from "@tiptap/extension-image";
import { FileHandler } from "@tiptap/extension-file-handler";
import { isHistoryTransaction } from "@tiptap/pm/history";

import { ScrollArea } from "../../components/ScrollArea";
import {
  validateRichDocument,
  type RichDocument,
} from "../../domain/richDocument";
import { CardRichTextToolbar } from "./CardRichTextToolbar";
import "./CardRichTextEditor.css";

/**
 * A rich text editor for one flashcard face.
 *
 * The document model matches `validateRichDocument`: paragraph, heading
 * (1-3), bullet/ordered lists, and a custom image node carrying only
 * `{ mediaId, alt, widthPercent }` — never a source URL. Every change is
 * validated before `onChange` fires, so the caller always receives a doc the
 * server-side contract accepts.
 *
 * Images are inserted through `onStageMedia` (which returns a stored `id`)
 * and rendered in the editor through the optional `resolveMedia` resolver.
 * The review renderer (`RichDocumentRenderer`) displays the same node shape.
 */

export type MediaSourceType = "file" | "clipboard" | "web";

/** Imperative control surface for hosts that drive the editor externally. */
export interface CardRichTextEditorHandle {
  /**
   * Inserts plain text at the current editor selection without replacing the
   * surrounding rich content. Returns false when the editor is unavailable.
   */
  insertTextAtSelection(text: string): boolean;
  /** Focuses the editor body. */
  focus(): void;
  /** Returns the live Tiptap editor instance (or null). */
  getEditor(): Editor | null;
  /** Opens this editor's hidden image file picker. */
  openImagePicker(): void;
  /**
   * Re-renders the current document so image nodes pick up freshly resolved
   * media URLs (e.g. committed media resolving after the panel mounts).
   */
  refreshMedia(): void;
}

export interface CardRichTextEditorProps {
  /** Accessible label for the editor's textbox. */
  ariaLabel: string;
  /** The rich document to edit. */
  value: RichDocument;
  /** When true the editor and its toolbar are read-only. */
  disabled?: boolean;
  /** When true (default) renders the built-in per-editor toolbar. */
  showToolbar?: boolean;
  /** Reports whether this editor's contenteditable gained/lost focus. */
  onFocusChange?: (focused: boolean) => void;
  /** Emitted with a validated document after every user change. */
  onChange(document: RichDocument): void;
  /** Stores an image and returns its media id. */
  onStageMedia?(
    file: File | Blob,
    sourceType: MediaSourceType,
  ): Promise<{ id: string; attribution?: string }>;
  /** Called when an image node is removed from the document. */
  onDiscardMedia?(mediaId: string): void;
  /** Resolves a staged media id to a display URL inside the editor. */
  resolveMedia?(mediaId: string): string;
}

export const MAX_IMAGES = 10;
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
export const MIN_WIDTH_PERCENT = 10;
export const MAX_WIDTH_PERCENT = 100;

const ALLOWED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const SIZE_ERROR = "Image files must be 10 MB or smaller.";
const MIME_ERROR = "Unsupported image type.";
const MAX_IMAGES_ERROR = `A card can contain at most ${MAX_IMAGES} images.`;

/** Rounds and clamps a percentage to the allowed 10..100 range. */
export function clampWidthPercent(percent: number): number {
  const rounded = Math.round(percent);
  return Math.min(MAX_WIDTH_PERCENT, Math.max(MIN_WIDTH_PERCENT, rounded));
}

/**
 * Converts a horizontal pointer delta into a clamped width percentage:
 * `startPercent + (dx / containerWidth) * 100`.
 */
export function widthPercentFromDrag(input: {
  startPercent: number;
  startX: number;
  currentX: number;
  containerWidth: number;
}): number {
  const { startPercent, startX, currentX, containerWidth } = input;
  const delta = currentX - startX;
  const ratio = containerWidth > 0 ? delta / containerWidth : 0;
  return clampWidthPercent(startPercent + ratio * 100);
}

function validateImageFile(file: File): string | null {
  if (file.size > MAX_FILE_SIZE_BYTES) return SIZE_ERROR;
  if (!ALLOWED_IMAGE_MIME_TYPES.has(file.type)) return MIME_ERROR;
  return null;
}

function collectMediaIds(doc: RichDocument): Set<string> {
  const ids = new Set<string>();
  const visit = (nodes: readonly unknown[]) => {
    for (const node of nodes as Array<{ type?: string; attrs?: { mediaId?: string }; content?: unknown[] }>) {
      if (node?.type === "image" && typeof node.attrs?.mediaId === "string") {
        ids.add(node.attrs.mediaId);
      }
      if (Array.isArray(node?.content)) visit(node.content);
    }
  };
  visit(doc.content);
  return ids;
}

/**
 * ProseMirror serializes attribute defaults (e.g. `textAlign: null` from the
 * TextAlign extension, `start: 1` on ordered lists) into the JSON document.
 * The domain contract only allows attributes when they hold real values, so
 * null/undefined attribute values are dropped, and attribute objects are
 * removed entirely from block nodes the contract marks as attribute-free.
 */
const NO_ATTR_BLOCK_TYPES = new Set(["bulletList", "orderedList", "listItem", "hardBreak"]);

function stripNullAttrs(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripNullAttrs);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      if (key === "attrs" && child !== null && typeof child === "object" && !Array.isArray(child)) {
        const cleanedAttrs: Record<string, unknown> = {};
        for (const [attrKey, attrValue] of Object.entries(child as Record<string, unknown>)) {
          if (attrValue !== null && attrValue !== undefined) cleanedAttrs[attrKey] = attrValue;
        }
        if (Object.keys(cleanedAttrs).length > 0) out.attrs = cleanedAttrs;
      } else if (child !== null && child !== undefined) {
        out[key] = stripNullAttrs(child);
      }
    }
    if (typeof out.type === "string" && NO_ATTR_BLOCK_TYPES.has(out.type)) {
      delete out.attrs;
    }
    return out;
  }
  return value;
}

function countImagesInEditor(editor: Editor): number {
  let count = 0;
  editor.state.doc.descendants((node) => {
    if (node.type.name === "image") count += 1;
    return true;
  });
  return count;
}

/**
 * Options for the card image node: the stock image options plus a resolver
 * that turns a staged media id into a display URL.
 */
interface CardImageOptions extends ImageOptions {
  resolveMedia: (mediaId: string) => string;
}

/**
 * The card image node: a Tiptap `image` whose attrs are exactly
 * `{ mediaId, alt, widthPercent }`. The extension's `resolveMedia` option
 * supplies the display URL; the serialized JSON never carries `src`/`width`.
 */
const CardImage = Image.extend<CardImageOptions>({
  addOptions() {
    return {
      ...this.parent?.(),
      resolveMedia: (_mediaId: string): string => "",
    } as CardImageOptions;
  },

  addAttributes() {
    return {
      mediaId: { default: null },
      alt: { default: null },
      widthPercent: { default: 100 },
    };
  },

  parseHTML() {
    return [{ tag: "img[src]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const src = this.options.resolveMedia(node.attrs.mediaId);
    return [
      "img",
      mergeAttributes(HTMLAttributes, {
        src: src || undefined,
        alt: node.attrs.alt ?? "",
        style: `width: ${node.attrs.widthPercent}%`,
      }),
    ];
  },

  addInputRules() {
    return [];
  },

  addNodeView() {
    const resolveMedia = this.options.resolveMedia;
    return ({ node, getPos, editor }) => {
      const container = document.createElement("div");
      container.className = "card-rich-text-editor__image";
      container.setAttribute("data-card-image", "true");

      const img = document.createElement("img");
      img.draggable = false;
      img.style.width = `${node.attrs.widthPercent}%`;
      img.alt = node.attrs.alt ?? "";

      const handle = document.createElement("button");
      handle.type = "button";
      handle.className = "card-rich-text-editor__resize-handle";
      handle.setAttribute("aria-label", "Resize image");

      const selectNode = () => {
        const pos = getPos();
        if (pos !== undefined) {
          editor.chain().setNodeSelection(pos).focus().run();
        }
      };

      container.addEventListener("mousedown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        selectNode();
      });

      let drag: { startX: number; startPercent: number; containerWidth: number } | null = null;
      const onMove = (event: MouseEvent) => {
        if (!drag) return;
        const percent = widthPercentFromDrag({
          startPercent: drag.startPercent,
          startX: drag.startX,
          currentX: event.clientX,
          containerWidth: drag.containerWidth,
        });
        img.style.width = `${percent}%`;
        const pos = getPos();
        if (pos !== undefined) {
          editor
            .chain()
            .setNodeSelection(pos)
            .updateAttributes(this.name, { widthPercent: percent })
            .run();
        }
      };
      const onUp = () => {
        drag = null;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };

      handle.addEventListener("mousedown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        selectNode();
        drag = {
          startX: event.clientX,
          startPercent: node.attrs.widthPercent,
          containerWidth: Math.max(1, container.getBoundingClientRect().width),
        };
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
      });

      // Resolved media URLs (staged or committed) can arrive after the node
      // view is created. Re-apply the source on every transaction so a
      // host-side refresh (setContent) repaints the image without waiting
      // for the node itself to change.
      const applySource = () => {
        const src = resolveMedia(node.attrs.mediaId);
        if (src) img.setAttribute("src", src);
        else img.removeAttribute("src");
      };
      applySource();
      editor.on("transaction", applySource);

      container.append(img, handle);

      return {
        dom: container,
        destroy: () => editor.off("transaction", applySource),
        selectNode: () => container.classList.add("is-selected"),
        deselectNode: () => container.classList.remove("is-selected"),
        update: (updatedNode) => {
          if (updatedNode.type.name !== this.name) return true;
          img.style.width = `${updatedNode.attrs.widthPercent}%`;
          if (updatedNode.attrs.alt !== img.getAttribute("alt")) {
            img.setAttribute("alt", updatedNode.attrs.alt ?? "");
          }
          const src = resolveMedia(updatedNode.attrs.mediaId);
          if (src && img.getAttribute("src") !== src) {
            img.setAttribute("src", src);
          }
          return true;
        },
        ignoreMutation: () => true,
      };
    };
  },
});

export const CardRichTextEditor = forwardRef<CardRichTextEditorHandle, CardRichTextEditorProps>(
  function CardRichTextEditor(
    {
      ariaLabel,
      value,
      disabled = false,
      showToolbar = true,
      onFocusChange,
      onChange,
      onStageMedia,
      onDiscardMedia,
      resolveMedia,
    }: CardRichTextEditorProps,
    ref,
  ) {
  const latest = useRef({ onChange, onStageMedia, onDiscardMedia, resolveMedia });
  latest.current = { onChange, onStageMedia, onDiscardMedia, resolveMedia };

  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const mediaIdsRef = useRef<Set<string> | null>(null);
  const lastEmittedRef = useRef<string>("");

  async function insertFiles(
    files: File[],
    sourceType: "file" | "clipboard",
  ): Promise<void> {
    const editor = editorRef.current;
    if (!editor) return;
    for (const file of files) {
      const fileError = validateImageFile(file);
      if (fileError) {
        setError(fileError);
        return;
      }
      if (countImagesInEditor(editor) >= MAX_IMAGES) {
        setError(MAX_IMAGES_ERROR);
        return;
      }
      const staged = await latest.current.onStageMedia?.(file, sourceType);
      if (!staged) return;
      editor
        .chain()
        .focus()
        .insertContent({
          type: "image",
          attrs: {
            mediaId: staged.id,
            alt: file.name,
            widthPercent: 100,
          },
        })
        .run();
      // insertContent leaves a node selection on the inserted image; move the
      // cursor after it so the next file appends instead of replacing it.
      editor.commands.setTextSelection(editor.state.selection.to);
      setError(null);
    }
  }

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Nodes/marks outside the rich document allowlist.
        blockquote: false,
        code: false,
        codeBlock: false,
        horizontalRule: false,
        link: false,
      }),
      // Underline is provided by StarterKit.
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      CardImage.configure({
        resolveMedia: (mediaId: string) => latest.current.resolveMedia?.(mediaId) ?? "",
      }),
      FileHandler.configure({
        onPaste: (_editor, files) => {
          void insertFiles(files, "clipboard");
        },
        onDrop: (_editor, files) => {
          void insertFiles(files, "file");
        },
      }),
    ],
    // The doc schema requires at least one block; an empty value renders as
    // a single empty paragraph so the editor is always typeable.
    content:
      value.content.length === 0
        ? { type: "doc", content: [{ type: "paragraph" }] }
        : value,
    editable: !disabled,
    editorProps: {
      attributes: {
        "aria-label": ariaLabel,
        "aria-multiline": "true",
      },
    },
    onUpdate: ({ editor: currentEditor, transaction }) => {
      const json = stripNullAttrs(currentEditor.getJSON());
      const result = validateRichDocument(json);
      if (!result.ok) return;
      const nextIds = collectMediaIds(result.doc);
      const previous = mediaIdsRef.current;
      if (previous && !isHistoryTransaction(transaction)) {
        for (const id of previous) {
          if (!nextIds.has(id)) {
            latest.current.onDiscardMedia?.(id);
          }
        }
      }
      mediaIdsRef.current = nextIds;
      lastEmittedRef.current = JSON.stringify(result.doc);
      latest.current.onChange(result.doc);
    },
  });
  editorRef.current = editor;

  useImperativeHandle(
    ref,
    () => ({
      insertTextAtSelection(text: string): boolean {
        const current = editorRef.current;
        if (!current) return false;
        return current
          .chain()
          .focus()
          .insertContent({ type: "text", text })
          .run();
      },
      focus(): void {
        const current = editorRef.current;
        if (!current) return;
        // `view.focus()` focuses the contenteditable and maps the ProseMirror
        // selection to the DOM synchronously. `editor.commands.focus()` defers
        // to requestAnimationFrame, which never runs in test environments and
        // can steal focus back to the front face long after the mount effect.
        current.view.focus();
      },
      getEditor(): Editor | null {
        return editorRef.current;
      },
      openImagePicker(): void {
        fileInputRef.current?.click();
      },
      refreshMedia(): void {
        const current = editorRef.current;
        if (!current) return;
        current.commands.setContent(current.getJSON(), { emitUpdate: false });
      },
    }),
    [],
  );

  useEffect(() => {
    // `emitUpdate: false` so toggling read-only never fires a spurious
    // onChange with an unchanged document.
    editor?.setEditable(!disabled, false);
  }, [editor, disabled]);

  // Report contenteditable focus changes so hosts can drive a shared toolbar.
  useEffect(() => {
    if (!editor) return;
    const onFocus = () => onFocusChange?.(true);
    const onBlur = () => onFocusChange?.(false);
    editor.on("focus", onFocus);
    editor.on("blur", onBlur);
    return () => {
      editor.off("focus", onFocus);
      editor.off("blur", onBlur);
    };
  }, [editor, onFocusChange]);

  // Seed the media tracking and "last emitted" marker from the initial value.
  // A layout effect so the marker exists before the external-sync layout
  // effect checks it on the first commit.
  useLayoutEffect(() => {
    mediaIdsRef.current = collectMediaIds(value);
    lastEmittedRef.current = JSON.stringify(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // External value sync: adopt a new `value` only when it did not originate
  // from this editor (so typing is never clobbered). `emitUpdate: false`
  // keeps an external adoption from echoing back through `onChange`, which
  // would otherwise re-enter the parent's state (and any side effects such
  // as language detection) with a document the parent already knows about.
  // Layout timing matters: under rapid typing React may defer passive
  // effects past the next editor transaction, which would misread a stale
  // echoed value as an external replacement. A layout effect runs
  // synchronously per commit, before the next keystroke can move the
  // document forward.
  useLayoutEffect(() => {
    if (!editor) return;
    const incoming = JSON.stringify(value);
    if (incoming === lastEmittedRef.current) return;
    if (incoming === JSON.stringify(editor.getJSON())) return;
    editor.commands.setContent(value, { emitUpdate: false });
  }, [editor, value]);

  return (
    <div className="card-rich-text-editor">
      {showToolbar ? (
        <CardRichTextToolbar
          editor={editor}
          disabled={disabled}
          onInsertImage={() => fileInputRef.current?.click()}
        />
      ) : null}

      <ScrollArea className="card-rich-text-editor__scroll-area">
        <div
          className="card-rich-text-editor__scroll-content"
          style={{ paddingRight: 20 }}
        >
          <EditorContent aria-label={ariaLabel} editor={editor} />
        </div>
      </ScrollArea>

      <input
        accept="image/jpeg,image/png,image/webp,image/gif"
        data-testid="card-rich-text-editor-file-input"
        disabled={disabled}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          if (files.length > 0) {
            void insertFiles(files, "file");
          }
        }}
        ref={fileInputRef}
        style={{ display: "none" }}
        type="file"
      />

      {error ? (
        <div className="card-rich-text-editor__error" role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
  },
);
