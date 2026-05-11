import { beforeEach, describe, expect, it, vi } from 'vitest';

async function importFullPageCapture(): Promise<typeof import('../full-page')> {
  vi.resetModules();
  vi.stubGlobal('chrome', {
    runtime: {
      sendMessage: vi.fn().mockResolvedValue(undefined)
    }
  });
  return import('../full-page');
}

function setPageMetrics(input: {
  innerHeight: number;
  scrollX?: number;
  scrollY?: number;
  documentElement?: Partial<Pick<HTMLElement, 'scrollHeight' | 'offsetHeight' | 'scrollWidth' | 'clientWidth'>>;
  body?: Partial<Pick<HTMLElement, 'scrollHeight' | 'offsetHeight' | 'scrollWidth'>>;
}): ReturnType<typeof vi.fn> {
  vi.stubGlobal('innerHeight', input.innerHeight);
  vi.stubGlobal('scrollX', input.scrollX ?? 0);
  vi.stubGlobal('scrollY', input.scrollY ?? 0);

  Object.defineProperties(document.documentElement, {
    scrollHeight: { configurable: true, value: input.documentElement?.scrollHeight ?? 0 },
    offsetHeight: { configurable: true, value: input.documentElement?.offsetHeight ?? 0 },
    scrollWidth: { configurable: true, value: input.documentElement?.scrollWidth ?? 0 },
    clientWidth: { configurable: true, value: input.documentElement?.clientWidth ?? 0 }
  });
  Object.defineProperties(document.body, {
    scrollHeight: { configurable: true, value: input.body?.scrollHeight ?? 0 },
    offsetHeight: { configurable: true, value: input.body?.offsetHeight ?? 0 },
    scrollWidth: { configurable: true, value: input.body?.scrollWidth ?? 0 }
  });

  const scrollTo = vi.fn((x: number, y: number) => {
    vi.stubGlobal('scrollX', x);
    vi.stubGlobal('scrollY', y);
  });
  vi.stubGlobal('scrollTo', scrollTo);
  return scrollTo;
}

function addPositionedElement(position: 'fixed' | 'sticky', visibility = ''): HTMLElement {
  const element = document.createElement('div');
  element.style.position = position;
  element.style.visibility = visibility;
  document.body.append(element);
  return element;
}

describe('startFullPageCapture', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.getElementById('screen-capture-extension-overlay')?.remove();
  });

  it('sends a full-page plan, scrolls each chunk, and restores the original scroll position', async () => {
    vi.useFakeTimers();
    const { startFullPageCapture } = await importFullPageCapture();
    const sendMessage = vi.mocked(chrome.runtime.sendMessage);
    const scrollTo = setPageMetrics({
      innerHeight: 500,
      scrollX: 7,
      scrollY: 120,
      documentElement: { scrollHeight: 1250, offsetHeight: 1100, scrollWidth: 900, clientWidth: 800 },
      body: { scrollHeight: 1000, offsetHeight: 900, scrollWidth: 1000 }
    });

    startFullPageCapture();
    await vi.advanceTimersByTimeAsync(900);

    expect(sendMessage).toHaveBeenNthCalledWith(1, {
      type: 'FULL_PAGE_PLAN_READY',
      chunks: [
        { scrollY: 0, y: 0, height: 500 },
        { scrollY: 500, y: 500, height: 500 },
        { scrollY: 750, y: 1000, height: 250 }
      ],
      pageWidth: 1000,
      pageHeight: 1250,
      devicePixelRatio: 1
    });
    expect(sendMessage).toHaveBeenNthCalledWith(2, { type: 'FULL_PAGE_SCROLLED', scrollY: 0, y: 0, viewportHeight: 500 });
    expect(sendMessage).toHaveBeenNthCalledWith(3, { type: 'FULL_PAGE_SCROLLED', scrollY: 500, y: 500, viewportHeight: 500 });
    expect(sendMessage).toHaveBeenNthCalledWith(4, { type: 'FULL_PAGE_SCROLLED', scrollY: 750, y: 1000, viewportHeight: 500 });
    expect(scrollTo).toHaveBeenLastCalledWith(7, 120);
    expect(document.getElementById('screen-capture-extension-overlay')).toBeNull();
  });

  it('cancels with Escape, sends cancellation, and restores the original scroll position', async () => {
    vi.useFakeTimers();
    const { startFullPageCapture } = await importFullPageCapture();
    const sendMessage = vi.mocked(chrome.runtime.sendMessage);
    const scrollTo = setPageMetrics({
      innerHeight: 500,
      scrollX: 3,
      scrollY: 400,
      documentElement: { scrollHeight: 1000, offsetHeight: 1000, scrollWidth: 700, clientWidth: 700 },
      body: { scrollHeight: 1000, offsetHeight: 1000, scrollWidth: 700 }
    });

    startFullPageCapture();
    await vi.advanceTimersByTimeAsync(300);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await vi.advanceTimersByTimeAsync(300);

    expect(sendMessage).toHaveBeenCalledWith({ type: 'CAPTURE_CANCELLED' });
    expect(sendMessage).toHaveBeenCalledTimes(3);
    expect(sendMessage).not.toHaveBeenCalledWith({ type: 'FULL_PAGE_SCROLLED', scrollY: 500, viewportHeight: 500 });
    expect(scrollTo).toHaveBeenLastCalledWith(3, 400);
    expect(document.getElementById('screen-capture-extension-overlay')).toBeNull();
  });

  it('hides fixed and sticky elements while capturing and restores visibility after completion', async () => {
    vi.useFakeTimers();
    const { startFullPageCapture } = await importFullPageCapture();
    const fixed = addPositionedElement('fixed', 'collapse');
    const sticky = addPositionedElement('sticky');
    setPageMetrics({
      innerHeight: 500,
      documentElement: { scrollHeight: 500, offsetHeight: 500, scrollWidth: 700, clientWidth: 700 },
      body: { scrollHeight: 500, offsetHeight: 500, scrollWidth: 700 }
    });

    startFullPageCapture();

    expect(fixed.style.visibility).toBe('hidden');
    expect(sticky.style.visibility).toBe('hidden');

    await vi.advanceTimersByTimeAsync(300);

    expect(fixed.style.visibility).toBe('collapse');
    expect(sticky.style.visibility).toBe('');
  });

  it('restores fixed and sticky element visibility when cancelled', async () => {
    vi.useFakeTimers();
    const { startFullPageCapture } = await importFullPageCapture();
    const fixed = addPositionedElement('fixed', 'collapse');
    const sticky = addPositionedElement('sticky');
    setPageMetrics({
      innerHeight: 500,
      documentElement: { scrollHeight: 1000, offsetHeight: 1000, scrollWidth: 700, clientWidth: 700 },
      body: { scrollHeight: 1000, offsetHeight: 1000, scrollWidth: 700 }
    });

    startFullPageCapture();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await vi.advanceTimersByTimeAsync(300);

    expect(fixed.style.visibility).toBe('collapse');
    expect(sticky.style.visibility).toBe('');
  });
});
