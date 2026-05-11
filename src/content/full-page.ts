import type { ContentToBackgroundMessage } from '../shared/messages';
import { createVerticalChunks } from '../shared/geometry';
import { createOverlayHost, installBaseStyles } from './overlay';

export const SETTLE_DELAY_MS = 300;
export const MAX_CAPTURE_HEIGHT = 30000;

type SuppressedElement = { element: HTMLElement; visibility: string };

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getPageHeight(): number {
  const documentElement = document.documentElement;
  const body = document.body;

  return Math.max(
    documentElement.scrollHeight,
    documentElement.offsetHeight,
    body?.scrollHeight ?? 0,
    body?.offsetHeight ?? 0
  );
}

export function getPageWidth(): number {
  const documentElement = document.documentElement;
  const body = document.body;

  return Math.max(
    documentElement.scrollWidth,
    documentElement.clientWidth,
    body?.scrollWidth ?? 0
  );
}

export function suppressFixedElements(): SuppressedElement[] {
  const suppressed: SuppressedElement[] = [];

  for (const element of document.body.querySelectorAll<HTMLElement>('*')) {
    const position = window.getComputedStyle(element).position;
    if (position !== 'fixed' && position !== 'sticky') continue;

    suppressed.push({ element, visibility: element.style.visibility });
    element.style.visibility = 'hidden';
  }

  return suppressed;
}

export function restoreSuppressedElements(suppressed: SuppressedElement[]): void {
  for (const { element, visibility } of suppressed) {
    element.style.visibility = visibility;
  }
}

export function startFullPageCapture(): () => void {
  const overlay = createOverlayHost();
  installBaseStyles(overlay.root);

  const backdrop = document.createElement('div');
  backdrop.className = 'capture-backdrop';

  const toolbar = document.createElement('div');
  toolbar.className = 'capture-toolbar';
  toolbar.textContent = '전체 페이지 캡처 중... ESC로 취소';

  overlay.root.append(backdrop, toolbar);

  const originalScrollX = window.scrollX;
  const originalScrollY = window.scrollY;
  const suppressedElements = suppressFixedElements();
  let cancelled = false;
  let cleanedUp = false;

  function cleanup(): void {
    cancelled = true;
    if (cleanedUp) return;
    cleanedUp = true;
    document.removeEventListener('keydown', onKeyDown, true);
    restoreSuppressedElements(suppressedElements);
    window.scrollTo(originalScrollX, originalScrollY);
    overlay.remove();
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    cancelled = true;
    cleanup();
    void chrome.runtime.sendMessage({ type: 'CAPTURE_CANCELLED' } satisfies ContentToBackgroundMessage);
  };

  async function run(): Promise<void> {
    const pageHeight = Math.min(getPageHeight(), MAX_CAPTURE_HEIGHT);
    const pageWidth = getPageWidth();
    const viewportHeight = window.innerHeight;
    const chunks = createVerticalChunks({ pageHeight, viewportHeight });

    await chrome.runtime.sendMessage({
      type: 'FULL_PAGE_PLAN_READY',
      chunks,
      pageWidth,
      pageHeight,
      devicePixelRatio: window.devicePixelRatio
    } satisfies ContentToBackgroundMessage);

    for (const [index, chunk] of chunks.entries()) {
      if (cancelled) return;
      toolbar.textContent = `전체 페이지 캡처 중... ${index + 1}/${chunks.length} ESC로 취소`;
      window.scrollTo(0, chunk.scrollY);
      await delay(SETTLE_DELAY_MS);
      if (cancelled) return;
      overlay.host.style.visibility = 'hidden';
      try {
        await chrome.runtime.sendMessage({ type: 'FULL_PAGE_SCROLLED', scrollY: chunk.scrollY, y: chunk.y, viewportHeight } satisfies ContentToBackgroundMessage);
      } finally {
        overlay.host.style.visibility = 'visible';
      }
    }
  }

  document.addEventListener('keydown', onKeyDown, true);
  void run().finally(() => {
    if (!cancelled) cleanup();
  });

  return cleanup;
}
