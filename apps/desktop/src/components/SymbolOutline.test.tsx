import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SymbolOutline } from './SymbolOutline';

describe('SymbolOutline', () => {
  const sampleCode = `
    export class UserProfile {
      id: string;
      name: string;
      constructor(id: string, name: string) {
        this.id = id;
        this.name = name;
      }
      getDisplayName(): string {
        return this.name;
      }
    }

    export interface AuthToken {
      token: string;
      expiresAt: number;
    }

    export function validateToken(t: AuthToken): boolean {
      return t.expiresAt > Date.now();
    }
  `;

  it('renders symbol groups from parsed AST code', () => {
    render(<SymbolOutline filePath="user.ts" content={sampleCode} />);

    expect(screen.getByText('UserProfile')).toBeInTheDocument();
    expect(screen.getByText('AuthToken')).toBeInTheDocument();
    expect(screen.getByText('validateToken')).toBeInTheDocument();
  });

  it('filters symbols by search query', () => {
    render(<SymbolOutline filePath="user.ts" content={sampleCode} />);

    const searchInput = screen.getByPlaceholderText(/Filter symbols/i);
    fireEvent.change(searchInput, { target: { value: 'validate' } });

    expect(screen.getByText('validateToken')).toBeInTheDocument();
    expect(screen.queryByText('UserProfile')).not.toBeInTheDocument();
  });

  it('triggers onSelectSymbol with exact line position when symbol is clicked', () => {
    const onSelect = vi.fn();
    render(<SymbolOutline filePath="user.ts" content={sampleCode} onSelectSymbol={onSelect} />);

    const userClassBtn = screen.getByText('UserProfile').closest('button');
    expect(userClassBtn).not.toBeNull();
    if (userClassBtn) fireEvent.click(userClassBtn);

    expect(onSelect).toHaveBeenCalled();
    expect(onSelect).toHaveBeenCalledWith(expect.any(Number), 1);
  });
});
