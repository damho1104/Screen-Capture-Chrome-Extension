export type OverlayHost = {
  root: ShadowRoot;
  host: HTMLDivElement;
  remove: () => void;
};

const HOST_ID = 'screen-capture-extension-overlay';

export function createOverlayHost(): OverlayHost {
  document.getElementById(HOST_ID)?.remove();

  const host = document.createElement('div');
  host.id = HOST_ID;
  host.style.position = 'fixed';
  host.style.inset = '0';
  host.style.zIndex = '2147483647';
  host.style.pointerEvents = 'auto';

  const root = host.attachShadow({ mode: 'open' });
  document.documentElement.append(host);

  return {
    root,
    host,
    remove: () => host.remove()
  };
}

export function installBaseStyles(root: ShadowRoot): void {
  const style = document.createElement('style');
  style.textContent = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    .capture-backdrop {
      position: fixed;
      inset: 0;
      cursor: crosshair;
      background: rgba(15, 23, 42, 0.22);
      user-select: none;
    }
    .capture-toolbar {
      position: fixed;
      top: 16px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      gap: 8px;
      align-items: center;
      padding: 8px 12px;
      border-radius: 999px;
      color: #fff;
      background: rgba(17, 24, 39, 0.92);
      font: 13px system-ui, sans-serif;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.24);
    }
    .capture-button {
      border: 0;
      border-radius: 999px;
      padding: 6px 10px;
      color: #111827;
      background: #ffffff;
      cursor: pointer;
      font: 12px system-ui, sans-serif;
    }
  `;
  root.append(style);
}

export function showMessageOverlay(message: string): () => void {
  const overlay = createOverlayHost();
  installBaseStyles(overlay.root);

  const backdrop = document.createElement('div');
  backdrop.className = 'capture-backdrop';
  backdrop.style.cursor = 'default';

  const toolbar = document.createElement('div');
  toolbar.className = 'capture-toolbar';

  const messageText = document.createElement('span');
  messageText.textContent = message;

  const closeButton = document.createElement('button');
  closeButton.className = 'capture-button';
  closeButton.type = 'button';
  closeButton.textContent = '닫기';

  toolbar.append(messageText, closeButton);
  overlay.root.append(backdrop, toolbar);

  const cleanup = () => overlay.remove();
  closeButton.addEventListener('click', cleanup);

  return cleanup;
}
