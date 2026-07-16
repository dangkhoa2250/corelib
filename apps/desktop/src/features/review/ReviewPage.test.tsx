import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi, beforeEach } from "vitest";
import type { LearningCard } from "../../domain/learning";
import { ReviewPage } from "./ReviewPage";

const card: LearningCard = {
  id: "card-1", deckId: "english", front: "bonjour", back: "hello", state: "new",
  dueAt: "2026-07-10T00:00:00Z", reps: 0, lapses: 0, stability: null, difficulty: null,
  lastReviewAt: null, learningStep: null, tags: [], source: null, frontLanguage: null,
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

test("reveals rating buttons on card click and rates", async () => {
  const user = userEvent.setup();
  const onRate = vi.fn().mockResolvedValue(undefined);
  render(<ReviewPage cards={[card]} previews={{}} onRate={onRate} />);
  expect(screen.getAllByText("bonjour").length).toBeGreaterThan(0);
  expect(screen.queryByRole("group", { name: "Rate card" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /Flashcard/i }));
  expect(screen.getByRole("group", { name: "Rate card" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Good" }));
  expect(onRate).toHaveBeenCalledWith(card, "good", expect.any(Number));
});

test("keeps YouGlish available from the front text after the card flips", async () => {
  const user = userEvent.setup();
  const cardWithLanguage = { ...card, frontLanguage: "en" };
  render(<ReviewPage cards={[cardWithLanguage]} previews={{}} onRate={vi.fn()} />);

  await user.click(screen.getByRole("button", { name: /Flashcard/i }));

  const wordButtons = screen.getAllByRole("button", { name: "Hear 'bonjour' in YouGlish" });
  expect(wordButtons).toHaveLength(2);
  await user.click(wordButtons[1]);

  expect(screen.getByTitle("YouGlish pronunciation for bonjour")).toBeInTheDocument();
});

test("keeps an open YouGlish panel visible when the card flips", async () => {
  const user = userEvent.setup();
  const cardWithLanguage = { ...card, frontLanguage: "en" };
  render(<ReviewPage cards={[cardWithLanguage]} previews={{}} onRate={vi.fn()} />);

  await user.click(screen.getAllByRole("button", { name: "Hear 'bonjour' in YouGlish" })[0]);
  await user.click(screen.getByRole("button", { name: /Flashcard/i }));

  expect(screen.getByTitle("YouGlish pronunciation for bonjour")).toBeInTheDocument();
});

test("shows error on failed rate", async () => {
  const user = userEvent.setup();
  render(<ReviewPage cards={[card]} previews={{}} onRate={vi.fn().mockRejectedValue(new Error("offline"))} />);
  await user.click(screen.getByRole("button", { name: /Flashcard/i }));
  await user.click(screen.getByRole("button", { name: "Again" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("offline");
});

test("renders empty state", () => {
  render(<ReviewPage cards={[]} previews={{}} onRate={vi.fn()} />);
  expect(screen.getByText("Nothing due today")).toBeInTheDocument();
});

test("provides back navigation", async () => {
  const user = userEvent.setup();
  const onBack = vi.fn();
  render(<ReviewPage cards={[]} previews={{}} onRate={vi.fn()} onBack={onBack} />);
  await user.click(screen.getByRole("button", { name: "Back to Library" }));
  expect(onBack).toHaveBeenCalledOnce();
});

test("practice mode shows summary after all cards reviewed", async () => {
  const user = userEvent.setup();
  const cards = [card, { ...card, id: "card-2", front: "au revoir", back: "goodbye" }];
  render(<ReviewPage cards={cards} previews={{}} onRate={vi.fn()} mode="practice" />);
  for (let i = 0; i < cards.length; i++) {
    await user.click(screen.getByRole("button", { name: /Flashcard/i }));
    await user.click(screen.getByRole("button", { name: "Good" }));
  }
  expect(screen.getByText("Practice Complete")).toBeInTheDocument();
  expect(screen.getByText("2")).toBeInTheDocument();
});

test("shows pronunciation control on the front face", () => {
  render(<ReviewPage cards={[card]} previews={{}} onRate={vi.fn()} />);
  const buttons = screen.getAllByRole("button", { name: "Play pronunciation" });
  expect(buttons).toHaveLength(2);
});
