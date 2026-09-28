# AGENTS.md

## Scope

Turnline is a React/TypeScript browser extension that adds outline navigation, copying, and export tools to ChatGPT, Claude, and Gemini. It runs entirely as a content script; there is no backend or background service worker. Use `README.md` for product behavior and setup details.

## Commands

```bash
npm run dev            # Vite development server
npm run build          # Chrome build in dist/
npm run build:firefox  # Firefox build in dist-firefox/
npm run typecheck      # Production TypeScript checks
npm run test:ci        # Type checks and unit tests
npm run test:e2e       # Build and run all Playwright tests
npm run test:check     # All automated checks
```

## Repository guide

Use this as a routing guide, not an exhaustive architecture map. Read only the area relevant to the task and use `rg` when ownership is unclear.

- `src/main.tsx` and `src/App.tsx`: content-script bootstrap and root composition.
- `src/components/` and `src/styles/`: sidebar UI, supporting components, and Shadow DOM styles.
- `src/hooks/`: browser lifecycle, conversation state, settings, and shortcuts.
- `src/providers/`: provider-specific URL matching and DOM extraction.
- `src/lib/`: shared navigation, history, export, markdown, and settings logic.
- `src/types/`: shared domain types.
- `tests/unit/`: pure logic tests.
- `tests/e2e/` and `tests/fixtures/`: extension behavior against offline provider DOM fixtures.

## Stable constraints

- Keep provider-specific selectors and parsing in `src/providers/`; keep reusable behavior in hooks or `src/lib/`.
- Host pages virtualize and replace conversation DOM. Do not assume every turn is mounted or that an element reference remains connected.
- The UI is isolated in a Shadow DOM. Put extension UI styles in `src/styles/main.css` and avoid changing host-page styles permanently.
- Do not edit generated output in `dist/` or `dist-firefox/`.
- Keep captured fixtures offline and sanitized: no scripts, remote assets, account data, or real conversation identifiers.
- Treat new permissions, supported origins, or background processes as product-level changes and keep `manifest.json`, builds, and tests aligned.

## Validation

- Match validation to the change. Use unit tests for pure logic and focused Playwright specs for provider DOM, navigation, scrolling, or UI behavior.
- Run the full suite for cross-cutting changes. Run both browser builds when changing the manifest, build configuration, or content-script bootstrap.
- Run Playwright outside the restricted sandbox; sandboxed Chrome launches can crash on macOS.
- Use `--repeat-each` only to diagnose suspected timing or virtualization failures. Normal local and CI runs stay at one pass.
