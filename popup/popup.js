import { STRINGS, pickLang, agoText } from '../src/i18n.js';
import { permissionOrigins } from '../src/engine/hosts.js';

const $ = (id) => document.getElementById(id);
const send = (type, extra = {}) => chrome.runtime.sendMessage({ type, ...extra });
let snap = null;
let T = STRINGS.en;
let toast = '';

function clock(ts) {
  return new Date(ts).toLocaleTimeString(document.documentElement.lang, { hour: '2-digit', minute: '2-digit' });
}

function resultLine(offer, r) {
  const p = document.createElement('p');
  p.className = 'result';
  const set = (txt, cls) => { p.textContent = txt; p.classList.add(cls); };
  if (!r) return null;
  switch (r.status) {
    case 'ok': set(T.resOk(r.count, r.duplicates), 'good'); break;
    case 'running': set(T.resRunning, 'muted'); break;
    case 'notasks': set(T.resNoTasks(r.reason), 'muted'); break;
    case 'notdue': set(T.resNotDue(clock(r.until)), 'muted'); break;
    case 'backoff': set(T.resBackoff(clock(r.until), r.reason), 'bad'); break;
    case 'signedout': set(T.resSignedOut(offer.label || offer.site), 'bad'); break;
    case 'permission': {
      set(T.resPerm, 'bad');
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'btn ghost'; b.textContent = T.allow;
      b.addEventListener('click', async () => {
        const ok = await chrome.permissions.request({ origins: permissionOrigins(offer) }).catch(() => false);
        if (ok) { await send('runNow'); } else { toast = T.permDenied; render(); }
      });
      p.append(' ', b);
      break;
    }
    default: set(T.resError(r.error || r.status), 'bad');
  }
  return p;
}

function siteCard(offer, meta, st, res) {
  const site = offer.site;
  const en = !!offer.enabled;
  const el = document.createElement('div');
  el.className = 'site';
  const head = document.createElement('div');
  head.className = 'site-head';
  const h = document.createElement('h2');
  h.textContent = offer.label || site;
  const sw = document.createElement('label');
  sw.className = 'switch';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = en;
  input.setAttribute('aria-label', `${offer.label || site}: ${T.on}/${T.off}`);
  input.addEventListener('change', () => toggle(offer, input));
  const track = document.createElement('span');
  track.className = 'track';
  const lab = document.createElement('span');
  lab.textContent = en ? T.on : T.off;
  sw.append(input, track, lab);
  head.append(h, sw);
  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.textContent = T.hint;
  el.append(head, hint);
  const hosts = permissionOrigins(offer).map((o) => o.slice('https://'.length, -2));
  if (hosts.length) {
    const p = document.createElement('p');
    p.className = 'hosts';
    p.textContent = T.access(hosts.join(', '));
    el.append(p);
  }

  const stat = document.createElement('div');
  stat.className = 'stat';
  const add = (txt, cls) => { const s = document.createElement('span'); s.textContent = txt; if (cls) s.className = cls; stat.append(s); };
  const synced = meta?.last_synced_at ? Date.parse(meta.last_synced_at) : 0;
  if (en) add(synced ? T.synced(agoText(Date.now() - synced, T)) : T.neverSynced);
  if (!st.lastRunAt) add(T.never);
  else {
    add(st.lastOk ? T.ok : T.failed, st.lastOk ? 'good' : 'bad');
    add(agoText(Date.now() - st.lastRunAt, T));
    if (st.lastOk) { add(T.pushed(st.lastCount), 'good'); add(T.dupes(st.lastDuplicates)); }
  }
  if (st.pushedTotal) add(T.total(st.pushedTotal));
  el.append(stat);
  const rl = resultLine(offer, res);
  if (rl) el.append(rl);
  if (st.backoffUntil > Date.now()) { const p = document.createElement('p'); p.className = 'err'; p.textContent = T.backoff(clock(st.backoffUntil)); el.append(p); }
  if (st.lastError) { const p = document.createElement('p'); p.className = 'err'; p.textContent = st.lastError; el.append(p); }
  return el;
}

/** The switch. Chrome's permission prompt needs this click, so it is requested here, before the service worker is told. */
async function toggle(offer, input) {
  const want = input.checked;
  input.disabled = true;
  if (want) {
    const origins = permissionOrigins(offer);
    let granted = true;
    if (origins.length) granted = await chrome.permissions.request({ origins }).catch(() => false);
    if (!granted) { toast = T.permDenied; input.checked = false; input.disabled = false; render(); return; }
  }
  const r = await send('toggle', { site: offer.site, enabled: want });
  if (r?.error) toast = r.error === 'permission' ? T.permDenied : T.errToggle(r.error);
  else { toast = ''; snap = r; }
  render();
}

