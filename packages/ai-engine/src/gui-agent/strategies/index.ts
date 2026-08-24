/**

 *
 * Re-exports the public API for browser-use-only, gui-agent-only, and
 * the mixed strategy. The CDP accessibility adapter and the WebDriver
 * fallback are exported too so callers can wire whichever transport
 * they have.
 */

export { BrowserUseOnlyStrategy, findByRoleAndName } from './browser-use-only.js';
export type {
  AxTreeNode,
  BrowserTarget,
  CdpAccessibilityClient,
  BrowserAction,
  BrowserUseOnlyConfig,
} from './browser-use-only.js';

export { GuiAgentOnlyStrategy } from './gui-agent-only.js';
export type {
  PixelOperator,
  VisionLocator,
  GuiAgentAction,
  GuiAgentOnlyConfig,
  GuiAgentExecutionResult,
} from './gui-agent-only.js';

export { MixedStrategy, isBrowserDescription as isBrowserTask } from './mixed.js';
export type { TaskKind, MixedTask, MixedAction, WindowProbe, MixedConfig } from './mixed.js';

export { CdpAccessibilityAdapter, WebDriverAccessibilityClient } from './cdp-accessibility.js';
export type {
  CdpTransport,
  WebDriverSession,
  WebDriverAccessibilityClientOptions,
} from './cdp-accessibility.js';
