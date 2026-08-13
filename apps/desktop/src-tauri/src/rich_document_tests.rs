use serde_json::{json, Map, Value};

use crate::rich_document::{
    plain_text, validate_document, RichDocumentError, MAX_DOCUMENT_DEPTH, MAX_DOCUMENT_NODES,
    MAX_IMAGES_PER_FACE,
};

fn text(value: &str) -> Value {
    json!({ "type": "text", "text": value })
}

fn paragraph(content: Vec<Value>) -> Value {
    json!({ "type": "paragraph", "content": content })
}

fn doc(content: Vec<Value>) -> Value {
    json!({ "type": "doc", "content": content })
}

fn default_image() -> Value {
    json!({
        "type": "image",
        "attrs": { "mediaId": "media-1", "alt": "a cat", "widthPercent": 50 }
    })
}

/// Inserts or overrides a single attribute on the default image attrs object.
fn image_with(override_key: &str, override_value: Value) -> Value {
    let mut attrs = Map::new();
    attrs.insert("mediaId".into(), json!("media-1"));
    attrs.insert("alt".into(), json!("a cat"));
    attrs.insert("widthPercent".into(), json!(50));
    attrs.insert(override_key.into(), override_value);
    json!({ "type": "image", "attrs": Value::Object(attrs) })
}

fn invalid_node_path(err: RichDocumentError) -> String {
    match err {
        RichDocumentError::InvalidNode { path, .. } => path,
        other => panic!("expected InvalidNode, got {other:?}"),
    }
}

#[test]
fn constants_mirror_ts_contract() {
    assert_eq!(MAX_DOCUMENT_DEPTH, 10);
    assert_eq!(MAX_DOCUMENT_NODES, 2000);
    assert_eq!(MAX_IMAGES_PER_FACE, 10);
}

#[test]
fn validate_accepts_full_allowlist() {
    let document = doc(vec![
        json!({
            "type": "paragraph",
            "attrs": { "textAlign": "center" },
            "content": [{
                "type": "text",
                "text": "hi",
                "marks": [
                    { "type": "bold" },
                    { "type": "italic" },
                    { "type": "strike" },
                    { "type": "underline" },
                    { "type": "textStyle", "attrs": { "color": "#ff0000" } },
                    { "type": "textStyle" },
                    { "type": "highlight" },
                    { "type": "highlight", "attrs": { "color": "#ffff00" } },
                ],
            }],
        }),
        json!({ "type": "heading", "attrs": { "level": 1 }, "content": [text("H1")] }),
        json!({ "type": "heading", "attrs": { "level": 2, "textAlign": "right" }, "content": [text("H2")] }),
        json!({ "type": "heading", "attrs": { "level": 3 }, "content": [text("H3")] }),
        paragraph(vec![text("a"), json!({ "type": "hardBreak" }), text("b")]),
        json!({
            "type": "bulletList",
            "content": [{ "type": "listItem", "content": [paragraph(vec![text("bullet")])] }]
        }),
        json!({
            "type": "orderedList",
            "content": [{ "type": "listItem", "content": [paragraph(vec![text("ordered")])] }]
        }),
        default_image(),
    ]);
    assert!(validate_document(&document).is_ok());
}

#[test]
fn validate_accepts_image_only_document() {
    assert!(validate_document(&doc(vec![default_image()])).is_ok());
}

#[test]
fn validate_accepts_width_percent_boundaries() {
    assert!(validate_document(&doc(vec![image_with("widthPercent", json!(10))])).is_ok());
    assert!(validate_document(&doc(vec![image_with("widthPercent", json!(100))])).is_ok());
}

#[test]
fn validate_accepts_empty_document() {
    assert!(validate_document(&doc(vec![])).is_ok());
}

#[test]
fn validate_accepts_ten_images() {
    let content: Vec<Value> = (0..10).map(|_| default_image()).collect();
    assert!(validate_document(&doc(content)).is_ok());
}

#[test]
fn validate_canonicalizes_paragraph_and_text() {
    let input = json!({
        "type": "doc",
        "junk": true,
        "content": [{
            "type": "paragraph",
            "junk": 1,
            "content": [{ "type": "text", "text": "hi", "extra": "x" }]
        }]
    });
    let expected = doc(vec![paragraph(vec![
        json!({ "type": "text", "text": "hi" }),
    ])]);
    assert_eq!(validate_document(&input).unwrap(), expected);
}

