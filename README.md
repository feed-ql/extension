# feedql collector (Chrome, Manifest V3)

Fetches posts from X and LinkedIn inside the user's own logged-in browser and pushes them to their feedql feed.
Never reads or uploads cookies (two values, `ct0` and `JSESSIONID`, are copied into one request header each, in
`src/cookies.js`, and go only back to x.com / linkedin.com). No remote code: tasks from feedql are search strings.

- `src/sw.js` alarm (15-30 min, jittered) and popup messages; `src/runner.js` one paced pass; `src/pacing.js` pure scheduling.
- `src/sites/*` per-site fetch (`x.js`, `linkedin.js`) and pure parsers (`*-parse.js`); `src/xct.js` X transaction id (port of the backend's Go).
- `popup/` UI (tokens from backend `site.css`), `src/i18n.js` UA/EN.
- Tests: `npm test` (node --test, no network). Zip: `scripts/pack.sh [out.zip]` (also generates icons; no binaries in git).
- Install and test steps: `../docs/sources/extension-install.md`.
