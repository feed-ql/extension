// The Details panel of a site (Story 13.15): what it reads, which pages, which cookies, what goes to feedql, who sees it,
// how to turn it off. Pure DOM building from {hosts, cookies, pages, sends, about} so a test can render it. Texts only.

function list(doc, items, { mono = true, added = [], addedLabel = '' } = {}) {
  const ul = doc.createElement('ul');
  ul.className = 'det-list';
  for (const it of items) {
    const li = doc.createElement('li');
    if (mono) li.className = 'mono';
    li.textContent = it;
    if (added.includes(it)) { li.classList.add('add'); const b = doc.createElement('b'); b.className = 'tag'; b.textContent = addedLabel; li.append(' ', b); }
    ul.append(li);
  }
  return ul;
}

function row(doc, title, body) {
  const wrap = doc.createElement('div');
  wrap.className = 'det-row';
  const h = doc.createElement('h3');
  h.textContent = title;
  wrap.append(h, body);
  return wrap;
}

const para = (doc, text) => { const p = doc.createElement('p'); p.className = 'det-text'; p.textContent = text; return p; };

/**
 * doc: a Document; T: the strings; d: details of the site; lang: 'en'|'uk'; on: the site is on (or paused);
 * added: {hosts, cookies, pages} the update added (marked), open: start expanded.
 */
export function detailsEl(doc, T, d, { lang = 'en', on = false, added = {}, open = false } = {}) {
  const el = doc.createElement('details');
  el.className = 'det';
  if (open) el.setAttribute('open', '');
  const sum = doc.createElement('summary');
  sum.textContent = T.details;
  el.append(sum);
  el.append(para(doc, on ? T.detNow : T.detIfOn));
  const about = d.about?.[lang] || d.about?.en || '';
  if (about) el.append(row(doc, T.detAbout, para(doc, about)));
  const tag = T.added;
  el.append(row(doc, T.detHosts, list(doc, d.hosts, { added: added.hosts || [], addedLabel: tag })));
  if (d.pages.length) el.append(row(doc, T.detPages, list(doc, d.pages, { added: added.pages || [], addedLabel: tag })));
  el.append(row(doc, T.detCookies, d.cookies.length ? list(doc, d.cookies, { added: added.cookies || [], addedLabel: tag }) : para(doc, T.detNoCookies)));
  if (d.sends.length) el.append(row(doc, T.detSends, para(doc, d.sends.map((k) => T.fields[k] || k).join(', '))));
  el.append(row(doc, T.detWho, para(doc, T.detWhoText)));
  el.append(row(doc, T.detOff, para(doc, T.detOffText)));
  if (d.unknown) el.append(para(doc, T.detUnknown));
  return el;
}

/** The "Needs your OK" box shown when an update asks for more than the person allowed. */
export function needsOkEl(doc, T, needsOk, onApprove) {
  const box = doc.createElement('div');
  box.className = 'needs';
  box.setAttribute('role', 'region');
  box.setAttribute('aria-labelledby', 'needs-title-' + (needsOk.site || 'site'));
  const h = doc.createElement('strong');
  h.id = 'needs-title-' + (needsOk.site || 'site');
  h.textContent = T.needsOk;
  box.append(h, para(doc, T.needsOkLead));
  const a = needsOk.added || {};
  for (const [k, title] of [['hosts', T.detHosts], ['pages', T.detPages], ['cookies', T.detCookies]]) {
    if (a[k]?.length) box.append(row(doc, title, list(doc, a[k], {})));
  }
  box.append(para(doc, T.needsOkWhat));
  const b = doc.createElement('button');
  b.type = 'button';
  b.className = 'btn primary';
  b.textContent = T.approve;
  b.addEventListener('click', onApprove);
  box.append(b);
  return box;
}
