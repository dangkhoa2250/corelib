use rusqlite::params;
use tempfile::TempDir;
use crate::library_db::LibraryDatabase;

fn db() -> (TempDir, LibraryDatabase) {
    let directory = TempDir::new().expect("temporary statistics database");
    let database = LibraryDatabase::open(directory.path()).expect("open statistics database");
    (directory, database)
}

#[test]
fn statistics_migration_creates_tables() {
    let (_directory, database) = db();
    let id: String = database.connection.query_row(
        "SELECT id FROM schema_migrations WHERE id='0011_statistics'", [], |row| row.get(0),
    ).expect("statistics migration");
    assert_eq!(id, "0011_statistics");
    for table in ["activity_sessions", "reading_session_pages"] {
        let count: i64 = database.connection.query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?1",
            params![table], |row| row.get(0),
        ).expect("table lookup");
        assert_eq!(count, 1, "missing {table}");
    }
}
