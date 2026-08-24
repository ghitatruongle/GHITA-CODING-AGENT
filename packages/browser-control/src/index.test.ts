import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserController, createBrowserControlSkills } from './index.js';

describe('BrowserController', () => {
  let controller: BrowserController;

  beforeEach(() => {
    controller = new BrowserController();
  });

  describe('initial state', () => {
    it('should start with idle status', () => {
      const state = controller.getState();
      expect(state.status).toBe('idle');
    });
  });

  describe('launch', () => {
    it('should fail if no adapter is provided', async () => {
      const result = await controller.launch();
      expect(result.success).toBe(false);
      expect(result.error).toContain('adapter is not available');
    });

    it('should succeed with a working adapter', async () => {
      const adapter = { launch: vi.fn().mockResolvedValue(undefined) };
      const ctrl = new BrowserController(adapter);
      const result = await ctrl.launch({ headless: true });
      expect(result.success).toBe(true);
      expect(adapter.launch).toHaveBeenCalledWith({ headless: true });
    });

    it('should set state to ready on success', async () => {
      const adapter = { launch: vi.fn().mockResolvedValue(undefined) };
      const ctrl = new BrowserController(adapter);
      await ctrl.launch();
      const state = ctrl.getState();
      expect(state.status).toBe('ready');
      expect(state.launchedAt).toBeGreaterThan(0);
    });

    it('should set state to error on failure', async () => {
      const adapter = { launch: vi.fn().mockRejectedValue(new Error('Port in use')) };
      const ctrl = new BrowserController(adapter);
      const result = await ctrl.launch();
      expect(result.success).toBe(false);
      expect(result.error).toBe('Port in use');
      const state = ctrl.getState();
      expect(state.status).toBe('error');
      expect(state.lastError).toBe('Port in use');
    });
  });

  describe('close', () => {
    it('should fail if adapter has no close handler', async () => {
      const result = await controller.close();
      expect(result.success).toBe(false);
    });

    it('should close and update state', async () => {
      const adapter = { close: vi.fn().mockResolvedValue(undefined) };
      const ctrl = new BrowserController(adapter);
      const result = await ctrl.close();
      expect(result.success).toBe(true);
      expect(ctrl.getState().status).toBe('closed');
    });
  });

  describe('navigate', () => {
    it('should fail if adapter has no navigate handler', async () => {
      const result = await controller.navigate('https://example.com');
      expect(result.success).toBe(false);
    });

    it('should navigate and record URL', async () => {
      const adapter = { navigate: vi.fn().mockResolvedValue(undefined) };
      const ctrl = new BrowserController(adapter);
      const result = await ctrl.navigate('https://example.com');
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ url: 'https://example.com' });
      expect(ctrl.getState().currentUrl).toBe('https://example.com');
    });
  });

  describe('click', () => {
    it('should fail if adapter has no click handler', async () => {
      const result = await controller.click('#button');
      expect(result.success).toBe(false);
    });

    it('should click with valid selector', async () => {
      const adapter = { click: vi.fn().mockResolvedValue(undefined) };
      const ctrl = new BrowserController(adapter);
      const result = await ctrl.click('#button');
      expect(result.success).toBe(true);
      expect(adapter.click).toHaveBeenCalledWith('#button');
    });
  });

  describe('fill', () => {
    it('should use fill handler first', async () => {
      const fill = vi.fn().mockResolvedValue(undefined);
      const adapter = { fill };
      const ctrl = new BrowserController(adapter);
      const result = await ctrl.fill('#input', 'hello');
      expect(result.success).toBe(true);
      expect(fill).toHaveBeenCalledWith('#input', 'hello');
    });

    it('should fall back to type handler if fill is not available', async () => {
      const type = vi.fn().mockResolvedValue(undefined);
      const adapter = { type };
      const ctrl = new BrowserController(adapter);
      const result = await ctrl.fill('#input', 'hello');
      expect(result.success).toBe(true);
      expect(type).toHaveBeenCalledWith('#input', 'hello');
    });

    it('should fail if neither fill nor type is available', async () => {
      const result = await controller.fill('#input', 'hello');
      expect(result.success).toBe(false);
    });
  });

  describe('extract', () => {
    it('should fail if adapter has no extractText handler', async () => {
      const result = await controller.extract();
      expect(result.success).toBe(false);
    });

    it('should extract text from page', async () => {
      const adapter = { extractText: vi.fn().mockResolvedValue('Hello World') };
      const ctrl = new BrowserController(adapter);
      const result = await ctrl.extract();
      expect(result.success).toBe(true);
      expect(result.data).toBe('Hello World');
    });

    it('should pass selector to adapter', async () => {
      const adapter = { extractText: vi.fn().mockResolvedValue('Scoped content') };
      const ctrl = new BrowserController(adapter);
      await ctrl.extract('.content');
      expect(adapter.extractText).toHaveBeenCalledWith('.content');
    });
  });

  describe('screenshot', () => {
    it('should fail if adapter has no screenshot handler', async () => {
      const result = await controller.screenshot();
      expect(result.success).toBe(false);
    });

    it('should return screenshot data', async () => {
      const adapter = {
        screenshot: vi.fn().mockResolvedValue({ mimeType: 'image/png', data: 'base64data' }),
      };
      const ctrl = new BrowserController(adapter);
      const result = await ctrl.screenshot();
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ mimeType: 'image/png' });
      expect(result.screenshot).toBe('base64data');
    });
  });

  describe('runAction', () => {
    it('should route navigate action', async () => {
      const adapter = { navigate: vi.fn().mockResolvedValue(undefined) };
      const ctrl = new BrowserController(adapter);
      const result = await ctrl.runAction({ type: 'navigate', url: 'https://example.com' });
      expect(result.success).toBe(true);
    });

    it('should fail navigate action without url', async () => {
      const result = await controller.runAction({ type: 'navigate' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('url');
    });

    it('should route click action', async () => {
      const adapter = { click: vi.fn().mockResolvedValue(undefined) };
      const ctrl = new BrowserController(adapter);
      const result = await ctrl.runAction({ type: 'click', selector: '#btn' });
      expect(result.success).toBe(true);
    });

    it('should fail click action without selector', async () => {
      const result = await controller.runAction({ type: 'click' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('selector');
    });

    it('should route fill action', async () => {
      const adapter = { fill: vi.fn().mockResolvedValue(undefined) };
      const ctrl = new BrowserController(adapter);
      const result = await ctrl.runAction({ type: 'fill', selector: '#input', value: 'test' });
      expect(result.success).toBe(true);
    });

    it('should fail fill action without selector or value', async () => {
      const result = await controller.runAction({ type: 'fill', selector: '#input' } as never);
      expect(result.success).toBe(false);
    });

    it('should route extract action', async () => {
      const adapter = { extractText: vi.fn().mockResolvedValue('content') };
      const ctrl = new BrowserController(adapter);
      const result = await ctrl.runAction({ type: 'extract' });
      expect(result.success).toBe(true);
    });

    it('should route screenshot action', async () => {
      const adapter = {
        screenshot: vi.fn().mockResolvedValue({ mimeType: 'image/png', data: '' }),
      };
      const ctrl = new BrowserController(adapter);
      const result = await ctrl.runAction({ type: 'screenshot' });
      expect(result.success).toBe(true);
    });
  });

  describe('getState immutability', () => {
    it('should return a copy of the state', () => {
      const state = controller.getState();
      state.status = 'ready';
      expect(controller.getState().status).toBe('idle');
    });
  });
});

describe('createBrowserControlSkills', () => {
  it('should return skill definitions', () => {
    const skills = createBrowserControlSkills();
    expect(skills.length).toBeGreaterThan(0);
  });

  it('should include browser.open skill', () => {
    const skills = createBrowserControlSkills();
    const open = skills.find((s) => s.id === 'browser.open');
    expect(open).toBeDefined();
    expect(open?.name).toBe('Open Browser');
  });

  it('should include browser.navigate skill', () => {
    const skills = createBrowserControlSkills();
    const navigate = skills.find((s) => s.id === 'browser.navigate');
    expect(navigate).toBeDefined();
    expect(navigate?.parameters?.url).toBeDefined();
  });

  it('should include browser.extract skill', () => {
    const skills = createBrowserControlSkills();
    const extract = skills.find((s) => s.id === 'browser.extract');
    expect(extract).toBeDefined();
    expect(extract?.parameters?.selector).toBeDefined();
  });

  it('should expose close, click, and screenshot lifecycle skills', async () => {
    const adapter = {
      close: vi.fn().mockResolvedValue(undefined),
      click: vi.fn().mockResolvedValue(undefined),
      screenshot: vi.fn().mockResolvedValue({ mimeType: 'image/png', data: 'base64' }),
    };
    const skills = createBrowserControlSkills(new BrowserController(adapter));

    const close = skills.find((skill) => skill.id === 'browser.close');
    const click = skills.find((skill) => skill.id === 'browser.click');
    const screenshot = skills.find((skill) => skill.id === 'browser.screenshot');

    expect((await close?.run({ input: {} }))?.success).toBe(true);
    expect((await click?.run({ input: { selector: '#submit' } }))?.success).toBe(true);
    expect((await screenshot?.run({ input: {} }))?.success).toBe(true);
    expect(adapter.click).toHaveBeenCalledWith('#submit');
  });

  it('should run browser.navigate skill via controller', async () => {
    const adapter = { navigate: vi.fn().mockResolvedValue(undefined) };
    const ctrl = new BrowserController(adapter);
    const skills = createBrowserControlSkills(ctrl);
    const navigate = skills.find((s) => s.id === 'browser.navigate');
    expect(navigate).toBeDefined();
    const result = await navigate?.run({ input: { url: 'https://example.com' } });
    expect(result?.success).toBe(true);
  });

  it('should fail navigation skill without url', async () => {
    const skills = createBrowserControlSkills();
    const navigate = skills.find((s) => s.id === 'browser.navigate');
    expect(navigate).toBeDefined();
    const result = await navigate?.run({ input: {} });
    expect(result?.success).toBe(false);
    expect(result?.error).toContain('url');
  });

  it('should run browser.fill skill via controller', async () => {
    const adapter = { fill: vi.fn().mockResolvedValue(undefined) };
    const ctrl = new BrowserController(adapter);
    const skills = createBrowserControlSkills(ctrl);
    const fill = skills.find((s) => s.id === 'browser.fill');
    expect(fill).toBeDefined();
    const result = await fill?.run({ input: { selector: '#input', value: 'test' } });
    expect(result?.success).toBe(true);
  });

  it('should fail fill skill without selector or value', async () => {
    const skills = createBrowserControlSkills();
    const fill = skills.find((s) => s.id === 'browser.fill');
    expect(fill).toBeDefined();
    const result = await fill?.run({ input: { selector: '#input' } });
    expect(result?.success).toBe(false);
  });

  it('should run browser.extract skill', async () => {
    const adapter = { extractText: vi.fn().mockResolvedValue('Hello') };
    const ctrl = new BrowserController(adapter);
    const skills = createBrowserControlSkills(ctrl);
    const extract = skills.find((s) => s.id === 'browser.extract');
    expect(extract).toBeDefined();
    const result = await extract?.run({ input: {} });
    expect(result?.success).toBe(true);
  });

  it('should run browser.open skill', async () => {
    const adapter = { launch: vi.fn().mockResolvedValue(undefined) };
    const ctrl = new BrowserController(adapter);
    const skills = createBrowserControlSkills(ctrl);
    const open = skills.find((s) => s.id === 'browser.open');
    expect(open).toBeDefined();
    const result = await open?.run({ input: {} });
    expect(result?.success).toBe(true);
  });
});
