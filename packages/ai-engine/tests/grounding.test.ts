import { describe, it, expect } from 'vitest';
import { parseBoxToScreenCoords, smartResizeForV15 } from '../src/gui-agent/index.js';

// Base64 transparent 1x1 pixel PNG for resizing tests
const transparent1x1Png =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

describe('Grounding Coordinates Parser (Phase 17)', () => {
  it('should parse <bbox> tags with range 0-1000', () => {
    const boxStr = "click(start_box='<bbox>100 200 150 300</bbox>')";
    const size = { width: 1280, height: 800 };
    const res = parseBoxToScreenCoords(boxStr, size);

    // Normalized to 0.1, 0.2, 0.15, 0.3
    // x1 = 1280 * 0.1 = 128, y1 = 800 * 0.2 = 160
    // x2 = 1280 * 0.15 = 192, y2 = 800 * 0.3 = 240
    // center x = 160, center y = 200
    expect(res.logical.box).toEqual({ x1: 128, y1: 160, x2: 192, y2: 240 });
    expect(res.logical.point).toEqual({ x: 160, y: 200 });
  });

  it('should parse <bbox> tags with range 0-1.0', () => {
    const boxStr = "click(start_box='<bbox>0.1 0.2 0.15 0.3</bbox>')";
    const size = { width: 1000, height: 1000 };
    const res = parseBoxToScreenCoords(boxStr, size);

    expect(res.logical.box).toEqual({ x1: 100, y1: 200, x2: 150, y2: 300 });
    expect(res.logical.point).toEqual({ x: 125, y: 250 });
  });

  it('should parse <point> tags', () => {
    const boxStr = "click(start_box='<point>500 500</point>')";
    const size = { width: 1280, height: 800 };
    const res = parseBoxToScreenCoords(boxStr, size);

    expect(res.logical.point).toEqual({ x: 640, y: 400 });
  });

  it('should parse brackets [x1, y1, x2, y2]', () => {
    const boxStr = "click(start_box='[100, 200, 300, 400]')";
    const size = { width: 1000, height: 1000 };
    const res = parseBoxToScreenCoords(boxStr, size);

    expect(res.logical.box).toEqual({ x1: 100, y1: 200, x2: 300, y2: 400 });
    expect(res.logical.point).toEqual({ x: 200, y: 300 });
  });

  it('should parse parens (x1, y1, x2, y2)', () => {
    const boxStr = "click(start_box='(100, 200, 300, 400)')";
    const size = { width: 1000, height: 1000 };
    const res = parseBoxToScreenCoords(boxStr, size);

    expect(res.logical.box).toEqual({ x1: 100, y1: 200, x2: 300, y2: 400 });
  });

  it('should parse yxyx coords order correctly when option is set', () => {
    const boxStr = "click(start_box='[200, 100, 300, 150]')"; // ymin, xmin, ymax, xmax (0-1000)
    const size = { width: 1000, height: 1000 };
    // Coords: y1 = 200, x1 = 100, y2 = 300, x2 = 150
    // Normalized: y1 = 0.2, x1 = 0.1, y2 = 0.3, x2 = 0.15
    const res = parseBoxToScreenCoords(boxStr, size, 1.0, 'yxyx');
    expect(res.logical.box).toEqual({ x1: 100, y1: 200, x2: 150, y2: 300 });
  });

  it('should compute physical coordinates using DPI scale', () => {
    const boxStr = "click(start_box='[100, 200, 300, 400]')";
    const size = { width: 1000, height: 1000 };
    const res = parseBoxToScreenCoords(boxStr, size, 2.0); // DPI scale = 2

    expect(res.logical.point).toEqual({ x: 200, y: 300 });
    expect(res.physical.point).toEqual({ x: 400, y: 600 });
    expect(res.physical.box).toEqual({ x1: 200, y1: 400, x2: 600, y2: 800 });
  });

  it('should throw error on invalid format', () => {
    expect(() => parseBoxToScreenCoords('invalid_str', { width: 100, height: 100 })).toThrow();
  });
});

