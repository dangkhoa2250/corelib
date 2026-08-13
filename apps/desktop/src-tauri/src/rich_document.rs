use serde_json::{json, Map, Value};

/// Maximum nesting depth allowed in a rich document.
pub const MAX_DOCUMENT_DEPTH: usize = 10;
/// Maximum number of nodes (excluding the document root) allowed in a document.
pub const MAX_DOCUMENT_NODES: usize = 2000;
/// Maximum number of image nodes allowed on a single card face.
pub const MAX_IMAGES_PER_FACE: usize = 10;

const MIN_WIDTH_PERCENT: f64 = 10.0;
const MAX_WIDTH_PERCENT: f64 = 100.0;

const BLOCK_TYPES: &[&str] = &["paragraph", "heading", "bulletList", "orderedList", "image"];
const INLINE_TYPES: &[&str] = &["text", "hardBreak"];
const TEXT_ALIGNMENTS: &[&str] = &["left", "center", "right", "justify"];
const HEADING_LEVELS: &[u64] = &[1, 2, 3];

/// Structured validation failure for a rich flashcard document.
///
/// Variants carry the JSON path of the offending node (for example
/// `doc.content[2].content[0]`) so callers can surface precise feedback.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RichDocumentError {
    /// The document root was malformed.
    InvalidRoot { reason: String },
    /// A node failed validation at a specific path.
    InvalidNode { path: String, reason: String },
    /// The document exceeded the maximum nesting depth.
    DepthExceeded { path: String, max_depth: usize },
    /// The document exceeded the total node budget.
    NodeCountExceeded { max_nodes: usize },
    /// The document exceeded the per-face image budget.
    ImageCountExceeded { max_images: usize },
}

impl std::fmt::Display for RichDocumentError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidRoot { reason } => formatter.write_str(reason),
            Self::InvalidNode { path, reason } => write!(formatter, "{reason} at {path}"),
            Self::DepthExceeded { path, max_depth } => {
                write!(
                    formatter,
                    "document exceeds maximum depth of {max_depth} at {path}"
                )
            }
            Self::NodeCountExceeded { max_nodes } => {
                write!(formatter, "document exceeds {max_nodes} nodes")
            }
            Self::ImageCountExceeded { max_images } => {
                write!(
                    formatter,
                    "document must not contain more than {max_images} images"
                )
            }
        }
    }
}

impl std::error::Error for RichDocumentError {}

/// Validates and canonicalizes a rich flashcard document.
///
/// Mirrors the TypeScript contract in `apps/desktop/src/domain/richDocument.ts`:
/// the validator rejects unknown node and mark types, disallowed attributes,
/// malformed text, image shapes other than `{mediaId, alt, widthPercent}`,
/// out-of-range widths, excessive depth or size, and returns a normalized copy
/// that strips unrecognized keys.
pub fn validate_document(value: &Value) -> Result<Value, RichDocumentError> {
    let mut validator = Validator {
        nodes: 0,
        images: 0,
    };
    validator.validate_doc(value, "doc")
}

/// Derives deterministic plain text from a rich document.
///
/// Text leaves are joined with paragraph, heading, list-item, and hard-break
/// boundaries so the result stays compatible with the legacy `front`/`back`
/// columns used for full-text search, translation, and YouGlish lookups. Image
/// nodes contribute their alt text (or a `[image]` placeholder) on their own
/// line.
pub fn plain_text(value: &Value) -> String {
    let rendered = node_to_text(value);
    collapse_blank_lines(&rendered).trim().to_string()
}

fn invalid_node(path: &str, reason: impl Into<String>) -> RichDocumentError {
    RichDocumentError::InvalidNode {
        path: path.to_string(),
        reason: reason.into(),
    }
}

#[derive(Debug, Default)]
struct Validator {
    nodes: usize,
    images: usize,
}

#[derive(Clone, Copy)]
enum Allow {
    Block,
    Inline,
    ListItem,
}

