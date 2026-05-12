import type { ContentToBackgroundMessage } from '../shared/messages';
import { clampRectToViewport, createRectFromPoints } from '../shared/geometry';
import type { Point, Rect } from '../shared/types';
import { waitForOverlayRemovalPaint } from './capture-timing';
import { createOverlayHost, installBaseStyles } from './overlay';

const MIN_SELECTION_SIZE = 8;

function getViewportSize(): { width: number; height: number } {
  return { width: window.innerWidth, height: window.innerHeight };
}

function applyRectangleStyle(element: HTMLElement, rect: Rect): void {
  element.style.display = 'block';
  element.style.left = `${rect.x}px`;
  element.style.top = `${rect.y}px`;
  element.style.width = `${rect.width}px`;
  element.style.height = `${rect.height}px`;
}

export function startDragCapture(): () => void {
  const overlay = createOverlayHost();
  overlay.host.style.background = 'rgba(15, 23, 42, 0.22)';
  overlay.host.style.cursor = 'crosshair';
  installBaseStyles(overlay.root);

  const backdrop = document.createElement('div');
  backdrop.className = 'capture-backdrop';

  const rectangle = document.createElement('div');
  rectangle.style.position = 'fixed';
  rectangle.style.border = '2px solid #2563eb';
  rectangle.style.background = 'rgba(37, 99, 235, 0.22)';
  rectangle.style.pointerEvents = 'none';
  rectangle.style.display = 'none';

  const toolbar = document.createElement('div');
  toolbar.className = 'capture-toolbar';
  toolbar.textContent = '드래그해서 캡처할 영역을 선택하세요. ESC로 취소';

  overlay.root.append(backdrop, rectangle, toolbar);

  let start: Point | null = null;
  let cleanedUp = false;

  function updateRectangle(current: Point): void {
    if (!start) return;
    const rawRect = createRectFromPoints(start, current);
    const rect = clampRectToViewport(rawRect, getViewportSize());
    applyRectangleStyle(rectangle, rect);
  }

  function cleanup(): void {
    if (cleanedUp) return;
    cleanedUp = true;
    backdrop.removeEventListener('pointerdown', onPointerDown);
    backdrop.removeEventListener('pointermove', onPointerMove);
    backdrop.removeEventListener('pointerup', onPointerUp);
    backdrop.removeEventListener('pointercancel', onPointerCancel);
    overlay.host.removeEventListener('pointerdown', onPointerDown);
    overlay.host.removeEventListener('pointermove', onPointerMove);
    overlay.host.removeEventListener('pointerup', onPointerUp);
    overlay.host.removeEventListener('pointercancel', onPointerCancel);
    document.removeEventListener('keydown', onKeyDown, true);
    overlay.remove();
  }

  const onPointerDown = (event: PointerEvent): void => {
    event.preventDefault();
    start = { x: event.clientX, y: event.clientY };
    backdrop.setPointerCapture?.(event.pointerId);
    updateRectangle(start);
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (!start) return;
    event.preventDefault();
    updateRectangle({ x: event.clientX, y: event.clientY });
  };

  const onPointerUp = (event: PointerEvent): void => {
    if (!start) return;
    event.preventDefault();
    const rawRect = createRectFromPoints(start, { x: event.clientX, y: event.clientY });
    const rect = clampRectToViewport(rawRect, getViewportSize());

    if (rect.width < MIN_SELECTION_SIZE || rect.height < MIN_SELECTION_SIZE) {
      cleanup();
      return;
    }

    start = null;
    backdrop.style.cursor = 'wait';
    overlay.host.style.cursor = 'wait';
    toolbar.textContent = '캡처 처리 중...';
    applyRectangleStyle(rectangle, rect);
    overlay.host.remove();

    const message: ContentToBackgroundMessage = { type: 'DRAG_AREA_SELECTED', rect, viewport: getViewportSize() };
    void waitForOverlayRemovalPaint()
      .then(() => chrome.runtime.sendMessage(message))
      .then((response: unknown) => {
        if (typeof response === 'object' && response !== null && 'ok' in response && response.ok === false) {
          document.documentElement.append(overlay.host);
          toolbar.textContent = '캡처 처리에 실패했습니다. ESC로 닫기';
        }
      })
      .catch((error: unknown) => {
        console.error('[screen-capture] drag send failed', error);
        document.documentElement.append(overlay.host);
        toolbar.textContent = '캡처 처리에 실패했습니다. ESC로 닫기';
      });
  };

  const onPointerCancel = (): void => {
    start = null;
    rectangle.style.display = 'none';
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    cleanup();
    void chrome.runtime.sendMessage({ type: 'CAPTURE_CANCELLED' } satisfies ContentToBackgroundMessage);
  };

  backdrop.addEventListener('pointerdown', onPointerDown);
  backdrop.addEventListener('pointermove', onPointerMove);
  backdrop.addEventListener('pointerup', onPointerUp);
  backdrop.addEventListener('pointercancel', onPointerCancel);
  overlay.host.addEventListener('pointerdown', onPointerDown);
  overlay.host.addEventListener('pointermove', onPointerMove);
  overlay.host.addEventListener('pointerup', onPointerUp);
  overlay.host.addEventListener('pointercancel', onPointerCancel);
  document.addEventListener('keydown', onKeyDown, true);

  return cleanup;
}
