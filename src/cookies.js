// The only two cookie reads in the extension. Each value is returned to the caller for ONE request header and is
// never stored, logged, or sent to feedql.
async function read(url, name) {
  const c = await chrome.cookies.get({ url, name });
  return c ? c.value : '';
}
export const xCt0 = () => read('https://x.com/', 'ct0');
export const linkedinJsessionid = () => read('https://www.linkedin.com/', 'JSESSIONID');
