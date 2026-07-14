# Settings Model Brand Icons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** Show the creator brand icon before every Settings model name while preserving the icon-free provider-management UI and existing hosting-provider label.

**Architecture:** Add a pure domain resolver that maps each model ID to a small set of local Lobe SVG URLs or a neutral fallback. A \`ModelBrandIcon\` component renders that result only in the selected-model display and result rows, not in provider views.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, \`@lobehub/icons-static-svg\`, semantic CSS tokens.

---

## File structure

- Modify: \`apps/desktop/package.json\` and \`apps/desktop/package-lock.json\` — install static SVG assets.
- Create: \`apps/desktop/src/domain/modelBrand.ts\` and \`modelBrand.test.ts\` — resolver and its pure tests.
- Create: \`apps/desktop/src/components/ModelBrandIcon.tsx\` — decorative resolved icon/fallback.
- Modify: \`apps/desktop/src/features/settings/SettingsPage.tsx\`, \`SettingsPage.test.tsx\`, and \`apps/desktop/src/styles/tokens.css\`.

### Task 1: Install local SVG assets

**Files:**
- Modify: \`apps/desktop/package.json\`
- Modify: \`apps/desktop/package-lock.json\`

- [ ] **Step 1: Install**

Run: \`npm install @lobehub/icons-static-svg\`

Expected: package is placed in runtime dependencies and the lockfile records its exact transitive graph.

- [ ] **Step 2: Commit**

    git add apps/desktop/package.json apps/desktop/package-lock.json
    git commit -m "build: add local Lobe model icon assets"

### Task 2: TDD the pure creator-brand resolver

**Files:**
- Create: \`apps/desktop/src/domain/modelBrand.test.ts\`
- Create: \`apps/desktop/src/domain/modelBrand.ts\`

- [ ] **Step 1: Write failing tests**

    test.each([
      ["01-ai/yi-large", "zeroone"],
      ["meta/llama-3.1-70b-instruct", "meta"],
      ["ai21labs/jamba-1.5-large-instruct", "ai21"],
      ["BAAI/bge-m3", "baai"],
      ["google/gemma-4-31b", "gemini"],
      ["unknown/vendor-model", "fallback"],
    ])("resolves %s to %s", (modelId, expected) => {
      expect(modelBrandFor(modelId).id).toBe(expected);
    });

    test("uses the specific vendor rule before a generic family match", () => {
      expect(modelBrandFor("01-ai/yi-large").id).toBe("zeroone");
    });

- [ ] **Step 2: Verify RED**

Run: \`npm test -- src/domain/modelBrand.test.ts\`

Expected: FAIL because \`modelBrandFor\` does not exist.

- [ ] **Step 3: Implement the resolver**

Import only \`zeroone.svg\`, \`meta.svg\`, \`ai21.svg\`, \`baai.svg\`, \`gemini.svg\`, \`mistral.svg\`, \`qwen.svg\`, \`deepseek.svg\`, and \`grok.svg\` from \`@lobehub/icons-static-svg/icons/\`. Export \`modelBrandFor(modelId)\` returning either a known \`{ id, src }\` or \`{ id: "fallback", src: null }\`. Match IDs case-insensitively; test ordered vendor prefixes before generic model-family tokens.

- [ ] **Step 4: Verify GREEN and commit**

Run: \`npm test -- src/domain/modelBrand.test.ts\`

Expected: PASS.

    git add apps/desktop/src/domain/modelBrand.ts apps/desktop/src/domain/modelBrand.test.ts
    git commit -m "feat: resolve model creator brand icons"

### Task 3: Render icons only for model choices

**Files:**
- Create: \`apps/desktop/src/components/ModelBrandIcon.tsx\`
- Modify: \`apps/desktop/src/features/settings/SettingsPage.tsx\`
- Modify: \`apps/desktop/src/features/settings/SettingsPage.test.tsx\`
- Modify: \`apps/desktop/src/styles/tokens.css\`

- [ ] **Step 1: Write a failing UI test**

    test("shows the creator icon before a model but keeps provider rows icon-free", async () => {
      renderSettingsWithConnectedNvidia([{ id: "01-ai/yi-large", name: "01-ai/yi-large" }]);
      await user.type(screen.getByLabelText("Search models"), "yi-large");
      const result = await screen.findByRole("button", { name: /01-ai\/yi-large/ });
      expect(result.querySelector("img")).toHaveAttribute("data-brand", "zeroone");
      expect(screen.getByLabelText("Connected providers").querySelector("img")).toBeNull();
    });

- [ ] **Step 2: Verify RED**

Run: \`npm test -- src/features/settings/SettingsPage.test.tsx\`

Expected: FAIL because result rows currently contain only text.

- [ ] **Step 3: Implement ModelBrandIcon**

Make \`ModelBrandIcon\` call the resolver. For a known asset, render \`<img aria-hidden="true" className="model-brand-icon" data-brand={brand.id} src={brand.src} />\`; for fallback, render the existing neutral \`IconMemora\` with \`aria-hidden="true"\`. In SettingsPage, wrap the model name in a flex row with this component. Keep the right-side \`small\` provider label exactly as it is, and do not change any \`.settings-page__provider-row\` markup.

Render a small selected-model summary with the same icon beside the native search field after selection. Leave the search input’s value, keyboard navigation, and selected-model state unchanged because native inputs cannot safely contain images.

- [ ] **Step 4: Add theme-safe layout CSS**

Add \`.settings-page__model-name\` and \`.model-brand-icon\` with 18px fixed dimensions, baseline alignment, \`flex: 0 0 auto\`, and fallback color \`var(--text-secondary)\`. Reuse existing result hover/focus tokens; do not add hard-coded colors or image filters.

- [ ] **Step 5: Verify GREEN and commit**

Run: \`npm test -- src/features/settings/SettingsPage.test.tsx src/domain/modelBrand.test.ts\`

Expected: PASS.

    git add apps/desktop/src/components/ModelBrandIcon.tsx apps/desktop/src/features/settings/SettingsPage.tsx apps/desktop/src/features/settings/SettingsPage.test.tsx apps/desktop/src/styles/tokens.css
    git commit -m "feat: show model creator icons in settings"

### Task 4: Verify production and both themes

**Files:** Verify only.

- [ ] **Step 1: Run the full frontend suite**

Run: \`npm test\`

Expected: PASS.

- [ ] **Step 2: Build**

Run: \`npm run build\`

Expected: PASS.

- [ ] **Step 3: Manual two-theme check**

Run: \`npm run tauri dev\`

Connect NVIDIA or OpenRouter, search models from at least two creators, and verify icon alignment/readability in light and dark mode. Confirm the right hosting-provider label remains present and the provider list/modal remains icon-free.