#[test]
fn validate_canonicalizes_heading_attrs() {
    let input = doc(vec![json!({
        "type": "heading",
        "attrs": { "level": 2, "textAlign": "center" },
        "junk": 1,
        "content": [text("title")]
    })]);
    let expected = doc(vec![json!({
        "type": "heading",
        "attrs": { "level": 2, "textAlign": "center" },
        "content": [text("title")]
    })]);
    assert_eq!(validate_document(&input).unwrap(), expected);
}

#[test]
fn validate_canonicalizes_image_attrs_and_preserves_number() {
    let input = doc(vec![image_with("alt", json!("kept"))]);
    let expected = doc(vec![json!({
        "type": "image",
        "attrs": { "mediaId": "media-1", "alt": "kept", "widthPercent": 50 }
    })]);
    assert_eq!(validate_document(&input).unwrap(), expected);
}

#[test]
fn validate_canonicalizes_marks() {
    let input = doc(vec![paragraph(vec![json!({
        "type": "text",
        "text": "x",
        "junk": 1,
        "marks": [
            { "type": "bold", "junk": 1 },
            { "type": "textStyle" },
            { "type": "highlight", "junk": 1, "attrs": { "color": "#ff0" } },
        ],
    })])]);
    let expected = doc(vec![paragraph(vec![json!({
        "type": "text",
        "text": "x",
        "marks": [
            { "type": "bold" },
            { "type": "textStyle" },
            { "type": "highlight", "attrs": { "color": "#ff0" } },
        ],
    })])]);
    assert_eq!(validate_document(&input).unwrap(), expected);
}
#[test]
fn validate_rejects_non_object_root() {
    assert!(matches!(
        validate_document(&json!(null)).unwrap_err(),
        RichDocumentError::InvalidRoot { .. }
    ));
    assert!(matches!(
        validate_document(&json!("doc")).unwrap_err(),
        RichDocumentError::InvalidRoot { .. }
    ));
    assert!(matches!(
        validate_document(&json!(42)).unwrap_err(),
        RichDocumentError::InvalidRoot { .. }
    ));
    assert!(matches!(
        validate_document(&json!([1])).unwrap_err(),
        RichDocumentError::InvalidRoot { .. }
    ));
}

#[test]
fn validate_rejects_root_type_not_doc() {
    assert!(matches!(
        validate_document(&json!({ "type": "paragraph", "content": [] })).unwrap_err(),
        RichDocumentError::InvalidRoot { .. }
    ));
}

#[test]
fn validate_rejects_doc_with_attrs() {
    let input = json!({ "type": "doc", "attrs": { "foo": 1 }, "content": [] });
    assert_eq!(
        invalid_node_path(validate_document(&input).unwrap_err()),
        "doc"
    );
}

#[test]
fn validate_rejects_unknown_node_type() {
    let input = doc(vec![json!({ "type": "blockquote", "content": [] })]);
    assert_eq!(
        invalid_node_path(validate_document(&input).unwrap_err()),
        "doc.content[0]"
    );
}

#[test]
fn validate_rejects_block_kind_violations() {
    let text_as_block = doc(vec![text("x")]);
    assert_eq!(
        invalid_node_path(validate_document(&text_as_block).unwrap_err()),
        "doc.content[0]"
    );
    let list_item_as_block = doc(vec![json!({ "type": "listItem", "content": [] })]);
    assert_eq!(
        invalid_node_path(validate_document(&list_item_as_block).unwrap_err()),
        "doc.content[0]"
    );
}

#[test]
fn validate_rejects_inline_kind_violation() {
    let input = doc(vec![paragraph(vec![default_image()])]);
    assert_eq!(
        invalid_node_path(validate_document(&input).unwrap_err()),
        "doc.content[0].content[0]"
    );
}

#[test]
fn validate_rejects_text_missing_or_non_string_text() {
    let missing = doc(vec![paragraph(vec![json!({ "type": "text" })])]);
    assert_eq!(
        invalid_node_path(validate_document(&missing).unwrap_err()),
        "doc.content[0].content[0]"
    );
    let non_string = doc(vec![paragraph(vec![json!({ "type": "text", "text": 7 })])]);
    assert_eq!(
        invalid_node_path(validate_document(&non_string).unwrap_err()),
        "doc.content[0].content[0]"
    );
}

#[test]
fn validate_rejects_text_with_content() {
    let input = doc(vec![paragraph(vec![
        json!({ "type": "text", "text": "x", "content": [] }),
    ])]);
    assert_eq!(
        invalid_node_path(validate_document(&input).unwrap_err()),
        "doc.content[0].content[0]"
    );
}

