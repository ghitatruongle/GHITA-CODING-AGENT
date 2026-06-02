// ==============================================================================
// GHITA CODING AGENT - Vision and GUI Grounding Types
// ==============================================================================

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

export interface ScreenElement {
  id?: string;
  name: string;
  role: string;
  box: BoundingBox;
  confidence?: number;
}

export interface GroundingResult {
  point?: Point;
  box?: BoundingBox;
  confidence: number;
}

export interface VisionAnalyzerResult {
  elements: ScreenElement[];
  description?: string;
}

export interface ActionInputs {
  start_box?: string;
  end_box?: string;
  start_coords?: [number, number];
  end_coords?: [number, number];
  text?: string;
  key?: string;
  direction?: 'up' | 'down' | 'left' | 'right';
  scroll_amount?: number;
  [key: string]: string | number | boolean | [number, number] | undefined;
}

export interface PredictionParsed {
  reflection?: string | null;
  thought: string;
  action_type: string;
  action_inputs: ActionInputs;
}
