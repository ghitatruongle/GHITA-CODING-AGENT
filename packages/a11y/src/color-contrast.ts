// @ghita/a11y -- Color Contrast Analyzer (WCAG 1.4.3 / 1.4.6)

import type { RgbColor, ContrastResult } from './types.js';

export class ColorContrastAnalyzer {
  parseColor(color: string): RgbColor {
    const trimmed = color.trim().toLowerCase();
    const shortHex = trimmed.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i);
    if (shortHex?.[1] && shortHex[2] && shortHex[3]) {
      return {
        r: parseInt(shortHex[1] + shortHex[1], 16),
        g: parseInt(shortHex[2] + shortHex[2], 16),
        b: parseInt(shortHex[3] + shortHex[3], 16),
      };
    }
    const hex6 = trimmed.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
    if (hex6?.[1] && hex6[2] && hex6[3]) {
      return {
        r: parseInt(hex6[1], 16),
        g: parseInt(hex6[2], 16),
        b: parseInt(hex6[3], 16),
      };
    }
    const rgbMatch = trimmed.match(
      /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/,
    );
    if (rgbMatch?.[1] && rgbMatch[2] && rgbMatch[3]) {
      return {
        r: parseInt(rgbMatch[1], 10),
        g: parseInt(rgbMatch[2], 10),
        b: parseInt(rgbMatch[3], 10),
      };
    }
    const namedColors: Record<string, string> = {
      black: '#000000',
      white: '#ffffff',
      red: '#ff0000',
      green: '#008000',
      blue: '#0000ff',
      yellow: '#ffff00',
      cyan: '#00ffff',
      magenta: '#ff00ff',
      gray: '#808080',
      grey: '#808080',
      orange: '#ffa500',
      purple: '#800080',
    };
    const named = namedColors[trimmed];
    if (named) return this.parseColor(named);
    throw new Error(`Unsupported color format: "${color}"`);
  }

  relativeLuminance(color: RgbColor): number {
    const rsrgb = color.r / 255;
    const gsrgb = color.g / 255;
    const bsrgb = color.b / 255;
    const r = rsrgb <= 0.04045 ? rsrgb / 12.92 : Math.pow((rsrgb + 0.055) / 1.055, 2.4);
    const g = gsrgb <= 0.04045 ? gsrgb / 12.92 : Math.pow((gsrgb + 0.055) / 1.055, 2.4);
    const b = bsrgb <= 0.04045 ? bsrgb / 12.92 : Math.pow((bsrgb + 0.055) / 1.055, 2.4);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  contrastRatio(color1: RgbColor, color2: RgbColor): number {
    const l1 = this.relativeLuminance(color1);
    const l2 = this.relativeLuminance(color2);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  }

  checkContrast(foreground: string, background: string): ContrastResult {
    const fg = this.parseColor(foreground);
    const bg = this.parseColor(background);
    const ratio = this.contrastRatio(fg, bg);
    return {
      ratio: Math.round(ratio * 100) / 100,
      passAA: ratio >= 4.5,
      passAALarge: ratio >= 3.0,
      passAAA: ratio >= 7.0,
      passAAALarge: ratio >= 4.5,
      foregroundLuminance: this.relativeLuminance(fg),
      backgroundLuminance: this.relativeLuminance(bg),
    };
  }
}