#[test]
fn validate_rejects_unknown_mark_type() {
    let input = doc(vec![paragraph(vec![json!({
        "type": "text",
        "text": "x",
        "marks": [{ "type": "nope" }]
    })])]);
    assert_eq!(
        invalid_node_path(validate_document(&input).unwrap_err()),
        "doc.content[0].content[0].marks[0]"
    );
}

#[test]
fn validate_rejects_simple_mark_with_attrs() {
    let input = doc(vec![paragraph(vec![json!({
        "type": "text",
        "text": "x",
        "marks": [{ "type": "bold", "attrs": {} }]
    })])]);
    assert_eq!(
        invalid_node_path(validate_document(&input).unwrap_err()),
        "doc.content[0].content[0].marks[0]"
    );
}

#[test]
fn validate_rejects_color_mark_extra_or_wrong_key() {
    let highlight_doc = doc(vec![paragraph(vec![json!({
        "type": "text",
        "text": "x",
        "marks": [{ "type": "highlight", "attrs": { "color": "#fff", "extra": 1 } }]
    })])]);
    assert_eq!(
        invalid_node_path(validate_document(&highlight_doc).unwrap_err()),
        "doc.content[0].content[0].marks[0]"
    );
    let text_style_doc = doc(vec![paragraph(vec![json!({
        "type": "text",
        "text": "x",
        "marks": [{ "type": "textStyle", "attrs": { "fontSize": "12" } }]
    })])]);
    assert_eq!(
        invalid_node_path(validate_document(&text_style_doc).unwrap_err()),
        "doc.content[0].content[0].marks[0]"
    );
}

#[test]
fn validate_rejects_color_mark_non_string_color() {
    let input = doc(vec![paragraph(vec![json!({
        "type": "text",
        "text": "x",
        "marks": [{ "type": "highlight", "attrs": { "color": 7 } }]
    })])]);
    assert_eq!(
        invalid_node_path(validate_document(&input).unwrap_err()),
        "doc.content[0].content[0].marks[0]"
    );
}

#[test]
fn validate_rejects_marks_on_non_text_node() {
    let input = doc(vec![json!({
        "type": "paragraph",
        "marks": [{ "type": "bold" }],
        "content": [text("x")]
    })]);
    assert_eq!(
        invalid_node_path(validate_document(&input).unwrap_err()),
        "doc.content[0]"
    );
}

#[test]
fn validate_rejects_image_extra_keys() {
    let with_src = image_with("src", json!("https://example.com/a.png"));
    assert_eq!(
        invalid_node_path(validate_document(&doc(vec![with_src])).unwrap_err()),
        "doc.content[0]"
    );
    let with_asset = image_with("asset", json!("x"));
    assert_eq!(
        invalid_node_path(validate_document(&doc(vec![with_asset])).unwrap_err()),
        "doc.content[0]"
    );
}

#[test]
fn validate_rejects_image_missing_keys() {
    let missing_media = doc(vec![json!({
        "type": "image",
        "attrs": { "alt": "x", "widthPercent": 50 }
    })]);
    assert!(validate_document(&missing_media).is_err());
    let missing_alt = doc(vec![json!({
        "type": "image",
        "attrs": { "mediaId": "m", "widthPercent": 50 }
    })]);
    assert!(validate_document(&missing_alt).is_err());
    let missing_width = doc(vec![json!({
        "type": "image",
        "attrs": { "mediaId": "m", "alt": "x" }
    })]);
    assert!(validate_document(&missing_width).is_err());
}

#[test]
fn validate_rejects_image_width_out_of_range() {
    assert!(validate_document(&doc(vec![image_with("widthPercent", json!(9))])).is_err());
    assert!(validate_document(&doc(vec![image_with("widthPercent", json!(101))])).is_err());
    assert!(validate_document(&doc(vec![image_with("widthPercent", json!("50"))])).is_err());
}

#[test]
fn validate_rejects_image_media_id_invalid() {
    assert!(validate_document(&doc(vec![image_with("mediaId", json!(""))])).is_err());
    assert!(validate_document(&doc(vec![image_with("mediaId", json!(5))])).is_err());
}

#[test]
fn validate_rejects_image_attrs_not_object() {
    let input = doc(vec![json!({ "type": "image", "attrs": "nope" })]);
    assert_eq!(
        invalid_node_path(validate_document(&input).unwrap_err()),
        "doc.content[0]"
    );
}

