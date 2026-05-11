import { describe, expect, it } from 'vitest';
import { getRestrictedUrlReason, isRestrictedUrl } from '../restricted-url';

describe('restricted URL detection', () => {
  it.each([
    ['chrome://settings', true],
    ['chrome-extension://abc/options.html', true],
    ['chrome-untrusted://print', true],
    ['devtools://devtools/bundled/inspector.html', true],
    ['view-source:chrome://settings', true],
    ['https://chromewebstore.google.com/detail/example', true],
    ['https://webstore.google.com/detail/example', true],
    ['https://chromewebstore.google.com.evil.test/detail/x', false],
    ['https://example.com/article', false],
    ['http://localhost:5173/basic.html', false],
    ['file:///tmp/test.html', false]
  ])('returns %s restricted=%s', (url, expected) => {
    expect(isRestrictedUrl(url)).toBe(expected);
  });

  it('treats malformed and missing URLs as restricted', () => {
    expect(isRestrictedUrl(undefined)).toBe(true);
    expect(isRestrictedUrl('not a url')).toBe(true);
  });

  it('explains restricted Chrome internal pages', () => {
    expect(getRestrictedUrlReason('chrome://settings')).toBe('Chrome security policy prevents capturing this page.');
  });

  it('does not explain unrestricted pages', () => {
    expect(getRestrictedUrlReason('https://example.com/article')).toBeNull();
  });
});
