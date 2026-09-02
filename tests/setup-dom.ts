import { vi } from 'vitest';

/**
 * Minimal canvas and worker stubs for the DOM smoke test.
 *
 * jsdom has no canvas and no module workers. The point of the smoke test is to
 * prove the app mounts, renders and responds — not to verify pixels, which no
 * headless environment can check anyway.
 */
const context2d = {
  canvas: null as unknown,
  setTransform: vi.fn(),
  clearRect: vi.fn(),
  fillRect: vi.fn(),
  strokeRect: vi.fn(),
  beginPath: vi.fn(),
  closePath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  arc: vi.fn(),
  fill: vi.fn(),
  stroke: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  translate: vi.fn(),
  rotate: vi.fn(),
  clip: vi.fn(),
  rect: vi.fn(),
  roundRect: vi.fn(),
  drawImage: vi.fn(),
  setLineDash: vi.fn(),
  createImageData: (w: number, h: number) => ({
    data: new Uint8ClampedArray(w * h * 4),
    width: w,
    height: h,
  }),
  putImageData: vi.fn(),
  fillStyle: '',
  strokeStyle: '',
  lineWidth: 1,
  globalAlpha: 1,
  globalCompositeOperation: 'source-over',
  imageSmoothingEnabled: true,
};

HTMLCanvasElement.prototype.getContext = vi.fn(
  () => context2d,
) as unknown as HTMLCanvasElement['getContext'];

class StubWorker {
  onmessage: ((e: MessageEvent) => void) | null = null;
  postMessage(): void {}
  terminate(): void {}
}
vi.stubGlobal('Worker', StubWorker);

vi.stubGlobal(
  'ResizeObserver',
  class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  },
);

if (!window.matchMedia) {
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

// requestAnimationFrame in jsdom fires on a timer; the render loops are
// exercised a handful of times rather than continuously.
let frames = 0;
vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
  if (frames++ > 200) return 0;
  return setTimeout(() => cb(performance.now()), 0) as unknown as number;
});
vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
