import { render, waitFor } from "@testing-library/react";
import { expect, test } from "vitest";

import { InputPrivacyGuard } from "./InputPrivacyGuard";

function expectNativeSuggestionsDisabled(control: HTMLElement) {
  expect(control).toHaveAttribute("autocomplete", "off");
  expect(control).toHaveAttribute("autocorrect", "off");
  expect(control).toHaveAttribute("autocapitalize", "off");
  expect(control).toHaveAttribute("spellcheck", "false");
}

test("disables native suggestions for existing, inserted, and focused editable controls", async () => {
  const { container } = render(
    <>
      <InputPrivacyGuard />
      <input aria-label="Existing text input" />
    </>,
  );

  const existing = container.querySelector("input")!;
  await waitFor(() => expectNativeSuggestionsDisabled(existing));

  const inserted = document.createElement("textarea");
  container.append(inserted);
  await waitFor(() => expectNativeSuggestionsDisabled(inserted));

  inserted.removeAttribute("autocomplete");
  inserted.removeAttribute("autocorrect");
  inserted.removeAttribute("autocapitalize");
  inserted.removeAttribute("spellcheck");
  inserted.focus();
  expectNativeSuggestionsDisabled(inserted);
});
