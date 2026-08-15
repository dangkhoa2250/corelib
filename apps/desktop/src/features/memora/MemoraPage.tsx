import { useEffect, useState } from "react";

import { ActionMenu } from "../../components/ActionMenu";
import { Button } from "../../components/Button";
import type { Deck, DeckStatistics, DeckLearningSettings, StudyReadyCounts } from "../../domain/learning";
import { DeckLearningSettingsDialog } from "./DeckLearningSettingsDialog";

interface MemoraPageProps {
  listDecks: () => Promise<Deck[]>;
  getStudyReadyCounts: () => Promise<StudyReadyCounts>;
  onReviewToday: () => void;
  createDeck: (name: string) => Promise<Deck>;
  renameDeck: (id: string, name: string) => Promise<Deck>;
  deleteDeck: (id: string) => Promise<void>;
  countDeckCards: (id: string) => Promise<number>;
  getDeckStatistics: (deckId: string) => Promise<DeckStatistics>;
  getDeckLearningSettings: (deckId: string) => Promise<DeckLearningSettings>;
  updateDeckLearningSettings: (deckId: string, newCardsPerDay: number | null) => Promise<DeckLearningSettings>;
  onOpenDeck: (deck: Deck) => void;
  onStudyDeck: (deckId: string) => void;
  onPracticeAll: (deckId: string) => void;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

type DeckRowMode = "idle" | "rename" | "delete" | "learning";

interface DeckRowProps {
  deck: Deck;
  menuOpen: boolean;
  onMenuToggle: (open: boolean) => void;
  onOpen: () => void;
  onRename: (name: string) => Promise<void>;
  onDelete: () => Promise<void>;
  onStudy: () => void;
  onPracticeAll: () => void;
  countDeckCards: (id: string) => Promise<number>;
  getDeckStatistics: (deckId: string) => Promise<DeckStatistics>;
  getDeckLearningSettings: (deckId: string) => Promise<DeckLearningSettings>;
  updateDeckLearningSettings: (deckId: string, newCardsPerDay: number | null) => Promise<DeckLearningSettings>;
}

function DeckRow({ deck, menuOpen, onMenuToggle, onOpen, onRename, onDelete, onStudy, onPracticeAll, countDeckCards, getDeckStatistics: fetchStats, getDeckLearningSettings, updateDeckLearningSettings }: DeckRowProps) {
  const [mode, setMode] = useState<DeckRowMode>("idle");
  const [nameValue, setNameValue] = useState(deck.name);
  const [saving, setSaving] = useState(false);
  const [cardCount, setCardCount] = useState<number | null>(null);
  const [stats, setStats] = useState<DeckStatistics | null>(null);
  const [learningSettings, setLearningSettings] = useState<DeckLearningSettings | null>(null);

  useEffect(() => {
    fetchStats(deck.id)
      .then(setStats)
      .catch(() => setStats(null));
  }, [deck.id, fetchStats]);

  const startDelete = () => {
    setCardCount(null);
    setMode("delete");
    void countDeckCards(deck.id)
      .then(setCardCount)
      .catch(() => setCardCount(null));
  };

  const openLearningSettings = () => {
    setLearningSettings(null);
    setMode("learning");
    void getDeckLearningSettings(deck.id)
      .then(setLearningSettings)
      .catch(() => setMode("idle"));
  };

  if (mode === "rename") {
    return (
      <li className="memora-deck-list__item">
        <form
          className="memora-deck-list__edit-form"
          onSubmit={(event) => {
            event.preventDefault();
            const trimmed = nameValue.trim();
            if (!trimmed) return;
            setSaving(true);
            void onRename(trimmed).finally(() => {
              setSaving(false);
              setMode("idle");
            });
          }}
        >
          <input
            aria-label="Deck name"
            autoFocus
            disabled={saving}
            onChange={(event) => setNameValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setNameValue(deck.name);
                setMode("idle");
              }
            }}
            value={nameValue}
          />
          <Button disabled={saving || !nameValue.trim()} type="submit" variant="primary">
            Save
          </Button>
          <Button onClick={() => { setNameValue(deck.name); setMode("idle"); }} variant="secondary">
            Cancel
          </Button>
        </form>
      </li>
    );
  }

  if (mode === "delete") {
    const warning = cardCount === null
      ? `Delete "${deck.name}"?`
      : cardCount > 0
        ? `Delete "${deck.name}" and its ${cardCount} card${cardCount === 1 ? "" : "s"}? This cannot be undone.`
        : `Delete "${deck.name}"? This deck has no cards.`;
    return (
      <li className="memora-deck-list__item memora-deck-list__item--confirm">
        <span>{warning}</span>
        <div className="memora-deck-list__confirm-actions">
          <Button
            disabled={saving}
            onClick={() => {
              setSaving(true);
              void onDelete().finally(() => {
                setSaving(false);
                setMode("idle");
              });
            }}
            variant="destructive"
          >
            Delete
          </Button>
          <Button disabled={saving} onClick={() => setMode("idle")} variant="secondary">
            Cancel
          </Button>
        </div>
      </li>
    );
  }

  return (
    <li className="memora-deck-list__item">
      <button aria-label={deck.name} className="memora-deck-list__open" onClick={onOpen} type="button">
        <div className="memora-deck-list__content">
          <span className="memora-deck-list__name">{deck.name}</span>
          {deck.description ? (
            <span className="memora-deck-list__description">{deck.description}</span>
          ) : null}
        </div>
      </button>
      {stats ? (
        <div aria-label={`Statistics for ${deck.name}`} className="memora-deck-list__statistics">
          <span className="memora-deck-list__stat memora-deck-list__stat--new"><strong>{stats.newCards}</strong>New</span>
          <span className="memora-deck-list__stat memora-deck-list__stat--learning"><strong>{stats.learningCards}</strong>Learning</span>
          <span className="memora-deck-list__stat memora-deck-list__stat--due"><strong>{stats.dueCards}</strong>Due</span>
        </div>
      ) : null}
      <ActionMenu
        items={[
          { label: "Review Due", disabled: !(stats && stats.newCards + stats.dueCards > 0), onSelect: onStudy },
          { label: "Practice All", disabled: !stats?.totalCards, onSelect: onPracticeAll },
        ]}
        label={`Study ${deck.name}`}
        triggerLabel="Study"
      />
      <div className="memora-deck-list__menu">
        <button
          aria-label={`Actions for ${deck.name}`}
          className="memora-deck-list__menu-trigger"
          onClick={(event) => {
            event.stopPropagation();
            onMenuToggle(!menuOpen);
          }}
          type="button"
        >
          <svg fill="currentColor" height="16" viewBox="0 0 20 20" width="16">
            <circle cx="5" cy="10" r="2" />
            <circle cx="10" cy="10" r="2" />
            <circle cx="15" cy="10" r="2" />
          </svg>
        </button>
        {menuOpen && (
          <div className="memora-deck-list__menu-popover">
            <button
              onClick={(event) => {
                event.stopPropagation();
                onMenuToggle(false);
                openLearningSettings();
              }}
              type="button"
            >
              Settings
            </button>
            <button
              onClick={(event) => {
                event.stopPropagation();
                onMenuToggle(false);
                setNameValue(deck.name);
                setMode("rename");
              }}
              type="button"
            >
              Rename
            </button>
            <button
              className="memora-deck-list__menu-delete"
              onClick={(event) => {
                event.stopPropagation();
                onMenuToggle(false);
                startDelete();
              }}
              type="button"
            >
              Delete
            </button>
          </div>
        )}
      </div>
      {mode === "learning" && learningSettings ? (
        <DeckLearningSettingsDialog
          deckName={deck.name}
          onCancel={() => {
            setMode("idle");
            setLearningSettings(null);
          }}
          onSave={async (newCardsPerDay) => {
            const updated = await updateDeckLearningSettings(deck.id, newCardsPerDay);
            setMode("idle");
            setLearningSettings(null);
            return updated;
          }}
          settings={learningSettings}
        />
      ) : null}
    </li>
  );
}

