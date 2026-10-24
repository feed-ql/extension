# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow `manifest.json`.

## [Unreleased]

- First public release under the MIT License.

## [0.3.0]

- Recipes are refused when a regex repeats a group holding an alternation or a quantifier, when a wildcard host sits on a
  public suffix or a bare TLD, when there are more than 10 hosts, or when a host is a feedql host. Every request host must be inside
  what Chrome granted. A cookie goes only to its own host or registrable domain.
- Every site starts off and runs only after you switch it on in this browser; no server flag turns one on.
- Details per site: hosts, pages, cookie names, fields sent, who sees it, how to turn it off.
- A recipe update that asks for more pauses the site with "Needs your OK" until you approve.
- YouTube History and Watch later recipe support (`json_between`, `items.root.any_of`).

## [0.2.1]

- Popup lists offered sites from the read-only `GET /ext/offered`, explains why a site got no tasks.
- Run now shows an outcome per site.
