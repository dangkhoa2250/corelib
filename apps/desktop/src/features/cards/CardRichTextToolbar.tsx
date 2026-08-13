import { type ReactNode } from "react";
import { useEditorState } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import {
  IconAlignCenter,
  IconAlignJustified,
  IconAlignLeft,
  IconAlignRight,
  IconArrowBackUp,
  IconArrowForwardUp,
  IconList,
  IconListNumbers,
  IconPhoto,
  IconPilcrow,
  IconTypography,
} from "@tabler/icons-react";
import { CompactToolbarMenu } from "./CompactToolbarMenu";

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
  iconOnly = false,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  iconOnly?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  const className = [
    "card-rich-text-editor__toolbar-button",
    iconOnly ? "card-rich-text-editor__toolbar-button--icon" : "",
    active ? "is-active" : "",
  ].filter(Boolean).join(" ");
  return (
    <button
      aria-label={label}
      aria-pressed={active}
      className={className}
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
      onMouseDown={(event) => {
        const target = event.target;
        if (target instanceof HTMLInputElement && target.type === "color") return;
        event.preventDefault();
      }}
    >
      <ToolbarButton
        disabled={isDisabled || !toolbar.canUndo}
        iconOnly
        label="Undo"
        onClick={() => editor?.chain().focus().undo().run()}
      >
        <IconArrowBackUp size={14} stroke={1.5} />
      </ToolbarButton>
      <ToolbarButton
        disabled={isDisabled || !toolbar.canRedo}
        iconOnly
        label="Redo"
        onClick={() => editor?.chain().focus().redo().run()}
      >
        <IconArrowForwardUp size={14} stroke={1.5} />
      </ToolbarButton>

      <span className="card-rich-text-editor__toolbar-separator" aria-hidden="true" />

      <CompactToolbarMenu
        active={toolbar.bold || toolbar.italic || toolbar.underline || toolbar.strike}
        disabled={isDisabled}
        icon={<IconTypography size={14} stroke={1.5} />}
        items={[
          { label: "Bold", active: toolbar.bold, role: "menuitemcheckbox", onSelect: () => editor?.chain().focus().toggleBold().run() },
          { label: "Italic", active: toolbar.italic, role: "menuitemcheckbox", onSelect: () => editor?.chain().focus().toggleItalic().run() },
          { label: "Underline", active: toolbar.underline, role: "menuitemcheckbox", onSelect: () => editor?.chain().focus().toggleUnderline().run() },
          { label: "Strikethrough", active: toolbar.strike, role: "menuitemcheckbox", onSelect: () => editor?.chain().focus().toggleStrike().run() },
        ]}
        label="Text formatting"
      />
      <CompactToolbarMenu
        active={toolbar.paragraph || toolbar.heading1 || toolbar.heading2 || toolbar.heading3}
        disabled={isDisabled}
        icon={<IconPilcrow size={14} stroke={1.5} />}
        items={[
          { label: "Paragraph", active: toolbar.paragraph, role: "menuitemradio", onSelect: () => editor?.chain().focus().setParagraph().run() },
          { label: "Heading 1", active: toolbar.heading1, role: "menuitemradio", onSelect: () => editor?.chain().focus().toggleHeading({ level: 1 }).run() },
          { label: "Heading 2", active: toolbar.heading2, role: "menuitemradio", onSelect: () => editor?.chain().focus().toggleHeading({ level: 2 }).run() },
          { label: "Heading 3", active: toolbar.heading3, role: "menuitemradio", onSelect: () => editor?.chain().focus().toggleHeading({ level: 3 }).run() },
        ]}
        label="Paragraph style"
      />
      <CompactToolbarMenu
        active={toolbar.bulletList || toolbar.orderedList}
        disabled={isDisabled}
        icon={<IconList size={14} stroke={1.5} />}
        items={[
          { label: "Bullet list", active: toolbar.bulletList, icon: <IconList size={13} stroke={1.5} />, role: "menuitemradio", onSelect: () => editor?.chain().focus().toggleBulletList().run() },
          { label: "Numbered list", active: toolbar.orderedList, icon: <IconListNumbers size={13} stroke={1.5} />, role: "menuitemradio", onSelect: () => editor?.chain().focus().toggleOrderedList().run() },
        ]}
        label="Lists"
      />
      <CompactToolbarMenu
        active={toolbar.alignCenter || toolbar.alignRight || toolbar.alignJustify}
        disabled={isDisabled}
        icon={<IconAlignLeft size={14} stroke={1.5} />}
        items={[
          { label: "Align left", active: toolbar.alignLeft, icon: <IconAlignLeft size={13} stroke={1.5} />, role: "menuitemradio", onSelect: () => setAlign("left") },
          { label: "Align center", active: toolbar.alignCenter, icon: <IconAlignCenter size={13} stroke={1.5} />, role: "menuitemradio", onSelect: () => setAlign("center") },
          { label: "Align right", active: toolbar.alignRight, icon: <IconAlignRight size={13} stroke={1.5} />, role: "menuitemradio", onSelect: () => setAlign("right") },
          { label: "Align justify", active: toolbar.alignJustify, icon: <IconAlignJustified size={13} stroke={1.5} />, role: "menuitemradio", onSelect: () => setAlign("justify") },
        ]}
        label="Alignment"
        layout="horizontal"
      />

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
        iconOnly
        label="Insert image"
        onClick={onInsertImage}
      >
        <IconPhoto size={14} stroke={1.5} />
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
