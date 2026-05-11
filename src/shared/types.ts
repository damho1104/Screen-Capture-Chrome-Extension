export type CaptureMode = 'drag' | 'element' | 'fullPage';
export type CaptureSessionState = 'idle' | 'selecting' | 'capturing' | 'preview' | 'failed';

export type Point = {
  x: number;
  y: number;
};

export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type Size = {
  width: number;
  height: number;
};

export type VerticalChunk = {
  scrollY: number;
  y: number;
  height: number;
};

export type CaptureResult = {
  dataUrl: string;
  width: number;
  height: number;
  mode: CaptureMode;
  partial?: boolean;
};