#[test]
fn validate_rejects_image_with_content() {
    let input = doc(vec![json!({
        "type": "image",
        "content": [],
        "attrs": { "mediaId": "m", "alt": "a", "widthPercent": 50 }
    })]);
    assert_eq!(
        invalid_node_path(validate_document(&input).unwrap_err()),
        "doc.content[0]"
    );
}

#[test]
fn validate_rejects_heading_level_out_of_range() {
    let zero = doc(vec![
        json!({ "type": "heading", "attrs": { "level": 0 }, "content": [] }),
    ]);
    assert_eq!(
        invalid_node_path(validate_document(&zero).unwrap_err()),
        "doc.content[0]"
    );
    let four = doc(vec![
        json!({ "type": "heading", "attrs": { "level": 4 }, "content": [] }),
    ]);
    assert_eq!(
        invalid_node_path(validate_document(&four).unwrap_err()),
        "doc.content[0]"
    );
}

#[test]
fn validate_rejects_heading_missing_level() {
    let input = doc(vec![
        json!({ "type": "heading", "attrs": {}, "content": [] }),
    ]);
    assert_eq!(
        invalid_node_path(validate_document(&input).unwrap_err()),
        "doc.content[0]"
    );
}

#[test]
fn validate_rejects_heading_unknown_attr() {
    let input = doc(vec![
        json!({ "type": "heading", "attrs": { "level": 1, "foo": 1 }, "content": [] }),
    ]);
    assert_eq!(
        invalid_node_path(validate_document(&input).unwrap_err()),
        "doc.content[0]"
    );
}

#[test]
fn validate_rejects_heading_attrs_not_object() {
    let input = doc(vec![
        json!({ "type": "heading", "attrs": "x", "content": [] }),
    ]);
    assert_eq!(
        invalid_node_path(validate_document(&input).unwrap_err()),
        "doc.content[0]"
    );
}

#[test]
fn validate_rejects_paragraph_unknown_attr() {
    let input = doc(vec![
        json!({ "type": "paragraph", "attrs": { "foo": 1 }, "content": [] }),
    ]);
    assert_eq!(
        invalid_node_path(validate_document(&input).unwrap_err()),
        "doc.content[0]"
    );
}

#[test]
fn validate_rejects_paragraph_attrs_not_object() {
    let input = doc(vec![
        json!({ "type": "paragraph", "attrs": "x", "content": [] }),
    ]);
    assert_eq!(
        invalid_node_path(validate_document(&input).unwrap_err()),
        "doc.content[0]"
    );
}

#[test]
fn validate_rejects_invalid_text_align() {
    let input = doc(vec![
        json!({ "type": "paragraph", "attrs": { "textAlign": "middle" }, "content": [] }),
    ]);
    assert_eq!(
        invalid_node_path(validate_document(&input).unwrap_err()),
        "doc.content[0]"
    );
}

#[test]
fn validate_rejects_content_not_array() {
    let doc_content = json!({ "type": "doc", "content": "not-array" });
    assert_eq!(
        invalid_node_path(validate_document(&doc_content).unwrap_err()),
        "doc.content"
    );
    let paragraph_content = doc(vec![json!({ "type": "paragraph", "content": "not-array" })]);
    assert_eq!(
        invalid_node_path(validate_document(&paragraph_content).unwrap_err()),
        "doc.content[0].content"
    );
}

#[test]
fn validate_rejects_non_object_node() {
    let input = doc(vec![json!(42)]);
    assert_eq!(
        invalid_node_path(validate_document(&input).unwrap_err()),
        "doc.content[0]"
    );
}

#[test]
fn validate_rejects_node_missing_type() {
    let input = doc(vec![json!({ "content": [] })]);
    assert_eq!(
        invalid_node_path(validate_document(&input).unwrap_err()),
        "doc.content[0]"
    );
}

#[test]
fn validate_rejects_eleven_images() {
    let content: Vec<Value> = (0..11).map(|_| default_image()).collect();
    assert!(matches!(
        validate_document(&doc(content)).unwrap_err(),
        RichDocumentError::ImageCountExceeded { .. }
    ));
}

