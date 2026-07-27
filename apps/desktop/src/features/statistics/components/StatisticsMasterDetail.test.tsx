import type { ComponentProps } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { StatisticsMasterDetail } from "./StatisticsMasterDetail";

const items = [
  {
    id: "atomic",
    label: "Atomic Habits",
    description: "James Clear",
    meta: "48% read",
    searchText: "Atomic Habits James Clear",
  },
  {
    id: "deep-work",
    label: "Deep Work",
    description: "Cal Newport",
    meta: "36% read",
    searchText: "Deep Work Cal Newport",
  },
];

type MasterDetailProps = ComponentProps<typeof StatisticsMasterDetail>;

function renderMasterDetail(overrides: Partial<MasterDetailProps> = {}) {
  const props: MasterDetailProps = {
    allLabel: "All Reading",
    ariaLabel: "Reading statistics scopes",
    searchLabel: "Search books",
    noResultsLabel: "No books found",
    items,
    selectedId: null,
    onSelect: vi.fn(),
    listState: "loaded",
    children: <p>right panel</p>,
    ...overrides,
  };
  return render(<StatisticsMasterDetail {...props} />);
}

test("keeps All scope visible and filters entities by local metadata", async () => {
  const user = userEvent.setup();
  render(
    <StatisticsMasterDetail
      allLabel="All Reading"
      ariaLabel="Reading statistics scopes"
      searchLabel="Search books"
      noResultsLabel="No books found"
      items={items}
      selectedId={null}
      onSelect={vi.fn()}
    >
      <p>right panel</p>
    </StatisticsMasterDetail>,
  );

  const navigation = screen.getByRole("navigation", {
    name: "Reading statistics scopes",
  });
  expect(within(navigation).getByRole("button", { name: "All Reading" }))
    .toHaveAttribute("aria-current", "page");
  await user.type(screen.getByRole("searchbox", { name: "Search books" }), "cal");
  expect(within(navigation).queryByRole("button", { name: /Atomic Habits/ }))
    .toBeNull();
  expect(within(navigation).getByRole("button", { name: /Deep Work/ }))
    .toBeInTheDocument();
  expect(within(navigation).getByRole("button", { name: "All Reading" }))
    .toBeInTheDocument();
});

test("selects an entity without unmounting the workspace", async () => {
  const user = userEvent.setup();
  const onSelect = vi.fn();
  render(
    <StatisticsMasterDetail
      allLabel="All Reading"
      ariaLabel="Reading statistics scopes"
      searchLabel="Search books"
      noResultsLabel="No books found"
      items={items}
      selectedId={null}
      onSelect={onSelect}
    >
      <p>right panel</p>
    </StatisticsMasterDetail>,
  );

  const navigation = screen.getByRole("navigation", {
    name: "Reading statistics scopes",
  });
  await user.click(
    within(navigation).getByRole("button", { name: /Atomic Habits/ }),
  );
  expect(onSelect).toHaveBeenCalledWith("atomic");
  expect(screen.getByText("right panel")).toBeInTheDocument();
});

test("maps the collapsed searchable picker back to All scope", async () => {
  const user = userEvent.setup();
  const onSelect = vi.fn();
  renderMasterDetail({ selectedId: "atomic", onSelect });

  await user.click(screen.getByRole("combobox", {
    name: "Reading statistics scopes",
  }));
  await user.click(screen.getByRole("option", { name: "All Reading" }));

  expect(onSelect).toHaveBeenCalledWith(null);
});

test("uses ScrollArea and reserves the custom thumb inset", () => {
  renderMasterDetail();
  expect(screen.getByTestId("statistics-entity-scroll-area"))
    .toHaveStyle({ overflow: "hidden" });
  expect(screen.getByTestId("statistics-entity-scroll-content"))
    .toHaveClass("statistics-entity-pane__scroll-content");
});

test("renders independent list loading, error, retry, and empty-filter states", async () => {
  const user = userEvent.setup();
  const onRetry = vi.fn();
  const { rerender } = renderMasterDetail({ listState: "loading", onRetry });
  expect(screen.getByRole("status", { name: "Loading scopes" })).toBeInTheDocument();

  rerender(
    <StatisticsMasterDetail
      allLabel="All Reading"
      ariaLabel="Reading statistics scopes"
      searchLabel="Search books"
      noResultsLabel="No books found"
      items={items}
      selectedId={null}
      onSelect={vi.fn()}
      listState="error"
      onRetry={onRetry}
    >
      <p>right panel</p>
    </StatisticsMasterDetail>,
  );
  await user.click(screen.getByRole("button", { name: "Retry scopes" }));
  expect(onRetry).toHaveBeenCalledOnce();

  rerender(
    <StatisticsMasterDetail
      allLabel="All Reading"
      ariaLabel="Reading statistics scopes"
      searchLabel="Search books"
      noResultsLabel="No books found"
      items={items}
      selectedId={null}
      onSelect={vi.fn()}
      listState="loaded"
    >
      <p>right panel</p>
    </StatisticsMasterDetail>,
  );
  await user.type(screen.getByRole("searchbox", { name: "Search books" }), "missing");
  expect(screen.getByText("No books found")).toBeInTheDocument();
});

test("exposes entity buttons as items in a semantic list", () => {
  renderMasterDetail();

  const navigation = screen.getByRole("navigation", {
    name: "Reading statistics scopes",
  });
  const list = within(navigation).getByRole("list");

  expect(within(list).getAllByRole("listitem")).toHaveLength(items.length);
  expect(within(list).getByRole("button", { name: /Atomic Habits/ }))
    .not.toHaveAttribute("aria-current");
});
