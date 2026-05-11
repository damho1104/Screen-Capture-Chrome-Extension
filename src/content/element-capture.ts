import type { ContentToBackgroundMessage } from '../shared/messages';
import { clampRectToViewport, createVerticalChunks } from '../shared/geometry';
import type { Rect } from '../shared/types';
import { createOverlayHost, installBaseStyles } from './overlay';

const ELEMENT_CAPTURE_SETTLE_DELAY_MS = 650;

function getViewportSize(): { width: number; height: number } {
  return { width: window.innerWidth, height: window.innerHeight };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForNextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function getElementViewportRect(element: Element): Rect {
  const rect = element.getBoundingClientRect();
  return {
    x: rect.left,
    y: rect.top,
    width: rect.width,
    height: rect.height
  };
}

function getElementDocumentRect(element: Element): Rect {
  const rect = element.getBoundingClientRect();
  return {
    x: rect.left + window.scrollX,
    y: rect.top + window.scrollY,
    width: rect.width,
    height: rect.height
  };
}
function applyRectangleStyle(element: HTMLElement, rect: Rect): void {
  element.style.display = 'block';
  element.style.left = `${rect.x}px`;
  element.style.top = `${rect.y}px`;
  element.style.width = `${rect.width}px`;
  element.style.height = `${rect.height}px`;
}

function getPageHeight(): number {
  return Math.max(
    document.documentElement.scrollHeight,
    document.documentElement.offsetHeight,
    document.body?.scrollHeight ?? 0,
    document.body?.offsetHeight ?? 0
  );
}

function getPageWidth(): number {
  return Math.max(
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
    document.body?.scrollWidth ?? 0
  );
}

function isSelectableElement(element: Element | null): element is HTMLElement {
  return element instanceof HTMLElement && element !== document.body && element !== document.documentElement;
}

type SelectedElement = {
  viewportRect: Rect;
  documentRect: Rect;
};

export function startElementCapture(): () => void {
  const overlay = createOverlayHost();
  overlay.host.style.background = 'rgba(15, 23, 42, 0.10)';
  overlay.host.style.cursor = 'pointer';
  installBaseStyles(overlay.root);

  const backdrop = document.createElement('div');
  backdrop.className = 'capture-backdrop';
  backdrop.style.background = 'transparent';
  backdrop.style.cursor = 'pointer';

  const highlight = document.createElement('div');
  highlight.style.position = 'fixed';
  highlight.style.border = '2px solid #f97316';
  highlight.style.background = 'rgba(249, 115, 22, 0.14)';
  highlight.style.pointerEvents = 'none';
  highlight.style.display = 'none';

  const toolbar = document.createElement('div');
  toolbar.className = 'capture-toolbar';
  toolbar.textContent = '캡처할 영역을 클릭하세요. ESC로 취소';

  overlay.root.append(backdrop, highlight, toolbar);

  let selectedElement: SelectedElement | null = null;
  let cleanedUp = false;

  function clearSelection(): void {
    selectedElement = null;
    highlight.style.display = 'none';
  }

  function getElementAtPoint(x: number, y: number): HTMLElement | null {
    const originalPointerEvents = overlay.host.style.pointerEvents;
    overlay.host.style.pointerEvents = 'none';
    const element = document.elementFromPoint(x, y);
    overlay.host.style.pointerEvents = originalPointerEvents;
    return isSelectableElement(element) ? element : null;
  }

  function updateSelection(x: number, y: number): void {
    const element = getElementAtPoint(x, y);
    if (!element) {
      clearSelection();
      return;
    }

    const viewportRect = clampRectToViewport(getElementViewportRect(element), getViewportSize());
    if (viewportRect.width <= 0 || viewportRect.height <= 0) {
      clearSelection();
      return;
    }

    selectedElement = { viewportRect, documentRect: getElementDocumentRect(element) };
    applyRectangleStyle(highlight, viewportRect);
  }

  function cleanup(): void {
    if (cleanedUp) return;
    cleanedUp = true;
    backdrop.removeEventListener('pointermove', onPointerMove);
    backdrop.removeEventListener('click', onClick, true);
    overlay.host.removeEventListener('pointermove', onPointerMove);
    overlay.host.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKeyDown, true);
    overlay.remove();
  }

  const onPointerMove = (event: PointerEvent): void => {
    event.preventDefault();
    updateSelection(event.clientX, event.clientY);
  };

  async function captureSelectedElement(selection: SelectedElement): Promise<void> {
    const originalScrollX = window.scrollX;
    const originalScrollY = window.scrollY;
    const pageHeight = getPageHeight();
    const pageWidth = getPageWidth();
    const viewportHeight = window.innerHeight;
    const chunks = createVerticalChunks({ pageHeight: selection.documentRect.y + selection.documentRect.height, viewportHeight }).filter((chunk) => {
      const chunkBottom = chunk.scrollY + chunk.height;
      return chunkBottom > selection.documentRect.y && chunk.scrollY < selection.documentRect.y + selection.documentRect.height;
    });

    try {
      await chrome.runtime.sendMessage({
        type: 'ELEMENT_CAPTURE_STARTED',
        chunks,
        documentRect: selection.documentRect,
        pageWidth,
        pageHeight,
        devicePixelRatio: window.devicePixelRatio
      } satisfies ContentToBackgroundMessage);

      for (const [index, chunk] of chunks.entries()) {
        toolbar.textContent = `캡처 처리 중... ${index + 1}/${chunks.length}`;
        window.scrollTo(0, chunk.scrollY);
        await delay(ELEMENT_CAPTURE_SETTLE_DELAY_MS);
        overlay.host.style.visibility = 'hidden';
        await waitForNextFrame();
        try {
          await chrome.runtime.sendMessage({
            type: 'ELEMENT_CAPTURE_SCROLLED',
            scrollY: chunk.scrollY,
            viewportHeight
          } satisfies ContentToBackgroundMessage);
        } finally {
          overlay.host.style.visibility = 'visible';
        }
      }

      toolbar.textContent = '캡처 이미지 처리 중...';
    } finally {
      window.scrollTo(originalScrollX, originalScrollY);
    }
  }
  const onClick = (event: MouseEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    if (!selectedElement) return;

    const selection = selectedElement;
    selectedElement = null;
    backdrop.style.cursor = 'wait';
    overlay.host.style.cursor = 'wait';
    toolbar.textContent = '캡처 처리 중...';

    void captureSelectedElement(selection)
      .then(() => cleanup())
      .catch((error: unknown) => {
        console.error('[screen-capture] element send failed', error);
        overlay.host.style.visibility = 'visible';
        toolbar.textContent = '캡처 처리에 실패했습니다. ESC로 닫기';
      });
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    cleanup();
    void chrome.runtime.sendMessage({ type: 'CAPTURE_CANCELLED' } satisfies ContentToBackgroundMessage);
  };

  backdrop.addEventListener('pointermove', onPointerMove);
  backdrop.addEventListener('click', onClick, true);
  overlay.host.addEventListener('pointermove', onPointerMove);
  overlay.host.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKeyDown, true);

  return cleanup;
}
