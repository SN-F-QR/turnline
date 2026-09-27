# AGENTS.md

## Project Overview

Scroll is a Chrome/Firefox extension that adds a navigation sidebar to AI chat interfaces (ChatGPT, Claude, Gemini). Press `Cmd+;` to toggle a table of contents for the current conversation, copy turns, and export chats.

## Commands

```bash
npm run dev        # Vite dev server with HMR
npm run build      # Production build to dist/
npm run build:firefox  # Build for Firefox to dist-firefox/
npm run typecheck  # TypeScript type checking
```

Load `dist/` as an unpacked extension in Chrome (`chrome://extensions` with Developer Mode enabled).

### Browser tests

Playwright launches the bundled `Chrome for Testing` with the built extension. On macOS it must be run outside the restricted filesystem/process sandbox. A sandboxed launch exits with `SIGABRT`/`EPERM` and may show the user a misleading “Chrome for Testing quit unexpectedly” notification.

- Run non-browser checks (`npm run typecheck`, `npm run typecheck:tests`, and `npm run test:unit`) normally.
- Before browser tests, build the extension with `npm run build`, or use `npm run test:e2e`, which builds it automatically.
- For `npm run test:e2e`, `npx playwright test`, and focused Playwright commands, request the required elevated/sandbox-exempt execution on the first attempt. Do not first probe by launching Playwright inside the restricted sandbox.
- Do not retry a sandboxed browser launch after `SIGABRT`, `EPERM`, or `Target page, context or browser has been closed`; rerun the same command once with the correct execution permission.
- Prefer focused specs while iterating, for example: `npx playwright test tests/e2e/scroll-recovery.spec.ts`. Run the broader suite after the focused tests pass when the change warrants it.

## Architecture

### Entry points

- `src/main.tsx` — Content script. Mounts React app inside Shadow DOM on supported chat pages.
- `src/App.tsx` — Root React component. Renders Sidebar and Toast.

### Sidebar (`src/components/Sidebar.tsx`)

The main component. Features:

- Table of contents with two view levels: "Prompts" and "All" (includes responses + headings)
- Search/filter within the sidebar
- Click-to-navigate with smooth scrolling
- Copy: prompt, response, Q&A pair, or full chat (plain text or markdown)
- Export: MD, PDF, TXT, JSON formats
- ChatGPT smart capture: scrolls through virtualized DOM to capture all turns
- Drag-to-reposition toggle button
- Keyboard navigation with smooth pursuit

### Provider system (`src/providers/`)

- `Provider` interface in `src/types/index.ts`: `isMatch()`, `getTurns(container)`, `getChatTitle()`
- Implementations: `chatgpt.ts`, `claude.ts`, `gemini.ts`

### Utilities (`src/lib/`)

| File                           | Purpose                                           |
| ------------------------------ | ------------------------------------------------- |
| `scroll.ts`                    | Smooth scroll navigation with highlight animation |
| `markdownUtil.ts`              | DOM-to-markdown serialization, markdown rendering |
| `download.ts`                  | File download helper                              |
| `exportFilenames.ts`           | Export filename generation                        |
| `pdfPrint.ts` / `pdfStyles.ts` | PDF export via iframe print                       |

### Types (`src/types/`)

- `index.ts` — `Heading`, `Turn`, `Provider`
- `messages.ts` — `CapturedTurn`, `ExportBlock` (used by export)

### Other components (`src/components/`)

- `Toast.tsx` — Toast notifications
- `ErrorBoundary.tsx` — React error boundary

### Hooks (`src/hooks/`)

- `useChatTurns` — MutationObserver-based turn detection with provider-aware DOM scraping

### Services (`src/services/`)

- `toast.ts` — Toast notification dispatch

## Key patterns

- **Shadow DOM isolation** — All UI injected into Shadow DOM. Styles inlined at runtime via Tailwind CSS v4 + PostCSS.
- **Provider adapters** — Each provider implements `getTurns(container)` to extract turns from the DOM.
- **No background service worker** — Pure content script extension. No database, no cloud, no permissions beyond content script injection.

## Build

Manifest V3 with `@crxjs/vite-plugin`. Content script runs only on ChatGPT, Claude, and Gemini domains.
