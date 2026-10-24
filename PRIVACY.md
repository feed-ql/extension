# Privacy

**What the extension reads:** pages of the sites you switch on in the popup, in your own browser, using your
existing login on those sites.

**What it sends, and where:** only to `api.feedql.com`, only for your signed-in feedql account:
- the posts/videos it extracted (address, title, text, author, time);
- a run status per site (when it ran, how many items, a short error text).

**What it never sends:** cookies, passwords, browsing history outside the switched-on pages, or anything to a third
party. There is no analytics or tracking in the extension.

**Who sees it:** items pushed by you go to your private feed; other feedql users do not get them.

**Stored locally:** your feedql sign-in token, site switches, last-run times and cursors (`chrome.storage`).
Removing the extension deletes them. Turning a site off stops collection; items already collected stay in your
feed until you delete them there.
