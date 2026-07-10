use std::{
    path::Path,
    sync::{Arc, Mutex},
};

use tempfile::tempdir;

use crate::{
    indexer::{extract_pdf_text, index_document_with, index_managed_pdf},
    library_db::{LibraryDatabase, NewLocalDocument},
};

#[test]
fn extracts_plain_text_from_a_managed_pdf() {
    let directory = tempdir().expect("create temporary directory");
    let path = directory.path().join("text.pdf");
    write_text_pdf(&path, "Quantum gardens bloom");

    let text = extract_pdf_text(&path).expect("extract text");

    assert!(text.contains("Quantum gardens bloom"));
}

fn pending_database() -> (Arc<Mutex<LibraryDatabase>>, tempfile::TempDir) {
    let directory = tempdir().expect("create temporary directory");
    let mut database = LibraryDatabase::open(directory.path()).expect("open database");
    database
        .insert_local(NewLocalDocument {
            id: "indexed".into(),
            title: "Indexed PDF".into(),
            content_hash: "indexed-content".into(),
            managed_path: "/managed/indexed.pdf".into(),
        })
        .expect("insert document");
    (Arc::new(Mutex::new(database)), directory)
}

#[test]
fn indexer_failure_keeps_the_document_ready_with_a_failed_index_state() {
    let (database, _directory) = pending_database();

    index_document_with(
        &database,
        "indexed",
        Path::new("/managed/indexed.pdf"),
        |_| Err("encrypted PDF".to_owned()),
    );

    let document = database
        .lock()
        .expect("lock database")
        .list()
        .expect("list documents")
        .pop()
        .expect("document");
    assert_eq!(document.status, "ready");
    assert!(!document.indexed);
}

#[test]
fn indexer_success_writes_the_extracted_text_to_fts() {
    let (database, _directory) = pending_database();

    index_document_with(
        &database,
        "indexed",
        Path::new("/managed/indexed.pdf"),
        |_| Ok("Tensor calculus for physics".to_owned()),
    );

    let documents = database
        .lock()
        .expect("lock database")
        .search("calculus")
        .expect("search document");
    assert_eq!(documents.len(), 1);
    assert!(documents[0].indexed);
}

#[test]
fn indexer_indexes_text_extracted_from_a_real_managed_pdf() {
    let (database, directory) = pending_database();
    let path = directory.path().join("managed.pdf");
    write_text_pdf(&path, "Orbit mechanics reference");

    index_managed_pdf(&database, "indexed", &path);

    let documents = database
        .lock()
        .expect("lock database")
        .search("mechanics")
        .expect("search extracted text");
    assert_eq!(documents.len(), 1);
    assert_eq!(documents[0].id, "indexed");
    assert!(documents[0].indexed);
}

fn write_text_pdf(path: &Path, text: &str) {
    let stream = format!("BT /F1 18 Tf 72 720 Td ({text}) Tj ET\n");
    let objects = [
        "<< /Type /Catalog /Pages 2 0 R >>".to_owned(),
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>".to_owned(),
        "<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /MediaBox [0 0 612 792] /Contents 5 0 R >>".to_owned(),
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>".to_owned(),
        format!("<< /Length {} >>\nstream\n{stream}endstream", stream.len()),
    ];
    let mut pdf = b"%PDF-1.4\n".to_vec();
    let mut offsets = Vec::new();
    for (index, object) in objects.iter().enumerate() {
        offsets.push(pdf.len());
        pdf.extend_from_slice(format!("{} 0 obj\n{}\nendobj\n", index + 1, object).as_bytes());
    }
    let xref = pdf.len();
    pdf.extend_from_slice(
        format!("xref\n0 {}\n0000000000 65535 f \n", objects.len() + 1).as_bytes(),
    );
    for offset in offsets {
        pdf.extend_from_slice(format!("{offset:010} 00000 n \n").as_bytes());
    }
    pdf.extend_from_slice(
        format!(
            "trailer\n<< /Size {} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n",
            objects.len() + 1
        )
        .as_bytes(),
    );
    std::fs::write(path, pdf).expect("write PDF");
}