#[test]
fn validate_rejects_excessive_depth() {
    let mut node = paragraph(vec![text("x")]);
    for _ in 0..8 {
        node =
            json!({ "type": "bulletList", "content": [{ "type": "listItem", "content": [node] }] });
    }
    let document = doc(vec![node]);
    assert!(matches!(
        validate_document(&document).unwrap_err(),
        RichDocumentError::DepthExceeded { .. }
    ));
}

#[test]
fn validate_rejects_excessive_node_count() {
    let content: Vec<Value> = (0..1100).map(|_| paragraph(vec![text("x")])).collect();
    assert!(matches!(
        validate_document(&doc(content)).unwrap_err(),
        RichDocumentError::NodeCountExceeded { .. }
    ));
}
#[test]
fn plain_text_single_paragraph() {
    let document = doc(vec![paragraph(vec![text("Hello")])]);
    assert_eq!(plain_text(&document), "Hello");
}

#[test]
fn plain_text_multiple_paragraphs() {
    let document = doc(vec![
        paragraph(vec![text("Hello")]),
        paragraph(vec![text("World")]),
    ]);
    assert_eq!(plain_text(&document), "Hello\nWorld");
}

#[test]
fn plain_text_hardbreak_in_paragraph() {
    let document = doc(vec![paragraph(vec![
        text("a"),
        json!({ "type": "hardBreak" }),
        text("b"),
    ])]);
    assert_eq!(plain_text(&document), "a\nb");
}

#[test]
fn plain_text_heading() {
    let document = doc(vec![json!({
        "type": "heading",
        "attrs": { "level": 1 },
        "content": [text("Title")]
    })]);
    assert_eq!(plain_text(&document), "Title");
}

#[test]
fn plain_text_bullet_list() {
    let item = |t: &str| json!({ "type": "listItem", "content": [paragraph(vec![text(t)])] });
    let document = doc(vec![
        json!({ "type": "bulletList", "content": [item("a"), item("b")] }),
    ]);
    assert_eq!(plain_text(&document), "• a\n• b");
}

#[test]
fn plain_text_ordered_list() {
    let item = |t: &str| json!({ "type": "listItem", "content": [paragraph(vec![text(t)])] });
    let document = doc(vec![
        json!({ "type": "orderedList", "content": [item("c"), item("d")] }),
    ]);
    assert_eq!(plain_text(&document), "1. c\n2. d");
}

#[test]
fn plain_text_image_alt() {
    let document = doc(vec![image_with("alt", json!("a cat"))]);
    assert_eq!(plain_text(&document), "a cat");
}

#[test]
fn plain_text_image_empty_alt_falls_back_to_placeholder() {
    let document = doc(vec![image_with("alt", json!(""))]);
    assert_eq!(plain_text(&document), "[image]");
}

#[test]
fn plain_text_paragraph_and_image() {
    let document = doc(vec![
        paragraph(vec![text("Question")]),
        image_with("alt", json!("cat")),
    ]);
    assert_eq!(plain_text(&document), "Question\ncat");
}

#[test]
fn plain_text_ignores_marks() {
    let document = doc(vec![paragraph(vec![json!({
        "type": "text",
        "text": "bold",
        "marks": [{ "type": "bold" }]
    })])]);
    assert_eq!(plain_text(&document), "bold");
}

#[test]
fn plain_text_trims_whitespace() {
    let document = doc(vec![paragraph(vec![text("   spaced   ")])]);
    assert_eq!(plain_text(&document), "spaced");
}

#[test]
fn plain_text_empty_document() {
    assert_eq!(plain_text(&doc(vec![])), "");
}

#[test]
fn plain_text_collapses_blank_lines() {
    let document = doc(vec![
        paragraph(vec![text("A")]),
        paragraph(vec![]),
        paragraph(vec![text("B")]),
    ]);
    assert_eq!(plain_text(&document), "A\nB");
}

#[test]
fn plain_text_is_deterministic_for_nested_lists() {
    let inner = json!({
        "type": "bulletList",
        "content": [{ "type": "listItem", "content": [paragraph(vec![text("nested")])] }]
    });
    let outer = json!({
        "type": "bulletList",
        "content": [{
            "type": "listItem",
            "content": [paragraph(vec![text("outer")]), inner]
        }]
    });
    let document = doc(vec![outer]);
    assert_eq!(plain_text(&document), "• outer\n• nested");
    assert_eq!(plain_text(&document), plain_text(&document));
}

#[test]
fn plain_text_non_doc_value_returns_empty() {
    assert_eq!(plain_text(&json!("hello")), "");
    assert_eq!(plain_text(&json!(null)), "");
}
