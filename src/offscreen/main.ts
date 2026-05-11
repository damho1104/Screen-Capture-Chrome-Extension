import { dataUrlToImageBitmap, offscreenCanvasToDataUrl } from '../shared/image';
import type { BackgroundToOffscreenMessage, OffscreenToBackgroundMessage } from '../shared/messages';
import type { Rect } from '../shared/types';

type CropImageMessage = Extract<BackgroundToOffscreenMessage, { type: 'CROP_IMAGE' }>;
type MergeVerticalImagesMessage = Extract<BackgroundToOffscreenMessage, { type: 'MERGE_VERTICAL_IMAGES' }>;

function getCanvasContext(canvas: OffscreenCanvas): OffscreenCanvasRenderingContext2D {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas context is unavailable.');
  return context;
}

export function resolveSourceRect(message: CropImageMessage, bitmap: ImageBitmap): Rect {
  if (!message.viewport) return message.rect;

  const scaleX = bitmap.width / message.viewport.width;
  const scaleY = bitmap.height / message.viewport.height;
  const rawLeft = Math.floor(message.rect.x * scaleX);
  const rawTop = Math.floor(message.rect.y * scaleY);
  const rawRight = Math.ceil((message.rect.x + message.rect.width) * scaleX);
  const rawBottom = Math.ceil((message.rect.y + message.rect.height) * scaleY);
  const left = Math.min(bitmap.width, Math.max(0, rawLeft));
  const top = Math.min(bitmap.height, Math.max(0, rawTop));
  const right = Math.min(bitmap.width, Math.max(left, rawRight));
  const bottom = Math.min(bitmap.height, Math.max(top, rawBottom));

  return {
    x: left,
    y: top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top)
  };
}

async function cropImage(message: CropImageMessage): Promise<OffscreenToBackgroundMessage> {
  const bitmap = await dataUrlToImageBitmap(message.dataUrl);

  try {
    const sourceRect = resolveSourceRect(message, bitmap);
    const canvas = new OffscreenCanvas(sourceRect.width, sourceRect.height);
    const context = getCanvasContext(canvas);

    context.drawImage(
      bitmap,
      sourceRect.x,
      sourceRect.y,
      sourceRect.width,
      sourceRect.height,
      0,
      0,
      sourceRect.width,
      sourceRect.height
    );

    return {
      type: 'IMAGE_PROCESSED',
      result: {
        dataUrl: await offscreenCanvasToDataUrl(canvas),
        width: sourceRect.width,
        height: sourceRect.height,
        mode: 'drag'
      }
    };
  } finally {
    bitmap.close();
  }
}

export function resolveMergeCanvasSize(message: MergeVerticalImagesMessage): { width: number; height: number; outputScale: number } {
  const outputScale = message.outputScale ?? 1;
  return {
    width: Math.round(message.width * outputScale),
    height: Math.round(message.height * outputScale),
    outputScale
  };
}

async function mergeVerticalImages(message: MergeVerticalImagesMessage): Promise<OffscreenToBackgroundMessage> {
  const { width, height, outputScale } = resolveMergeCanvasSize(message);
  const canvas = new OffscreenCanvas(width, height);
  const context = getCanvasContext(canvas);

  for (const image of message.images) {
    const bitmap = await dataUrlToImageBitmap(image.dataUrl);
    try {
      const sourceHeight = Math.round(image.height * (message.sourceWidth / message.width));
      context.drawImage(
        bitmap,
        0,
        0,
        message.sourceWidth,
        sourceHeight,
        0,
        Math.round(image.y * outputScale),
        Math.round(message.width * outputScale),
        Math.round(image.height * outputScale)
      );
    } finally {
      bitmap.close();
    }
  }

  return {
    type: 'IMAGE_PROCESSED',
    result: {
      dataUrl: await offscreenCanvasToDataUrl(canvas),
      width: canvas.width,
      height: canvas.height,
      mode: 'fullPage'
    }
  };
}

function isBackgroundToOffscreenMessage(message: unknown): message is BackgroundToOffscreenMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    'type' in message &&
    (message.type === 'CROP_IMAGE' || message.type === 'MERGE_VERTICAL_IMAGES')
  );
}

async function processImage(message: BackgroundToOffscreenMessage): Promise<OffscreenToBackgroundMessage> {
  if (message.type === 'CROP_IMAGE') return cropImage(message);
  if (message.type === 'MERGE_VERTICAL_IMAGES') return mergeVerticalImages(message);
  return { type: 'IMAGE_PROCESSING_FAILED', message: 'Unknown image operation.' };
}

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!isBackgroundToOffscreenMessage(message)) return false;

  void processImage(message)
    .then((response) => {
      sendResponse(response);
    })
    .catch((error: unknown) => {
      console.error('[screen-capture] offscreen:error', error);
      sendResponse({
        type: 'IMAGE_PROCESSING_FAILED',
        message: error instanceof Error ? error.message : 'Image processing failed.'
      } satisfies OffscreenToBackgroundMessage);
    });

  return true;
});
