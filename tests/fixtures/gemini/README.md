# Gemini fixtures

`current-conversation/` is a sanitized Chrome DOM capture from the authorized test conversation on 2026-09-28. It retains three user/assistant pairs, 28 H2/H3 headings, formatted text, tables and code blocks. See `meta.json` for capture details and limitations. The separate live reproduction conversation is not saved.

The offline layout preserves Gemini's current `infinite-scroller.chat-history` and the earlier turn's `content-visibility: auto`. Browser tests scroll to the bottom and model a content update to reproduce headings whose `innerText` is empty while `textContent` still contains their titles. Streaming, replacement and additional H1/H4 cases are explicitly modeled in tests.

Account data, real conversation/message identifiers, tracking metadata, scripts and remote resources are excluded. `expected.json` records the captured prompts, heading order, counts and levels.

`basic.html` remains a synthetic minimal fixture for shared outline settings and the legacy `.mat-sidenav-content` layout.
