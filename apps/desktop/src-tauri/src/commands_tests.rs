use crate::commands::{validate_import_paths, validate_read_page};

#[test]
fn import_command_validation_rejects_empty_and_non_pdf_paths() {
    assert!(validate_import_paths(&[]).is_err());
    assert!(validate_import_paths(&["".to_owned()]).is_err());
    assert!(validate_import_paths(&["/tmp/not-a-pdf.txt".to_owned()]).is_err());
}

#[test]
fn save_read_page_command_validation_rejects_non_positive_pages() {
    assert!(validate_read_page(0).is_err());
    assert!(validate_read_page(-1).is_err());
}
