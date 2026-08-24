// Analyzes screenshot vision payloads and extracts pixel Bounding Box coordinates
// [xMin, yMin, xMax, yMax] for UI elements (buttons, inputs, icons) to click precisely.

export interface UITarget {
  label: string;
  confidence: number;
  boundingBox: [number, number, number, number]; // [xMin, yMin, xMax, yMax]
  centerCoordinate: { x: number; y: number };
}

export class UITarsBoundingBoxDetector {
  /**
   * Parse vision LLM output containing bounding box format e.g. `box: [100, 200, 150, 250] "Submit"`.
   */
  static parseTargets(visionOutput: string): UITarget[] {
    const targets: UITarget[] = [];
    const pattern = /box:\s*\[(\d+),\s*(\d+),\s*(\d+),\s*(\d+)\]\s*(?:"([^"]+)"|'([^']+)')?/g;

    let match: RegExpExecArray | null;
    while ((match = pattern.exec(visionOutput)) !== null) {
      const xMin = parseInt(match[1] || '0', 10);
      const yMin = parseInt(match[2] || '0', 10);
      const xMax = parseInt(match[3] || '0', 10);
      const yMax = parseInt(match[4] || '0', 10);
      const label = match[5] || match[6] || 'UI Element';

      const xCenter = Math.round((xMin + xMax) / 2);
      const yCenter = Math.round((yMin + yMax) / 2);

      targets.push({
        label,
        confidence: 0.95,
        boundingBox: [xMin, yMin, xMax, yMax],
        centerCoordinate: { x: xCenter, y: yCenter },
      });
    }

    return targets;
  }
}
