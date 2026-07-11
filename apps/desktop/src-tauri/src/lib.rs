use tauri::Manager;

pub mod commands;
pub mod drive_api;
pub mod drive_auth;
pub mod drive_cache;
pub mod indexer;
pub mod learning;
pub mod library_db;
pub mod library_store;
pub mod model;
pub mod scheduler;

#[cfg(test)]
mod drive_tests;

#[cfg(test)]
mod commands_tests;

#[cfg(test)]
mod indexer_tests;

#[cfg(test)]
mod library_db_tests;

#[cfg(test)]
mod library_store_tests;

#[cfg(test)]
mod learning_tests;

#[cfg(test)]
mod scheduler_tests;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let app_data_directory = app
                .path()
                .app_data_dir()
                .map_err(|error| std::io::Error::other(error.to_string()))?;
            app.manage(
                commands::LibraryStore::open(app_data_directory).map_err(std::io::Error::other)?,
            );
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_documents,
            commands::import_local_documents,
            commands::search_documents,
            commands::save_read_page,
            commands::drive_connect,
            commands::drive_list,
            commands::drive_import,
            commands::get_document_file_url,
            commands::clear_drive_cache,
            commands::delete_document,
            commands::create_card,
            commands::list_decks,
            commands::create_deck,
            commands::rename_deck,
            commands::delete_deck,
            commands::count_deck_cards,
            commands::list_deck_cards,
            commands::delete_card,
            commands::list_due_cards,
            commands::get_card,
            commands::preview_card_review,
            commands::rate_card,
            commands::get_card_source,
            commands::search_everything,
            commands::get_document,
            commands::rename_document,
            commands::query_deck_cards,
            commands::list_active_tags,
            commands::update_card,
            commands::update_and_move_card,
            commands::move_cards,
            commands::set_cards_suspended,
            commands::trash_cards,
            commands::list_trashed_cards,
            commands::restore_cards,
            commands::delete_cards_permanently,
            commands::empty_trash,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
