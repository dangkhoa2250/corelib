import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";

import type { PixabayImage } from "../../domain/media";
import { MediaPicker } from "./MediaPicker";

const image = (overrides: Partial<PixabayImage> = {}): PixabayImage => ({
  id: 1,
  pageUrl: "https://pixabay.com/photos/1",
  previewUrl: "https://cdn.pixabay.com/preview-1.jpg",
  imageUrl: "https://cdn.pixabay.com/full-1.jpg",
  previewWidth: 150,
  previewHeight: 100,
  width: 640,
  height: 427,
  tags: "algebra, board",
  user: "JaneDoe",
  userId: 42,
  mediaType: "photo",
  ...overrides,
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function renderPicker(overrides: Partial<React.ComponentProps<typeof MediaPicker>> = {}) {
  const props: React.ComponentProps<typeof MediaPicker> = {
    frontText: "algebra",
    hasKey: true,
    onSearch: vi.fn().mockResolvedValue([]),
    onStage: vi.fn().mockResolvedValue({ mediaId: "media-1", alt: "algebra" }),
    ...overrides,
  };
  const utils = render(<MediaPicker {...props} />);
  return { onSearch: props.onSearch, onStage: props.onStage, user: userEvent.setup(), utils };
}

test("auto-searches the front text and shows attribution on results", async () => {
  const { onSearch } = renderPicker({
    onSearch: vi.fn().mockResolvedValue([image()]),
  });

  await waitFor(() => expect(onSearch).toHaveBeenCalledWith("algebra", 1));
  const result = await screen.findByRole("button", { name: /Photo by JaneDoe on Pixabay/i });
  expect(result.querySelector("img")).toHaveAttribute("src", "https://cdn.pixabay.com/preview-1.jpg");
});

test("does not search and shows a settings CTA when no key is configured", async () => {
  const onSearch = vi.fn().mockResolvedValue([]);
  const onClose = vi.fn();
  renderPicker({ hasKey: false, onSearch, onClose });

  expect(screen.getByText(/Settings › Media/i)).toBeInTheDocument();
  expect(onSearch).not.toHaveBeenCalled();

  await userEvent.setup().click(screen.getByRole("button", { name: /Add a Pixabay API key/i }));
  expect(onClose).toHaveBeenCalledExactlyOnceWith();
});

test("shows a loading state while the search is in flight", async () => {
  const pending = deferred<PixabayImage[]>();
  renderPicker({ onSearch: vi.fn().mockReturnValue(pending.promise) });

  expect(screen.getByText(/Loading Pixabay images/i)).toBeInTheDocument();

  pending.resolve([image()]);
  expect(await screen.findByRole("button", { name: /Photo by JaneDoe on Pixabay/i })).toBeInTheDocument();
});

test("shows an empty state when the search returns no results", async () => {
  renderPicker({ onSearch: vi.fn().mockResolvedValue([]) });

  expect(await screen.findByText(/No images found/i)).toBeInTheDocument();
});

test("surfaces a search failure with a retry that re-searches page one", async () => {
  const user = userEvent.setup();
  const onSearch = vi
    .fn()
    .mockRejectedValueOnce(new Error("Rate limited"))
    .mockResolvedValueOnce([image()]);
  renderPicker({ onSearch });

  expect(await screen.findByRole("alert")).toHaveTextContent("Rate limited");
  await user.click(screen.getByRole("button", { name: /Retry search/i }));

  expect(await screen.findByRole("button", { name: /Photo by JaneDoe on Pixabay/i })).toBeInTheDocument();
  expect(onSearch).toHaveBeenCalledTimes(2);
});

test("stages a chosen result through onStage", async () => {
  const user = userEvent.setup();
  const onStage = vi.fn().mockResolvedValue({ mediaId: "media-1", alt: "algebra" });
  renderPicker({ onStage, onSearch: vi.fn().mockResolvedValue([image()]) });

  await user.click(await screen.findByRole("button", { name: /Photo by JaneDoe on Pixabay/i }));

  await waitFor(() => expect(onStage).toHaveBeenCalledWith(image()));
});

test("shows a per-result download failure and retries only that result", async () => {
  const user = userEvent.setup();
  const first = image();
  const second = image({ id: 2, user: "Bob" });
  const onStage = vi
    .fn()
    .mockRejectedValueOnce(new Error("Download failed"))
    .mockResolvedValue({ mediaId: "media-1", alt: "algebra" });
  renderPicker({ onStage, onSearch: vi.fn().mockResolvedValue([first, second]) });

  const firstCard = (await screen.findByRole("button", { name: /Photo by JaneDoe on Pixabay/i }))
    .closest("[data-media-result]") as HTMLElement;
  await user.click(screen.getByRole("button", { name: /Photo by JaneDoe on Pixabay/i }));

  expect(await within(firstCard).findByText("Download failed")).toBeInTheDocument();
  const retry = within(firstCard).getByRole("button", { name: /Retry download/i });

  await user.click(retry);
  await waitFor(() => expect(onStage).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(within(firstCard).queryByText("Download failed")).not.toBeInTheDocument());
  // The other result is untouched by the failed stage.
  const secondCard = (screen.getByRole("button", { name: /Photo by Bob on Pixabay/i }))
    .closest("[data-media-result]") as HTMLElement;
  expect(within(secondCard).queryByText("Download failed")).not.toBeInTheDocument();
});

test("loads the next page and appends results", async () => {
  const user = userEvent.setup();
  const onSearch = vi
    .fn()
    .mockResolvedValueOnce([image()])
    .mockResolvedValueOnce([image({ id: 2, user: "Bob" })]);
  renderPicker({ onSearch });

  await user.click(await screen.findByRole("button", { name: /Load more/i }));

  await waitFor(() => expect(onSearch).toHaveBeenCalledWith("algebra", 2));
  expect(await screen.findByRole("button", { name: /Photo by Bob on Pixabay/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Photo by JaneDoe on Pixabay/i })).toBeInTheDocument();
});

test("hides Load more while the next page is loading", async () => {
  const user = userEvent.setup();
  const pending = deferred<PixabayImage[]>();
  const onSearch = vi
    .fn()
    .mockResolvedValueOnce([image()])
    .mockReturnValueOnce(pending.promise);
  renderPicker({ onSearch });

  await user.click(await screen.findByRole("button", { name: /Load more/i }));
  expect(screen.queryByRole("button", { name: /Load more/i })).not.toBeInTheDocument();

  pending.resolve([]);
  await waitFor(() => expect(screen.getByRole("button", { name: /Load more/i })).toBeInTheDocument());
});
