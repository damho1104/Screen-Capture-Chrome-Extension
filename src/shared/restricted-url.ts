const RESTRICTED_SCHEMES = new Set(['chrome:', 'chrome-extension:', 'chrome-untrusted:', 'devtools:']);
const CHROME_WEB_STORE_HOSTS = new Set(['chromewebstore.google.com', 'webstore.google.com']);

export function isRestrictedUrl(url: string | undefined): boolean {
  if (!url) return true;

  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'view-source:') return isRestrictedUrl(url.slice('view-source:'.length));
    if (RESTRICTED_SCHEMES.has(parsed.protocol)) return true;
    return CHROME_WEB_STORE_HOSTS.has(parsed.hostname);
  } catch {
    return true;
  }
}

export function getRestrictedUrlReason(url: string | undefined): string | null {
  return isRestrictedUrl(url) ? 'Chrome security policy prevents capturing this page.' : null;
}
