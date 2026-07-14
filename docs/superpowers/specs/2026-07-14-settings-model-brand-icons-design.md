# Settings Model Brand Icons

## Goal

Make the model selector in Settings easy to scan when a gateway provider exposes models from many different vendors, without changing the existing provider-management presentation.

## Scope

- The connected-provider list and provider editor remain visually unchanged: no brand icons are added to provider rows or the provider picker.
- Every model result in **Translate model** shows the model creator's brand icon immediately before the model name.
- The existing right-aligned provider label remains untouched. For example, a result such as `01-ai/yi-large` displays the 01.AI icon before its name and `NVIDIA NIM` at the right, accurately separating the model creator from its hosting provider.
- The selected-model input/result also displays the same model icon, so the selection does not lose its visual identity after the result list closes.

## Icon source and resolution

- Add `@lobehub/icons-static-svg` as the local, MIT-licensed source of AI/model brand SVGs. Import only the individual SVG assets needed by the resolver; do not load icons from a CDN.
- Implement a small model-icon resolver that accepts the model ID and returns the corresponding local Lobe Icon asset. It maps known model-family/vendor tokens (for example: `01-ai`, `llama`/`meta`, `ai21`, `baai`, `gemini`, `mistral`, `qwen`, `deepseek`, and `grok`) before rendering.
- Matching is case-insensitive and more-specific patterns win over generic ones. The resolver remains independent of the hosting provider because an aggregator can serve many vendors' models.
- If a model is not covered by Lobe Icons or cannot be identified safely, use a neutral model/sparkle icon. Never guess a brand or substitute the gateway provider's logo.

## Theme and accessibility

- Icons are decorative when adjacent to an exposed model name (`aria-hidden="true"`); the accessible name remains the model's visible text and provider label.
- Icon dimensions are fixed and aligned to the first text baseline so long model IDs remain readable.
- Model rows, selected input, hover/keyboard-highlight, focus, and fallback icon must be implemented and visually verified in both light and dark mode using existing semantic tokens.

## Tests

- Resolver unit tests cover representative vendor/model IDs, precedence for overlapping patterns, case-insensitive matching, and the neutral fallback.
- Settings UI tests verify a resolved icon appears before the model name while the provider list remains icon-free.
- The final visual check covers selected and unselected results in both themes.
