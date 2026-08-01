import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
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
  const editor = useEditor({ extensions: [StarterKit], content: "<p>hi</p>" });
  if (!editor) return null;
  return (
    <div>
      <CardRichTextToolbar editor={editor} onInsertImage={onInsertImage} />
      <EditorContent editor={editor} />
    </div>
  );
}

test("applies formatting to the given editor and reflects active marks", async () => {
  const user = userEvent.setup();
  const { container } = render(<Harness onInsertImage={vi.fn()} />);
  const editable = container.querySelector(".tiptap")!;
  await user.click(editable);
  const bold = screen.getByRole("button", { name: "Bold" });
  await user.click(bold);
  await user.keyboard("text");
  expect(bold).toHaveAttribute("aria-pressed", "true");
  // Scope to the editor body: the toolbar's own Bold button renders a
  // `<strong>` glyph and appears earlier in the DOM.
  expect(container.querySelector(".tiptap strong")?.textContent).toBe("text");
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
