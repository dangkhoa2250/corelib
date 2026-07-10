use std::{
    path::Path,
    sync::{Arc, Mutex},
};

use library_desktop_lib::{
    indexer::{extract_pdf_text_with_worker, index_document_with, MAX_PDF_INPUT_BYTES},
    library_db::{LibraryDatabase, NewLocalDocument},
};
use lopdf::{dictionary, Document, Object, Stream};
use tempfile::tempdir;

#[test]
fn compressed_expansion_is_killed_in_the_extraction_worker_and_marks_the_document_failed() {
    let directory = tempdir().expect("create temporary directory");
    let path = directory.path().join("compressed-expansion.pdf");
    write_compressed_expansion_pdf(&path);
    assert!(
        std::fs::metadata(&path).expect("read PDF metadata").len() < MAX_PDF_INPUT_BYTES as u64,
        "the regression fixture must fit the input-file limit"
    );
    let database = Arc::new(Mutex::new(
        LibraryDatabase::open(directory.path()).expect("open database"),
    ));
    database
        .lock()
        .expect("lock database")
        .insert_local(NewLocalDocument {
            id: "compressed".into(),
            title: "Compressed expansion".into(),
            content_hash: "compressed-expansion".into(),
            managed_path: path.to_string_lossy().into_owned(),
        })
        .expect("insert pending document");
    let worker_path = std::env::current_exe()
        .expect("locate integration test executable")
        .parent()
        .and_then(Path::parent)
        .expect("locate Cargo debug directory")
        .join(format!(
            "pdf_text_extractor{}",
            std::env::consts::EXE_SUFFIX
        ));
    assert!(
        worker_path.is_file(),
        "build the local worker binary for the test"
    );
    let worker = worker_path.as_path();

    index_document_with(&database, "compressed", &path, |pdf| {
        extract_pdf_text_with_worker(pdf, worker)
    });

    let document = database
        .lock()
        .expect("lock database after failed extraction")
        .list()
        .expect("application process remains usable after worker limit")
        .pop()
        .expect("document");
    assert_eq!(document.status, "ready");
    assert!(
        !document.indexed,
        "resource-limited extraction maps to failed"
    );
}

fn write_compressed_expansion_pdf(path: &Path) {
    let mut document = Document::with_version("1.5");
    let pages_id = document.new_object_id();
    let font_id = document.add_object(dictionary! {
        "Type" => "Font", "Subtype" => "Type1", "BaseFont" => "Helvetica",
    });
    let resources_id = document.add_object(dictionary! {
        "Font" => dictionary! { "F1" => font_id },
    });
    let mut contents = b"BT /F1 12 Tf 72 720 Td (".to_vec();
    contents.extend(std::iter::repeat_n(b'x', 128 * 1024 * 1024));
    contents.extend_from_slice(b") Tj ET");
    let mut stream = Stream::new(dictionary! {}, contents);
    stream.compress().expect("compress expansion fixture");
    let contents_id = document.add_object(stream);
    let page_id = document.add_object(dictionary! {
        "Type" => "Page", "Parent" => pages_id, "Resources" => resources_id,
        "Contents" => contents_id, "MediaBox" => vec![0.into(), 0.into(), 612.into(), 792.into()],
    });
    document.objects.insert(
        pages_id,
        Object::Dictionary(dictionary! {
            "Type" => "Pages", "Kids" => vec![page_id.into()], "Count" => 1,
        }),
    );
    let catalog_id = document.add_object(dictionary! { "Type" => "Catalog", "Pages" => pages_id });
    document.trailer.set("Root", catalog_id);
    document.save(path).expect("write compressed expansion PDF");
}
