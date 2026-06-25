import { describe, it, expect } from 'vitest';
import { StatusEnum, parseModelOutput, validateGuiAction, GuiAction } from '../src/index.js';

describe('GUI Agent StatusEnum', () => {
  it('should support the 5 required states', () => {
    expect(StatusEnum.RUNNING).toBe('RUNNING');
    expect(StatusEnum.PAUSED).toBe('PAUSED');
    expect(StatusEnum.DONE).toBe('DONE');
    expect(StatusEnum.CALL_USER).toBe('CALL_USER');
    expect(StatusEnum.ERROR).toBe('ERROR');
  });
});

describe('GUI Agent Action Validation (10 Actions)', () => {
  it('should validate click/double_click/right_click/move_to with coords', () => {
    // Valid cases
    const actClick = validateGuiAction({ type: 'click', params: { x: 100, y: 200 } });
    expect(actClick.params.x).toBe(100);
    expect(actClick.params.y).toBe(200);
    expect(actClick.params.button).toBe('left');

    const actRightClick = validateGuiAction({
      type: 'right_click',
      params: { x: 150, y: 250, button: 'right' },
    });
    expect(actRightClick.type).toBe('right_click');
    expect(actRightClick.params.button).toBe('right');

    const actMove = validateGuiAction({ type: 'move_to', params: { x: 50, y: 60 } });
    expect(actMove.type).toBe('move_to');

    // Invalid cases
    expect(() => validateGuiAction({ type: 'click', params: { x: 'abc', y: 100 } })).toThrow();
    expect(() => validateGuiAction({ type: 'click', params: { x: 100 } })).toThrow();
  });

  it('should validate drag with from/to coords', () => {
    // Valid cases
    const actDrag1 = validateGuiAction({
      type: 'drag',
      params: { fromX: 10, fromY: 20, toX: 30, toY: 40 },
    });
    expect(actDrag1.params).toEqual({ fromX: 10, fromY: 20, toX: 30, toY: 40 });

    // Alternates: x1, y1, x2, y2
    const actDrag2 = validateGuiAction({
      type: 'drag',
      params: { x1: 50, y1: 50, x2: 100, y2: 100 },
    });
    expect(actDrag2.params).toEqual({ fromX: 50, fromY: 50, toX: 100, toY: 100 });

    // Invalid
    expect(() => validateGuiAction({ type: 'drag', params: { fromX: 10 } })).toThrow();
  });

  it('should validate type action', () => {
    const act = validateGuiAction({ type: 'type', params: { text: 'Hello, World!' } });
    expect(act.params.text).toBe('Hello, World!');

    expect(() => validateGuiAction({ type: 'type', params: {} })).toThrow();
  });

  it('should validate keypress action', () => {
    const act = validateGuiAction({ type: 'keypress', params: { key: 'enter' } });
    expect(act.params.key).toBe('enter');

    expect(() => validateGuiAction({ type: 'keypress', params: { key: 123 } })).toThrow();
  });

  it('should validate hotkey action with multi keys', () => {
    const act1 = validateGuiAction({ type: 'hotkey', params: { keys: ['ctrl', 'alt', 't'] } });
    expect(act1.params.keys).toEqual(['ctrl', 'alt', 't']);

    const act2 = validateGuiAction({ type: 'hotkey', params: { keys: 'ctrl+c' } });
    expect(act2.params.keys).toEqual(['ctrl', 'c']);

    expect(() => validateGuiAction({ type: 'hotkey', params: {} })).toThrow();
  });

  it('should validate scroll action with amount and direction', () => {
    const act = validateGuiAction({ type: 'scroll', params: { amount: 3, direction: 'down' } });
    expect(act.params.amount).toBe(3);
    expect(act.params.direction).toBe('down');

    expect(() =>
      validateGuiAction({ type: 'scroll', params: { amount: 3, direction: 'middle' } }),
    ).toThrow();
    expect(() => validateGuiAction({ type: 'scroll', params: { direction: 'down' } })).toThrow();
  });

  it('should validate wait action with ms/duration', () => {
    const act1 = validateGuiAction({ type: 'wait', params: { ms: 500 } });
    expect(act1.params.ms).toBe(500);

    const act2 = validateGuiAction({ type: 'wait', params: { duration: 1000 } });
    expect(act2.params.ms).toBe(1000);

    expect(() => validateGuiAction({ type: 'wait', params: { ms: -10 } })).toThrow();
  });
});

describe('GUI Agent Action Parser', () => {
  it('should parse JSON block array or single actions', () => {
    const output = `
Some reasoning here...
\`\`\`json
[
  { "type": "click", "params": { "x": 100, "y": 200 } },
  { "type": "wait", "params": { "ms": 250 } }
]
\`\`\`
    `;
    const actions = parseModelOutput(output);
    expect(actions).toHaveLength(2);
    expect(actions[0]!.type).toBe('click');
    expect(actions[0]!.params.x).toBe(100);
    expect(actions[1]!.type).toBe('wait');
    expect(actions[1]!.params.ms).toBe(250);
  });

  it('should parse single JSON block', () => {
    const output = `\`\`\`json\n{ "type": "type", "params": { "text": "hello" } }\n\`\`\``;
    const actions = parseModelOutput(output);
    expect(actions).toHaveLength(1);
    expect(actions[0]!.type).toBe('type');
    expect(actions[0]!.params.text).toBe('hello');
  });

  it('should parse XML tag blocks', () => {
    const output = `
Let's click first:
<action type="click">
  <x>150</x>
  <y>250</y>
</action>
And then type:
<gui_action>
  <type>type</type>
  <text>Antigravity</text>
</gui_action>
    `;
    const actions = parseModelOutput(output);
    expect(actions).toHaveLength(2);
    expect(actions[0]!.type).toBe('click');
    expect(actions[0]!.params.x).toBe(150);
    expect(actions[0]!.params.y).toBe(250);

    expect(actions[1]!.type).toBe('type');
    expect(actions[1]!.params.text).toBe('Antigravity');
  });

  it('should parse function-style text directives', () => {
    const output = `
1. click(100, 200)
2. wait(500)
3. type("Hello World")
4. scroll(5, "down")
5. drag(10, 20, 30, 40)
6. hotkey("ctrl", "alt", "delete")
    `;
    const actions = parseModelOutput(output);
    expect(actions).toHaveLength(6);
    expect(actions[0]!.type).toBe('click');
    expect(actions[0]!.params.x).toBe(100);
    expect(actions[1]!.type).toBe('wait');
    expect(actions[1]!.params.ms).toBe(500);
    expect(actions[2]!.type).toBe('type');
    expect(actions[2]!.params.text).toBe('Hello World');
    expect(actions[3]!.type).toBe('scroll');
    expect(actions[3]!.params.amount).toBe(5);
    expect(actions[3]!.params.direction).toBe('down');
    expect(actions[4]!.type).toBe('drag');
    expect(actions[4]!.params).toEqual({ fromX: 10, fromY: 20, toX: 30, toY: 40 });
    expect(actions[5]!.type).toBe('hotkey');
    expect(actions[5]!.params.keys).toEqual(['ctrl', 'alt', 'delete']);
  });

  it('should ignore malformed directives or inputs', () => {
    const output = `
click(abc, 200)
wait(-500)
scroll(5, "unknown_dir")
    `;
    const actions = parseModelOutput(output);
    expect(actions).toHaveLength(0);
  });
});
