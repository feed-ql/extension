// UA / EN strings for the popup. lang 'auto' follows the browser UI language.
export const STRINGS = {
  en: {
    title: 'feedql collector',
    lead: 'Brings posts from the sites feedql offers (such as X and LinkedIn) into your own feed. Fetched in this browser with your own sessions; cookies never leave it.',
    signIn: 'Sign in to feedql', signOut: 'Sign out', signedOut: 'Not signed in', signingIn: 'Opening feedql…',
    runNow: 'Run now', running: 'Running…', never: 'Never ran', ago: (s) => s + ' ago',
    pushed: (n) => `${n} new`, dupes: (n) => `${n} known`, total: (n) => `${n} sent in total`,
    backoff: (t) => `Paused until ${t}`, on: 'On', off: 'Off', ok: 'OK', failed: 'Failed',
    hint: 'Searches posts for your topics with your own session. Use gently: sites limit automation.',
    hint_youtube: 'Reads your YouTube History and Watch later pages in this browser, with your own session. Only the video list (link, title, channel) goes to feedql, never a cookie. Only you see it, in the topic "My YouTube", with transcripts and summaries. Turning it off stops reading and keeps what was collected.',
    details: 'Details', detIfOn: 'If you switch it on, this site will:', detNow: 'This site:', detAbout: 'What it does', detHosts: 'Reads only these sites', detPages: 'Fetches these pages', detCookies: 'Uses these cookies (names only, sent only to the same site)',
    detNoCookies: 'none', detSends: 'Sends to feedql', detWho: 'Who sees it', detWhoText: 'Only you. It goes to your own private feed on feedql; nobody else gets a copy.',
    detOff: 'Turn it off', detOffText: 'Use the switch above. Reading stops at once and the access Chrome gave is withdrawn; what was already collected stays in your feed.',
    detUnknown: 'This version of feedql did not list the pages and cookies yet; they are shown after the first start and need your OK then.',
    fields: { external_id: 'post id', url: 'link', title: 'title', text: 'text', author: 'author', author_url: 'author link', published_at: 'time', lang: 'language', place: 'place', discussion_url: 'discussion link', metrics: 'counts (likes, replies)', query: 'which search or list found it' },
    needsOk: 'Needs your OK', needsOkLead: 'An update asks for more than you allowed, so this site is paused. Added:', approve: 'Approve and allow', resNeedsOk: 'Paused: needs your OK (see Details)', added: 'added',
    access: (h) => `Needs access to: ${h}`, synced: (t) => `Last synced ${t}`, neverSynced: 'Not synced yet',
    noSites: 'No sites offered yet. Open this popup again in a moment.',
    permDenied: 'Chrome did not grant access to the site, so it stays off.', errToggle: (m) => `Could not change the site: ${m}`,
    advanced: 'Debug',
    debug: 'Keep last raw responses on this device', saveRaw: 'Save raw response', saveShape: 'Capture request shape', noRaw: 'Nothing captured yet',
    language: 'Language', foot: 'Runs every 15–30 min while the browser is open.',
    resOk: (n, d) => `OK, ${n} new` + (d ? `, ${d} known` : ''), resRunning: 'Running…', resNoTasks: (r) => r === 'leased' ? 'Searches are held by another browser install; try again in a few minutes' : 'Nothing to search: follow a topic with words in feedql',
    resNotDue: (t) => `Nothing due until ${t}`, resBackoff: (t, why) => `Paused until ${t}` + (why && why !== 'server' && why !== 'site' ? ` (${why})` : ' (the site or feedql asked to slow down)'),
    resPerm: 'Needs permission to read this site', allow: 'Allow', resSignedOut: (s) => `Signed out of ${s}: open it in this browser and sign in`, resError: (m) => `Error: ${m}`,
    resBusy: 'A run is already in progress', resGeneral: (m) => `Run failed: ${m}`,
    signinFirst: 'Sign in first', errSignedOut: 'Your feedql session ended. Sign in again.', busy: 'A run is already in progress',
  },
  uk: {
    title: 'колектор feedql',
    lead: 'Додає дописи з сайтів, які пропонує feedql (наприклад X і LinkedIn), у вашу стрічку. Завантажується в цьому браузері з вашими сесіями; cookies звідси не виходять.',
    signIn: 'Увійти в feedql', signOut: 'Вийти', signedOut: 'Не виконано вхід', signingIn: 'Відкриваємо feedql…',
    runNow: 'Запустити зараз', running: 'Працює…', never: 'Ще не запускався', ago: (s) => s + ' тому',
    pushed: (n) => `${n} нових`, dupes: (n) => `${n} відомих`, total: (n) => `${n} надіслано загалом`,
    backoff: (t) => `Пауза до ${t}`, on: 'Увімк.', off: 'Вимк.', ok: 'ОК', failed: 'Помилка',
    hint: 'Шукає дописи за вашими темами у вашій власній сесії. Обережно: сайти обмежують автоматизацію.',
    hint_youtube: 'Читає сторінки «Історія» і «Дивитися пізніше» на YouTube у цьому браузері, у вашій сесії. До feedql іде лише список відео (посилання, назва, канал), ніколи cookie. Бачите його тільки ви, у темі «My YouTube», з транскриптами та підсумками. Вимкнення зупиняє читання і залишає вже зібране.',
    details: 'Деталі', detIfOn: 'Якщо ви ввімкнете, цей сайт:', detNow: 'Цей сайт:', detAbout: 'Що він робить', detHosts: 'Читає лише ці сайти', detPages: 'Завантажує ці сторінки', detCookies: 'Використовує ці cookie (лише назви, надсилаються лише на той самий сайт)',
    detNoCookies: 'жодних', detSends: 'Надсилає до feedql', detWho: 'Хто це бачить', detWhoText: 'Лише ви. Це потрапляє у вашу особисту стрічку на feedql; ніхто інший не отримує копії.',
    detOff: 'Як вимкнути', detOffText: 'Перемикач вище. Читання зупиняється одразу, дозвіл Chrome скасовується; уже зібране лишається у вашій стрічці.',
    detUnknown: 'Ця версія feedql ще не показувала сторінки й cookie; вони з’являться після першого запуску і тоді потребуватимуть вашого підтвердження.',
    fields: { external_id: 'ідентифікатор допису', url: 'посилання', title: 'заголовок', text: 'текст', author: 'автор', author_url: 'посилання на автора', published_at: 'час', lang: 'мова', place: 'місце', discussion_url: 'посилання на обговорення', metrics: 'лічильники (вподобання, відповіді)', query: 'який пошук чи список це знайшов' },
    needsOk: 'Потрібне ваше підтвердження', needsOkLead: 'Оновлення просить більше, ніж ви дозволили, тому сайт призупинено. Додано:', approve: 'Підтвердити й дозволити', resNeedsOk: 'Призупинено: потрібне підтвердження (див. Деталі)', added: 'додано',
    access: (h) => `Потрібен доступ до: ${h}`, synced: (t) => `Остання синхронізація ${t}`, neverSynced: 'Ще не синхронізовано',
    noSites: 'Сайтів поки немає. Відкрийте вікно ще раз за мить.',
    permDenied: 'Chrome не надав доступ до сайту, тому він лишається вимкненим.', errToggle: (m) => `Не вдалося змінити сайт: ${m}`,
    advanced: 'Діагностика',
    debug: 'Зберігати останні сирі відповіді на цьому пристрої', saveRaw: 'Зберегти сиру відповідь', saveShape: 'Зняти форму запитів', noRaw: 'Ще нічого не зафіксовано',
    language: 'Мова', foot: 'Працює кожні 15–30 хв, поки браузер відкритий.',
    resOk: (n, d) => `ОК, ${n} нових` + (d ? `, ${d} відомих` : ''), resRunning: 'Працює…', resNoTasks: (r) => r === 'leased' ? 'Пошуки утримує інша інсталяція браузера; спробуйте за кілька хвилин' : 'Нічого шукати: стежте в feedql за темою зі словами',
    resNotDue: (t) => `Нічого до ${t}`, resBackoff: (t, why) => `Пауза до ${t}` + (why && why !== 'server' && why !== 'site' ? ` (${why})` : ' (сайт або feedql просить не поспішати)'),
    resPerm: 'Потрібен дозвіл читати цей сайт', allow: 'Дозволити', resSignedOut: (s) => `Не виконано вхід на ${s}: відкрийте його в цьому браузері й увійдіть`, resError: (m) => `Помилка: ${m}`,
    resBusy: 'Запуск уже триває', resGeneral: (m) => `Запуск не вдався: ${m}`,
    signinFirst: 'Спершу увійдіть', errSignedOut: 'Сесію feedql завершено. Увійдіть знову.', busy: 'Запуск уже триває',
  },
};

export function pickLang(pref, ui = (globalThis.navigator?.language || 'en')) {
  if (pref === 'en' || pref === 'uk') return pref;
  return /^uk/i.test(ui) ? 'uk' : 'en';
}

export function agoText(ms, t) {
  const s = Math.max(0, Math.round(ms / 1000));
  const u = (en, uk) => (t === STRINGS.uk ? uk : en);
  if (s < 60) return t.ago(u(`${s}s`, `${s} с`));
  if (s < 3600) return t.ago(u(`${Math.floor(s / 60)}m`, `${Math.floor(s / 60)} хв`));
  if (s < 86400) return t.ago(u(`${Math.floor(s / 3600)}h`, `${Math.floor(s / 3600)} год`));
  return t.ago(u(`${Math.floor(s / 86400)}d`, `${Math.floor(s / 86400)} д`));
}
