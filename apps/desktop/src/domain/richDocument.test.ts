import { describe, expect, it } from "vitest";

import {
  derivePlainText,
  validateRichDocument,
  type RichDocument,
} from "./richDocument";

const text = (value: string): unknown => ({ type: "text", text: value });

const paragraph = (...content: unknown[]): unknown => ({
  type: "paragraph",
  content: content.map((child) => (typeof child === "string" ? text(child) : child)),
});

const image = (overrides: Partial<Record<string, unknown>> = {}): unknown => ({
  type: "image",
  attrs: {
    mediaId: "media-1",
    alt: "a cat",
    widthPercent: 50,
    ...overrides,
  },
});

describe("validateRichDocument - accepted documents", () => {
  it("accepts a simple paragraph with text", () => {
    const doc = { type: "doc", content: [paragraph("Hello")] };
    const result = validateRichDocument(doc);
    expect(result.ok).toBe(true);
  });

  it("accepts an image-only document", () => {
    const doc = { type: "doc", content: [image()] };
    const result = validateRichDocument(doc);
    expect(result.ok).toBe(true);
  });

  it("accepts image widthPercent boundaries of 10 and 100", () => {
    expect(validateRichDocument({ type: "doc", content: [image({ widthPercent: 10 })] }).ok).toBe(true);
    expect(validateRichDocument({ type: "doc", content: [image({ widthPercent: 100 })] }).ok).toBe(true);
  });

  it("accepts an image with an empty alt string", () => {
    expect(validateRichDocument({ type: "doc", content: [image({ alt: "" })] }).ok).toBe(true);
  });

  it("accepts headings at levels 1, 2, and 3", () => {
    for (const level of [1, 2, 3]) {
      const doc = { type: "doc", content: [{ type: "heading", attrs: { level }, content: [text("Title")] }] };
      expect(validateRichDocument(doc).ok).toBe(true);
    }
  });

  it("accepts bullet and ordered lists with list items", () => {
    const listItem = { type: "listItem", content: [paragraph("a")] };
    const doc = {
      type: "doc",
      content: [
        { type: "bulletList", content: [listItem] },
        { type: "orderedList", content: [listItem] },
      ],
    };
    expect(validateRichDocument(doc).ok).toBe(true);
  });

  it("accepts a hardBreak inside a paragraph", () => {
    const doc = { type: "doc", content: [paragraph(text("a"), { type: "hardBreak" }, text("b"))] };
    expect(validateRichDocument(doc).ok).toBe(true);
  });

  it("accepts every configured mark on a text node", () => {
    const marks = [
      { type: "bold" },
      { type: "italic" },
      { type: "strike" },
      { type: "underline" },
      { type: "textStyle", attrs: { color: "#ff0000" } },
      { type: "textStyle" },
      { type: "highlight" },
      { type: "highlight", attrs: { color: "#ffff00" } },
    ];
    const doc = { type: "doc", content: [paragraph({ type: "text", text: "x", marks })] };
    expect(validateRichDocument(doc).ok).toBe(true);
  });

  it("accepts text alignment on paragraphs and headings", () => {
    const alignments = ["left", "center", "right", "justify"] as const;
    for (const textAlign of alignments) {
      const doc = {
        type: "doc",
        content: [
          { type: "paragraph", attrs: { textAlign }, content: [text("p")] },
          { type: "heading", attrs: { level: 2, textAlign }, content: [text("h")] },
        ],
      };
      expect(validateRichDocument(doc).ok).toBe(true);
    }
  });

  it("accepts a structurally empty document", () => {
    expect(validateRichDocument({ type: "doc", content: [] }).ok).toBe(true);
  });

  it("accepts up to 10 images and rejects the 11th", () => {
    const ten = { type: "doc", content: Array.from({ length: 10 }, () => image()) };
    expect(validateRichDocument(ten).ok).toBe(true);
    const eleven = { type: "doc", content: Array.from({ length: 11 }, () => image()) };
    expect(validateRichDocument(eleven).ok).toBe(false);
  });

  it("returns the narrowed document on success", () => {
    const result = validateRichDocument({ type: "doc", content: [paragraph("Hi")] });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.doc.type).toBe("doc");
      expect(result.doc.content[0]!.type).toBe("paragraph");
    }
  });
});

