import { act, fireEvent, render, screen } from "@testing-library/react";
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
  vi.useRealTimers();
  vi.restoreAllMocks();
});

test("study shows a per-card timer and resets it for a replacement session", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-17T00:00:00.000Z"));
  const { rerender } = render(
    <ReviewPage
      mode="study"
      session={studySession}
      onRate={vi.fn()}
      onRefresh={vi.fn()}
    />,
  );

  expect(screen.getByText("0s")).toHaveClass("review-page__elapsed");
  act(() => vi.advanceTimersByTime(2_000));
  expect(screen.getByText("2s")).toHaveClass("review-page__elapsed");

  rerender(
    <ReviewPage
      mode="study"
      session={{ ...studySession, sessionId: "session-2" }}
      onRate={vi.fn()}
      onRefresh={vi.fn()}
    />,
  );
  expect(screen.getByText("0s")).toHaveClass("review-page__elapsed");
});

test("practice resets its visible timer for each card", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-17T00:00:00.000Z"));
  render(<ReviewPage mode="practice" cards={[card, replacementGrant.card]} />);

  act(() => vi.advanceTimersByTime(2_000));
  expect(screen.getByText("2s")).toHaveClass("review-page__elapsed");

  fireEvent.click(screen.getByRole("button", { name: "Flashcard" }));
  fireEvent.click(screen.getByRole("button", { name: "Good" }));

  expect(screen.getByText("0s")).toHaveClass("review-page__elapsed");
});

test("study and practice share the same two-face flip structure", async () => {
  const user = userEvent.setup();
  const { unmount } = render(
    <ReviewPage
      mode="study"
      session={studySession}
      onRate={vi.fn()}
      onRefresh={vi.fn()}
    />,
  );

  const studyCard = screen.getByRole("button", { name: "Flashcard" });
  expect(studyCard.querySelectorAll(".review-page__card-face--front")).toHaveLength(1);
  expect(studyCard.querySelectorAll(".review-page__card-face--back")).toHaveLength(1);

  await user.click(studyCard);
  expect(studyCard).toHaveClass("review-page__card--flipped");
  expect(screen.getByRole("group", { name: "Rate card" })).toBeInTheDocument();

  unmount();
  render(<ReviewPage mode="practice" cards={[card]} />);
  const practiceCard = screen.getByRole("button", { name: "Flashcard" });
  expect(practiceCard.querySelectorAll(".review-page__card-face--front")).toHaveLength(1);
  expect(practiceCard.querySelectorAll(".review-page__card-face--back")).toHaveLength(1);
});

test("lowers the waiting review state without moving the nothing-due state", () => {
  const onRate = vi.fn();
  const onRefresh = vi.fn();
  const { rerender } = render(
    <ReviewPage
      mode="study"
      session={{ ...studySession, cards: [], nextLearningDueAt: "2026-07-17T01:00:00.000Z" }}
      onRate={onRate}
      onRefresh={onRefresh}
    />,
  );

  expect(screen.getByRole("main")).toHaveClass("review-page--lowered");

  rerender(
    <ReviewPage
      mode="study"
      session={{ ...studySession, cards: [], nextLearningDueAt: null }}
      onRate={onRate}
      onRefresh={onRefresh}
    />,
  );

  expect(screen.getByRole("main")).not.toHaveClass("review-page--lowered");
});

test("lowers the practice-complete state", () => {
  render(<ReviewPage mode="practice" cards={[]} />);

  expect(screen.getByRole("main")).toHaveClass("review-page--lowered");
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
    studySession.sessionId,
    studySession.cards[0],
    "again",
    expect.any(Number),
  );
  expect(onRefresh).toHaveBeenCalledWith(studySession.sessionId);
  expect(await screen.findByText(/Next learning card/)).toBeInTheDocument();
});

test("stale ratings show an error without refreshing the queue", async () => {
  const user = userEvent.setup();
  const onRate = vi.fn().mockRejectedValue(
    new Error("study card changed; refresh the session"),
  );
  const onRefresh = vi.fn();
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

  expect(screen.getByRole("alert")).toHaveTextContent(
    "This card changed elsewhere. Leave this session and start again.",
  );
  expect(onRefresh).not.toHaveBeenCalled();
});

test("practice labels ratings locally and never accepts a persistence callback", async () => {
  const user = userEvent.setup();
  render(<ReviewPage mode="practice" cards={[card]} />);

  expect(screen.getByRole("heading", { name: "Practice" })).toBeInTheDocument();
  expect(screen.queryByText(/does not affect your schedule/i)).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /Flashcard/i }));
  await user.click(screen.getByRole("button", { name: "Good" }));
  expect(screen.getByText("Practice Complete")).toBeInTheDocument();
});

test("does not offer manual refresh controls", () => {
  const onRate = vi.fn();
  const onRefresh = vi.fn();
  const { rerender } = render(
    <ReviewPage mode="study" session={studySession} onRate={onRate} onRefresh={onRefresh} />,
  );
  expect(screen.queryByRole("button", { name: "Refresh now" })).not.toBeInTheDocument();

  rerender(
    <ReviewPage
      mode="study"
      session={{ ...studySession, cards: [], nextLearningDueAt: null }}
      onRate={onRate}
      onRefresh={onRefresh}
    />,
  );
  expect(screen.queryByRole("button", { name: "Refresh now" })).not.toBeInTheDocument();
});

test("waits for the due time only when the visible queue is empty", async () => {
  const dueNow = new Date(Date.now() - 1).toISOString();
  const onRefreshWithCard = vi.fn().mockResolvedValue(studySession);
  const { rerender } = render(
    <ReviewPage
      mode="study"
      session={{ ...studySession, nextLearningDueAt: dueNow }}
      onRate={vi.fn()}
      onRefresh={onRefreshWithCard}
    />,
  );
  await new Promise((resolve) => window.setTimeout(resolve, 300));
  expect(onRefreshWithCard).not.toHaveBeenCalled();

  const replacement = { ...studySession, sessionId: "session-2", cards: [replacementGrant] };
  const onRefreshEmpty = vi.fn().mockResolvedValue(replacement);
  rerender(
    <ReviewPage
      mode="study"
      session={{ ...studySession, cards: [], nextLearningDueAt: dueNow }}
      onRate={vi.fn()}
      onRefresh={onRefreshEmpty}
    />,
  );
  expect(await screen.findAllByText(replacementGrant.card.front)).toHaveLength(2);
  expect(onRefreshEmpty).toHaveBeenCalledWith(studySession.sessionId);
});

test("rates with the replacement session id after an automatic refresh", async () => {
  const dueNow = new Date(Date.now() - 1).toISOString();
  const replacement = { ...studySession, sessionId: "session-2", cards: [replacementGrant] };
  const onRate = vi.fn().mockResolvedValue({ card: replacementGrant.card, reviewLogId: "log-2" });
  render(
    <ReviewPage
      mode="study"
      session={{ ...studySession, cards: [], nextLearningDueAt: dueNow }}
      onRate={onRate}
      onRefresh={vi.fn().mockResolvedValue(replacement)}
    />,
  );

  await userEvent.click(await screen.findByRole("button", { name: /Flashcard/i }));
  await userEvent.click(screen.getByRole("button", { name: "Good" }));
  expect(onRate).toHaveBeenCalledWith(
    replacement.sessionId,
    replacementGrant,
    "good",
    expect.any(Number),
  );
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
