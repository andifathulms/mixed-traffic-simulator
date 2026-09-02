import { useEffect, useRef } from 'react';

/**
 * A canvas sized to its container in device pixels.
 *
 * Every canvas in the app needs the same three things: a backing store at the
 * device pixel ratio, a context scaled so drawing code can work in CSS pixels,
 * and a resize observer. Getting this wrong makes text render at half
 * resolution on a retina display, which on a chart of small numbers is fatal.
 */
export function useCanvas(
  onResize?: (width: number, height: number) => void,
): {
  canvasRef: React.RefObject<HTMLCanvasElement>;
  sizeRef: React.MutableRefObject<{ width: number; height: number; dpr: number }>;
} {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sizeRef = useRef({ width: 0, height: 0, dpr: 1 });
  const onResizeRef = useRef(onResize);
  onResizeRef.current = onResize;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const apply = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      // Cap the ratio: a 3x display at full width is a lot of pixels to fill
      // sixty times a second for no visible gain.
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const width = Math.round(rect.width);
      const height = Math.round(rect.height);
      if (
        sizeRef.current.width === width &&
        sizeRef.current.height === height &&
        sizeRef.current.dpr === dpr
      ) {
        return;
      }
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      sizeRef.current = { width, height, dpr };
      onResizeRef.current?.(width, height);
    };

    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  return { canvasRef, sizeRef };
}
