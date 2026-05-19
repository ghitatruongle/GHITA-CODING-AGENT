declare module 'screenshot-desktop' {
  interface ScreenshotOptions {
    format?: 'jpg' | 'png';
    screen?: number;
  }

  function screenshot(options?: ScreenshotOptions): Promise<Buffer>;
  export default screenshot;
}
