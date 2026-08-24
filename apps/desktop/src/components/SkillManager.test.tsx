// @vitest-environment happy-dom

// Covers: rendering, category grouping, toggle, run, result display, socket sync

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';

// ── Mocks ──────────────────────────────────────────────────────────────

const mockSocketEmit = vi.fn();
const mockSocketOn = vi.fn();
const mockGetSharedSocket = vi.fn();

vi.mock('../utils/sharedSocket', () => ({
  getSharedSocket: (...args: unknown[]) => mockGetSharedSocket(...args),
}));

vi.mock('../i18n', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'skillManager.title': 'Skill Manager',
        'skillManager.subtitle': 'Manage and test host-side automation skills.',
        'skillManager.enabledSkills': 'Enabled Skills',
        'skillManager.testRun': 'Test Run',
        'skillManager.running': 'Running…',
        'common.active': 'Active',
        'common.off': 'Off',
        'common.enable': 'Enable',
        'common.disable': 'Disable',
      };
      return translations[key] ?? key;
    },
  }),
}));

vi.mock('ioredis', () => ({ default: vi.fn() }));
vi.mock('socket.io-client', () => ({ default: vi.fn() }));
vi.mock('@ghita/ai-engine', () => ({}));
vi.mock('@ghita/computer-use', () => ({}));
vi.mock('@ghita/browser-control', () => ({}));
vi.mock('@ghita/skills/node', () => ({}));

// Use the REAL SkillRegistry from @ghita/skills so registerMany / snapshot actually work.
vi.mock('@ghita/skills', async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  const { SkillRegistry } = actual as { SkillRegistry: new (...args: unknown[]) => unknown };
  const createDefaultSkillRegistry = () => new SkillRegistry();
  return { ...actual, createDefaultSkillRegistry };
});

// ── Import component AFTER mocks ───────────────────────────────────────

import { SkillManager } from './SkillManager';

// ── Helpers ────────────────────────────────────────────────────────────

function createMockSocket(connected = false) {
  return { connected, emit: mockSocketEmit, on: mockSocketOn };
}

/** Get the skill card article for a skill by its visible name. */
function getSkillCard(name: string): HTMLElement {
  const el = screen.getByText(name);
  return (el.closest('article') as HTMLElement) ?? (el.closest('div') as HTMLElement);
}

/** Get the Toggle and Test Run buttons inside a skill card.
 *  Returns throw-early getters so a missing button fails the test with a
 *  clear error rather than producing a confusing `undefined is not a
 *  function` deep inside RTL.
 */
