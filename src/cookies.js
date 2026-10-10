// The ONLY cookie read in the extension. A recipe header may name {cookie:NAME@HOST}; the interpreter calls this for
// one request and puts the value into that request's header. The value is never stored, logged, returned to the popup
// or sent to feedql (test/cookies.test.js). Needs the site's optional host permission, granted by the person.
export async function readCookie(name, host) {
  try {
    const c = await chrome.cookies.get({ url: `https://${host}/`, name });
    return c ? c.value : '';
  } catch {
    return '';
  }
}
