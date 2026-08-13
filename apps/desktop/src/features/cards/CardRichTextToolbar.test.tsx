import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import TextAlign from "@tiptap/extension-text-align";
import { CardRichTextToolbar } from "./CardRichTextToolbar";

// ---------------------------------------------------------------------------
// jsdom shims. ProseMirror (and user-event) need APIs jsdom does not provide:
// Text/Range geometry queries and document.elementFromPoint.
// ---------------------------------------------------------------------------
function rectListPolyfill() {
  return { length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] };
}
function zeroRect() {
  return new DOMRect(0, 0, 0, 0);
}
if (typeof Text !== "undefined" && !(Text.prototype as any).getClientRects) {
  (Text.prototype as any).getClientRects = rectListPolyfill;
}
if (typeof Text !== "undefined" && !(Text.prototype as any).getBoundingClientRect) {
  (Text.prototype as any).getBoundingClientRect = zeroRect;
}
if (typeof Range !== "undefined" && !(Range.prototype as any).getClientRects) {
  (Range.prototype as any).getClientRects = rectListPolyfill;
}
if (typeof Range !== "undefined" && !(Range.prototype as any).getBoundingClientRect) {
  (Range.prototype as any).getBoundingClientRect = zeroRect;
}
if (typeof document !== "undefined" && typeof document.elementFromPoint !== "function") {
  (document as any).elementFromPoint = () => document.body;
}

function Harness({ onInsertImage }: { onInsertImage: () => void }) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
    ],
    content: "<p>hi</p>",
  });
  if (!editor) return null;
  return (
    <div>
      <CardRichTextToolbar editor={editor} onInsertImage={onInsertImage} />
      <EditorContent editor={editor} />
    </div>
  );
}

test("groups formatting controls into compact menus", () => {
  render(<Harness onInsertImage={vi.fn()} />);
  expect(screen.getByRole("button", { name: "Text formatting" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Paragraph style" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Lists" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Alignment" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Undo" }).querySelector("svg")).not.toBeNull();
  expect(screen.getByRole("button", { name: "Redo" }).querySelector("svg")).not.toBeNull();
  expect(screen.getByRole("button", { name: "Insert image" }).querySelector("svg")).not.toBeNull();
  expect(screen.getByRole("button", { name: "Clear formatting" })).toHaveTextContent("Clear");
  expect(screen.queryByRole("button", { name: "Bold" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Heading 2" })).not.toBeInTheDocument();
});

test("applies formatting from the text formatting menu and reflects active marks", async () => {
  const user = userEvent.setup();
  const { container } = render(<Harness onInsertImage={vi.fn()} />);
  const editable = container.querySelector(".tiptap")!;
  await user.click(editable);
  await user.click(screen.getByRole("button", { name: "Text formatting" }));
  await user.click(screen.getByRole("menuitemcheckbox", { name: "Bold" }));
  await user.keyboard("text");
  // Scope to the editor body: the menu trigger renders an icon, not a glyph.
  expect(container.querySelector(".tiptap strong")?.textContent).toBe("text");
  await user.click(screen.getByRole("button", { name: "Text formatting" }));
  expect(screen.getByRole("menuitemcheckbox", { name: "Bold" })).toHaveAttribute("aria-checked", "true");
});

test("paragraph style menu applies headings", async () => {
  const user = userEvent.setup();
  const { container } = render(<Harness onInsertImage={vi.fn()} />);
  await user.click(container.querySelector(".tiptap")!);
  await user.click(screen.getByRole("button", { name: "Paragraph style" }));
  await user.click(screen.getByRole("menuitemradio", { name: "Heading 2" }));
  await user.keyboard("title");
  const heading = container.querySelector(".tiptap h2");
  expect(heading).not.toBeNull();
  expect(heading?.textContent).toContain("title");
});

test("list menu applies bullet and numbered lists with distinct icons", async () => {
  const user = userEvent.setup();
  const { container } = render(<Harness onInsertImage={vi.fn()} />);
  await user.click(container.querySelector(".tiptap")!);
  await user.click(screen.getByRole("button", { name: "Lists" }));
  const bullet = screen.getByRole("menuitemradio", { name: "Bullet list" });
  const numbered = screen.getByRole("menuitemradio", { name: "Numbered list" });
  expect(bullet.querySelector("svg")).not.toBeNull();
  expect(numbered.querySelector("svg")).not.toBeNull();
  expect(bullet.querySelector("svg")?.outerHTML).not.toEqual(numbered.querySelector("svg")?.outerHTML);
  await user.click(bullet);
  await user.keyboard("item");
  const item = container.querySelector(".tiptap ul li");
  expect(item).not.toBeNull();
  expect(item?.textContent).toContain("item");
});

test("alignment menu applies alignment with distinct icons", async () => {
  const user = userEvent.setup();
  const { container } = render(<Harness onInsertImage={vi.fn()} />);
  await user.click(container.querySelector(".tiptap")!);
  await user.click(screen.getByRole("button", { name: "Alignment" }));
  const alignLeft = screen.getByRole("menuitemradio", { name: "Align left" });
  const alignRight = screen.getByRole("menuitemradio", { name: "Align right" });
  expect(alignLeft.querySelector("svg")?.outerHTML).not.toEqual(alignRight.querySelector("svg")?.outerHTML);
  await user.click(alignRight);
  expect(container.querySelector(".tiptap p")).toHaveStyle({ textAlign: "right" });
});

test("disables every button when the editor is null", () => {
  render(<CardRichTextToolbar editor={null} onInsertImage={vi.fn()} />);
  for (const btn of screen.getAllByRole("button")) {
    expect(btn).toBeDisabled();
  }
});

test("insert image button invokes onInsertImage", async () => {
  const user = userEvent.setup();
  const onInsertImage = vi.fn();
  render(<Harness onInsertImage={onInsertImage} />);
  await user.click(screen.getByRole("button", { name: "Insert image" }));
  expect(onInsertImage).toHaveBeenCalled();
});

test("color trigger opens the native color picker", async () => {
  const user = userEvent.setup();
  render(<Harness onInsertImage={vi.fn()} />);
  const picker = screen.getByLabelText("Text color picker") as HTMLInputElement;
  const clickSpy = vi.spyOn(picker, "click").mockImplementation(() => {});

  await user.click(screen.getByRole("button", { name: "Text color" }));

  expect(clickSpy).toHaveBeenCalled();
});
