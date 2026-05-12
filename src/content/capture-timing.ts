export const OVERLAY_REMOVAL_PAINT_DELAY_MS = 60;

export function waitForNextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

export async function waitForOverlayRemovalPaint(): Promise<void> {
  await waitForNextFrame();
  await new Promise((resolve) => setTimeout(resolve, OVERLAY_REMOVAL_PAINT_DELAY_MS));
}
