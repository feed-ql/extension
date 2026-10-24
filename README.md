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

A generic interpreter of server-defined **recipes**. A recipe is JSON data (no code): which hosts a site may use, the
requests to make, how to read the answers, how to pace. The feedql server hands out the recipes of the sites you switched
on plus the small tasks to run; the extension fetches in your own logged-in browser and pushes the extracted items to your
private feed. A new site needs a recipe on the server, not an extension release.

**Recipe format (schema 1)**

- `site`, `label`, `kind` (`search`: a task is a query; `list`: fixed pages, e.g. a history list), optional `about` (plain-words
  description per language) and `default_enabled` (ignored by this extension: only you switch a site on).
- `hosts` (at most 10, exact or `*.example.com`, never a bare TLD or a public suffix, never a feedql host) and
  `needs_permission_origins` (what Chrome is asked for when you switch the site on). A request to any other host is refused.
- `steps`: HTTP requests (`url` with `{query}`, `{cursor}`, `{var.x}` placeholders; headers; optional `{cookie:NAME@host}` that
  is read for that one request header and goes only to its own host or registrable domain), `expect` json/html/text, `extract`
  variables by JSON path, CSS selector or regex, `json_between` to cut a JSON document out of a page.
- `items`: the node list (`root`), per-item variables, drop rules and a `map` to the pushed fields
  (`external_id,url,title,text,author,published_at,...`). `pacing`: interval, gaps, back-off statuses.
- Limits enforced before anything runs: regexes (at most 200 characters, no back-references or look-around, no alternation or
  quantifier inside a quantified group, 250 ms budget), hosts, headers, body sizes. A recipe that breaks them is refused.
- The only code a recipe can name is the built-in transform `x_transaction_id` (`src/xct.js`). No eval, no remote JS.

**What you control.** Every site starts off. Switching it on (popup) asks Chrome for access to exactly its hosts and records
what you saw in **Details**: hosts, pages, cookie names, the fields sent to feedql. If a later recipe asks for more, the site
pauses with "Needs your OK" until you approve; asking for less needs no approval.

**Code map**

- `src/engine/`: the executor. `exec.js` (steps, extract, pagination, items), `template.js`, `jsonpath.js`, `json.js`,
  `dom.js` (CSS selectors; the DOM lives in the offscreen document `offscreen/`), `hosts.js` (host rules, permission origins),
  `regexguard.js`, `details.js` (what a recipe touches), `transforms.js`.
- `src/runner.js`: one pass: tasks and recipes from feedql, run each granted and due site, push items, report status.
  `src/grants.js`: what you switched on and the approve/pause logic. `src/sw.js`: alarm (15-30 min), browser start, popup
  messages. `src/headers.js`: Origin/Referer rules from the recipes' hosts. `src/cookies.js`: the only cookie reader.
- `popup/`: sites with a switch, Details, "Needs your OK", Run now, debug capture. UA/EN in `src/i18n.js`.
- Tests: `npm install` once (dev only: linkedom), then `npm test` (node --test, no network).

Test fixtures: `x-search.recorded.json` is a real X search response with public posts of public accounts; the
`Bearer AAAA…` in `test/fixtures/seeds/x-search.json` is X's public web-client token, not a secret. The drift tests
compare fixtures with the server's Go reference and are skipped outside the maintainers' checkout.
