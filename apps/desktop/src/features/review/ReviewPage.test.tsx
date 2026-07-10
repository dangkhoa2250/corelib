import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import type { LearningCard, ReviewPreview } from "../../domain/learning";
import { ReviewPage } from "./ReviewPage";

const card: LearningCard = {
  id: "card-1", deckId: "english", front: "bonjour", back: "hello", state: "new",
  dueAt: "2026-07-10T00:00:00Z", reps: 0, lapses: 0, stability: null, difficulty: null,
  lastReviewAt: null, tags: [], source: { documentId: "book-1", page: 4, quote: "bonjour", rects: [] },
};
const preview: ReviewPreview = {
  again: { dueAt: "", intervalLabel: "1m" }, hard: { dueAt: "", intervalLabel: "6m" },
  good: { dueAt: "", intervalLabel: "1d" }, easy: { dueAt: "", intervalLabel: "4d" },
};

test("reveals back, shows elapsed timer, and rates Good", async () => {
  const user = userEvent.setup();
  const onRate = vi.fn().mockResolvedValue(undefined);
  render(<ReviewPage cards={[card]} previews={{ [card.id]: preview }} onRate={onRate} onShowSource={vi.fn()} />);
  expect(screen.getByRole("heading", { name: "Review today" })).toBeInTheDocument();
  expect(screen.getByText("bonjour")).toBeInTheDocument();
  expect(screen.queryByText("hello")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /Show answer/i }));
  expect(screen.getByText("hello")).toBeInTheDocument();
  expect(screen.getByText(/Elapsed/)).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Good 1d" }));
  expect(onRate).toHaveBeenCalledWith(card, "good", expect.any(Number));
});

test("keeps card visible and reports a failed rating", async () => {
  const user = userEvent.setup();
  render(<ReviewPage cards={[card]} previews={{ [card.id]: preview }} onRate={vi.fn().mockRejectedValue(new Error("offline"))} onShowSource={vi.fn()} />);
  await user.click(screen.getByRole("button", { name: /Show answer/i }));
  await user.click(screen.getByRole("button", { name: "Again 1m" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("offline");
  expect(screen.getByText("bonjour")).toBeInTheDocument();
});

test("alerts when source is unavailable", async () => {
  const user = userEvent.setup();
  const unavailable = { ...card, source: null };
  render(<ReviewPage cards={[unavailable]} previews={{ [card.id]: preview }} onRate={vi.fn()} onShowSource={vi.fn()} />);
  await user.click(screen.getByRole("button", { name: /Show source/i }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Source is unavailable");
});

test("renders empty state", () => {
  render(<ReviewPage cards={[]} previews={{}} onRate={vi.fn()} onShowSource={vi.fn()} />);
  expect(screen.getByText("Nothing due today")).toBeInTheDocument();
});
