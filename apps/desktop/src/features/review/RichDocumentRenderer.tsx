import type { ReactNode } from "react";

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
}

export function RichDocumentRenderer({
  document,
  resolveMedia,
}: RichDocumentRendererProps) {
  return (
    <div className="rich-document">
      {document.content.map((block, index) => (
        <Block key={index} node={block} resolveMedia={resolveMedia} />
      ))}
    </div>
  );
}

function Block({
  node,
  resolveMedia,
}: {
  node: RichBlock | ListItemNode;
  resolveMedia: (mediaId: string) => string;
}) {
  switch (node.type) {
    case "paragraph":
      return <Paragraph node={node} />;
    case "heading":
      return <Heading node={node} />;
    case "bulletList":
      return <List node={node} resolveMedia={resolveMedia} />;
    case "orderedList":
      return <List node={node} resolveMedia={resolveMedia} />;
    case "listItem":
      return <ListItem node={node} resolveMedia={resolveMedia} />;
    case "image":
      return <Image node={node} resolveMedia={resolveMedia} />;
  }
}

function Paragraph({ node }: { node: ParagraphNode }) {
  return <p>{renderInlines(node.content)}</p>;
}

function Heading({ node }: { node: HeadingNode }) {
  const Tag = headingTag(node.attrs.level);
  return <Tag>{renderInlines(node.content)}</Tag>;
}

function headingTag(level: 1 | 2 | 3) {
  if (level === 1) return "h1" as const;
  if (level === 2) return "h2" as const;
  return "h3" as const;
}

function List({
  node,
  resolveMedia,
}: {
  node: BulletListNode | OrderedListNode;
  resolveMedia: (mediaId: string) => string;
}) {
  const Tag = node.type === "bulletList" ? "ul" : "ol";
  return (
    <Tag>
      {node.content.map((item, index) => (
        <ListItem key={index} node={item} resolveMedia={resolveMedia} />
      ))}
    </Tag>
  );
}

function ListItem({
  node,
  resolveMedia,
}: {
  node: ListItemNode;
  resolveMedia: (mediaId: string) => string;
}) {
  return (
    <li>
      {node.content.map((block, index) => (
        <Block key={index} node={block} resolveMedia={resolveMedia} />
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

function renderInlines(nodes: RichInline[]): ReactNode {
  return nodes.map((node, index) => {
    if (node.type === "hardBreak") {
      return <br key={index} />;
    }
    return <Text key={index} node={node} />;
  });
}

function Text({ node }: { node: TextNode }) {
  let content: ReactNode = node.text;
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
