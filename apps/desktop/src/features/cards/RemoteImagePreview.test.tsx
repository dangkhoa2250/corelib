import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { RemoteImagePreview } from "./RemoteImagePreview";

afterEach(() => vi.restoreAllMocks());

test("renders backend preview bytes as a local object URL and revokes it on replacement", async () => {
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:preview");
  const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  const fetchPreview = vi.fn().mockResolvedValue({ mimeType: "image/png", dataBase64: "aGk=" });
  const { rerender, unmount } = render(<RemoteImagePreview url="https://example.test/a" fetchPreview={fetchPreview} />);
  await waitFor(() => expect(document.querySelector("img")).toHaveAttribute("src", "blob:preview"));
  rerender(<RemoteImagePreview url="https://example.test/b" fetchPreview={fetchPreview} />);
  await waitFor(() => expect(revoke).toHaveBeenCalledWith("blob:preview"));
  unmount();
});

test("revokes a preview URL created after unmount before state can commit", async () => {
  let resolve!: (value: { mimeType: string; dataBase64: string }) => void;
  const pending = new Promise<{ mimeType: string; dataBase64: string }>((done) => { resolve = done; });
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:late");
  const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  const { unmount } = render(<RemoteImagePreview url="late" fetchPreview={() => pending} />);
  unmount();
  resolve({ mimeType: "image/png", dataBase64: "aGk=" });
  await waitFor(() => expect(revoke).toHaveBeenCalledWith("blob:late"));
});

test("shows a harmless fallback when backend preview fails", async () => {
  render(<RemoteImagePreview url="https://example.test/bad" fetchPreview={vi.fn().mockRejectedValue(new Error("offline"))} />);
  expect(await screen.findByText("Image preview unavailable")).toBeInTheDocument();
});

test("falls back to the original image when a provider thumbnail is unavailable", async () => {
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:original");
  const fetchPreview = vi.fn()
    .mockRejectedValueOnce(new Error("thumbnail unavailable"))
    .mockResolvedValueOnce({ mimeType: "image/jpeg", dataBase64: "aGk=" });

  render(
    <RemoteImagePreview
      url="https://api.openverse.test/thumb"
      fallbackUrl="https://images.test/original.jpg"
      fetchPreview={fetchPreview}
    />,
  );

  await waitFor(() => expect(document.querySelector("img")).toHaveAttribute("src", "blob:original"));
  expect(fetchPreview).toHaveBeenNthCalledWith(1, "https://api.openverse.test/thumb");
  expect(fetchPreview).toHaveBeenNthCalledWith(2, "https://images.test/original.jpg");
});