export function MemoraPage({ listDecks, getStudyReadyCounts, onReviewToday, createDeck, renameDeck, deleteDeck, countDeckCards, getDeckStatistics, getDeckLearningSettings, updateDeckLearningSettings, onOpenDeck, onStudyDeck, onPracticeAll }: MemoraPageProps) {
  const [decks, setDecks] = useState<Deck[] | null>(null);
  const [dueCount, setDueCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creatingDeck, setCreatingDeck] = useState(false);
  const [newDeckName, setNewDeckName] = useState("");
  const [saving, setSaving] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setError(null);
    listDecks()
      .then((loadedDecks) => {
        if (active) setDecks(loadedDecks);
      })
      .catch((loadError) => {
        if (active) setError(errorMessage(loadError));
      });
    Promise.resolve()
      .then(() => getStudyReadyCounts())
      .then((counts) => {
        if (active) setDueCount(counts.total);
      })
      .catch(() => {
        if (active) setDueCount(null);
      });
    return () => {
      active = false;
    };
  }, [listDecks, getStudyReadyCounts]);

  useEffect(() => {
    if (!openMenuId) return;
    const handleOutsideClick = () => setOpenMenuId(null);
    window.document.addEventListener("click", handleOutsideClick);
    return () => window.document.removeEventListener("click", handleOutsideClick);
  }, [openMenuId]);

  const submitNewDeck = () => {
    const name = newDeckName.trim();
    if (!name) return;
    setSaving(true);
    setError(null);
    createDeck(name)
      .then((deck) => {
        setDecks((current) => [...(current ?? []), deck]);
        setNewDeckName("");
        setCreatingDeck(false);
      })
      .catch((createError) => setError(errorMessage(createError)))
      .finally(() => setSaving(false));
  };

  const handleRenameDeck = (id: string, name: string) => {
    setError(null);
    return renameDeck(id, name)
      .then((updated) => {
        setDecks((current) => (current ?? []).map((deck) => (deck.id === id ? updated : deck)));
      })
      .catch((renameError) => setError(errorMessage(renameError)));
  };

  const handleDeleteDeck = (id: string) => {
    setError(null);
    return deleteDeck(id)
      .then(() => {
        setDecks((current) => (current ?? []).filter((deck) => deck.id !== id));
      })
      .catch((deleteError) => setError(errorMessage(deleteError)));
  };

  return (
    <main className="memora-page">
      <header className="memora-page__header">
        <h1>Memora</h1>
        <div className="memora-page__actions">
          <Button onClick={() => setCreatingDeck(true)} variant="primary">New Deck</Button>
          <Button
            onClick={onReviewToday}
            variant="secondary"
          >
            {dueCount ? `Review ${dueCount} Ready` : "Review"}
          </Button>
        </div>
      </header>
      {creatingDeck ? (
        <div aria-labelledby="new-deck-dialog-title" aria-modal="true" className="deck-learning-dialog__backdrop" role="dialog">
          <div className="deck-learning-dialog">
            <div className="deck-learning-dialog__header">
              <h2 id="new-deck-dialog-title">New Deck</h2>
              <button
                aria-label="Close dialog"
                className="deck-learning-dialog__close"
                onClick={() => {
                  setCreatingDeck(false);
                  setNewDeckName("");
                }}
                type="button"
              >
                ×
              </button>
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                submitNewDeck();
              }}
              style={{ display: "grid", gap: "16px" }}
            >
              <label className="deck-learning-dialog__field">
                <span>Deck name</span>
                <input
                  aria-label="New deck name"
                  autoFocus
                  disabled={saving}
                  onChange={(event) => setNewDeckName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      setCreatingDeck(false);
                      setNewDeckName("");
                    }
                  }}
                  placeholder="e.g. Spanish Vocabulary"
                  value={newDeckName}
                />
              </label>
              <div className="deck-learning-dialog__actions">
                <Button disabled={saving || !newDeckName.trim()} type="submit" variant="primary">
                  {saving ? "Creating…" : "Create"}
                </Button>
                <Button
                  disabled={saving}
                  onClick={() => {
                    setCreatingDeck(false);
                    setNewDeckName("");
                  }}
                  variant="secondary"
                >
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
      {error ? (
        <div role="alert">
          <p>{error}</p>
        </div>
      ) : null}
      {decks && decks.length > 0 ? (
        <ul className="memora-deck-list">
          {decks.map((deck) => (
            <DeckRow
              countDeckCards={countDeckCards}
              deck={deck}
              getDeckLearningSettings={getDeckLearningSettings}
              getDeckStatistics={getDeckStatistics}
              key={deck.id}
              updateDeckLearningSettings={updateDeckLearningSettings}
              menuOpen={openMenuId === deck.id}
              onDelete={() => handleDeleteDeck(deck.id)}
              onPracticeAll={() => onPracticeAll(deck.id)}
              onMenuToggle={(open) => setOpenMenuId(open ? deck.id : null)}
              onOpen={() => onOpenDeck(deck)}
              onRename={(name) => handleRenameDeck(deck.id, name)}
              onStudy={() => onStudyDeck(deck.id)}
            />
          ))}
        </ul>
      ) : decks && decks.length === 0 ? (
        <p className="memora-page__empty">Your decks will appear here.</p>
      ) : null}
    </main>
  );
}