impl Allow {
    fn permits(self, node_type: &str) -> bool {
        match self {
            Allow::Block => BLOCK_TYPES.contains(&node_type),
            Allow::Inline => INLINE_TYPES.contains(&node_type),
            Allow::ListItem => node_type == "listItem",
        }
    }
}

impl Validator {
    fn validate_doc(&mut self, value: &Value, path: &str) -> Result<Value, RichDocumentError> {
        let object = match value.as_object() {
            Some(object) => object,
            None => {
                return Err(RichDocumentError::InvalidRoot {
                    reason: "document must be an object".to_string(),
                })
            }
        };
        if object.get("type").and_then(Value::as_str) != Some("doc") {
            return Err(RichDocumentError::InvalidRoot {
                reason: "document root must be type 'doc'".to_string(),
            });
        }
        forbid_attrs(object.get("attrs"), "doc", path)?;
        let content = self.validate_children(object.get("content"), 1, path, Allow::Block)?;
        Ok(json!({ "type": "doc", "content": content }))
    }

    fn validate_children(
        &mut self,
        content: Option<&Value>,
        parent_depth: usize,
        parent_path: &str,
        allow: Allow,
    ) -> Result<Vec<Value>, RichDocumentError> {
        match content {
            None => Ok(Vec::new()),
            Some(Value::Array(items)) => {
                let mut validated = Vec::with_capacity(items.len());
                for (index, child) in items.iter().enumerate() {
                    let child_path = format!("{parent_path}.content[{index}]");
                    let node = self.validate_node(child, parent_depth + 1, &child_path)?;
                    let node_type = node.get("type").and_then(Value::as_str).unwrap_or("");
                    if !allow.permits(node_type) {
                        return Err(invalid_node(
                            &child_path,
                            format!("node '{node_type}' is not allowed here"),
                        ));
                    }
                    validated.push(node);
                }
                Ok(validated)
            }
            Some(_) => Err(invalid_node(
                format!("{parent_path}.content").as_str(),
                "content must be an array",
            )),
        }
    }

    fn validate_node(
        &mut self,
        node: &Value,
        depth: usize,
        path: &str,
    ) -> Result<Value, RichDocumentError> {
        self.nodes += 1;
        if self.nodes > MAX_DOCUMENT_NODES {
            return Err(RichDocumentError::NodeCountExceeded {
                max_nodes: MAX_DOCUMENT_NODES,
            });
        }
        if depth > MAX_DOCUMENT_DEPTH {
            return Err(RichDocumentError::DepthExceeded {
                path: path.to_string(),
                max_depth: MAX_DOCUMENT_DEPTH,
            });
        }
        let object = match node.as_object() {
            Some(object) => object,
            None => return Err(invalid_node(path, "node must be an object")),
        };
        let node_type = match object.get("type").and_then(Value::as_str) {
            Some(node_type) => node_type,
            None => return Err(invalid_node(path, "node is missing its type")),
        };
        if node_type != "text" && object.contains_key("marks") {
            return Err(invalid_node(path, "marks are only allowed on text nodes"));
        }
        match node_type {
            "doc" => self.validate_doc(node, path),
            "paragraph" => self.validate_paragraph(object, depth, path),
            "heading" => self.validate_heading(object, depth, path),
            "text" => validate_text(object, path),
            "bulletList" | "orderedList" => self.validate_list(node_type, object, depth, path),
            "listItem" => self.validate_list_item(object, depth, path),
            "hardBreak" => validate_hard_break(object, path),
            "image" => self.validate_image(object, path),
            other => Err(invalid_node(path, format!("unknown node type '{other}'"))),
        }
    }

    fn validate_paragraph(
        &mut self,
        node: &Map<String, Value>,
        depth: usize,
        path: &str,
    ) -> Result<Value, RichDocumentError> {
        let text_align = validate_text_align_attrs(node.get("attrs"), "paragraph", path)?;
        let content = self.validate_children(node.get("content"), depth, path, Allow::Inline)?;
        let mut paragraph = Map::new();
        paragraph.insert("type".into(), Value::String("paragraph".to_string()));
        if let Some(align) = text_align {
            let mut attrs = Map::new();
            attrs.insert("textAlign".into(), Value::String(align));
            paragraph.insert("attrs".into(), Value::Object(attrs));
        }
        paragraph.insert("content".into(), Value::Array(content));
        Ok(Value::Object(paragraph))
    }

