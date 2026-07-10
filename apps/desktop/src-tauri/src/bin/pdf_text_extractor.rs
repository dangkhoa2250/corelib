fn main() {
    std::process::exit(library_desktop_lib::indexer::run_pdf_text_extraction_worker().unwrap_or(2));
}
