import { useEffect, useState } from "react";

import { ActionMenu } from "../../components/ActionMenu";
import { Button } from "../../components/Button";
import type { Deck, LearningCard, DeckStatistics } from "../../domain/learning";

interface MemoraPageProps {
  listDecks: () => Promise<Deck[]>;
  listDueCards: () => Promise<LearningCard[]>;
  onReviewToday: () => void;
  createDeck: (name: string) => Promise<Deck>;
  renameDeck: (id: string, name: string) => Promise<Deck>;
  deleteDeck: (id: string) => Promise<void>;
  countDeckCards: (id: string) => Promise<number>;
  getDeckStatistics: (deckId: string) => Promise<DeckStatistics>;
  onOpenDeck: (deck: Deck) => void;
  onStudyDeck: (deckId: string) => void;
  onPracticeAll: (deckId: string) => void;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

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
}

function DeckRow({ deck, menuOpen, onMenuToggle, onOpen, onRename, onDelete, onStudy, onPracticeAll, countDeckCards, getDeckStatistics: fetchStats }: DeckRowProps) {
  const [mode, setMode] = useState<"idle" | "rename" | "delete">("idle");
  const [nameValue, setNameValue] = useState(deck.name);
  const [saving, setSaving] = useState(false);
  const [cardCount, setCardCount] = useState<number | null>(null);
  const [stats, setStats] = useState<DeckStatistics | null>(null);

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
          <button disabled={saving || !nameValue.trim()} type="submit">
            Save
          </button>
          <button onClick={() => { setNameValue(deck.name); setMode("idle"); }} type="button">
            Cancel
          </button>
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
          <button
            className="memora-deck-list__delete-confirm"
            disabled={saving}
            onClick={() => {
              setSaving(true);
              void onDelete().finally(() => {
                setSaving(false);
                setMode("idle");
              });
            }}
            type="button"
          >
            Delete
          </button>
          <button disabled={saving} onClick={() => setMode("idle")} type="button">
            Cancel
          </button>
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
          { label: "Review Due", disabled: !stats?.dueCards, onSelect: onStudy },
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
    </li>
  );
}

export function MemoraPage({ listDecks, listDueCards, onReviewToday, createDeck, renameDeck, deleteDeck, countDeckCards, getDeckStatistics, onOpenDeck, onStudyDeck, onPracticeAll }: MemoraPageProps) {
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
    Promise.all([listDecks(), listDueCards()])
      .then(([loadedDecks, dueCards]) => {
        if (!active) return;
        setDecks(loadedDecks);
        setDueCount(dueCards.length);
      })
      .catch((loadError) => {
        if (active) setError(errorMessage(loadError));
      });
    return () => {
      active = false;
    };
  }, [listDecks, listDueCards]);

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
          {creatingDeck ? (
            <form
              className="memora-new-deck"
              onSubmit={(event) => {
                event.preventDefault();
                submitNewDeck();
              }}
            >
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
                placeholder="Deck name"
                value={newDeckName}
              />
              <button disabled={saving || !newDeckName.trim()} type="submit">
                Create
              </button>
              <button
                onClick={() => {
                  setCreatingDeck(false);
                  setNewDeckName("");
                }}
                type="button"
              >
                Cancel
              </button>
            </form>
          ) : (
            <Button onClick={() => setCreatingDeck(true)}>New Deck</Button>
          )}
          <Button
            disabled={!dueCount}
            onClick={onReviewToday}
          >
            {dueCount ? `Review ${dueCount} Ready` : "Review"}
          </Button>
        </div>
      </header>
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
              getDeckStatistics={getDeckStatistics}
              key={deck.id}
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
