// Origin / Referer for the extension's own fetches. A service-worker fetch carries Origin: chrome-extension://<id> and
// the sites' internal APIs reject that, and fetch cannot set Origin. So, for each enabled recipe, a declarativeNetRequest
// DYNAMIC rule (built from the recipe's `hosts`, no per-site code, no static list) sets Origin and Referer to the
// recipe's primary host, for requests this extension itself makes to that host.
import { EXTENSION_ID } from './config.js';
import { isFeedqlHost } from './engine/hosts.js';

/** The first literal (non-wildcard) host of a recipe's hosts list: the site's own origin. */
export function primaryHost(rec) {
  return (rec.hosts || []).find((h) => !h.startsWith('*.') && !isFeedqlHost(h)) || '';
}

/** Rules for the given recipes; ids start at 1. Pure. */
export function headerRules(recipes, extensionId = EXTENSION_ID) {
  const rules = [];
  for (const rec of recipes) {
    const host = primaryHost(rec);
    if (!host) continue;
    rules.push({
      id: rules.length + 1,
      priority: 1,
      action: { type: 'modifyHeaders', requestHeaders: [
        { header: 'origin', operation: 'set', value: `https://${host}` },
        { header: 'referer', operation: 'set', value: `https://${host}/` },
      ] },
      condition: { requestDomains: [host], resourceTypes: ['xmlhttprequest'], initiatorDomains: [extensionId] },
    });
  }
  return rules;
}

/** Replaces all dynamic rules with those of the given recipes. */
export async function syncHeaderRules(recipes) {
  const old = await chrome.declarativeNetRequest.getDynamicRules();
  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: old.map((r) => r.id), addRules: headerRules(recipes) });
}
