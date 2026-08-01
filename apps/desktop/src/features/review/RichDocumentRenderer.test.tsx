import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import {
  validateRichDocument,
  type RichDocument,
} from "../../domain/richDocument";
import { RichDocumentRenderer } from "./RichDocumentRenderer";

const resolveMedia = (mediaId: string) => `/assets/${mediaId}.png`;

function renderDoc(value: unknown): RichDocument {
  const result = validateRichDocument(value);
  if (!result.ok) {
    throw new Error(`expected valid document but got: ${result.error}`);
  }
  return result.doc;
}

const text = (value: string, marks?: unknown): unknown => ({
  type: "text",
  text: value,
  ...(marks ? { marks } : {}),
});

test("renders paragraphs as <p>", () => {
  const doc = renderDoc({
    type: "doc",
    content: [{ type: "paragraph", content: [text("Hello")] }],
  });
  render(<RichDocumentRenderer document={doc} resolveMedia={resolveMedia} />);
  const p = screen.getByText("Hello");
  expect(p.tagName).toBe("P");
});

test("renders headings as h1/h2/h3 by level", () => {
  const doc = renderDoc({
    type: "doc",
    content: [
      { type: "heading", attrs: { level: 1 }, content: [text("One")] },
      { type: "heading", attrs: { level: 2 }, content: [text("Two")] },
      { type: "heading", attrs: { level: 3 }, content: [text("Three")] },
    ],
  });
  render(<RichDocumentRenderer document={doc} resolveMedia={resolveMedia} />);
  expect(screen.getByText("One").tagName).toBe("H1");
  expect(screen.getByText("Two").tagName).toBe("H2");
  expect(screen.getByText("Three").tagName).toBe("H3");
});

test("maps simple marks to strong/em/s/u elements", () => {
  const doc = renderDoc({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          text("b", [{ type: "bold" }]),
          text("i", [{ type: "italic" }]),
          text("s", [{ type: "strike" }]),
          text("u", [{ type: "underline" }]),
        ],
      },
    ],
  });
  render(<RichDocumentRenderer document={doc} resolveMedia={resolveMedia} />);
  expect(screen.getByText("b").tagName).toBe("STRONG");
  expect(screen.getByText("i").tagName).toBe("EM");
  expect(screen.getByText("s").tagName).toBe("S");
  expect(screen.getByText("u").tagName).toBe("U");
});

test("maps textStyle color to a span style and highlight to a mark background", () => {
  const doc = renderDoc({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          text("red", [{ type: "textStyle", attrs: { color: "#ff0000" } }]),
          text("hl", [{ type: "highlight", attrs: { color: "#ffff00" } }]),
        ],
      },
    ],
  });
  render(<RichDocumentRenderer document={doc} resolveMedia={resolveMedia} />);
  const red = screen.getByText("red");
  expect(red.tagName).toBe("SPAN");
  expect(red).toHaveStyle({ color: "#ff0000" });
  const hl = screen.getByText("hl");
  expect(hl.tagName).toBe("MARK");
  expect(hl).toHaveStyle({ backgroundColor: "#ffff00" });
});

test("renders bullet and ordered lists as ul/ol with li items", () => {
  const doc = renderDoc({
    type: "doc",
    content: [
      {
        type: "bulletList",
        content: [
          { type: "listItem", content: [{ type: "paragraph", content: [text("alpha")] }] },
          { type: "listItem", content: [{ type: "paragraph", content: [text("beta")] }] },
        ],
      },
      {
        type: "orderedList",
        content: [
          { type: "listItem", content: [{ type: "paragraph", content: [text("one")] }] },
        ],
      },
    ],
  });
  const { container } = render(<RichDocumentRenderer document={doc} resolveMedia={resolveMedia} />);
  const lists = container.querySelectorAll("ul, ol");
  expect(lists).toHaveLength(2);
  expect(lists[0]!.tagName).toBe("UL");
  expect(lists[1]!.tagName).toBe("OL");
  expect(container.querySelectorAll("li")).toHaveLength(3);
  expect(screen.getByText("alpha")).toBeInTheDocument();
  expect(screen.getByText("one")).toBeInTheDocument();
});

test("renders hardBreak as a <br>", () => {
  const doc = renderDoc({
    type: "doc",
    content: [
      { type: "paragraph", content: [text("a"), { type: "hardBreak" }, text("b")] },
    ],
  });
  const { container } = render(<RichDocumentRenderer document={doc} resolveMedia={resolveMedia} />);
  expect(container.querySelector("br")).not.toBeNull();
});

test("renders images through resolveMedia with alt and widthPercent width", () => {
  const doc = renderDoc({
    type: "doc",
    content: [
      {
        type: "image",
        attrs: { mediaId: "media-1", alt: "a cat", widthPercent: 50 },
      },
    ],
  });
  const { container } = render(<RichDocumentRenderer document={doc} resolveMedia={resolveMedia} />);
  const img = container.querySelector("img");
  expect(img).not.toBeNull();
  expect(img!.getAttribute("src")).toBe("/assets/media-1.png");
  expect(img!.getAttribute("alt")).toBe("a cat");
  expect(img).toHaveStyle({ width: "50%" });
});

test("does not interpret text as HTML", () => {
  const doc = renderDoc({
    type: "doc",
    content: [{ type: "paragraph", content: [text("<script>alert('x')</script>")] }],
  });
  const { container } = render(<RichDocumentRenderer document={doc} resolveMedia={resolveMedia} />);
  const script = container.querySelector("script");
  expect(script).toBeNull();
  expect(container.querySelector("p")!.textContent).toBe("<script>alert('x')</script>");
});

test("renders multi-block list items", () => {
  const doc = renderDoc({
    type: "doc",
    content: [
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [
              { type: "paragraph", content: [text("first")] },
              { type: "paragraph", content: [text("second")] },
            ],
          },
        ],
      },
    ],
  });
  render(<RichDocumentRenderer document={doc} resolveMedia={resolveMedia} />);
  expect(screen.getByText("first")).toBeInTheDocument();
  expect(screen.getByText("second")).toBeInTheDocument();
});