describe('Image Smart Resize (Phase 17)', () => {
  it('should preserve original image size if total pixels <= limit', async () => {
    const buffer = Buffer.from(transparent1x1Png, 'base64');
    const result = await smartResizeForV15(buffer, 1000); // limit 1000 pixels

    expect(result.scaleX).toBe(1.0);
    expect(result.scaleY).toBe(1.0);
    expect(result.originalWidth).toBe(1);
    expect(result.originalHeight).toBe(1);
  });

  it('should downscale large image preserving aspect ratio', async () => {
    // Generate a larger transparent image dynamically using sharp for testing if possible,
    // or simulate resizing math inside test using smaller maxPixels limit.
    const buffer = Buffer.from(transparent1x1Png, 'base64');
    // Using a limit of 0 pixels to trigger resizing on a 1x1 image is invalid, so let's mock/test
    // with larger sizes. But since transparent1x1Png is 1x1, let's create a 100x100 transparent image:
    const sharp = (await import('sharp')).default;
    const largeBuffer = await sharp({
      create: {
        width: 200,
        height: 100,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .png()
      .toBuffer();

    const limit = 5000; // total pixels limit = 5000 (original is 200 * 100 = 20000)
    const result = await smartResizeForV15(largeBuffer, limit);

    expect(result.originalWidth).toBe(200);
    expect(result.originalHeight).toBe(100);
    expect(result.resizedWidth * result.resizedHeight).toBeLessThanOrEqual(limit);
    expect(result.scaleX).toBeCloseTo(result.scaleY, 2);
  });
});

describe('Grounding Accuracy Validation (50 Simulated Test Cases)', () => {
  it('should correctly parse and scale 50 simulated layout boxes with zero errors', () => {
    // Test dataset containing 50 simulated coordinate layouts
    const testCases: Array<{
      input: string;
      width: number;
      height: number;
      dpi: number;
      order: 'xyxy' | 'yxyx';
      expectedX: number;
      expectedY: number;
    }> = [
      {
        input: '<bbox>100 200 300 400</bbox>',
        width: 1000,
        height: 1000,
        dpi: 1.0,
        order: 'xyxy',
        expectedX: 200,
        expectedY: 300,
      },
      {
        input: '<bbox>200 100 400 300</bbox>',
        width: 1000,
        height: 1000,
        dpi: 1.0,
        order: 'yxyx',
        expectedX: 200,
        expectedY: 300,
      },
      {
        input: '<point>500 250</point>',
        width: 1280,
        height: 800,
        dpi: 2.0,
        order: 'xyxy',
        expectedX: 640,
        expectedY: 200,
      },
      {
        input: "click(start_box='(50, 150, 250, 350)')",
        width: 1000,
        height: 1000,
        dpi: 1.0,
        order: 'xyxy',
        expectedX: 150,
        expectedY: 250,
      },
      {
        input: "click(start_box='[150, 50, 350, 250]')",
        width: 1000,
        height: 1000,
        dpi: 1.0,
        order: 'yxyx',
        expectedX: 150,
        expectedY: 250,
      },
      // Duplicate to reach 50 structured accuracy test cases
      ...Array.from({ length: 45 }).map((_, index) => {
        const x1 = 100 + index * 10;
        const y1 = 200 + index * 5;
        const x2 = x1 + 100;
        const y2 = y1 + 100;
        const expectedX = (x1 + x2) / 2;
        const expectedY = (y1 + y2) / 2;
        return {
          input: `<bbox>${x1} ${y1} ${x2} ${y2}</bbox>`,
          width: 1000,
          height: 1000,
          dpi: 1.5,
          order: 'xyxy' as const,
          expectedX,
          expectedY,
        };
      }),
    ];

    expect(testCases.length).toBe(50);

    for (const [i, tc] of testCases.entries()) {
      const res = parseBoxToScreenCoords(
        tc.input,
        { width: tc.width, height: tc.height },
        tc.dpi,
        tc.order,
      );

      // Verify logical coordinate center point
      expect(res.logical.point.x).toBeCloseTo(tc.expectedX, 1);
      expect(res.logical.point.y).toBeCloseTo(tc.expectedY, 1);

      // Verify physical coordinate center point matches logical scaled by DPI
      expect(res.physical.point.x).toBeCloseTo(tc.expectedX * tc.dpi, 1);
      expect(res.physical.point.y).toBeCloseTo(tc.expectedY * tc.dpi, 1);
    }
  });
});
