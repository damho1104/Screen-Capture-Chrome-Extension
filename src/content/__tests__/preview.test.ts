import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CaptureResult } from '../../shared/types';

function installChromeStub(): ReturnType<typeof vi.fn> {
  const sendMessage = vi.fn();
  vi.stubGlobal('chrome', {
    runtime: {
      sendMessage
    }
  });
  return sendMessage;
}

async function importPreview(): Promise<typeof import('../preview')> {
  vi.resetModules();
  installChromeStub();
  return import('../preview');
}

function getOverlayRoot(): ShadowRoot {
  const host = document.getElementById('screen-capture-extension-overlay');
  if (!host?.shadowRoot) throw new Error('Preview overlay was not created.');
  return host.shadowRoot;
}

function clickButton(label: string): void {
  const button = Array.from(getOverlayRoot().querySelectorAll('button')).find((candidate) => candidate.textContent === label);
  if (!button) throw new Error(`${label} button was not found.`);
  button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

const result: CaptureResult = {
  dataUrl: 'data:image/png;base64,cHJldmlldw==',
  width: 120,
  height: 80,
  mode: 'drag'
};

describe('showPreview', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    document.body.replaceChildren();
    document.documentElement.querySelector('#screen-capture-extension-overlay')?.remove();
  });

  it('renders the captured image and sends a save request', async () => {
    const { showPreview } = await importPreview();
    const sendMessage = vi.mocked(chrome.runtime.sendMessage);

    showPreview(result, 'drag');

    const image = getOverlayRoot().querySelector('img');
    expect(image?.getAttribute('src')).toBe(result.dataUrl);
    expect(image?.getAttribute('alt')).toBe('캡처 미리보기');

    clickButton('저장');

    expect(sendMessage).toHaveBeenCalledWith({ type: 'PREVIEW_SAVE_REQUESTED', dataUrl: result.dataUrl });
  });

  it('renders equal-sized grouped action buttons with primary and secondary styles', async () => {
    const { showPreview } = await importPreview();

    showPreview(result, 'drag');

    const actions = getOverlayRoot().querySelector('.preview-actions');
    const buttons = Array.from(getOverlayRoot().querySelectorAll<HTMLButtonElement>('.preview-button'));
    expect(actions?.classList.contains('preview-actions')).toBe(true);
    expect(buttons).toHaveLength(4);
    expect(buttons.map((button) => button.textContent)).toEqual(['복사', '저장', '다시 캡처', '닫기']);
    expect(buttons.every((button) => button.classList.contains('preview-button'))).toBe(true);
    expect(buttons[0].classList.contains('preview-button-primary')).toBe(true);
    expect(buttons[1].classList.contains('preview-button-primary')).toBe(true);
    expect(buttons[2].classList.contains('preview-button-secondary')).toBe(true);
    expect(buttons[3].classList.contains('preview-button-secondary')).toBe(true);
  });

  it('uses a neutral button palette without orange gradients', async () => {
    const { showPreview } = await importPreview();

    showPreview(result, 'drag');

    const style = Array.from(getOverlayRoot().querySelectorAll('style')).map((element) => element.textContent ?? '').join('\n');
    expect(style).toContain('background: #f8fafc;');
    expect(style).toContain('color: #0f172a;');
    expect(style).not.toContain('#fed7aa');
    expect(style).not.toContain('251, 146, 60');
  });
  it('shows a partial capture status when the result is partial', async () => {
    const { showPreview } = await importPreview();

    showPreview({ ...result, partial: true }, 'drag');

    expect(getOverlayRoot().textContent).toContain('일부 영역만 캡처되었습니다.');
  });

  it('retries the provided mode and removes the overlay', async () => {
    const { showPreview } = await importPreview();
    const sendMessage = vi.mocked(chrome.runtime.sendMessage);

    showPreview(result, 'element');
    clickButton('다시 캡처');

    expect(sendMessage).toHaveBeenCalledWith({ type: 'PREVIEW_RETRY_REQUESTED', mode: 'element' });
    expect(document.getElementById('screen-capture-extension-overlay')).toBeNull();
  });

  it('closes with the close button and Escape key', async () => {
    const { showPreview } = await importPreview();

    showPreview(result, 'drag');
    clickButton('닫기');
    expect(document.getElementById('screen-capture-extension-overlay')).toBeNull();

    showPreview(result, 'drag');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.getElementById('screen-capture-extension-overlay')).toBeNull();
  });

  it('copies the captured image blob to the clipboard and closes the overlay', async () => {
    const { showPreview } = await importPreview();
    const blob = new Blob(['preview'], { type: 'image/png' });
    const write = vi.fn().mockResolvedValue(undefined);
    const clipboardItem = vi.fn((items: Record<string, Blob>) => items);
    const fetch = vi.fn().mockResolvedValue({ blob: vi.fn().mockResolvedValue(blob) });
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('ClipboardItem', clipboardItem);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { write }
    });

    showPreview(result, 'drag');
    clickButton('복사');

    await vi.waitFor(() => expect(write).toHaveBeenCalledWith([{ 'image/png': blob }]));
    expect(fetch).toHaveBeenCalledWith(result.dataUrl);
    expect(document.getElementById('screen-capture-extension-overlay')).toBeNull();
  });

  it('shows copy fallback status when clipboard write fails', async () => {
    const { showPreview } = await importPreview();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('denied')));

    showPreview(result, 'drag');
    clickButton('복사');

    await vi.waitFor(() => expect(getOverlayRoot().textContent).toContain('복사에 실패했습니다. 저장 버튼을 사용하세요.'));
  });
});
