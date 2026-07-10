// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if let Some(status) = library_desktop_lib::indexer::run_pdf_text_extraction_worker() {
        std::process::exit(status);
    }
    library_desktop_lib::run()
}
