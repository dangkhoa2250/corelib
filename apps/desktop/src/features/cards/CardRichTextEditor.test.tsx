import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  derivePlainText,
  validateRichDocument,
  type ImageNode,
  type RichDocument,
} from "../../domain/richDocument";
import { CardRichTextEditor, clampWidthPercent, widthPercentFromDrag } from "./CardRichTextEditor";

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const EMPTY_DOC: RichDocument = { type: "doc", content: [] };

const textDoc = (text: string): RichDocument => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});

function makeImageFile(name: string, overrides: Partial<File> = {}): File {
  return new File(["fake-image-bytes"], name, { type: "image/png", ...overrides });
}

function makeDataTransfer(files: File[]): DataTransfer {
  return {
    files,
    types: ["Files"],
    getData: () => "",
    items: { add: vi.fn() },
  } as unknown as DataTransfer;
}

function lastDoc(onChange: ReturnType<typeof vi.fn>): RichDocument {
  const calls = onChange.mock.calls;
  return calls[calls.length - 1][0] as RichDocument;
}

function walkBlocks(blocks: unknown[]): any[] {
  const out: any[] = [];
  for (const block of blocks as any[]) {
    out.push(block);
    if (Array.isArray(block.content)) out.push(...walkBlocks(block.content));
  }
  return out;
}

function findImages(doc: RichDocument): ImageNode[] {
  return walkBlocks(doc.content).filter((node) => node.type === "image");
}

function findText(doc: RichDocument, text: string): any[] {
  return walkBlocks(doc.content).filter(
    (node) => node.type === "text" && node.text === text,
  );
}

function hasMark(doc: RichDocument, text: string, markType: string): boolean {
  return findText(doc, text).some(
    (node) => Array.isArray(node.marks) && node.marks.some((mark: any) => mark.type === markType),
  );
}

interface RenderResult {
  user: ReturnType<typeof userEvent.setup>;
  onChange: ReturnType<typeof vi.fn>;
  onStageMedia: ReturnType<typeof vi.fn>;
  onDiscardMedia: ReturnType<typeof vi.fn>;
  container: HTMLElement;
  rerender: (props: Partial<React.ComponentProps<typeof CardRichTextEditor>>) => void;
}

function renderEditor(
  overrides: Partial<React.ComponentProps<typeof CardRichTextEditor>> = {},
): RenderResult {
  const onChange = vi.fn();
  const onStageMedia = vi.fn().mockResolvedValue({ id: "media-1" });
  const onDiscardMedia = vi.fn();
  const user = userEvent.setup();
  const utils = render(
    <CardRichTextEditor
      ariaLabel="Front"
      value={EMPTY_DOC}
      onChange={onChange}
      onStageMedia={onStageMedia}
      onDiscardMedia={onDiscardMedia}
      {...overrides}
    />,
  );
  return {
    user,
    onChange,
    onStageMedia,
    onDiscardMedia,
    container: utils.container,
    rerender: (props) =>
      utils.rerender(
        <CardRichTextEditor
          ariaLabel="Front"
          value={overrides.value ?? EMPTY_DOC}
          onChange={onChange}
          onStageMedia={onStageMedia}
          onDiscardMedia={onDiscardMedia}
          {...props}
        />,
      ),
  };
}

async function insertImage(
  result: RenderResult,
  file = makeImageFile("diagram.png"),
): Promise<void> {
  const input = result.container.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
  await waitFor(() => expect(result.onStageMedia).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(findImages(lastDoc(result.onChange))).toHaveLength(1));
}

describe("clampWidthPercent / widthPercentFromDrag", () => {
  test("clamps width percent to the 10..100 range and rounds to integers", () => {
    expect(clampWidthPercent(5)).toBe(10);
    expect(clampWidthPercent(0)).toBe(10);
    expect(clampWidthPercent(-20)).toBe(10);
    expect(clampWidthPercent(150)).toBe(100);
    expect(clampWidthPercent(500)).toBe(100);
    expect(clampWidthPercent(50.4)).toBe(50);
    expect(clampWidthPercent(37.6)).toBe(38);
    expect(clampWidthPercent(100)).toBe(100);
    expect(clampWidthPercent(10)).toBe(10);
  });

  test("derives a clamped width percent from a drag delta", () => {
    expect(
      widthPercentFromDrag({ startPercent: 50, startX: 0, currentX: 100, containerWidth: 200 }),
    ).toBe(100);
    expect(
      widthPercentFromDrag({ startPercent: 50, startX: 0, currentX: -400, containerWidth: 200 }),
    ).toBe(10);
    expect(
      widthPercentFromDrag({ startPercent: 50, startX: 10, currentX: 60, containerWidth: 200 }),
    ).toBe(75);
  });
});

