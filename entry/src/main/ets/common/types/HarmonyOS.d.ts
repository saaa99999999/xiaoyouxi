// OpenHarmony API 12 Supplemental Type Declarations
// Only includes types NOT provided by the SDK's own .d.ts files.

// ---------- Global types (not provided by SDK) ----------

interface ApplicationInfo {
  name: string;
  bundleName: string;
  accessTokenId: number;
}

interface Context {
  applicationInfo: ApplicationInfo;
  resourceManager: {
    getRawFileContent(path: string, callback: (err: Object | null, value: ArrayBuffer) => void): void;
    getRawFileContent(path: string): Promise<ArrayBuffer>;
    getRawFd(path: string): Promise<{ fd: number; offset: number; length: number }>;
    closeRawFd(path: string): Promise<void>;
  };
  filesDir: string;
  cacheDir: string;
  tempDir: string;
}

interface RenderingContextSettings {
  antialias: boolean;
}

interface ImageData {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

declare class CanvasRenderingContext2D {
  width: number;
  height: number;
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  lineCap: string;
  lineJoin: string;
  font: string;
  globalAlpha: number;
  globalCompositeOperation: string;
  fillRect(x: number, y: number, w: number, h: number): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  strokeRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  closePath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number, counterclockwise?: boolean): void;
  fill(): void;
  stroke(): void;
  setLineDash(segments: number[]): void;
  save(): void;
  restore(): void;
  scale(x: number, y: number): void;
  rotate(angle: number): void;
  translate(x: number, y: number): void;
  drawImage(image: Object, dx: number, dy: number): void;
  measureText(text: string): { width: number };
  fillText(text: string, x: number, y: number, maxWidth?: number): void;
  strokeText(text: string, x: number, y: number, maxWidth?: number): void;
  getImageData(sx: number, sy: number, sw: number, sh: number): ImageData;
  putImageData(imageData: ImageData, dx: number, dy: number): void;
}

declare class AppStorage {
  static getOrCreate(key: string, defaultValue?: Object): Object;
  static setOrCreate(key: string, value: Object): void;
  static get<T>(key: string): T;
  static set(key: string, value: Object): void;
  static link(key: string): Object;
}

// ArkUI Constants (provided by runtime, not SDK .d.ts)
declare const Alignment: {
  TopStart: number;
  Top: number;
  TopEnd: number;
  Start: number;
  Center: number;
  End: number;
  BottomStart: number;
  Bottom: number;
  BottomEnd: number;
};

// getContext — available in .ets files
declare function getContext(component?: Object): Context;
