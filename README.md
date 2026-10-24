# feedql collector

[![ci](https://github.com/feed-ql/extension/actions/workflows/ci.yml/badge.svg)](https://github.com/feed-ql/extension/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A Chrome extension that fills your [feedql](https://feedql.com) feed from sites that have no usable API (X, LinkedIn,
your YouTube history…), using your own logged-in browser. feedql then deduplicates, groups, summarises and makes the
items searchable on the web and for your AI agents (MCP).

- **Opt-in per site.** Nothing is read until you switch a site on in the popup and grant its access.
- **Cookies stay in the browser.** Only the extracted items go to feedql, into your private feed. See
  [PRIVACY.md](PRIVACY.md) and [SECURITY.md](SECURITY.md).
- **No remote code.** The server sends declarative recipes; the extension interprets them.

## Install

1. Download this repository (Code → Download ZIP) and unzip it, or `git clone`.
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and pick the folder.
3. Click the feedql icon, sign in, and switch on the sites you want.

To update: pull or re-download, then press ↻ on the extension card.

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md). `npm install && npm test`.

## Architecture

A generic interpreter of server-defined **recipes**: the server decides which sites are fetched and how (hosts, requests,
parsing, pacing); the extension runs them in the user's own logged-in browser and pushes the posts to their feedql feed. A new
site needs a recipe on the server, not an extension release. Spec: `../docs/sources/extension-recipes.md`; Go reference
interpreter: `../backend/internal/extrecipe`.

- No per-site parsers. The only code a recipe can name is the built-in transform `x_transaction_id` (`src/xct.js`,
  `src/engine/transforms.js`, versioned: `SUPPORTED_SCHEMAS`, `TRANSFORMS_VERSION`). No eval, no `new Function`, no remote JS.
- `src/engine/`: the executor. `exec.js` (steps, extract, pagination, items, drop rules, status/backoff signals),
  `template.js` (`{query} {cursor} {var.*} {cookie:NAME@host} {uuid} {now} {rand}`, filters), `jsonpath.js`, `json.js`
  (order-preserving JSON), `dom.js` (CSS selectors; the DOM lives in the offscreen document `offscreen/`, the service worker has
  none), `hosts.js` (host rules, permission origins), `transforms.js`.
- `src/runner.js` one pass: `GET /ext/tasks` -> run each enabled, due site's tasks (since, cursor, pages, catch-up, leases) ->
  `POST /ext/items` (with `query`) -> `POST /ext/status`. Recipes are cached by `recipe_version`. Pacing and backoff (persisted)
  come from the recipe. `src/sw.js`: alarm (15-30 min, jittered), run at browser start and install, popup messages.
  `src/headers.js`: Origin/Referer as dynamic declarativeNetRequest rules built from the recipes' hosts.
- Permissions: required host access is `api.feedql.com` only; each site's origins (the recipe's `needs_permission_origins`) are
  requested at runtime from the popup switch (`chrome.permissions.request`), `<all_urls>` is only the optional ceiling.
- Cookies: `src/cookies.js` is the only reader; a value goes into one request header and nowhere else.
- `popup/` lists the offered sites with a switch (`PUT /ext/sites`), last synced / last run, Run now (`?force=1`), debug raw
  capture and redacted request-shape capture (`src/capture.js`); the popup never leases tasks (`src/offered.js`); UA/EN in `src/i18n.js`; tokens from backend `site.css`.
- Tests: `npm install` once (dev only: linkedom, a DOM for the HTML tests), then `npm test` (node --test, no network). They run
  the executor on the Go reference's fixtures (`test/fixtures/README.md` lists their origin; `test/drift.test.js` compares them with
  the backend checkout). Zip: `scripts/pack.sh [out.zip]` (generates icons; excludes tests, scripts, keys).
- Install and test steps: `../docs/sources/extension-install.md`.