function render() {
  const { settings, state, signedIn, offered, results } = snap;
  T = STRINGS[pickLang(settings.lang)];
  document.documentElement.lang = pickLang(settings.lang);
  $('title').textContent = T.title;
  $('lead').textContent = T.lead;
  $('lang').value = settings.lang;
  $('foot').textContent = T.foot;

  const auth = $('auth');
  auth.className = 'auth' + (signedIn ? '' : ' out');
  auth.replaceChildren();
  if (signedIn) {
    const who = document.createElement('span'); who.className = 'who'; who.textContent = 'feedql';
    const out = document.createElement('button'); out.className = 'btn ghost'; out.type = 'button'; out.textContent = T.signOut;
    out.addEventListener('click', async () => { snap = await send('signOut'); render(); });
    auth.append(who, out);
  } else {
    const btn = document.createElement('button'); btn.className = 'btn primary'; btn.type = 'button'; btn.textContent = T.signIn;
    btn.style.width = '100%';
    btn.addEventListener('click', async () => {
      btn.classList.add('busy'); btn.disabled = true; btn.textContent = T.signingIn;
      const r = await send('signIn');
      if (r?.error) toast = r.error; else snap = r;
      render();
    });
    auth.append(btn);
  }

  $('sites').hidden = !signedIn;
  $('actions').hidden = !signedIn;
  $('adv').hidden = !signedIn;
  const list = $('sites');
  const sites = offered?.offered || [];
  if (sites.length) list.replaceChildren(...sites.map((o) => siteCard(o, offered.sites?.[o.site], state.sites[o.site] || {}, results?.sites?.[o.site])));
  else { const p = document.createElement('p'); p.className = 'muted'; p.textContent = T.noSites; list.replaceChildren(p); }
  const gen = results?.general;
  const genText = gen === 'busy' ? T.resBusy : gen === 'signed-out' ? T.errSignedOut : gen ? T.resGeneral(gen) : '';
  const shown = toast || genText;
  $('msg').hidden = !shown;
  $('msg').textContent = shown;
  const run = $('run');
  const busy = state.running || (results && !results.done && Date.now() - results.at < 120000);
  run.textContent = busy ? T.running : T.runNow;
  run.disabled = busy;
  run.classList.toggle('busy', busy);
  $('advTitle').textContent = T.advanced;
  $('debugLabel').textContent = T.debug;
  $('debug').checked = settings.debug;
  $('saveRaw').textContent = T.saveRaw;
  $('saveRaw').disabled = !settings.debug;
  $('saveShape').textContent = T.saveShape;
  $('saveShape').disabled = !settings.debug;
  $('rawMsg').textContent = '';
}

async function refresh() { snap = await send('state'); render(); }

$('lang').addEventListener('change', async (e) => { snap = await send('lang', { lang: e.target.value }); render(); });
$('run').addEventListener('click', async () => {
  const r = await send('runNow').catch((e) => ({ error: e.message }));
  if (r?.state) { snap = r; render(); } else { toast = T.resGeneral(r?.error || 'no answer from the background worker'); await refresh(); }
});
$('debug').addEventListener('change', async (e) => { snap = await send('debug', { on: e.target.checked }); render(); });
$('saveRaw').addEventListener('click', async () => {
  const raw = await send('raw');
  const sites = Object.keys(raw || {});
  if (!sites.length) { $('rawMsg').textContent = T.noRaw; return; }
  for (const s of sites) {
    const url = URL.createObjectURL(new Blob([raw[s].body], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = `feedql-${s}-raw-${new Date(raw[s].at).toISOString().slice(0, 16).replace(/[:T]/g, '')}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
});

$('saveShape').addEventListener('click', async () => {
  const shape = await send('shape');
  if (!shape?.requests?.length) { $('rawMsg').textContent = T.noRaw; return; }
  const url = URL.createObjectURL(new Blob([JSON.stringify(shape, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url; a.download = `feedql-request-shape-${new Date(shape.at).toISOString().slice(0, 16).replace(/[:T]/g, '')}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
});

await refresh();
chrome.storage.onChanged.addListener(refresh);
