import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi, beforeEach } from "vitest";
import type { LearningCard, StudyGrant, StudySession } from "../../domain/learning";
import { ReviewPage } from "./ReviewPage";

const card: LearningCard = {
  id: "card-1", deckId: "english", front: "bonjour", back: "hello", state: "new",
  dueAt: "2026-07-10T00:00:00Z", reps: 0, lapses: 0, stability: null, difficulty: null,
  lastReviewAt: null, learningStep: null, tags: [], source: null, frontLanguage: null,
};

const grant: StudyGrant = {
  grantToken: "grant-1",
  expectedState: "new",
  expectedDueAt: "2026-07-10T00:00:00Z",
  card,
  preview: {
    again: { dueAt: "2026-07-16T09:01:00.000Z", intervalLabel: "1m" },
    hard: { dueAt: "2026-07-16T09:06:00.000Z", intervalLabel: "6m" },
    good: { dueAt: "2026-07-16T09:10:00.000Z", intervalLabel: "10m" },
    easy: { dueAt: "2026-07-17T09:00:00.000Z", intervalLabel: "1d" },
  },
};

const replacementGrant: StudyGrant = {
  grantToken: "grant-2",
  expectedState: "learning",
  expectedDueAt: "2026-07-16T09:05:00.000Z",
  card: { ...card, id: "card-2", front: "au revoir", back: "goodbye" },
  preview: {
    again: { dueAt: "2026-07-16T09:06:00.000Z", intervalLabel: "1m" },
    hard: { dueAt: "2026-07-16T09:11:00.000Z", intervalLabel: "6m" },
    good: { dueAt: "2026-07-16T09:15:00.000Z", intervalLabel: "10m" },
    easy: { dueAt: "2026-07-17T09:05:00.000Z", intervalLabel: "1d" },
  },
};

const studySession: StudySession = {
  sessionId: "session-1",
  scope: { kind: "all" },
  cards: [grant],
  counts: { learning: 0, review: 0, new: 1 },
  nextLearningDueAt: null,
};

beforeEach(() => {
  const mockSynth = {
    cancel: vi.fn(),
    speak: vi.fn(),
    getVoices: vi.fn().mockReturnValue([]),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    onvoiceschanged: null,
    paused: false,
    pending: false,
    speaking: false,
  };
  Object.defineProperty(window, "speechSynthesis", {
    value: mockSynth,
    writable: true,
    configurable: true,
  });
  window.SpeechSynthesisUtterance = vi.fn().mockImplementation(
    function (this: any, text: string) { this.text = text; this.lang = ""; }
  ) as unknown as typeof SpeechSynthesisUtterance;
});

afterEach(() => {
  vi.restoreAllMocks();
});

test("rates a grant and refreshes the backend queue", async () => {
  const user = userEvent.setup();
  const onRate = vi.fn().mockResolvedValue({
    card: { ...card, state: "learning", dueAt: "2026-07-16T09:01:00.000Z" },
    reviewLogId: "log-1",
  });
  const onRefresh = vi.fn().mockResolvedValue({
    ...studySession,
    cards: [],
    nextLearningDueAt: "2026-07-16T09:01:00.000Z",
  });

  render(
    <ReviewPage
      mode="study"
      session={studySession}
      onRate={onRate}
      onRefresh={onRefresh}
    />,
  );
  await user.click(screen.getByRole("button", { name: /Flashcard/i }));
  await user.click(screen.getByRole("button", { name: "Again" }));

  expect(onRate).toHaveBeenCalledWith(
    studySession.cards[0],
    "again",
    expect.any(Number),
  );
  expect(onRefresh).toHaveBeenCalledOnce();
  expect(await screen.findByText(/Next learning card/)).toBeInTheDocument();
});