describe("validateRichDocument - rejected documents", () => {
  it("rejects non-object roots", () => {
    expect(validateRichDocument(null).ok).toBe(false);
    expect(validateRichDocument("doc").ok).toBe(false);
    expect(validateRichDocument(42).ok).toBe(false);
    expect(validateRichDocument(undefined).ok).toBe(false);
  });

  it("rejects a root whose type is not doc", () => {
    expect(validateRichDocument({ type: "paragraph", content: [] }).ok).toBe(false);
  });

  it("rejects unknown node types", () => {
    const doc = { type: "doc", content: [{ type: "blockquote", content: [] }] };
    expect(validateRichDocument(doc).ok).toBe(false);
  });

  it("rejects a text node whose text is missing or not a string", () => {
    expect(validateRichDocument({ type: "doc", content: [paragraph({ type: "text" })] }).ok).toBe(false);
    expect(validateRichDocument({ type: "doc", content: [paragraph({ type: "text", text: 7 })] }).ok).toBe(false);
  });

  it("rejects unknown marks", () => {
    const doc = { type: "doc", content: [paragraph({ type: "text", text: "x", marks: [{ type: "nope" }] })] };
    expect(validateRichDocument(doc).ok).toBe(false);
  });

  it("rejects unexpected attributes on simple marks", () => {
    const doc = { type: "doc", content: [paragraph({ type: "text", text: "x", marks: [{ type: "bold", attrs: { foo: 1 } }] })] };
    expect(validateRichDocument(doc).ok).toBe(false);
  });

  it("rejects highlight and textStyle attributes other than color", () => {
    const highlightDoc = { type: "doc", content: [paragraph({ type: "text", text: "x", marks: [{ type: "highlight", attrs: { color: "#fff", extra: 1 } }] })] };
    const textStyleDoc = { type: "doc", content: [paragraph({ type: "text", text: "x", marks: [{ type: "textStyle", attrs: { fontSize: "12" } }] })] };
    expect(validateRichDocument(highlightDoc).ok).toBe(false);
    expect(validateRichDocument(textStyleDoc).ok).toBe(false);
  });

  it("rejects marks on non-text nodes", () => {
    const doc = { type: "doc", content: [{ type: "paragraph", marks: [{ type: "bold" }], content: [text("x")] }] };
    expect(validateRichDocument(doc).ok).toBe(false);
  });

  it("rejects image nodes carrying arbitrary source/asset keys", () => {
    const withSrc = { type: "doc", content: [image({ src: "https://example.com/a.png" })] };
    const withAsset = { type: "doc", content: [image({ asset: "x" })] };
    expect(validateRichDocument(withSrc).ok).toBe(false);
    expect(validateRichDocument(withAsset).ok).toBe(false);
  });

  it("rejects image nodes missing required attributes", () => {
    expect(validateRichDocument({ type: "doc", content: [{ type: "image", attrs: { alt: "x", widthPercent: 50 } }] }).ok).toBe(false);
    expect(validateRichDocument({ type: "doc", content: [{ type: "image", attrs: { mediaId: "m", widthPercent: 50 } }] }).ok).toBe(false);
    expect(validateRichDocument({ type: "doc", content: [{ type: "image", attrs: { mediaId: "m", alt: "x" } }] }).ok).toBe(false);
  });

  it("rejects image widthPercent outside 10..100 or non-numeric", () => {
    expect(validateRichDocument({ type: "doc", content: [image({ widthPercent: 9 })] }).ok).toBe(false);
    expect(validateRichDocument({ type: "doc", content: [image({ widthPercent: 101 })] }).ok).toBe(false);
    expect(validateRichDocument({ type: "doc", content: [image({ widthPercent: "50" })] }).ok).toBe(false);
  });

  it("rejects image mediaId that is not a non-empty string", () => {
    expect(validateRichDocument({ type: "doc", content: [image({ mediaId: "" })] }).ok).toBe(false);
    expect(validateRichDocument({ type: "doc", content: [image({ mediaId: 5 })] }).ok).toBe(false);
  });

  it("rejects image attrs that is not an object", () => {
    expect(validateRichDocument({ type: "doc", content: [{ type: "image", attrs: "nope" }] }).ok).toBe(false);
  });

  it("rejects heading levels outside 1..3", () => {
    expect(validateRichDocument({ type: "doc", content: [{ type: "heading", attrs: { level: 0 }, content: [] }] }).ok).toBe(false);
    expect(validateRichDocument({ type: "doc", content: [{ type: "heading", attrs: { level: 4 }, content: [] }] }).ok).toBe(false);
  });

  it("rejects headings missing a level", () => {
    expect(validateRichDocument({ type: "doc", content: [{ type: "heading", attrs: {}, content: [] }] }).ok).toBe(false);
  });

  it("rejects unknown attributes on paragraphs and headings", () => {
    expect(validateRichDocument({ type: "doc", content: [{ type: "paragraph", attrs: { foo: 1 }, content: [] }] }).ok).toBe(false);
    expect(validateRichDocument({ type: "doc", content: [{ type: "heading", attrs: { level: 1, foo: 1 }, content: [] }] }).ok).toBe(false);
  });

  it("rejects invalid text alignment values", () => {
    expect(validateRichDocument({ type: "doc", content: [{ type: "paragraph", attrs: { textAlign: "middle" }, content: [] }] }).ok).toBe(false);
  });

  it("rejects attrs/content of the wrong shape", () => {
    expect(validateRichDocument({ type: "doc", content: [{ type: "paragraph", attrs: "x" }] }).ok).toBe(false);
    expect(validateRichDocument({ type: "doc", content: "not-array" }).ok).toBe(false);
  });

  it("rejects excessively deep nesting", () => {
    let node: unknown = paragraph(text("x"));
    for (let i = 0; i < 8; i++) {
      node = { type: "bulletList", content: [{ type: "listItem", content: [node] }] };
    }
    const doc = { type: "doc", content: [node] };
    expect(validateRichDocument(doc).ok).toBe(false);
  });
});

