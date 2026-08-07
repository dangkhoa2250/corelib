use tauri::Manager;

#[cfg(target_os = "macos")]
fn apply_overlay_scroller_style(view: &objc2_app_kit::NSView) {
    use objc2_app_kit::{NSScrollerStyle, NSScrollView};

    for subview in view.subviews().iter() {
        if let Some(scroll_view) = subview.downcast_ref::<NSScrollView>() {
            scroll_view.setScrollerStyle(NSScrollerStyle::Overlay);
        }
        apply_overlay_scroller_style(&subview);
    }
}

#[cfg(target_os = "macos")]
fn configure_macos_overlay_scrollers(window: &tauri::WebviewWindow) {
    use objc2_app_kit::NSView;

    window
        .with_webview(|webview| unsafe {
            // WKWebView inherits NSView. Only public NSView APIs are used to
            // find WebKit's embedded NSScrollViews, avoiding private selectors.
            let view: &NSView = &*webview.inner().cast();
            apply_overlay_scroller_style(view);
        })
        .expect("configure macOS overlay scrollers");
}

pub mod commands;
pub mod ai;
pub mod drive_api;
pub mod drive_auth;
pub mod drive_cache;
pub mod indexer;
pub mod learning;
pub mod library_db;
pub mod library_store;
pub mod model;
pub mod plugin_lifecycle;
pub mod scheduler;
pub mod study_queue;
pub mod statistics;
pub mod translation;
pub mod account;

#[cfg(test)]
mod account_tests;

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
mod plugin_lifecycle_tests;

#[cfg(test)]
mod learning_tests;

#[cfg(test)]
mod scheduler_tests;

#[cfg(test)]
mod study_queue_tests;

#[cfg(test)]
mod statistics_tests;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let app_data_directory = app
                .path()
                .app_data_dir()
                .map_err(|error| std::io::Error::other(error.to_string()))?;
            app.manage(plugin_lifecycle::PluginLifecycleStateStore::new(
                &app_data_directory,
            ));
            app.manage(
                commands::LibraryStore::open(app_data_directory).map_err(std::io::Error::other)?,
            );

            let base_url = option_env!("ACCOUNT_API_BASE_URL")
                .unwrap_or("")
                .to_string();
            let account_api = crate::account::PocketBaseAccountApi::new_with_deps(
                base_url,
                crate::account::KeyringSessionStore,
                crate::account::ReqwestHttpClient::new(),
            );
            app.manage(commands::AccountServiceState { api: account_api });

            #[cfg(target_os = "macos")]
            {
                let window = app.get_webview_window("main").unwrap();
                window_vibrancy::apply_vibrancy(
                    &window,
                    window_vibrancy::NSVisualEffectMaterial::Sidebar,
                    None,
                    None,
                )
                .expect("apply_vibrancy requires macOS 10.11+");
                configure_macos_overlay_scrollers(&window);
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_documents,
            commands::import_local_documents,
            commands::search_documents,
            commands::save_read_page,
            commands::list_page_tags,
            commands::toggle_page_tag,
            commands::drive_connect,
            commands::save_google_drive_credentials,
            commands::load_google_drive_credentials,
            commands::clear_google_drive_credentials,
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
            commands::get_deck_statistics,
            commands::count_deck_cards,
            commands::list_deck_cards,
            commands::delete_card,
            commands::get_card,
            commands::get_card_source,
            commands::search_everything,
            commands::get_document,
            commands::rename_document,
            commands::save_cover,
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
            commands::get_memora_settings,
            commands::update_memora_settings,
            commands::get_deck_learning_settings,
            commands::update_deck_learning_settings,
            commands::start_study_session,
            commands::refresh_study_session,
            commands::rate_study_card,
            commands::get_study_ready_counts,
            ai::save_ai_api_key,
            ai::clear_ai_api_key,
            ai::has_ai_api_key,
            ai::list_ai_models,
            ai::translate_with_ai,
            translation::translate_text,
            translation::apple_translation_available,
            commands::get_statistics_overview,
            commands::get_reading_statistics,
            commands::get_document_statistics,
            commands::get_memora_statistics,
            commands::get_deck_statistics_detail,
            commands::start_activity_session,
            commands::checkpoint_activity_session,
            commands::finish_activity_session,
            commands::get_daily_statistics_snapshots,
            commands::account_register,
            commands::account_sign_in,
            commands::account_session,
            commands::account_sign_out,
            commands::account_set_analytics_enabled,
            commands::account_track_event,
            commands::admin_list_users,
            commands::admin_set_user_status,
            commands::admin_set_user_groups,
            commands::admin_list_groups,
            commands::admin_create_group,
            commands::admin_list_features,
            commands::admin_create_feature,
            commands::admin_set_feature_assignment,
            commands::admin_get_metrics,
            commands::admin_delete_user,
            commands::account_upsert_daily_statistics,
            commands::admin_get_statistics,
            plugin_lifecycle::load_plugin_lifecycle_state,
            plugin_lifecycle::save_plugin_lifecycle_state,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
