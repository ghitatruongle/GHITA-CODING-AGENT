// ==============================================================================
// GHITA CODING AGENT - Computer Use Package
// ==============================================================================
import { ActionParser } from './actionParser.js';
export * from './vision/types.js';
export { GuiGrounder } from './vision/grounding.js';
export { VisionScreenshotAnalyzer } from './vision/analyzer.js';
export { ActionParser } from './actionParser.js';
export const COMPUTER_USE_VERSION = '0.1.0';
function success(action, output, data) {
    return { action, success: true, output, data };
}
function failure(action, error) {
    return { action, success: false, error };
}
function toSkillResult(result) {
    return {
        success: result.success,
        output: result.output,
        error: result.error,
        data: result.data,
    };
}
function readNumber(input, key) {
    const value = input?.[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
function readString(input, key) {
    const value = input?.[key];
    return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}
export class ComputerUseController {
    adapter;
    constructor(adapter = {}) {
        this.adapter = adapter;
    }
    getStatus() {
        const required = [
            'moveMouse',
            'click',
            'typeText',
            'pressKey',
            'screenshot',
        ];
        const missing = required.filter((key) => typeof this.adapter[key] !== 'function');
        return { available: missing.length === 0, missing };
    }
    async moveMouse(point) {
        const action = { type: 'moveMouse', point };
        if (!this.adapter.moveMouse)
            return failure(action, 'Mouse movement adapter is not available.');
        await this.adapter.moveMouse(point);
        return success(action, `Moved mouse to ${point.x}, ${point.y}.`);
    }
    async click(point, button = 'left') {
        const action = { type: 'click', point, button };
        if (!this.adapter.click)
            return failure(action, 'Mouse click adapter is not available.');
        await this.adapter.click(point, button);
        return success(action, `Clicked ${button}${point ? ` at ${point.x}, ${point.y}` : ''}.`);
    }
    async typeText(text) {
        const action = { type: 'typeText', text };
        if (!this.adapter.typeText)
            return failure(action, 'Keyboard typing adapter is not available.');
        await this.adapter.typeText(text);
        return success(action, `Typed ${text.length} characters.`);
    }
    async pressKey(key) {
        const action = { type: 'pressKey', key };
        if (!this.adapter.pressKey)
            return failure(action, 'Keyboard key adapter is not available.');
        await this.adapter.pressKey(key);
        return success(action, `Pressed ${key}.`);
    }
    async screenshot() {
        const action = { type: 'screenshot' };
        if (!this.adapter.screenshot)
            return failure(action, 'Screenshot adapter is not available.');
        const capture = await this.adapter.screenshot();
        return success(action, 'Captured screenshot.', capture);
    }
    async runAction(action) {
        switch (action.type) {
            case 'moveMouse':
                return this.moveMouse(action.point);
            case 'click':
                return this.click(action.point, action.button);
            case 'typeText':
                return this.typeText(action.text);
            case 'pressKey':
                return this.pressKey(action.key);
            case 'screenshot':
                return this.screenshot();
        }
    }
    async runSequence(actions) {
        const results = [];
        for (const action of actions) {
            const result = await this.runAction(action);
            results.push(result);
            if (!result.success)
                break;
        }
        return results;
    }
    /**
     * Execute prediction string (UI-TARS or multimodal action output) on screen context.
     */
    async executeActionText(prediction, size) {
        const parsedActions = ActionParser.parse({
            prediction,
            factor: 1000,
            screenContext: { width: size.width, height: size.height },
        });
        const results = [];
        for (const action of parsedActions) {
            const type = action.action_type;
            const inputs = action.action_inputs;
            let result;
            const startCoords = inputs.start_coords; // [physX, physY]
            // const endCoords = inputs.end_coords; // [physX, physY]
            const startPoint = startCoords ? { x: startCoords[0], y: startCoords[1] } : undefined;
            // const endPoint: Point | undefined = endCoords ? { x: endCoords[0], y: endCoords[1] } : undefined;
            switch (type) {
                case 'mouse_move':
                case 'hover': {
                    if (!startPoint) {
                        result = failure({ type: 'moveMouse', point: { x: 0, y: 0 } }, 'Missing start_coords for hover/mouse_move');
                    }
                    else {
                        result = await this.moveMouse(startPoint);
                    }
                    break;
                }
                case 'click':
                case 'left_click':
                case 'left_single': {
                    result = await this.click(startPoint, 'left');
                    break;
                }
                case 'left_double':
                case 'double_click': {
                    const actionObj = { type: 'click', point: startPoint, button: 'left' };
                    if (!this.adapter.click) {
                        result = failure(actionObj, 'Mouse click adapter is not available.');
                    }
                    else {
                        await this.adapter.click(startPoint, 'left');
                        await new Promise((resolve) => setTimeout(resolve, 100));
                        await this.adapter.click(startPoint, 'left');
                        result = success(actionObj, `Double clicked left at ${startPoint ? `${startPoint.x}, ${startPoint.y}` : 'current position'}`);
                    }
                    break;
                }
                case 'right_click':
                case 'right_single': {
                    result = await this.click(startPoint, 'right');
                    break;
                }
                case 'middle_click': {
                    result = await this.click(startPoint, 'middle');
                    break;
                }
                case 'type': {
                    const text = inputs.content || inputs.text || '';
                    if (startPoint) {
                        await this.click(startPoint);
                        await new Promise((resolve) => setTimeout(resolve, 200));
                    }
                    result = await this.typeText(text);
                    break;
                }
                case 'press':
                case 'hotkey': {
                    const key = inputs.key || inputs.hotkey || inputs.text || '';
                    result = await this.pressKey(key);
                    break;
                }
                case 'screenshot': {
                    result = await this.screenshot();
                    break;
                }
                case 'wait': {
                    const actionObj = { type: 'screenshot' };
                    const waitTime = inputs.time ? parseInt(inputs.time, 10) * 1000 : 5000;
                    await new Promise((resolve) => setTimeout(resolve, waitTime));
                    result = success(actionObj, `Waited for ${waitTime}ms.`);
                    break;
                }
                default: {
                    const actionObj = { type: 'screenshot' };
                    result = failure(actionObj, `Unsupported action type: ${type}`);
                }
            }
            results.push(result);
            if (!result.success)
                break;
        }
        return results;
    }
}
// NOTE: sandbox.js re-exports removed to avoid bundling Node.js APIs (child_process, fs, etc.)
// in browser/frontend builds. Import from '@ghita/computer-use/sandbox' directly in Node.js contexts.
export function createComputerUseSkills(controller = new ComputerUseController()) {
    return [
        {
            id: 'computer.moveMouse',
            name: 'Move Mouse',
            description: 'Move the mouse cursor to screen coordinates.',
            category: 'computer',
            enabled: false,
            version: COMPUTER_USE_VERSION,
            scopes: ['desktop'],
            status: 'disabled',
            parameters: {
                x: { type: 'number', description: 'X coordinate', required: true },
                y: { type: 'number', description: 'Y coordinate', required: true },
            },
            run: async ({ input }) => {
                const x = readNumber(input, 'x');
                const y = readNumber(input, 'y');
                if (x === undefined || y === undefined) {
                    return { success: false, error: 'Missing required inputs: x and y' };
                }
                return toSkillResult(await controller.moveMouse({ x, y }));
            },
        },
        {
            id: 'computer.click',
            name: 'Click Mouse',
            description: 'Click at the current cursor or a target coordinate.',
            category: 'computer',
            enabled: false,
            version: COMPUTER_USE_VERSION,
            scopes: ['desktop'],
            status: 'disabled',
            parameters: {
                x: { type: 'number', description: 'Optional X coordinate', required: false },
                y: { type: 'number', description: 'Optional Y coordinate', required: false },
            },
            run: async ({ input }) => {
                const x = readNumber(input, 'x');
                const y = readNumber(input, 'y');
                const point = x === undefined || y === undefined ? undefined : { x, y };
                return toSkillResult(await controller.click(point));
            },
        },
        {
            id: 'computer.typeText',
            name: 'Type Text',
            description: 'Type text through the keyboard adapter.',
            category: 'computer',
            enabled: false,
            version: COMPUTER_USE_VERSION,
            scopes: ['desktop'],
            status: 'disabled',
            parameters: {
                text: { type: 'string', description: 'Text to type', required: true },
            },
            run: async ({ input }) => {
                const text = readString(input, 'text');
                if (!text)
                    return { success: false, error: 'Missing required input: text' };
                return toSkillResult(await controller.typeText(text));
            },
        },
        {
            id: 'computer.screenshot',
            name: 'Computer Screenshot',
            description: 'Capture the screen through the computer-use adapter.',
            category: 'computer',
            enabled: false,
            version: COMPUTER_USE_VERSION,
            scopes: ['desktop'],
            status: 'disabled',
            run: async () => toSkillResult(await controller.screenshot()),
        },
    ];
}
//# sourceMappingURL=index.js.map