describe("derivePlainText", () => {
  it("derives text from a single paragraph", () => {
    const doc = validateDoc({ type: "doc", content: [paragraph("Hello")] });
    expect(derivePlainText(doc)).toBe("Hello");
  });

  it("joins multiple paragraphs with newlines", () => {
    const doc = validateDoc({ type: "doc", content: [paragraph("Hello"), paragraph("World")] });
    expect(derivePlainText(doc)).toBe("Hello\nWorld");
  });

  it("renders hardBreaks as newlines within a paragraph", () => {
    const doc = validateDoc({ type: "doc", content: [paragraph(text("a"), { type: "hardBreak" }, text("b"))] });
    expect(derivePlainText(doc)).toBe("a\nb");
  });

  it("derives text from headings", () => {
    const doc = validateDoc({ type: "doc", content: [{ type: "heading", attrs: { level: 1 }, content: [text("Title")] }] });
    expect(derivePlainText(doc)).toBe("Title");
  });

  it("derives text from list items across bullet and ordered lists", () => {
    const listItem = (value: string): unknown => ({ type: "listItem", content: [paragraph(value)] });
    const doc = validateDoc({
      type: "doc",
      content: [
        { type: "bulletList", content: [listItem("a"), listItem("b")] },
        { type: "orderedList", content: [listItem("c")] },
      ],
    });
    expect(derivePlainText(doc)).toBe("a\nb\nc");
  });

  it("includes image alt text as a plain-text fallback", () => {
    const doc = validateDoc({ type: "doc", content: [image({ alt: "a cat" })] });
    expect(derivePlainText(doc)).toBe("a cat");
  });

  it("omits nothing for images with empty alt text", () => {
    const doc = validateDoc({ type: "doc", content: [image({ alt: "" })] });
    expect(derivePlainText(doc)).toBe("");
  });

  it("combines paragraphs and image alt text on separate lines", () => {
    const doc = validateDoc({ type: "doc", content: [paragraph("Question"), image({ alt: "cat" })] });
    expect(derivePlainText(doc)).toBe("Question\ncat");
  });

  it("ignores marks when deriving plain text", () => {
    const doc = validateDoc({
      type: "doc",
      content: [paragraph({ type: "text", text: "bold", marks: [{ type: "bold" }] })],
    });
    expect(derivePlainText(doc)).toBe("bold");
  });

  it("trims surrounding whitespace", () => {
    const doc = validateDoc({ type: "doc", content: [paragraph("   spaced   ")] });
    expect(derivePlainText(doc)).toBe("spaced");
  });

  it("returns an empty string for an empty document", () => {
    const doc = validateDoc({ type: "doc", content: [] });
    expect(derivePlainText(doc)).toBe("");
  });

  it("is deterministic for nested lists", () => {
    const inner = { type: "bulletList", content: [{ type: "listItem", content: [paragraph("nested")] }] };
    const doc = validateDoc({
      type: "doc",
      content: [{ type: "bulletList", content: [{ type: "listItem", content: [paragraph("outer"), inner] }] }],
    });
    expect(derivePlainText(doc)).toBe("outer\nnested");
    expect(derivePlainText(doc)).toBe(derivePlainText(doc));
  });
});

function validateDoc(value: unknown): RichDocument {
  const result = validateRichDocument(value);
  if (!result.ok) {
    throw new Error(`expected valid document but got: ${result.error}`);
  }
  return result.doc;
}
