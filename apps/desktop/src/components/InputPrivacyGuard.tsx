import { useLayoutEffect } from "react";

const EDITABLE_SELECTOR = "input, textarea, [contenteditable]:not([contenteditable='false'])";

function disableNativeSuggestions(element: Element) {
  if (!(element instanceof HTMLElement) || !element.matches(EDITABLE_SELECTOR)) return;

  element.setAttribute("autocomplete", "off");
  element.setAttribute("autocorrect", "off");
  element.setAttribute("autocapitalize", "off");
  element.setAttribute("spellcheck", "false");
}

function disableNativeSuggestionsIn(node: Node) {
  if (!(node instanceof Element)) return;

  disableNativeSuggestions(node);
  node.querySelectorAll(EDITABLE_SELECTOR).forEach(disableNativeSuggestions);
}

export function InputPrivacyGuard() {
  useLayoutEffect(() => {
    document.querySelectorAll(EDITABLE_SELECTOR).forEach(disableNativeSuggestions);

    const onFocus = (event: FocusEvent) => {
      if (event.target instanceof Element) disableNativeSuggestions(event.target);
    };
    const observer = new MutationObserver((records) => {
      records.forEach((record) => record.addedNodes.forEach(disableNativeSuggestionsIn));
    });

    document.addEventListener("focusin", onFocus, true);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      document.removeEventListener("focusin", onFocus, true);
      observer.disconnect();
    };
  }, []);

  return null;
}