function getCardButtons(card: HTMLElement) {
  const buttons = within(card).getAllByRole('button');
  if (buttons.length < 2) {
    throw new Error(`Expected ≥ 2 buttons in skill card, got ${buttons.length}`);
  }
  // Cast away `undefined` from the `noUncheckedIndexedAccess` index access:
  // we just verified the length above, so [0] / [1] are defined at runtime.
  return {
    toggle: buttons[0] as HTMLElement,
    testRun: buttons[1] as HTMLElement,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('SkillManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSharedSocket.mockResolvedValue(createMockSocket(false));
  });

  // ── Rendering ────────────────────────────────────────────────────────

  describe('rendering', () => {
    it('renders the title and subtitle', async () => {
      render(<SkillManager />);
      expect(screen.getByText('Skill Manager')).toBeInTheDocument();
      expect(screen.getByText('Manage and test host-side automation skills.')).toBeInTheDocument();
    });

    it('shows enabled/total count as 0/8', async () => {
      render(<SkillManager />);
      await waitFor(() => {
        expect(screen.getByText('0/8')).toBeInTheDocument();
      });
    });

    it('renders category headings (Computer and Browser)', async () => {
      render(<SkillManager />);
      await waitFor(() => {
        // The h3 headings contain "Computer (4)" and "Browser (4)" in the DOM
        expect(screen.getByText('Computer (4)')).toBeInTheDocument();
        expect(screen.getByText('Browser (4)')).toBeInTheDocument();
      });
    });

    it('renders 8 skill cards (4 computer + 4 browser)', async () => {
      render(<SkillManager />);
      await waitFor(() => {
        expect(screen.getAllByRole('article')).toHaveLength(8);
      });
    });

    it('renders individual skill names and ids', async () => {
      render(<SkillManager />);
      await waitFor(() => {
        expect(screen.getByText('Move Mouse')).toBeInTheDocument();
        expect(screen.getByText('computer.moveMouse')).toBeInTheDocument();
        expect(screen.getByText('Open Browser')).toBeInTheDocument();
        expect(screen.getByText('browser.open')).toBeInTheDocument();
      });
    });
  });

  // ── Skill Toggle ─────────────────────────────────────────────────────

  describe('skill toggle', () => {
    it('toggles a skill from Off to Active', async () => {
      render(<SkillManager />);
      await waitFor(() => expect(screen.getByText('Move Mouse')).toBeInTheDocument());

      // Click Enable on Move Mouse card
      const card = getSkillCard('Move Mouse');
      const { toggle } = getCardButtons(card);
      await act(async () => {
        fireEvent.click(toggle);
      });

      await waitFor(() => {
        expect(screen.getByText('Active')).toBeInTheDocument();
        expect(screen.getByText('Disable')).toBeInTheDocument();
      });
    });

    it('does not emit socket event when not connected', async () => {
      render(<SkillManager />);
      await waitFor(() => expect(screen.getByText('Move Mouse')).toBeInTheDocument());

      await act(async () => {
        fireEvent.click(getCardButtons(getSkillCard('Move Mouse')).toggle);
      });
      expect(mockSocketEmit).not.toHaveBeenCalled();
    });

    it('updates enabled count from 0/8 to 1/8 after toggle', async () => {
      render(<SkillManager />);
      await waitFor(() => expect(screen.getByText('0/8')).toBeInTheDocument());

      await act(async () => {
        fireEvent.click(getCardButtons(getSkillCard('Move Mouse')).toggle);
      });

      await waitFor(() => {
        expect(screen.getByText('1/8')).toBeInTheDocument();
      });
    });

    it('can toggle a skill off after enabling it', async () => {
      render(<SkillManager />);
      await waitFor(() => expect(screen.getByText('Move Mouse')).toBeInTheDocument());

      // Enable
      await act(async () => {
        fireEvent.click(getCardButtons(getSkillCard('Move Mouse')).toggle);
      });
      await waitFor(() => expect(screen.getByText('1/8')).toBeInTheDocument());

      // Disable — re-query the card since DOM has re-rendered
      await act(async () => {
        fireEvent.click(getCardButtons(getSkillCard('Move Mouse')).toggle);
      });

      await waitFor(() => {
        expect(screen.getByText('0/8')).toBeInTheDocument();
        // All 8 skills should show "Off"
        expect(screen.getAllByText('Off')).toHaveLength(8);
      });
    });
  });

  // ── Skill Run (local fallback) ──────────────────────────────────────

  describe('skill run (local)', () => {
    it('disables run button when skill is disabled', async () => {
      render(<SkillManager />);
      await waitFor(() => expect(screen.getByText('Move Mouse')).toBeInTheDocument());

      const { testRun } = getCardButtons(getSkillCard('Move Mouse'));
      expect(testRun).toBeDisabled();
    });

    it('enables run button after skill is toggled on', async () => {
      render(<SkillManager />);
      await waitFor(() => expect(screen.getByText('Move Mouse')).toBeInTheDocument());

      // Enable the Move Mouse skill
      await act(async () => {
        fireEvent.click(getCardButtons(getSkillCard('Move Mouse')).toggle);
      });

      // Wait for the Test Run button to become enabled
      await waitFor(() => {
        const { testRun } = getCardButtons(getSkillCard('Move Mouse'));
        expect(testRun).not.toBeDisabled();
      });
    });
  });

  // ── ResultLine ───────────────────────────────────────────────────────

  describe('result display', () => {
    it('shows error result after running a skill locally', async () => {
      render(<SkillManager />);
      await waitFor(() => expect(screen.getByText('Move Mouse')).toBeInTheDocument());

      // Enable the skill first
      await act(async () => {
        fireEvent.click(getCardButtons(getSkillCard('Move Mouse')).toggle);
      });

      // Wait for the Test Run button to become enabled
      await waitFor(() => {
        expect(getCardButtons(getSkillCard('Move Mouse')).testRun).not.toBeDisabled();
      });

      // Click Test Run
      await act(async () => {
        fireEvent.click(getCardButtons(getSkillCard('Move Mouse')).testRun);
      });

      // Wait for the async run result to appear
      await waitFor(
        () => {
          expect(screen.getByText(/OS Automation adapter/)).toBeInTheDocument();
        },
        { timeout: 5000 },
      );
    });
  });

  // ── Socket sync (connected mode) ────────────────────────────────────

  describe('socket sync', () => {
    it('emits set_skill_enabled when connected and toggling', async () => {
      mockGetSharedSocket.mockResolvedValue(createMockSocket(true));
      // Only fire the 'connect' callback immediately — do NOT fire 'disconnect'
      // (the real socket would not fire disconnect on a connected socket).
      mockSocketOn.mockImplementation((event: string, cb: () => void) => {
        if (event === 'connect') cb();
        return { dispose: () => {} };
      });
      mockSocketEmit.mockImplementation(
        (event: string, _data: unknown, cb?: (res: unknown) => void) => {
          if (event === 'set_skill_enabled' && cb) {
            cb({
              success: true,
              skill: { id: 'computer.moveMouse', enabled: true, status: 'active' },
            });
          }
        },
      );

      render(<SkillManager />);

      // Wait for the socket useEffect to have run, then flush React state updates
      // so that connected=true is reflected before we click.
      await act(async () => {
        await waitFor(() => {
          expect(mockSocketOn).toHaveBeenCalled();
        });
      });

      // Now toggle — connected state should be true by now
      await act(async () => {
        fireEvent.click(getCardButtons(getSkillCard('Move Mouse')).toggle);
      });

      await waitFor(() => {
        expect(mockSocketEmit).toHaveBeenCalledWith(
          'set_skill_enabled',
          expect.objectContaining({ id: 'computer.moveMouse', enabled: true }),
          expect.any(Function),
        );
      });
    });
  });
});
