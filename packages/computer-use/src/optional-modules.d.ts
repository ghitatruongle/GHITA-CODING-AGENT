declare module '@nut-tree/nut-js' {
  export const mouse: {
    setPosition(point: { x: number; y: number }): Promise<void>;
    click(button?: unknown): Promise<void>;
  };
  export const keyboard: {
    type(text: string): Promise<void>;
    pressKey(key: unknown): Promise<void>;
  };
  export const screen: {
    width(): Promise<number>;
    height(): Promise<number>;
    capture(): Promise<unknown>;
  };
  export const Button: Record<string, unknown>;
  export const Key: Record<string, unknown>;
  export class Point {
    x: number;
    y: number;
    constructor(x: number, y: number);
  }
}
