# Contributing

Thanks for helping. Issues and pull requests are welcome.

## Setup

```sh
npm install      # dev only: linkedom, a DOM for the HTML tests
npm test         # node --test, no network
```

Load it in Chrome: `chrome://extensions` → Developer mode → Load unpacked → this folder.

## Rules

- **No per-site code.** A new site is a server recipe, not a parser in the extension. Engine changes must stay
  generic (see `README.md` → Architecture).
- **No remote code, ever:** no `eval`, `new Function`, `innerHTML` with fetched content, or remote scripts.
  Reviews reject these outright.
- **Cookies** are read only in `src/cookies.js` and may go into one request header to the same site. Any change
  touching cookies, hosts or permissions needs a test in `test/`.
- New permissions in `manifest.json` need a reason in the PR description.
- Every change comes with a test that fails without it. Keep `npm test` green.
- UI strings go to `src/i18n.js` and `_locales/` in English and Ukrainian.

## Pull requests

Small and focused. Describe what changes for the user and how you tested it. By contributing you agree your work is
licensed under the MIT License.

Security issues: see [SECURITY.md](SECURITY.md), not a public issue.