    fn validate_heading(
        &mut self,
        node: &Map<String, Value>,
        depth: usize,
        path: &str,
    ) -> Result<Value, RichDocumentError> {
        let attrs = match node.get("attrs") {
            Some(Value::Object(map)) => map,
            _ => return Err(invalid_node(path, "heading requires an attrs object")),
        };
        for key in attrs.keys() {
            if key != "level" && key != "textAlign" {
                return Err(invalid_node(
                    path,
                    "heading only allows level and textAlign attributes",
                ));
            }
        }
        let level = match attrs.get("level").and_then(Value::as_i64) {
            Some(level) if HEADING_LEVELS.contains(&(level as u64)) => level,
            _ => return Err(invalid_node(path, "heading level must be 1, 2, or 3")),
        };
        let mut heading_attrs = Map::new();
        heading_attrs.insert("level".into(), json!(level));
        if let Some(align_value) = attrs.get("textAlign") {
            match align_value.as_str() {
                Some(align) if TEXT_ALIGNMENTS.contains(&align) => {
                    heading_attrs.insert("textAlign".into(), Value::String(align.to_string()));
                }
                _ => return Err(invalid_node(path, "invalid textAlign value")),
            }
        }
        let content = self.validate_children(node.get("content"), depth, path, Allow::Inline)?;
        let mut heading = Map::new();
        heading.insert("type".into(), Value::String("heading".to_string()));
        heading.insert("attrs".into(), Value::Object(heading_attrs));
        heading.insert("content".into(), Value::Array(content));
        Ok(Value::Object(heading))
    }

    fn validate_list(
        &mut self,
        node_type: &str,
        node: &Map<String, Value>,
        depth: usize,
        path: &str,
    ) -> Result<Value, RichDocumentError> {
        forbid_attrs(node.get("attrs"), node_type, path)?;
        let content = self.validate_children(node.get("content"), depth, path, Allow::ListItem)?;
        Ok(json!({ "type": node_type, "content": content }))
    }

    fn validate_list_item(
        &mut self,
        node: &Map<String, Value>,
        depth: usize,
        path: &str,
    ) -> Result<Value, RichDocumentError> {
        forbid_attrs(node.get("attrs"), "listItem", path)?;
        let content = self.validate_children(node.get("content"), depth, path, Allow::Block)?;
        Ok(json!({ "type": "listItem", "content": content }))
    }

    fn validate_image(
        &mut self,
        node: &Map<String, Value>,
        path: &str,
    ) -> Result<Value, RichDocumentError> {
        self.images += 1;
        if self.images > MAX_IMAGES_PER_FACE {
            return Err(RichDocumentError::ImageCountExceeded {
                max_images: MAX_IMAGES_PER_FACE,
            });
        }
        if node.contains_key("content") {
            return Err(invalid_node(path, "image node must not carry content"));
        }
        let attrs = match node.get("attrs") {
            Some(Value::Object(map)) => map,
            _ => return Err(invalid_node(path, "image attrs must be an object")),
        };
        let has_keys = attrs.contains_key("mediaId")
            && attrs.contains_key("alt")
            && attrs.contains_key("widthPercent");
        if attrs.len() != 3 || !has_keys {
            return Err(invalid_node(
                path,
                "image attrs must be exactly mediaId, alt, and widthPercent",
            ));
        }
        let media_id = match attrs.get("mediaId").and_then(Value::as_str) {
            Some(media_id) if !media_id.is_empty() => media_id,
            _ => {
                return Err(invalid_node(
                    path,
                    "image mediaId must be a non-empty string",
                ))
            }
        };
        let alt = match attrs.get("alt").and_then(Value::as_str) {
            Some(alt) => alt,
            None => return Err(invalid_node(path, "image alt must be a string")),
        };
        let width_reason = format!(
            "image widthPercent must be a number between {MIN_WIDTH_PERCENT} and {MAX_WIDTH_PERCENT}"
        );
        let width_number = match attrs.get("widthPercent").and_then(Value::as_number) {
            Some(width_number) => width_number,
            None => return Err(invalid_node(path, width_reason)),
        };
        let width_in_range = width_number
            .as_f64()
            .map(|width| {
                width.is_finite() && (MIN_WIDTH_PERCENT..=MAX_WIDTH_PERCENT).contains(&width)
            })
            .unwrap_or(false);
        if !width_in_range {
            return Err(invalid_node(path, width_reason));
        }
        Ok(json!({
            "type": "image",
            "attrs": {
                "mediaId": media_id,
                "alt": alt,
                "widthPercent": width_number.clone(),
            }
        }))
    }
}

