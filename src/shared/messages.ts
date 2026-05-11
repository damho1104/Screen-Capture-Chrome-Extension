import type { CaptureMode, CaptureResult, Rect, Size, VerticalChunk } from './types';

export type PopupToBackgroundMessage = {
  type: 'START_CAPTURE';
  mode: CaptureMode;
};

export type BackgroundToContentMessage =
  | { type: 'BEGIN_DRAG_CAPTURE' }
  | { type: 'BEGIN_ELEMENT_CAPTURE' }
  | { type: 'BEGIN_FULL_PAGE_CAPTURE' }
  | { type: 'SHOW_PREVIEW'; result: CaptureResult }
  | { type: 'SHOW_ERROR'; message: string; retryMode?: CaptureMode };

export type ContentToBackgroundMessage =
  | { type: 'DRAG_AREA_SELECTED'; rect: Rect; viewport: Size }
  | { type: 'ELEMENT_CAPTURE_STARTED'; chunks: VerticalChunk[]; documentRect: Rect; pageWidth: number; pageHeight: number; devicePixelRatio: number }
  | { type: 'ELEMENT_CAPTURE_SCROLLED'; scrollY: number; viewportHeight: number }
  | { type: 'FULL_PAGE_PLAN_READY'; chunks: VerticalChunk[]; pageWidth: number; pageHeight: number; devicePixelRatio: number }
  | { type: 'FULL_PAGE_SCROLLED'; scrollY: number; viewportHeight: number }
  | { type: 'CAPTURE_CANCELLED' }
  | { type: 'PREVIEW_SAVE_REQUESTED'; dataUrl: string }
  | { type: 'PREVIEW_RETRY_REQUESTED'; mode: CaptureMode };

export type BackgroundToOffscreenMessage =
  | { type: 'CROP_IMAGE'; dataUrl: string; rect: Rect; viewport?: Size }
  | { type: 'MERGE_VERTICAL_IMAGES'; images: Array<{ dataUrl: string; y: number; height: number }>; width: number; height: number; sourceWidth: number; outputScale?: number };

export type OffscreenToBackgroundMessage =
  | { type: 'IMAGE_PROCESSED'; result: CaptureResult }
  | { type: 'IMAGE_PROCESSING_FAILED'; message: string };

export type ExtensionMessage =
  | PopupToBackgroundMessage
  | BackgroundToContentMessage
  | ContentToBackgroundMessage
  | BackgroundToOffscreenMessage
  | OffscreenToBackgroundMessage;
