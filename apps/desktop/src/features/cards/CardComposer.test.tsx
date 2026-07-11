import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";

import type { CardSource, NewCardSource } from "../reader/readerSelection";
import { CardComposer } from "./CardComposer";

const draft: NewCardSource = {
  documentId: "linear-algebra",
  page: 12,
  quote: "A vector space is closed under addition.",
  rects: [{ x: 12, y: 24, width: 180, height: 16 }],
};

const decks = [
  {
    id: "math",
    name: "Mathematics",
    description: "Linear algebra notes",
    color: "#007aff",
    archived: false,
  },
  {
    id: "language",
    name: "Language",
    description: null,
    color: null,
    archived: false,
  },
];

function renderComposer(overrides: Partial<React.ComponentProps<typeof CardComposer>> = {}) {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const onCancel = vi.fn();
  const user = userEvent.setup();
  render(
    <CardComposer
      draft={draft}
      decks={decks}
      onSave={onSave}
      onCancel={onCancel}
      {...overrides}
    />,
  );
  return { onSave, onCancel, user };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

test("prefills the front from the selection and lets both card sides be edited", async () => {
  const { user } = renderComposer();
  const front = screen.getByRole("textbox", { name: "Front" });
  const back = screen.getByRole("textbox", { name: "Back" });

  expect(front).toHaveValue(draft.quote);
  expect(back).toHaveValue("");

  await user.clear(front);
  await user.type(front, "What is a vector space?");
  await user.type(back, "A set closed under vector addition and scalar multiplication.");

  expect(front).toHaveValue("What is a vector space?");
  expect(back).toHaveValue("A set closed under vector addition and scalar multiplication.");
});

test("translates the selected text into the back field", async () => {
  const onTranslate = vi.fn().mockResolvedValue("Tôi đã định gọi cho bạn.");
  const { user } = renderComposer({ onTranslate });

  await user.click(screen.getByRole("button", { name: "Translate" }));

  expect(onTranslate).toHaveBeenCalledWith(draft.quote);
  expect(await screen.findByRole("textbox", { name: "Back" })).toHaveValue("Tôi đã định gọi cho bạn.");
});

test("keeps the composer usable when translation fails", async () => {
  const { user } = renderComposer({ onTranslate: vi.fn().mockRejectedValue(new Error("No default AI provider")) });

  await user.click(screen.getByRole("button", { name: "Translate" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("No default AI provider");
  expect(screen.getByRole("textbox", { name: "Back" })).toBeEnabled();
});

test("hydrates the first loaded deck when the composer opened before decks resolved", async () => {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const onCancel = vi.fn();
  const user = userEvent.setup();
  const view = render(
    <CardComposer
      draft={draft}
      decks={[]}
      onSave={onSave}
      onCancel={onCancel}
    />,
  );

  expect(screen.getByRole("combobox", { name: "Deck" })).toHaveValue("__new_deck__");

  view.rerender(
    <CardComposer
      draft={draft}
      decks={[decks[0]]}
      onSave={onSave}
      onCancel={onCancel}
    />,
  );

  await waitFor(() => {
    expect(screen.getByRole("combobox", { name: "Deck" })).toHaveValue("math");
  });
  await user.type(screen.getByRole("textbox", { name: "Back" }), "A set with vector operations.");
  await user.click(screen.getByRole("button", { name: "Save" }));

  expect(onSave).toHaveBeenCalledExactlyOnceWith({
    deckName: "Mathematics",
    front: draft.quote,
    back: "A set with vector operations.",
    source: draft,
    tags: [],
  });
});

test("does not replace an explicit new deck choice when decks finish loading", async () => {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const onCancel = vi.fn();
  const user = userEvent.setup();
  const view = render(
    <CardComposer
      draft={draft}
      decks={decks}
      onSave={onSave}
      onCancel={onCancel}
    />,
  );

  await user.selectOptions(screen.getByRole("combobox", { name: "Deck" }), "__new_deck__");
  view.rerender(
    <CardComposer
      draft={draft}
      decks={[decks[0]]}
      onSave={onSave}
      onCancel={onCancel}
    />,
  );

  expect(screen.getByRole("combobox", { name: "Deck" })).toHaveValue("__new_deck__");
  expect(screen.getByRole("textbox", { name: "New deck name" })).toBeInTheDocument();
});

test("requires both card sides before it saves", async () => {
  const { onSave, user } = renderComposer();

  await user.click(screen.getByRole("button", { name: "Save" }));

  expect(screen.getByRole("alert")).toHaveTextContent("Front and Back are required.");
  expect(onSave).not.toHaveBeenCalled();
});

test("disables saving and explains when the selected source is no longer available", () => {
  const missingSource: CardSource = { ...draft, documentId: null };
  const { onSave } = renderComposer({ draft: missingSource });

  expect(screen.getByRole("alert")).toHaveTextContent("Source document is no longer available.");
  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  expect(onSave).not.toHaveBeenCalled();
});

test("saves the selected source, chosen deck, and comma-separated tags", async () => {
  const { onSave, user } = renderComposer();

  await user.selectOptions(screen.getByRole("combobox", { name: "Deck" }), "language");
  await user.clear(screen.getByRole("textbox", { name: "Front" }));
  await user.type(screen.getByRole("textbox", { name: "Front" }), "What is a vector space?");
  await user.type(screen.getByRole("textbox", { name: "Back" }), "A set with vector operations.");
  await user.type(screen.getByRole("textbox", { name: "Tags" }), "algebra, definition, algebra");
  await user.click(screen.getByRole("button", { name: "Save" }));

  expect(onSave).toHaveBeenCalledExactlyOnceWith({
    deckName: "Language",
    front: "What is a vector space?",
    back: "A set with vector operations.",
    source: draft,
    tags: ["algebra", "definition"],
  });
});

test("keeps the composer open and exposes a failure when saving is rejected", async () => {
  const onSave = vi.fn().mockRejectedValue(new Error("Card storage is unavailable"));
  const { user } = renderComposer({ onSave });

  await user.type(screen.getByRole("textbox", { name: "Back" }), "A set with vector operations.");
  await user.click(screen.getByRole("button", { name: "Save" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Card storage is unavailable");
  expect(screen.getByRole("dialog", { name: "Create flashcard" })).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Back" })).toHaveValue("A set with vector operations.");
});

test("submits a new deck through the atomic card save transaction after a failed retry", async () => {
  const committedDecks: string[] = [];
  let attempts = 0;
  const onSave = vi.fn(async ({ deckName }: { deckName: string }) => {
    attempts += 1;
    if (attempts === 1) {
      throw new Error("Card storage is unavailable");
    }
    committedDecks.push(deckName);
  });
  const { onCancel, user } = renderComposer({ onSave });

  await user.selectOptions(screen.getByRole("combobox", { name: "Deck" }), "__new_deck__");
  await user.type(screen.getByRole("textbox", { name: "New deck name" }), "English vocabulary");
  await user.type(screen.getByRole("textbox", { name: "Back" }), "A set with vector operations.");

  await user.click(screen.getByRole("button", { name: "Save" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Card storage is unavailable");
  expect(committedDecks).toEqual([]);

  await user.click(screen.getByRole("button", { name: "Save" }));

  await waitFor(() => {
    expect(onCancel).toHaveBeenCalledExactlyOnceWith();
  });
  expect(onSave).toHaveBeenCalledTimes(2);
  expect(committedDecks).toEqual(["English vocabulary"]);
});

test("closes through onCancel and cannot submit a successful card twice", async () => {
  const { onCancel, onSave, user } = renderComposer();

  await user.type(screen.getByRole("textbox", { name: "Back" }), "A set with vector operations.");
  await user.click(screen.getByRole("button", { name: "Save" }));

  await waitFor(() => {
    expect(onCancel).toHaveBeenCalledExactlyOnceWith();
  });
  expect(screen.queryByRole("dialog", { name: "Create flashcard" })).not.toBeInTheDocument();
  expect(onSave).toHaveBeenCalledExactlyOnceWith(expect.any(Object));
});

test("keeps keyboard focus in the modal and cancels from Escape", async () => {
  const { onCancel, user } = renderComposer();
  const front = screen.getByRole("textbox", { name: "Front" });
  const deck = screen.getByRole("combobox", { name: "Deck" });
  const save = screen.getByRole("button", { name: "Save" });

  expect(front).toHaveFocus();

  save.focus();
  await user.tab();
  expect(deck).toHaveFocus();
  await user.tab({ shift: true });
  expect(save).toHaveFocus();

  await user.keyboard("{Escape}");
  expect(onCancel).toHaveBeenCalledExactlyOnceWith();
});

test("prevents a second save while the first one is pending", async () => {
  const pendingSave = deferred<void>();
  const onSave = vi.fn().mockReturnValue(pendingSave.promise);
  const { onCancel, user } = renderComposer({ onSave });

  await user.type(screen.getByRole("textbox", { name: "Back" }), "A set with vector operations.");
  await user.click(screen.getByRole("button", { name: "Save" }));
  await user.click(screen.getByRole("button", { name: "Saving…" }));

  expect(onSave).toHaveBeenCalledTimes(1);

  pendingSave.resolve();
  await waitFor(() => {
    expect(onCancel).toHaveBeenCalledExactlyOnceWith();
  });
  expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
});

test("offers a pronunciation button beside the Front label", () => {
  renderComposer();
  expect(screen.getByRole("button", { name: "Play pronunciation" })).toBeInTheDocument();
});
