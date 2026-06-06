/**
 * Status of the GUI Agent execution loop.
 */
export enum StatusEnum {
  RUNNING = 'RUNNING',
  PAUSED = 'PAUSED',
  DONE = 'DONE',
  CALL_USER = 'CALL_USER',
  ERROR = 'ERROR',
}

/**
 * Supported Action Types
 */
export type ActionType =
  | 'click'
  | 'double_click'
  | 'right_click'
  | 'drag'
  | 'move_to'
  | 'type'
  | 'keypress'
  | 'hotkey'
  | 'scroll'
  | 'wait';

/**
 * Interface representing a parsed GUI Action
 */
export interface GuiAction {
  type: ActionType;
  params: Record<string, unknown>;
}

/**
 * Schema or validation errors during parsing
 */
export interface ActionValidationError {
  actionIndex: number;
  message: string;
}