describe("CardRichTextEditor", () => {
  let result: RenderResult;

  beforeEach(() => {
    result = renderEditor();
  });

  test("renders a single-paragraph document unchanged", () => {
    const { container } = renderEditor({ value: textDoc("Hello world") });
    expect(container.querySelector(".tiptap")).toHaveTextContent("Hello world");
  });

  test("accepts an empty document and renders an empty paragraph", () => {
    expect(result.container.querySelector(".tiptap p")).not.toBeNull();
  });

  test("wraps the editor body in a ScrollArea with a 20px thumb-side gutter", () => {
    const scrollArea = result.container.querySelector("[data-scroll-area-root]");
    expect(scrollArea).not.toBeNull();
    const content = scrollArea!.firstElementChild as HTMLElement | null;
    expect(content).not.toBeNull();
    expect(Number.parseFloat(content!.style.paddingRight)).toBeGreaterThanOrEqual(20);
  });

  test("typing emits a validateRichDocument-compatible document via onChange", async () => {
    const editable = result.container.querySelector(".tiptap")!;
    await result.user.click(editable);
    await result.user.keyboard("Hello");

    const doc = lastDoc(result.onChange);
    expect(validateRichDocument(doc).ok).toBe(true);
    expect(derivePlainText(doc)).toBe("Hello");
  });

  test("toolbar menus act on the focused editor and reflect active marks via aria-checked", async () => {
    const editable = result.container.querySelector(".tiptap")!;
    await result.user.click(editable);

    const openFormatting = () => screen.getByRole("button", { name: "Text formatting" });
    await result.user.click(openFormatting());
    await result.user.click(screen.getByRole("menuitemcheckbox", { name: "Bold" }));
    await result.user.click(openFormatting());
    await result.user.click(screen.getByRole("menuitemcheckbox", { name: "Italic" }));

    await result.user.keyboard("text");
    const doc = lastDoc(result.onChange);
    expect(hasMark(doc, "text", "bold")).toBe(true);
    expect(hasMark(doc, "text", "italic")).toBe(true);

    await result.user.click(openFormatting());
    expect(screen.getByRole("menuitemcheckbox", { name: "Bold" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("menuitemcheckbox", { name: "Italic" })).toHaveAttribute("aria-checked", "true");
  });

  test("underline, strike, and clear-formatting buttons work", async () => {
    const editable = result.container.querySelector(".tiptap")!;
    await result.user.click(editable);
    const openFormatting = () => screen.getByRole("button", { name: "Text formatting" });
    await result.user.click(openFormatting());
    await result.user.click(screen.getByRole("menuitemcheckbox", { name: "Underline" }));
    await result.user.keyboard("u");

    const underlined = lastDoc(result.onChange);
    expect(hasMark(underlined, "u", "underline")).toBe(true);

    await result.user.keyboard("{Control>}a{/Control}");
    await result.user.click(openFormatting());
    await result.user.click(screen.getByRole("menuitemcheckbox", { name: "Strikethrough" }));
    const struck = lastDoc(result.onChange);
    expect(hasMark(struck, "u", "strike")).toBe(true);

    await result.user.click(screen.getByRole("button", { name: "Clear formatting" }));
    const cleared = lastDoc(result.onChange);
    expect(findText(cleared, "u")[0]?.marks ?? []).toHaveLength(0);
  });

  test("heading and paragraph buttons convert blocks", async () => {
    const editable = result.container.querySelector(".tiptap")!;
    await result.user.click(editable);
    const openParagraphStyle = () => screen.getByRole("button", { name: "Paragraph style" });
    await result.user.click(openParagraphStyle());
    await result.user.click(screen.getByRole("menuitemradio", { name: "Heading 2" }));
    await result.user.keyboard("Title");
    const heading = lastDoc(result.onChange);
    expect(heading.content[0]).toMatchObject({ type: "heading", attrs: { level: 2 } });

    await result.user.click(openParagraphStyle());
    expect(screen.getByRole("menuitemradio", { name: "Heading 2" })).toHaveAttribute("aria-checked", "true");
    await result.user.click(screen.getByRole("menuitemradio", { name: "Paragraph" }));
    await result.user.keyboard(" body");
    const paragraph = lastDoc(result.onChange);
    expect(paragraph.content[0].type).toBe("paragraph");
  });

  test("bullet and ordered list buttons create lists", async () => {
    const editable = result.container.querySelector(".tiptap")!;
    await result.user.click(editable);
    const openLists = () => screen.getByRole("button", { name: "Lists" });
    await result.user.click(openLists());
    await result.user.click(screen.getByRole("menuitemradio", { name: "Bullet list" }));
    await result.user.keyboard("item");
    const bullet = lastDoc(result.onChange);
    expect(bullet.content[0].type).toBe("bulletList");

    await result.user.keyboard("{Enter}");
    // A second Enter inside the empty list item exits the list, so the
    // numbered list is created as a separate block instead of converting the
    // bullet list in place.
    await result.user.keyboard("{Enter}");
    await result.user.click(openLists());
    await result.user.click(screen.getByRole("menuitemradio", { name: "Numbered list" }));
    await result.user.keyboard("second");
    const ordered = lastDoc(result.onChange);
    expect(findImages(ordered)).toHaveLength(0);
    const types = walkBlocks(ordered.content)
      .filter((node) => ["bulletList", "orderedList"].includes(node.type))
      .map((node) => node.type);
    expect(types).toContain("bulletList");
    expect(types).toContain("orderedList");
  });

  test("alignment buttons apply textAlign to the paragraph", async () => {
    const editable = result.container.querySelector(".tiptap")!;
    await result.user.click(editable);
    await result.user.click(screen.getByRole("button", { name: "Alignment" }));
    await result.user.click(screen.getByRole("menuitemradio", { name: "Align right" }));
    await result.user.keyboard("right");
    const doc = lastDoc(result.onChange);
    const paragraph = doc.content[0] as any;
    expect(paragraph.attrs?.textAlign).toBe("right");
  });

  test("text color and highlight controls apply color marks", async () => {
    const editable = result.container.querySelector(".tiptap")!;
    await result.user.click(editable);

    const color = screen.getByLabelText("Text color") as HTMLInputElement;
    fireEvent.input(color, { target: { value: "#ff0000" } });
    await result.user.keyboard("red");
    const colored = lastDoc(result.onChange);
    expect(hasMark(colored, "red", "textStyle")).toBe(true);

    const highlight = screen.getByLabelText("Highlight color") as HTMLInputElement;
    fireEvent.input(highlight, { target: { value: "#00ff00" } });
    await result.user.keyboard(" mark");
    const highlighted = lastDoc(result.onChange);
    expect(hasMark(highlighted, " mark", "highlight")).toBe(true);
  });

  test("undo and redo buttons restore text", async () => {
    const editable = result.container.querySelector(".tiptap")!;
    await result.user.click(editable);
    await result.user.keyboard("hello");

    await result.user.click(screen.getByRole("button", { name: "Undo" }));
    expect(derivePlainText(lastDoc(result.onChange))).toBe("");

    await result.user.click(screen.getByRole("button", { name: "Redo" }));
    expect(derivePlainText(lastDoc(result.onChange))).toBe("hello");
  });

  test("re-rendering with the same document does not clobber typed text", async () => {
    const editable = result.container.querySelector(".tiptap")!;
    await result.user.click(editable);
    await result.user.keyboard("hi");
    const doc = lastDoc(result.onChange);

    result.rerender({ value: doc });
    expect(result.container.querySelector(".tiptap")).toHaveTextContent("hi");
  });

  test("upload button opens the file picker", async () => {
    const clickSpy = vi
      .spyOn(HTMLInputElement.prototype, "click")
      .mockImplementation(() => {});
    try {
      await result.user.click(screen.getByRole("button", { name: "Insert image" }));
      expect(clickSpy).toHaveBeenCalledTimes(1);
    } finally {
      clickSpy.mockRestore();
    }
  });

  test("image upload stages the file and inserts an image node at the cursor", async () => {
    const file = makeImageFile("diagram.png");
    await insertImage(result, file);

    expect(result.onStageMedia).toHaveBeenCalledWith(file, "file");
    const image = findImages(lastDoc(result.onChange))[0];
    expect(image).toMatchObject({
      type: "image",
      attrs: { mediaId: "media-1", alt: "diagram.png", widthPercent: 100 },
    });
  });

  test("pasting an image file stages it as clipboard media and inserts", async () => {
    const file = makeImageFile("clip.png");
    const editable = result.container.querySelector(".tiptap")!;
    fireEvent.paste(editable, { clipboardData: makeDataTransfer([file]) });

    await waitFor(() => expect(result.onStageMedia).toHaveBeenCalledWith(file, "clipboard"));
    await waitFor(() => {
      expect(findImages(lastDoc(result.onChange))[0]?.attrs.mediaId).toBe("media-1");
    });
  });

  test("dropping an image file stages it as file media and inserts", async () => {
    const file = makeImageFile("drop.png");
    const editable = result.container.querySelector(".tiptap")!;
    // ProseMirror resolves drop coordinates against DOM layout, which jsdom
    // lacks; give the editor a real rect and hit-test target so the drop
    // handler reaches the FileHandler plugin.
    vi.spyOn(editable, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 200, 100));
    const originalElementFromPoint = document.elementFromPoint.bind(document);
    (document as any).elementFromPoint = () => editable;
    try {
      fireEvent.drop(editable, {
        dataTransfer: makeDataTransfer([file]),
        clientX: 5,
        clientY: 5,
      });

      await waitFor(() => expect(result.onStageMedia).toHaveBeenCalledWith(file, "file"));
      await waitFor(() => {
        expect(findImages(lastDoc(result.onChange))[0]?.attrs.mediaId).toBe("media-1");
      });
    } finally {
      (document as any).elementFromPoint = originalElementFromPoint;
    }
  });

  test("rejects an 11th image with a visible error and does not insert it", async () => {
    const input = result.container.querySelector('input[type="file"]') as HTMLInputElement;
    for (let i = 0; i < 10; i += 1) {
      fireEvent.change(input, { target: { files: [makeImageFile(`img-${i}.png`)] } });
      await waitFor(() => expect(findImages(lastDoc(result.onChange))).toHaveLength(i + 1));
    }

    result.onStageMedia.mockClear();
    fireEvent.change(input, { target: { files: [makeImageFile("eleventh.png")] } });

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/10 images/i);
    });
    expect(result.onStageMedia).not.toHaveBeenCalled();
    expect(findImages(lastDoc(result.onChange))).toHaveLength(10);
  });

  test("rejects files larger than 10 MB with a visible error and no insert", async () => {
    const huge = makeImageFile("huge.png", {
      size: 10 * 1024 * 1024 + 1,
    });
    // `size` is derived from the buffer; build a real oversized file instead.
    const bigFile = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "huge.png", {
      type: "image/png",
    });
    void huge;
    const input = result.container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [bigFile] } });

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/10 MB/i);
    });
    expect(result.onStageMedia).not.toHaveBeenCalled();
    expect(result.container.querySelectorAll("[data-card-image]")).toHaveLength(0);
  });

  test("rejects unsupported MIME types with a visible error and no insert", async () => {
    const pdf = new File(["pdf-bytes"], "doc.pdf", { type: "application/pdf" });
    const input = result.container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [pdf] } });

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/unsupported|image/i);
    });
    expect(result.onStageMedia).not.toHaveBeenCalled();
    expect(result.container.querySelectorAll("[data-card-image]")).toHaveLength(0);
  });

  test("renders inserted images through the node view with a resize handle", async () => {
    await insertImage(result);
    expect(result.container.querySelector("[data-card-image] img")).not.toBeNull();
    expect(
      result.container.querySelector('button[aria-label="Resize image"]'),
    ).not.toBeNull();
  });

  test("dragging the resize handle updates widthPercent and clamps to 100", async () => {
    await insertImage(result);
    const imageEl = result.container.querySelector("[data-card-image]") as HTMLElement;
    vi.spyOn(imageEl, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 200, 100));

    const handle = result.container.querySelector(
      'button[aria-label="Resize image"]',
    ) as HTMLElement;
    fireEvent.mouseDown(handle, { clientX: 100, clientY: 0 });
    fireEvent.mouseMove(window, { clientX: 300, clientY: 0 });
    fireEvent.mouseUp(window, { clientX: 300, clientY: 0 });

    await waitFor(() => {
      const image = findImages(lastDoc(result.onChange))[0];
      expect(image.attrs.widthPercent).toBe(100);
    });
  });

  test("keyboard delete on a selected image removes the node and discards the media", async () => {
    await insertImage(result);
    const imageEl = result.container.querySelector("[data-card-image]") as HTMLElement;
    // The node view selects the image on mousedown; a synthetic mousedown is
    // more reliable in jsdom than a full pointer/click sequence.
    fireEvent.mouseDown(imageEl, { button: 0 });
    const editable = result.container.querySelector(".tiptap")!;
    fireEvent.keyDown(editable, { key: "Delete" });

    await waitFor(() => expect(result.onDiscardMedia).toHaveBeenCalledWith("media-1"));
    await waitFor(() => expect(findImages(lastDoc(result.onChange))).toHaveLength(0));
  });

  test("disabled editor rejects typing and disables toolbar buttons", async () => {
    result.rerender({ disabled: true });
    const editable = result.container.querySelector(".tiptap")!;
    expect(editable.getAttribute("contenteditable")).toBe("false");
    expect(screen.getByRole("button", { name: "Text formatting" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Insert image" })).toBeDisabled();

    await result.user.click(editable);
    await result.user.keyboard("hello");
    expect(result.onChange).not.toHaveBeenCalled();
    expect(editable.textContent).toBe("");
  });
});