fn forbid_attrs(attrs: Option<&Value>, name: &str, path: &str) -> Result<(), RichDocumentError> {
    match attrs {
        None => Ok(()),
        Some(Value::Object(map)) if map.is_empty() => Ok(()),
        _ => Err(invalid_node(
            path,
            format!("{name} must not carry attributes"),
        )),
    }
}

fn validate_text_align_attrs(
    attrs: Option<&Value>,
    name: &str,
    path: &str,
) -> Result<Option<String>, RichDocumentError> {
    match attrs {
        None => Ok(None),
        Some(Value::Object(map)) => {
            if map.is_empty() {
                return Ok(None);
            }
            if map.len() > 1 || !map.contains_key("textAlign") {
                return Err(invalid_node(
                    path,
                    format!("{name} only allows a textAlign attribute"),
                ));
            }
            match map.get("textAlign").and_then(Value::as_str) {
                Some(align) if TEXT_ALIGNMENTS.contains(&align) => Ok(Some(align.to_string())),
                _ => Err(invalid_node(path, "invalid textAlign value")),
            }
        }
        Some(_) => Err(invalid_node(
            path,
            format!("{name} attrs must be an object"),
        )),
    }
}

fn validate_text(node: &Map<String, Value>, path: &str) -> Result<Value, RichDocumentError> {
    let text_value = match node.get("text") {
        Some(Value::String(text)) => text.clone(),
        _ => {
            return Err(invalid_node(
                path,
                "text node requires a string 'text' property",
            ))
        }
    };
    if node.contains_key("content") {
        return Err(invalid_node(path, "text node must not carry content"));
    }
    let marks = validate_marks(node.get("marks"), path)?;
    let mut text_node = Map::new();
    text_node.insert("type".into(), Value::String("text".to_string()));
    text_node.insert("text".into(), Value::String(text_value));
    if let Some(marks) = marks {
        text_node.insert("marks".into(), Value::Array(marks));
    }
    Ok(Value::Object(text_node))
}

fn validate_marks(
    marks: Option<&Value>,
    path: &str,
) -> Result<Option<Vec<Value>>, RichDocumentError> {
    match marks {
        None => Ok(None),
        Some(Value::Array(items)) => {
            let mut validated = Vec::with_capacity(items.len());
            for (index, mark) in items.iter().enumerate() {
                let mark_path = format!("{path}.marks[{index}]");
                validated.push(validate_mark(mark, &mark_path)?);
            }
            Ok(Some(validated))
        }
        Some(_) => Err(invalid_node(path, "marks must be an array")),
    }
}

fn validate_mark(mark: &Value, path: &str) -> Result<Value, RichDocumentError> {
    let map = match mark.as_object() {
        Some(map) => map,
        None => return Err(invalid_node(path, "mark must be an object")),
    };
    let mark_type = match map.get("type").and_then(Value::as_str) {
        Some(mark_type) => mark_type,
        None => return Err(invalid_node(path, "mark is missing its type")),
    };
    match mark_type {
        "bold" | "italic" | "strike" | "underline" => {
            if map.contains_key("attrs") {
                return Err(invalid_node(
                    path,
                    format!("mark '{mark_type}' must not carry attributes"),
                ));
            }
            Ok(json!({ "type": mark_type }))
        }
        "textStyle" | "highlight" => validate_color_mark(map, mark_type, path),
        other => Err(invalid_node(path, format!("unknown mark type '{other}'"))),
    }
}

