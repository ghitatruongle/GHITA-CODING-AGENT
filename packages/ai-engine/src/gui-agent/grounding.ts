import fs from 'fs';
import path from 'path';
import os from 'os';

export interface Point {
  x: number;
  y: number;
}

export interface BoundingBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface ScreenSize {
  width: number;
  height: number;
}

export interface GroundingResult {
  point?: Point;
  box?: BoundingBox;
  confidence: number;
}

// Types for dynamic loading configuration
interface ProviderMeta {
  type: string;
  base_url?: string;
  api_key?: string;
  default_model?: string;
}

interface LocalConfig {
  agentModels?: Record<string, ProviderMeta>;
  agentRouting?: Record<string, string>;
}

export interface GroundingCoordsResult {
  box: BoundingBox;
  point: Point;
  logical: { box: BoundingBox; point: Point };
  physical: { box: BoundingBox; point: Point };
}

// ---------------------------------------------------------------------------
// 1. parseBoxToScreenCoords
// ---------------------------------------------------------------------------
/**
 * Translates predicted bounding box strings from various model patterns into screen coordinates.
 * Supports DPI scaling and coordinate ordering configuration.
 */
export function parseBoxToScreenCoords(
  boxStr: string,
  screenSize: ScreenSize,
  dpiScale = 1.0,
  coordsOrder: 'xyxy' | 'yxyx' = 'xyxy',
): GroundingCoordsResult {
  let coords: number[] = [];

  // Pattern 1: <bbox>x1 y1 x2 y2</bbox>
  const bboxMatch = boxStr.match(/<bbox>\s*(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s*<\/bbox>/i);
  if (bboxMatch) {
    coords = [Number(bboxMatch[1]), Number(bboxMatch[2]), Number(bboxMatch[3]), Number(bboxMatch[4])];
  } else {
    // Pattern 2: <point>x y</point>
    const pointMatch = boxStr.match(/<point>\s*(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s*<\/point>/i);
    if (pointMatch) {
      const p1 = Number(pointMatch[1]);
      const p2 = Number(pointMatch[2]);
      coords = [p1, p2, p1, p2];
    } else {
      // Pattern 3: [y1, x1, y2, x2] or [x1, y1, x2, y2]
      const bracketsMatch = boxStr.match(/\[\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*\]/);
      if (bracketsMatch) {
        coords = [Number(bracketsMatch[1]), Number(bracketsMatch[2]), Number(bracketsMatch[3]), Number(bracketsMatch[4])];
      } else {
        // Pattern 4: (x1, y1, x2, y2) or (x, y)
        const parensMatch = boxStr.match(/\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*(?:,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*)?\)/);
        if (parensMatch) {
          if (parensMatch[3] !== undefined && parensMatch[4] !== undefined) {
            coords = [Number(parensMatch[1]), Number(parensMatch[2]), Number(parensMatch[3]), Number(parensMatch[4])];
          } else {
            const px = Number(parensMatch[1]);
            const py = Number(parensMatch[2]);
            coords = [px, py, px, py];
          }
        } else {
          // Pattern 5: sequential fallback
          const numbers = boxStr.match(/[-+]?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
          if (numbers.length >= 4) {
            coords = numbers.slice(0, 4);
          } else if (numbers.length >= 2) {
            const px = numbers[0] as number;
            const py = numbers[1] as number;
            coords = [px, py, px, py];
          }
        }
      }
    }
  }

  if (coords.length < 4) {
    throw new Error(`Failed to parse coordinates from target prediction: "${boxStr}"`);
  }

  // Detect whether coordinates are normalized to 0-1000 or 0-1.0
  let isRange1000 = false;
  for (const val of coords) {
    if (val > 1.0) {
      isRange1000 = true;
      break;
    }
  }

  const maxVal = isRange1000 ? 1000 : 1.0;

  let x1_norm = 0, y1_norm = 0, x2_norm = 0, y2_norm = 0;
  if (coordsOrder === 'yxyx') {
    const [y1 = 0, x1 = 0, y2 = 0, x2 = 0] = coords;
    x1_norm = x1 / maxVal;
    y1_norm = y1 / maxVal;
    x2_norm = x2 / maxVal;
    y2_norm = y2 / maxVal;
  } else {
    const [x1 = 0, y1 = 0, x2 = 0, y2 = 0] = coords;
    x1_norm = x1 / maxVal;
    y1_norm = y1 / maxVal;
    x2_norm = x2 / maxVal;
    y2_norm = y2 / maxVal;
  }

  // Scaling directly to logical screenSize coordinates
  const logicalX1 = x1_norm * screenSize.width;
  const logicalY1 = y1_norm * screenSize.height;
  const logicalX2 = x2_norm * screenSize.width;
  const logicalY2 = y2_norm * screenSize.height;

  const logicalBox: BoundingBox = {
    x1: Math.min(logicalX1, logicalX2),
    y1: Math.min(logicalY1, logicalY2),
    x2: Math.max(logicalX1, logicalX2),
    y2: Math.max(logicalY1, logicalY2),
  };

  const logicalPoint: Point = {
    x: (logicalBox.x1 + logicalBox.x2) / 2,
    y: (logicalBox.y1 + logicalBox.y2) / 2,
  };

  // Convert to physical coordinates by applying display DPI scale factor
  const physicalBox: BoundingBox = {
    x1: logicalBox.x1 * dpiScale,
    y1: logicalBox.y1 * dpiScale,
    x2: logicalBox.x2 * dpiScale,
    y2: logicalBox.y2 * dpiScale,
  };

  const physicalPoint: Point = {
    x: logicalPoint.x * dpiScale,
    y: logicalPoint.y * dpiScale,
  };

  return {
    box: logicalBox,
    point: logicalPoint,
    logical: { box: logicalBox, point: logicalPoint },
    physical: { box: physicalBox, point: physicalPoint },
  };
}

// ---------------------------------------------------------------------------
// 2. smartResizeForV15
// ---------------------------------------------------------------------------
/**
 * Downscales image buffers so that the total pixels fit under maxPixels limits
 * while maintaining aspect ratios. Scale mapping constants are tracked for coordinate remapping.
 */
export async function smartResizeForV15(
  imageBuffer: Buffer,
  maxPixels = 1_500_000,
): Promise<{
  resizedBuffer: Buffer;
  scaleX: number;
  scaleY: number;
  originalWidth: number;
  originalHeight: number;
  resizedWidth: number;
  resizedHeight: number;
}> {
  const sharpModule = (await import('sharp')).default;
  const image = sharpModule(imageBuffer);
  const metadata = await image.metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;

  if (width === 0 || height === 0) {
    throw new Error('Image metadata contains invalid dimensions.');
  }

  const totalPixels = width * height;
  if (totalPixels <= maxPixels) {
    return {
      resizedBuffer: imageBuffer,
      scaleX: 1.0,
      scaleY: 1.0,
      originalWidth: width,
      originalHeight: height,
      resizedWidth: width,
      resizedHeight: height,
    };
  }

  const ratio = Math.sqrt(maxPixels / totalPixels);
  const resizedWidth = Math.round(width * ratio);
  const resizedHeight = Math.round(height * ratio);

  const resizedBuffer = await image
    .resize(resizedWidth, resizedHeight)
    .toBuffer();

  return {
    resizedBuffer,
    scaleX: resizedWidth / width,
    scaleY: resizedHeight / height,
    originalWidth: width,
    originalHeight: height,
    resizedWidth,
    resizedHeight,
  };
}

// ---------------------------------------------------------------------------
// 3. VisionGrounder
// ---------------------------------------------------------------------------
export class VisionGrounder {
  private configPath: string;

  constructor() {
    this.configPath = path.resolve(os.homedir(), '.openclaude.json');
  }

  private loadConfig(): { apiKey: string; baseUrl: string; model: string; type: string } | null {
    try {
      if (!fs.existsSync(this.configPath)) return null;
      const raw = fs.readFileSync(this.configPath, 'utf-8');
      const config = JSON.parse(raw) as LocalConfig;

      if (!config.agentModels) return null;

      const activeModelKey =
        config.agentRouting?.UI || config.agentRouting?.default || 'openai-gpt-4o';
      const meta = config.agentModels[activeModelKey];

      if (meta && meta.api_key) {
        return {
          apiKey: meta.api_key,
          baseUrl:
            meta.base_url ||
            (meta.type === 'openai' ? 'https://api.openai.com/v1' : 'https://api.anthropic.com/v1'),
          model:
            meta.default_model || (meta.type === 'openai' ? 'gpt-4o' : 'claude-3-5-sonnet-latest'),
          type: meta.type,
        };
      }

      for (const [key, provider] of Object.entries(config.agentModels)) {
        if (provider.api_key) {
          return {
            apiKey: provider.api_key,
            baseUrl:
              provider.base_url ||
              (provider.type === 'openai'
                ? 'https://api.openai.com/v1'
                : 'https://api.anthropic.com/v1'),
            model: provider.default_model || key,
            type: provider.type,
          };
        }
      }
    } catch (e) {
      console.error('[VisionGrounder] Failed to parse local config:', e);
    }
    return null;
  }

  /**
   * Performs vision-based grounding using a multimodal prompt and image resizing pipeline.
   */
  async ground(
    screenshotBase64: string,
    description: string,
    options: {
      screenSize?: ScreenSize;
      dpiScale?: number;
      coordsOrder?: 'xyxy' | 'yxyx';
      maxPixels?: number;
    } = {},
  ): Promise<GroundingResult & { logical?: { box: BoundingBox; point: Point }; physical?: { box: BoundingBox; point: Point } }> {
    const apiConfig = this.loadConfig();
    if (!apiConfig) {
      throw new Error('[VisionGrounder] API Key configuration is missing in ~/.openclaude.json');
    }

    const imageBuffer = Buffer.from(screenshotBase64, 'base64');
    const resizeResult = await smartResizeForV15(imageBuffer, options.maxPixels ?? 1_500_000);
    const resizedBase64 = resizeResult.resizedBuffer.toString('base64');

    const prompt = `You are a GUI grounding assistant. Look at the screenshot and find the coordinate box or point of the target element described as: "${description}".
Provide your output in one of the following formats:
- click(start_box='<bbox>x1 y1 x2 y2</bbox>') where coordinates are normalized from 0 to 1000
- click(start_box='(x1,y1,x2,y2)') where coordinates are normalized from 0 to 1000

Only output the Action. Do not write any HTML tags, explainers or other text.`;

    const rawOutput = await this.queryMultimodalLLM(apiConfig, resizedBase64, prompt);

    // Coordinate resolution sizing fallback
    const resolvedSize: ScreenSize = options.screenSize || {
      width: resizeResult.originalWidth,
      height: resizeResult.originalHeight,
    };

    const parsed = parseBoxToScreenCoords(
      rawOutput,
      resolvedSize,
      options.dpiScale ?? 1.0,
      options.coordsOrder ?? 'xyxy',
    );

    return {
      point: parsed.point,
      box: parsed.box,
      logical: parsed.logical,
      physical: parsed.physical,
      confidence: 0.95,
    };
  }

  private async queryMultimodalLLM(
    config: { apiKey: string; baseUrl: string; model: string; type: string },
    imageBase64: string,
    prompt: string,
  ): Promise<string> {
    const url = config.baseUrl.endsWith('/') ? config.baseUrl : config.baseUrl + '/';

    if (config.type === 'openai') {
      const response = await fetch(url + 'chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:image/png;base64,${imageBase64}`,
                  },
                },
              ],
            },
          ],
          max_tokens: 100,
          temperature: 0,
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI Vision API Error (${response.status}): ${await response.text()}`);
      }

      const res = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      return res.choices?.[0]?.message?.content || '';
    } else if (config.type === 'anthropic') {
      const response = await fetch(url + 'messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: config.model,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: 'image/png',
                    data: imageBase64,
                  },
                },
                { type: 'text', text: prompt },
              ],
            },
          ],
          max_tokens: 100,
          temperature: 0,
        }),
      });

      if (!response.ok) {
        throw new Error(`Anthropic Vision API Error (${response.status}): ${await response.text()}`);
      }

      const res = (await response.json()) as { content?: Array<{ text?: string }> };
      return res.content?.[0]?.text || '';
    } else {
      throw new Error(`Vision provider type not supported: ${config.type}`);
    }
  }
}
