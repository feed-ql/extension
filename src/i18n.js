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
