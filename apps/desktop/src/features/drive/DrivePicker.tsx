import { useState } from "react";
import type { DriveEntry } from "../../lib/desktop";

export interface DrivePickerProps {
  entries: DriveEntry[];
  onAdd: (ids: string[]) => Promise<void>;
  onClose: () => void;
  onNavigateFolder?: (folderId?: string) => void;
  parentId?: string | null;
}

export function DrivePicker({
  entries,
  onAdd,
  onClose,
  onNavigateFolder,
  parentId,
}: DrivePickerProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const handleAddSelected = async () => {
    if (selectedIds.length === 0) return;
    setLoading(true);
    try {
      await onAdd(selectedIds);
      setSelectedIds([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAddSingle = async (id: string) => {
    setLoading(true);
    try {
      await onAdd([id]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="drive-picker-overlay">
      <div className="drive-picker">
        <header className="drive-picker__header">
          <button type="button" className="drive-picker__back-btn" onClick={onClose}>
            Back to Library
          </button>
          <h2>Google Drive</h2>
        </header>

        <div className="drive-picker__toolbar">
          {parentId !== undefined && (
            <button
              type="button"
              className="drive-picker__parent-btn"
              onClick={() => onNavigateFolder?.(parentId || undefined)}
            >
              ← Up
            </button>
          )}
          <button
            type="button"
            className="drive-picker__add-selected-btn"
            disabled={selectedIds.length === 0 || loading}
            onClick={handleAddSelected}
          >
            {loading ? "Adding..." : `Add Selected (${selectedIds.length})`}
          </button>
        </div>

        <ul className="drive-picker__list">
          {entries.length === 0 ? (
            <li className="drive-picker__empty">No PDFs or folders found here.</li>
          ) : (
            entries.map((entry) => (
              <li key={entry.id} className="drive-picker__item">
                {entry.kind === "pdf" ? (
                  <div className="drive-picker__item-pdf">
                    <input
                      type="checkbox"
                      id={`check-${entry.id}`}
                      checked={selectedIds.includes(entry.id)}
                      onChange={() => toggleSelect(entry.id)}
                    />
                    <label htmlFor={`check-${entry.id}`} className="drive-picker__label">
                      📄 {entry.name}
                    </label>
                    <button
                      type="button"
                      className="drive-picker__add-btn"
                      disabled={loading}
                      onClick={() => void handleAddSingle(entry.id)}
                    >
                      Add {entry.name}
                    </button>
                  </div>
                ) : (
                  <div className="drive-picker__item-folder">
                    <button
                      type="button"
                      className="drive-picker__folder-link"
                      onClick={() => onNavigateFolder?.(entry.id)}
                    >
                      📁 {entry.name}
                    </button>
                  </div>
                )}
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
