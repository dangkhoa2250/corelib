import type { ReactNode } from "react";
import { ClickableFrontText } from "./ClickableFrontText";

import type {
  BulletListNode,
  HeadingNode,
  ImageNode,
  ListItemNode,
  OrderedListNode,
  ParagraphNode,
  RichBlock,
  RichDocument,
  RichInline,
  RichTextMark,
  TextNode,
} from "../../domain/richDocument";

/**
 * Renders a validated rich flashcard document to React elements only.
 *
 * The node/mark mapping is a fixed allowlist (paragraph, heading, text marks,
 * bullet/ordered lists, listItem, hardBreak, image). It never uses
 * `dangerouslySetInnerHTML`, never emits arbitrary HTML, and never builds an
 * arbitrary image `src` — images are resolved through the `resolveMedia` prop
 * keyed by `mediaId`.
 */
export interface RichDocumentRendererProps {
  document: RichDocument;
  resolveMedia: (mediaId: string) => string;
  onWordSelect?: (word: string) => void;
  selectedWord?: string | null;
  frontLanguage?: string | null;
}

export function RichDocumentRenderer({
  document,
  resolveMedia,
  onWordSelect,
  selectedWord,
  frontLanguage,
}: RichDocumentRendererProps) {
  return (
    <div className="rich-document">
      {document.content.map((block, index) => (
        <Block
          key={index}
          node={block}
          resolveMedia={resolveMedia}
          onWordSelect={onWordSelect}
          selectedWord={selectedWord}
          frontLanguage={frontLanguage}
        />
      ))}
    </div>
  );
}

function Block({
  node,
  resolveMedia,
  onWordSelect,
  selectedWord,
  frontLanguage,
}: {
  node: RichBlock | ListItemNode;
  resolveMedia: (mediaId: string) => string;
  onWordSelect?: (word: string) => void;
  selectedWord?: string | null;
  frontLanguage?: string | null;
}) {
  switch (node.type) {
    case "paragraph":
      return <Paragraph node={node} onWordSelect={onWordSelect} selectedWord={selectedWord} frontLanguage={frontLanguage} />;
    case "heading":
      return <Heading node={node} onWordSelect={onWordSelect} selectedWord={selectedWord} frontLanguage={frontLanguage} />;
    case "bulletList":
      return <List node={node} resolveMedia={resolveMedia} onWordSelect={onWordSelect} selectedWord={selectedWord} frontLanguage={frontLanguage} />;
    case "orderedList":
      return <List node={node} resolveMedia={resolveMedia} onWordSelect={onWordSelect} selectedWord={selectedWord} frontLanguage={frontLanguage} />;
    case "listItem":
      return <ListItem node={node} resolveMedia={resolveMedia} onWordSelect={onWordSelect} selectedWord={selectedWord} frontLanguage={frontLanguage} />;
    case "image":
      return <Image node={node} resolveMedia={resolveMedia} />;
  }
}

function Paragraph({
  node,
  onWordSelect,
  selectedWord,
  frontLanguage,
}: {
  node: ParagraphNode;
  onWordSelect?: (word: string) => void;
  selectedWord?: string | null;
  frontLanguage?: string | null;
}) {
  return <p>{renderInlines(node.content, onWordSelect, selectedWord, frontLanguage)}</p>;
}

function Heading({
  node,
  onWordSelect,
  selectedWord,
  frontLanguage,
}: {
  node: HeadingNode;
  onWordSelect?: (word: string) => void;
  selectedWord?: string | null;
  frontLanguage?: string | null;
}) {
  const Tag = headingTag(node.attrs.level);
  return <Tag>{renderInlines(node.content, onWordSelect, selectedWord, frontLanguage)}</Tag>;
}

function headingTag(level: 1 | 2 | 3) {
  if (level === 1) return "h1" as const;
  if (level === 2) return "h2" as const;
  return "h3" as const;
}

function List({
  node,
  resolveMedia,
  onWordSelect,
  selectedWord,
  frontLanguage,
}: {
  node: BulletListNode | OrderedListNode;
  resolveMedia: (mediaId: string) => string;
  onWordSelect?: (word: string) => void;
  selectedWord?: string | null;
  frontLanguage?: string | null;
}) {
  const Tag = node.type === "bulletList" ? "ul" : "ol";
  return (
    <Tag>
      {node.content.map((item, index) => (
        <ListItem
          key={index}
          node={item}
          resolveMedia={resolveMedia}
          onWordSelect={onWordSelect}
          selectedWord={selectedWord}
          frontLanguage={frontLanguage}
        />
      ))}
    </Tag>
  );
}

function ListItem({
  node,
  resolveMedia,
  onWordSelect,
  selectedWord,
  frontLanguage,
}: {
  node: ListItemNode;
  resolveMedia: (mediaId: string) => string;
  onWordSelect?: (word: string) => void;
  selectedWord?: string | null;
  frontLanguage?: string | null;
}) {
  return (
    <li>
      {node.content.map((block, index) => (
        <Block
          key={index}
          node={block}
          resolveMedia={resolveMedia}
          onWordSelect={onWordSelect}
          selectedWord={selectedWord}
          frontLanguage={frontLanguage}
        />
      ))}
    </li>
  );
}

function Image({
  node,
  resolveMedia,
}: {
  node: ImageNode;
  resolveMedia: (mediaId: string) => string;
}) {
  const src = resolveMedia(node.attrs.mediaId);
  return (
    <img
      src={src || undefined}
      alt={node.attrs.alt}
      style={{ width: `${node.attrs.widthPercent}%` }}
    />
  );
}

function renderInlines(
  nodes: RichInline[],
  onWordSelect?: (word: string) => void,
  selectedWord?: string | null,
  frontLanguage?: string | null,
): ReactNode {
  return nodes.map((node, index) => {
    if (node.type === "hardBreak") {
      return <br key={index} />;
    }
    return (
      <Text
        key={index}
        node={node}
        onWordSelect={onWordSelect}
        selectedWord={selectedWord}
        frontLanguage={frontLanguage}
      />
    );
  });
}

function Text({
  node,
  onWordSelect,
  selectedWord,
  frontLanguage,
}: {
  node: TextNode;
  onWordSelect?: (word: string) => void;
  selectedWord?: string | null;
  frontLanguage?: string | null;
}) {
  let content: ReactNode = onWordSelect ? (
    <ClickableFrontText
      text={node.text}
      frontLanguage={frontLanguage ?? null}
      selectedWord={selectedWord ?? null}
      onWordSelect={onWordSelect}
    />
  ) : (
    node.text
  );
  if (node.marks) {
    for (const mark of [...node.marks].reverse()) {
      content = <Mark mark={mark}>{content}</Mark>;
    }
  }
  return <>{content}</>;
}

function Mark({ mark, children }: { mark: RichTextMark; children: ReactNode }) {
  switch (mark.type) {
    case "bold":
      return <strong>{children}</strong>;
    case "italic":
      return <em>{children}</em>;
    case "strike":
      return <s>{children}</s>;
    case "underline":
      return <u>{children}</u>;
    case "textStyle":
      return mark.attrs?.color ? (
        <span style={{ color: mark.attrs.color }}>{children}</span>
      ) : (
        <span>{children}</span>
      );
    case "highlight":
      return mark.attrs?.color ? (
        <mark style={{ backgroundColor: mark.attrs.color }}>{children}</mark>
      ) : (
        <mark>{children}</mark>
      );
  }
}
