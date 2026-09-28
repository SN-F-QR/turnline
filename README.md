# Scroll

**Navigate, copy, and export your AI conversations.**

A browser extension that adds a navigation sidebar to ChatGPT, Claude, and Gemini. Jump to any turn, copy prompts and responses, and export discovered conversation content.

<p align="center">
  <img src="assets/demo.png" alt="Scroll sidebar" width="800">
</p>

## Install

[**Add to Chrome**](https://chromewebstore.google.com/detail/scroll/mpcklmodkihbiblhffoganikkdfoaphe) — works on Chrome, Edge, and Brave.

### From source

```bash
git clone https://github.com/asker-kurtelli/scroll.git
cd scroll
npm install
npm run build
```

Load `dist/` as an unpacked extension in Chrome (`chrome://extensions` > Developer Mode > Load Unpacked).

For Firefox:

```bash
npm run build:firefox
```

Load `dist-firefox/` as a temporary add-on (`about:debugging` > This Firefox > Load Temporary Add-on).

## Features

**Navigate** — A floating table of contents for every conversation. Click any prompt to jump to it instantly. Headings inside long responses are detected for section-level navigation.

**Copy** — Copy individual prompts, responses, Q&A pairs, or all discovered messages. Toggle markdown mode for formatted output.

**Export** — Export conversations to Markdown, PDF, plain text, or JSON. Copy and export share the same captured messages, including independent assistant replies and headings hidden by your depth setting.

**Reading position** — The outline tracks the message or heading you are reading without moving keyboard focus. A heading hidden by the depth setting falls back to its visible parent or message; collapsed answers highlight their turn title. Repeated clicks replace the previous navigation; a wheel, touch, or key interaction interrupts it. Reduced-motion preferences are respected.

**Collapse** — Use the icon beside history refresh to collapse or expand all discovered turns, including turns hidden by search. Individual arrows toggle each answer outline. New turns start expanded, and switching conversations resets collapsed turns.

**ChatGPT history** — Opening the outline automatically searches toward older messages and retains discovered messages when ChatGPT replaces its visible DOM. Use **Stop** to cancel or **Scan history** to retry. Scrolling, touching, clicking or typing in the chat immediately takes control back from the scan; it will not pull you back afterward. The scan also visits empty message/heading placeholders and restores your reading position afterward. Clicking an evicted message attempts to load its DOM again; unavailable messages are reported.

After checking the oldest available messages without finding new messages or unresolved content, the outline shows **Scan finished · No more messages found**. Layout changes and text streaming in existing replies do not keep history discovery running. Missing content, a 15-second timeout, cancellation or an error still shows **Incomplete** and its reason. A finished DOM scan does not prove that the server has returned the entire chat: copies and exports describe the discovered range, and JSON separates `scanStatus: "finished"` from `complete: null` (overall completeness unknown). An unfinished scan uses `complete: false`. Cancelling an export stops the download. No background API, account access, or persistent chat archive is used; discovered messages are kept in memory for the current conversation.

**Search** — Filter turns and headings by keyword.

**Drag** — Press and hold to reposition the toggle button anywhere on screen. Drag the outer sidebar edge to adjust its width from 214px to 420px (default 320px), or focus the edge and use Left/Right arrows in 10px steps. Double-click the edge to restore the default 320px width. The chosen width persists; smaller windows temporarily limit the displayed width.

**Outline settings** — Open the gear button for a dedicated settings view. Choose one of six theme colors (Blue, Green, Yellow, Pink, Orange, or Purple) or enter a custom hex theme color; choose System, Light, or Dark appearance; set an optional custom hex background; enter an outline text size from 10px to 24px; and choose heading depth 1–6 (default 4). Enable **Hover mode** to open the outline when the mouse enters the toggle and close it 200ms after leaving the toggle, sidebar and menus. Clicking still toggles it; dragging and dialogs pause automatic closing. Hover mode defaults off. Custom backgrounds automatically use readable light or dark text. Press Escape or use the back button to return to the outline. Preferences persist locally and synchronize between tabs. Depth only filters the outline; search, copy, and export retain the full detected content. ChatGPT supports H1–H6 with conservative numbered-chapter normalization; Claude/Gemini retain their existing H1–H4 extraction.

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + ;` | Toggle sidebar |

## How it works

Scroll runs as a content script on ChatGPT, Claude, and Gemini. It watches the DOM for conversation turns using a MutationObserver and renders a sidebar table of contents inside a Shadow DOM.

No data leaves your browser. No account required. The extension uses the storage permission for local settings.

**Tech stack:** TypeScript, React, Vite, Tailwind CSS v4, Manifest V3.

## Local verification

Use Node 24.13.0 from `.nvmrc` (CI baseline):

```bash
npm ci
npx playwright install chromium
npm run test:ci       # Production/test type checks and Node unit tests
npm run test:e2e      # Build Chrome once, then offline Chromium extension tests
npm run test:check    # All local checks above
npm run build:firefox # Clean and rebuild dist-firefox/
```

The browser tests load the real extension and replay local DOM captures without accessing an account. Synthetic transitions are labeled in the tests. Chromium tests and a Firefox build do not replace live ChatGPT, Claude, Gemini or Firefox smoke checks. Scheduled-message DOM and release-time live-site checks remain separate validation work.

## Contributing

See [contributing.md](contributing.md) for guidelines.

## License

MIT — [Asker Kurt-Elli](https://x.com/askerkurtelli)
