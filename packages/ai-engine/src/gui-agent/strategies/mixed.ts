/**
 * Phase 20 — Mixed Control Strategy
 *
 * Chooses between the browser-use-only and gui-agent-only strategies
 * based on the task type and a quick URL / focus probe. The mixed
 * controller inspects the active window (URL, focused process) and
 * routes browser-shaped tasks to CDP and pixel-shaped tasks to the
 * pixel operator.
 */

import {
  BrowserUseOnlyStrategy,
  type BrowserAction,
  type CdpAccessibilityClient,
} from './browser-use-only.js';
import {
  GuiAgentOnlyStrategy,
  type GuiAgentAction,
  type PixelOperator,
  type VisionLocator,
} from './gui-agent-only.js';

export type TaskKind = 'browser' | 'desktop' | 'auto';

export interface MixedTask {
  /** Natural-language description of the task. */
  description: string;
  /** When set, force a strategy regardless of the probe. */
  kind?: TaskKind;
}

export type MixedAction =
  | { strategy: 'browser'; action: BrowserAction }
  | { strategy: 'gui'; action: GuiAgentAction };

export interface WindowProbe {
  /** Returns the URL of the foreground browser tab, or null. */
  activeBrowserUrl(): Promise<string | null>;
  /** Returns the foreground process name, or null. */
  foregroundProcess(): Promise<string | null>;
}

export interface MixedConfig {
  cdp: CdpAccessibilityClient;
  operator: PixelOperator;
  locator: VisionLocator;
  probe?: WindowProbe;
  /** Confidence threshold for grounding. */
  minConfidence?: number;
}

/** Heuristic: does this string look like a browser task? */
export function isBrowserDescription(description: string): boolean {
  const text = description.toLowerCase();
  if (/\b(browser|chrome|firefox|edge|safari)\b/.test(text)) return true;
  if (/\b(url|web ?page|website|tab|navigate|click (on |the )?(link|button))\b/.test(text)) {
    return true;
  }
  if (/^https?:\/\//i.test(text.trim())) return true;
  return false;
}

/**
 * MixedStrategy — picks the right control strategy per task. When the
 * task is forced as 'browser' or 'desktop', the choice is direct.
 * Otherwise the strategy inspects the foreground window and the
 * description.
 */
export class MixedStrategy {
  readonly name = 'mixed' as const;
  private readonly browser: BrowserUseOnlyStrategy;
  private readonly gui: GuiAgentOnlyStrategy;
  private readonly probe?: WindowProbe;

  constructor(config: MixedConfig) {
    this.browser = new BrowserUseOnlyStrategy({
      cdp: config.cdp,
      axFallback: true,
    });
    this.gui = new GuiAgentOnlyStrategy({
      operator: config.operator,
      locator: config.locator,
      minConfidence: config.minConfidence,
    });
    this.probe = config.probe;
  }

  async openBrowser(sessionId: string, url: string) {
    return this.browser.open({ url, sessionId });
  }

  async closeBrowser() {
    await this.browser.close();
  }

  /** Decide which strategy handles a given task. */
  async route(task: MixedTask): Promise<'browser' | 'gui'> {
    if (task.kind === 'browser') return 'browser';
    if (task.kind === 'desktop') return 'gui';
    // auto-detect
    if (isBrowserDescription(task.description)) return 'browser';
    if (this.probe) {
      const url = await this.probe.activeBrowserUrl();
      if (url) return 'browser';
    }
    return 'gui';
  }

  async execute(
    task: MixedTask,
    action: MixedAction,
  ): Promise<{
    strategy: 'browser' | 'gui';
    result: unknown;
  }> {
    const strategy = action.strategy ?? (await this.route(task));
    if (strategy === 'browser') {
      const result = await this.browser.execute(action.action as BrowserAction);
      return { strategy, result };
    }
    const result = await this.gui.execute(action.action as GuiAgentAction);
    return { strategy, result };
  }
}