fn validate_color_mark(
    map: &Map<String, Value>,
    mark_type: &str,
    path: &str,
) -> Result<Value, RichDocumentError> {
    let attrs = match map.get("attrs") {
        None => return Ok(json!({ "type": mark_type })),
        Some(Value::Object(attrs)) => attrs,
        Some(_) => {
            return Err(invalid_node(
                path,
                format!("mark '{mark_type}' attrs must be an object"),
            ))
        }
    };
    if attrs.is_empty() {
        return Ok(json!({ "type": mark_type }));
    }
    if attrs.len() > 1 || !attrs.contains_key("color") {
        return Err(invalid_node(
            path,
            format!("mark '{mark_type}' only allows a color attribute"),
        ));
    }
    match attrs.get("color").and_then(Value::as_str) {
        Some(color) => Ok(json!({ "type": mark_type, "attrs": { "color": color } })),
        None => Err(invalid_node(
            path,
            format!("mark '{mark_type}' color must be a string"),
        )),
    }
}

fn validate_hard_break(node: &Map<String, Value>, path: &str) -> Result<Value, RichDocumentError> {
    forbid_attrs(node.get("attrs"), "hardBreak", path)?;
    if node.contains_key("content") {
        return Err(invalid_node(path, "hardBreak must not carry content"));
    }
    Ok(json!({ "type": "hardBreak" }))
}

fn node_to_text(node: &Value) -> String {
    let node_type = node.get("type").and_then(Value::as_str).unwrap_or("");
    match node_type {
        "doc" => node
            .get("content")
            .and_then(Value::as_array)
            .map(|items| {
                items
                    .iter()
                    .map(node_to_text)
                    .collect::<Vec<String>>()
                    .join("\n")
            })
            .unwrap_or_default(),
        "paragraph" | "heading" => inline_to_text(node.get("content")),
        "bulletList" => list_to_text(node, false),
        "orderedList" => list_to_text(node, true),
        "listItem" => blocks_to_text(node.get("content")),
        "image" => image_alt(node),
        "hardBreak" => "\n".to_string(),
        "text" => node
            .get("text")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string(),
        _ => String::new(),
    }
}

fn inline_to_text(content: Option<&Value>) -> String {
    let mut out = String::new();
    if let Some(Value::Array(items)) = content {
        for child in items {
            match child.get("type").and_then(Value::as_str) {
                Some("text") => {
                    out.push_str(child.get("text").and_then(Value::as_str).unwrap_or(""))
                }
                Some("hardBreak") => out.push('\n'),
                _ => {}
            }
        }
    }
    out
}

fn blocks_to_text(content: Option<&Value>) -> String {
    match content {
        Some(Value::Array(items)) => items
            .iter()
            .map(node_to_text)
            .collect::<Vec<String>>()
            .join("\n"),
        _ => String::new(),
    }
}

fn list_to_text(node: &Value, ordered: bool) -> String {
    let items = match node.get("content").and_then(Value::as_array) {
        Some(items) => items,
        None => return String::new(),
    };
    items
        .iter()
        .enumerate()
        .map(|(index, item)| {
            let prefix = if ordered {
                format!("{}. ", index + 1)
            } else {
                "• ".to_string()
            };
            let body = blocks_to_text(item.get("content"));
            format!("{prefix}{body}")
        })
        .collect::<Vec<String>>()
        .join("\n")
}

fn image_alt(node: &Value) -> String {
    let alt = node
        .get("attrs")
        .and_then(|attrs| attrs.get("alt"))
        .and_then(Value::as_str)
        .unwrap_or("");
    if alt.is_empty() {
        "[image]".to_string()
    } else {
        alt.to_string()
    }
}

fn collapse_blank_lines(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    let mut newline_run = 0usize;
    for ch in value.chars() {
        if ch == '\n' {
            newline_run += 1;
            if newline_run == 1 {
                out.push('\n');
            }
        } else {
            newline_run = 0;
            out.push(ch);
        }
    }
    out
}