test("stale ratings refresh without advancing the wrong card", async () => {
  const user = userEvent.setup();
  const onRate = vi.fn().mockRejectedValue(
    new Error("study card changed; refresh the session"),
  );
  const refreshed = {
    ...studySession,
    cards: [replacementGrant],
  };
  const onRefresh = vi.fn().mockResolvedValue(refreshed);
  render(
    <ReviewPage
      mode="study"
      session={studySession}
      onRate={onRate}
      onRefresh={onRefresh}
    />,
  );

  await user.click(screen.getByRole("button", { name: /Flashcard/i }));
  await user.click(screen.getByRole("button", { name: "Good" }));

  expect(await screen.findByText(replacementGrant.card.front)).toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent(
    "This card changed elsewhere. The study queue was refreshed.",
  );
});

test("practice labels ratings locally and never accepts a persistence callback", async () => {
  const user = userEvent.setup();
  render(<ReviewPage mode="practice" cards={[card]} />);

  expect(screen.getByText("Practice mode")).toBeInTheDocument();
  expect(screen.getByText(/does not affect your schedule/i)).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /Flashcard/i }));
  await user.click(screen.getByRole("button", { name: "Good" }));
  expect(screen.getByText("Practice Complete")).toBeInTheDocument();
});

test("practice keeps YouGlish available from the front text after the card flips", async () => {
  const user = userEvent.setup();
  const cardWithLanguage = { ...card, frontLanguage: "en" };
  render(<ReviewPage mode="practice" cards={[cardWithLanguage]} />);

  await user.click(screen.getByRole("button", { name: /Flashcard/i }));

  const wordButtons = screen.getAllByRole("button", { name: "Hear 'bonjour' in YouGlish" });
  expect(wordButtons).toHaveLength(2);
  await user.click(wordButtons[1]);

  expect(screen.getByTitle("YouGlish pronunciation for bonjour")).toBeInTheDocument();
});

test("practice keeps an open YouGlish panel visible when the card flips", async () => {
  const user = userEvent.setup();
  const cardWithLanguage = { ...card, frontLanguage: "en" };
  render(<ReviewPage mode="practice" cards={[cardWithLanguage]} />);

  await user.click(screen.getAllByRole("button", { name: "Hear 'bonjour' in YouGlish" })[0]);
  await user.click(screen.getByRole("button", { name: /Flashcard/i }));

  expect(screen.getByTitle("YouGlish pronunciation for bonjour")).toBeInTheDocument();
});

test("practice renders empty state", () => {
  render(<ReviewPage mode="practice" cards={[]} />);
  expect(screen.getByText("Practice Complete")).toBeInTheDocument();
});

test("practice provides back navigation", async () => {
  const user = userEvent.setup();
  const onBack = vi.fn();
  render(<ReviewPage mode="practice" cards={[]} onBack={onBack} />);
  await user.click(screen.getByRole("button", { name: "Back to Deck" }));
  expect(onBack).toHaveBeenCalledOnce();
});

test("practice mode shows summary after all cards reviewed", async () => {
  const user = userEvent.setup();
  const cards = [card, { ...card, id: "card-2", front: "au revoir", back: "goodbye" }];
  render(<ReviewPage mode="practice" cards={cards} />);
  for (let i = 0; i < cards.length; i++) {
    await user.click(screen.getByRole("button", { name: /Flashcard/i }));
    await user.click(screen.getByRole("button", { name: "Good" }));
  }
  expect(screen.getByText("Practice Complete")).toBeInTheDocument();
  expect(screen.getByText("2")).toBeInTheDocument();
});

test("practice shows pronunciation control on the front face", () => {
  render(<ReviewPage mode="practice" cards={[card]} />);
  const buttons = screen.getAllByRole("button", { name: "Play pronunciation" });
  expect(buttons).toHaveLength(2);
});

test("practice never renders interval labels", async () => {
  const user = userEvent.setup();
  render(<ReviewPage mode="practice" cards={[card]} />);
  await user.click(screen.getByRole("button", { name: /Flashcard/i }));
  expect(screen.queryByText("10m")).not.toBeInTheDocument();
});
