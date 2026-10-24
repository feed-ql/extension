# Security policy

The extension runs in your logged-in browser, so we treat security reports as the highest priority.

## Reporting a vulnerability

- Email **ruslan@feedql.com**, or use GitHub's private vulnerability reporting on this repository
  (Security → Report a vulnerability). Please do not open a public issue.
- Include the version (`manifest.json`), Chrome version, steps to reproduce and the impact you see.
- We acknowledge within 3 working days and aim to ship a fix for high-severity issues within 14 days.
  We credit reporters in the release notes unless you prefer otherwise.

## Supported versions

Only the latest released version receives fixes.

## Security model

- **The server describes what to fetch, never code.** Sites are declarative recipes (hosts, requests, selectors,
  pacing). The extension has no `eval`, no `new Function`, no remote scripts; the CSP is `script-src 'self'`.
- **Cookies never leave the browser.** A cookie is read only for a host the recipe declares and you granted, and is
  placed in one request header to that same site. It is never sent to feedql, never put in a URL, body or item.
- **Access is opt-in per site.** The only host granted at install is `api.feedql.com`. Each site's origins are
  requested when you switch the site on in the popup, and can be revoked in Chrome at any time.
- **What is sent to feedql:** the items extracted from the pages (URL, title, text, author, time), a run status
  (counts, a short error text) and your feedql sign-in token. See [PRIVACY.md](PRIVACY.md).

In scope: anything that lets a recipe, a web page or a third party read cookies, run code, reach hosts you did not
grant, or send data anywhere other than described above.
