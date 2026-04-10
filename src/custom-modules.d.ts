/**
 * Ambient typings for optional runtime dependency.
 * This file must not use `import` / `export` so it stays a global script (CRA + fork-ts-checker).
 */
declare module "@mediapipe/tasks-vision" {
  export class FilesetResolver {
    static forVisionTasks(baseUrl: string): Promise<unknown>;
  }

  export class ImageSegmenter {
    static createFromOptions(
      wasm: unknown,
      options: Record<string, unknown>
    ): Promise<{
      segmentForVideo(
        image: HTMLVideoElement,
        timestamp: number
      ): {
        categoryMask?: {
          width: number;
          height: number;
          getAsUint8Array(): Uint8Array;
        };
        confidenceMasks?: Array<{
          width: number;
          height: number;
          getAsFloat32Array(): Float32Array;
        }>;
      };
      close(): void;
    }>;
  }
}
