import { type ReactNode } from "react";
import { useEditorState } from "@tiptap/react";
import type { Editor } from "@tiptap/core";

interface ToolbarState {
  canUndo: boolean;
  canRedo: boolean;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  paragraph: boolean;
  heading1: boolean;
  heading2: boolean;
  heading3: boolean;
  bulletList: boolean;
  orderedList: boolean;
  alignLeft: boolean;
  alignCenter: boolean;
  alignRight: boolean;
  alignJustify: boolean;
}

const IDLE_TOOLBAR: ToolbarState = {
  canUndo: false,
  canRedo: false,
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  paragraph: true,
  heading1: false,
  heading2: false,
  heading3: false,
  bulletList: false,
  orderedList: false,
  alignLeft: false,
  alignCenter: false,
  alignRight: false,
  alignJustify: false,
};

function ToolbarButton({
  label,
  active = false,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      aria-label={label}
      aria-pressed={active}
      className={
        active
          ? "card-rich-text-editor__toolbar-button is-active"
          : "card-rich-text-editor__toolbar-button"
      }
      disabled={disabled}
      onClick={onClick}
      onMouseDown={(event) => event.preventDefault()}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}

export interface CardRichTextToolbarProps {
  editor: Editor | null;
  disabled?: boolean;
  onInsertImage: () => void;
}

export function CardRichTextToolbar({
  editor,
  disabled = false,
  onInsertImage,
}: CardRichTextToolbarProps) {
  const toolbar =
    useEditorState({
      editor,
      selector: ({ editor: current }) => {
        if (!current) return IDLE_TOOLBAR;
        return {
          canUndo: current.can().undo(),
          canRedo: current.can().redo(),
          bold: current.isActive("bold"),
          italic: current.isActive("italic"),
          underline: current.isActive("underline"),
          strike: current.isActive("strike"),
          paragraph: current.isActive("paragraph"),
          heading1: current.isActive("heading", { level: 1 }),
          heading2: current.isActive("heading", { level: 2 }),
          heading3: current.isActive("heading", { level: 3 }),
          bulletList: current.isActive("bulletList"),
          orderedList: current.isActive("orderedList"),
          alignLeft: current.isActive({ textAlign: "left" }),
          alignCenter: current.isActive({ textAlign: "center" }),
          alignRight: current.isActive({ textAlign: "right" }),
          alignJustify: current.isActive({ textAlign: "justify" }),
        };
      },
    }) ?? IDLE_TOOLBAR;
  const setAlign = (alignment: "left" | "center" | "right" | "justify") => {
    editor?.chain().focus().setTextAlign(alignment).run();
  };
  const isDisabled = disabled || !editor;
  return (
    <div
      className="card-rich-text-editor__toolbar"
      role="toolbar"
      aria-label="Card formatting"
      onMouseDown={(event) => event.preventDefault()}
    >
      <ToolbarButton
        disabled={isDisabled || !toolbar.canUndo}
        label="Undo"
        onClick={() => editor?.chain().focus().undo().run()}
      >
        ↺
      </ToolbarButton>
      <ToolbarButton
        disabled={isDisabled || !toolbar.canRedo}
        label="Redo"
        onClick={() => editor?.chain().focus().redo().run()}
      >
        ↻
      </ToolbarButton>

      <span className="card-rich-text-editor__toolbar-separator" aria-hidden="true" />

      <ToolbarButton
        active={toolbar.bold}
        disabled={isDisabled}
        label="Bold"
        onClick={() => editor?.chain().focus().toggleBold().run()}
      >
        <strong>B</strong>
      </ToolbarButton>
      <ToolbarButton
        active={toolbar.italic}
        disabled={isDisabled}
        label="Italic"
        onClick={() => editor?.chain().focus().toggleItalic().run()}
      >
        <em>I</em>
      </ToolbarButton>
      <ToolbarButton
        active={toolbar.underline}
        disabled={isDisabled}
        label="Underline"
        onClick={() => editor?.chain().focus().toggleUnderline().run()}
      >
        <u>U</u>
      </ToolbarButton>
      <ToolbarButton
        active={toolbar.strike}
        disabled={isDisabled}
        label="Strikethrough"
        onClick={() => editor?.chain().focus().toggleStrike().run()}
      >
        <s>S</s>
      </ToolbarButton>

      <span className="card-rich-text-editor__toolbar-separator" aria-hidden="true" />

      <ToolbarButton
        active={toolbar.paragraph}
        disabled={isDisabled}
        label="Paragraph"
        onClick={() => editor?.chain().focus().setParagraph().run()}
      >
        ¶
      </ToolbarButton>
      <ToolbarButton
        active={toolbar.heading1}
        disabled={isDisabled}
        label="Heading 1"
        onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
      >
        H1
      </ToolbarButton>
      <ToolbarButton
        active={toolbar.heading2}
        disabled={isDisabled}
        label="Heading 2"
        onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        H2
      </ToolbarButton>
      <ToolbarButton
        active={toolbar.heading3}
        disabled={isDisabled}
        label="Heading 3"
        onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
      >
        H3
      </ToolbarButton>

      <span className="card-rich-text-editor__toolbar-separator" aria-hidden="true" />

      <ToolbarButton
        active={toolbar.bulletList}
        disabled={isDisabled}
        label="Bullet list"
        onClick={() => editor?.chain().focus().toggleBulletList().run()}
      >
        • List
      </ToolbarButton>
      <ToolbarButton
        active={toolbar.orderedList}
        disabled={isDisabled}
        label="Numbered list"
        onClick={() => editor?.chain().focus().toggleOrderedList().run()}
      >
        1. List
      </ToolbarButton>

      <span className="card-rich-text-editor__toolbar-separator" aria-hidden="true" />

      <ToolbarButton
        active={toolbar.alignLeft}
        disabled={isDisabled}
        label="Align left"
        onClick={() => setAlign("left")}
      >
        ⯇
      </ToolbarButton>
      <ToolbarButton
        active={toolbar.alignCenter}
        disabled={isDisabled}
        label="Align center"
        onClick={() => setAlign("center")}
      >
        ⯈
      </ToolbarButton>
      <ToolbarButton
        active={toolbar.alignRight}
        disabled={isDisabled}
        label="Align right"
        onClick={() => setAlign("right")}
      >
        ≣
      </ToolbarButton>
      <ToolbarButton
        active={toolbar.alignJustify}
        disabled={isDisabled}
        label="Align justify"
        onClick={() => setAlign("justify")}
      >
        ☰
      </ToolbarButton>

      <span className="card-rich-text-editor__toolbar-separator" aria-hidden="true" />

      <label className="card-rich-text-editor__color-control">
        <span className="card-rich-text-editor__sr-only">Text color</span>
        <input
          aria-label="Text color"
          disabled={isDisabled}
          onChange={(event) => {
            editor?.chain().focus().setColor(event.target.value).run();
          }}
          type="color"
          value="#000000"
        />
      </label>
      <label className="card-rich-text-editor__color-control">
        <span className="card-rich-text-editor__sr-only">Highlight color</span>
        <input
          aria-label="Highlight color"
          disabled={isDisabled}
          onChange={(event) => {
            editor?.chain().focus().setHighlight({ color: event.target.value }).run();
          }}
          type="color"
          value="#ffff00"
        />
      </label>

      <span className="card-rich-text-editor__toolbar-separator" aria-hidden="true" />

      <ToolbarButton
        disabled={isDisabled}
        label="Insert image"
        onClick={onInsertImage}
      >
        Image
      </ToolbarButton>
      <ToolbarButton
        disabled={isDisabled}
        label="Clear formatting"
        onClick={() => editor?.chain().focus().unsetAllMarks().clearNodes().run()}
      >
        Clear
      </ToolbarButton>
    </div>
  );
}
