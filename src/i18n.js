// UA / EN strings for the popup. lang 'auto' follows the browser UI language.
export const STRINGS = {
  en: {
    title: 'feedql collector',
    lead: 'Brings posts from X and LinkedIn into your own feed. Fetched in this browser with your own sessions; cookies never leave it.',
    signIn: 'Sign in to feedql', signOut: 'Sign out', signedOut: 'Not signed in', signingIn: 'Opening feedql…',
    runNow: 'Run now', running: 'Running…', never: 'Never ran', ago: (s) => s + ' ago',
    pushed: (n) => `${n} new`, dupes: (n) => `${n} known`, total: (n) => `${n} sent in total`,
    backoff: (t) => `Paused until ${t}`, on: 'On', off: 'Off', ok: 'OK', failed: 'Failed',
    site_x: 'X', site_linkedin: 'LinkedIn',
    hint_x: 'Search posts for your topics', hint_linkedin: 'Search posts for your topics. Use gently: LinkedIn limits automation.',
    advanced: 'Debug',
    debug: 'Keep last raw responses on this device', saveRaw: 'Save raw response', noRaw: 'Nothing captured yet',
    language: 'Language', foot: 'Runs every 15–30 min while the browser is open.',
    signinFirst: 'Sign in first', errSignedOut: 'Your feedql session ended. Sign in again.', busy: 'A run is already in progress',
  },
  uk: {
    title: 'колектор feedql',
    lead: 'Додає дописи з X і LinkedIn у вашу стрічку. Завантажується в цьому браузері з вашими сесіями; cookies звідси не виходять.',
    signIn: 'Увійти в feedql', signOut: 'Вийти', signedOut: 'Не виконано вхід', signingIn: 'Відкриваємо feedql…',
    runNow: 'Запустити зараз', running: 'Працює…', never: 'Ще не запускався', ago: (s) => s + ' тому',
    pushed: (n) => `${n} нових`, dupes: (n) => `${n} відомих`, total: (n) => `${n} надіслано загалом`,
    backoff: (t) => `Пауза до ${t}`, on: 'Увімк.', off: 'Вимк.', ok: 'ОК', failed: 'Помилка',
    site_x: 'X', site_linkedin: 'LinkedIn',
    hint_x: 'Шукає дописи за вашими темами', hint_linkedin: 'Шукає дописи за вашими темами. Обережно: LinkedIn обмежує автоматизацію.',
    advanced: 'Діагностика',
    debug: 'Зберігати останні сирі відповіді на цьому пристрої', saveRaw: 'Зберегти сиру відповідь', noRaw: 'Ще нічого не зафіксовано',
    language: 'Мова', foot: 'Працює кожні 15–30 хв, поки браузер відкритий.',
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
