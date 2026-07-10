use tauri::Manager;

pub mod commands;
pub mod indexer;
pub mod library_db;
pub mod library_store;
pub mod model;

#[cfg(test)]
mod commands_tests;

#[cfg(test)]
mod indexer_tests;

#[cfg(test)]
mod library_db_tests;

#[cfg(test)]
mod library_store_tests;

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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
