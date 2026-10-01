# ChatGPT fixtures

These are sanitized, offline DOM captures from logged-in ChatGPT on 2026-09-25. The files preserve the observed message wrappers, selector-bearing attributes and text. Their `meta.json` files record capture times, sanitization and layout limitations; they are the versioned source of provenance.

| Directory | Captured state | Historical label |
| --- | --- | --- |
| `current-turn-unit/` | Two user/assistant pairs using `data-turn-key` and `data-content-search-unit-key` | F02 |
| `long-response-l01/` | Five mounted turns in `page.html`; `loaded.html` contains an older turn and evicts the newest, with four overlapping turns | L01 / F15 |
| `long-response-l02/` | Five long responses with varied heading levels and numbered Chinese chapters | L02 / F04–F05 |

F labels identify scenarios from the original repair work. P3/P4/P7 in older test names identify historical validation stages, not current issue priorities. Tests now use behavior names where they have been reorganized.

`chatgpt-dom.spec.ts` checks extraction, DIL headings and streamed chapter levels. `chatgpt-lifecycle.spec.ts` models search-key changes, pending submissions, SPA navigation, cached workspaces and local-to-permanent conversation IDs on these captures. Those transitions are controlled by tests; the snapshots do not constitute a later live-site capture. `chatgpt-export.spec.ts` checks independent-answer copying and exports.

The offline CSS models nested reverse scrolling; typography and image placeholders in long responses are approximations. Streaming, hydration, cache visibility and virtual-window transitions are explicitly modeled. Passing these tests does not establish current live-site or network-loading compatibility. No scripts, remote assets, account data or original conversation identifiers should be added.
