import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";

import type { NewCardSource } from "../reader/readerSelection";
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

test("requires both card sides before it saves", async () => {
  const { onSave, user } = renderComposer();

  await user.click(screen.getByRole("button", { name: "Save" }));

  expect(screen.getByRole("alert")).toHaveTextContent("Front and Back are required.");
  expect(onSave).not.toHaveBeenCalled();
});

test("rejects saving a card with a blank source document id", async () => {
  const { onSave, user } = renderComposer({
    draft: { ...draft, documentId: " \n" },
  });

  await user.type(screen.getByRole("textbox", { name: "Back" }), "A set with vector operations.");
  await user.click(screen.getByRole("button", { name: "Save" }));

  expect(screen.getByRole("alert")).toHaveTextContent("Source document is required.");
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

test("prevents a second save while the first one is pending", async () => {
  const pendingSave = deferred<void>();
  const onSave = vi.fn().mockReturnValue(pendingSave.promise);
  const { user } = renderComposer({ onSave });

  await user.type(screen.getByRole("textbox", { name: "Back" }), "A set with vector operations.");
  await user.click(screen.getByRole("button", { name: "Save" }));
  await user.click(screen.getByRole("button", { name: "Saving…" }));

  expect(onSave).toHaveBeenCalledTimes(1);

  pendingSave.resolve();
  await waitFor(() => {
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });
});
