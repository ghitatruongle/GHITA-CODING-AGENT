// ==============================================================================
// @ghita/a11y -- Screen Reader Helper
// ==============================================================================

import type { AnnouncementPriority, ScreenReaderText } from './types.js';

export class ScreenReaderHelper {
  private announcements: Array<{
    text: string;
    priority: AnnouncementPriority;
    timestamp: number;
  }> = [];

  resolveAccessibleName(
    tagName: string,
    attrs: Record<string, string>,
    textContent?: string,
  ): ScreenReaderText {
    const ariaLabel = attrs['aria-label'] ?? '';
    const ariaLabelledby = attrs['aria-labelledby'] ?? '';
    const title = attrs['title'] ?? '';
    const alt = attrs['alt'] ?? '';
    const placeholder = attrs['placeholder'] ?? '';

    let accessibleName = '';
    let needsLabel = false;

    if (ariaLabelledby) {
      accessibleName = `[referenced: ${ariaLabelledby}]`;
    } else if (ariaLabel) {
      accessibleName = ariaLabel;
    } else if (tagName === 'img' && alt) {
      accessibleName = alt;
    } else if (title) {
      accessibleName = title;
    } else if (textContent && textContent.trim().length > 0) {
      accessibleName = textContent.trim();
    } else if (placeholder) {
      accessibleName = placeholder;
      needsLabel = true;
    } else {
      needsLabel = true;
      accessibleName = tagName;
    }

    return {
      accessibleName,
      accessibleDescription: attrs['aria-describedby']
        ? `[describedby: ${attrs['aria-describedby']}]`
        : title || undefined,
      needsLabel,
      needsDescription: !attrs['aria-describedby'] && ['button', 'link', 'textbox'].includes(tagName),
    };
  }

  announce(text: string, priority: AnnouncementPriority = 'polite'): void {
    this.announcements.push({ text, priority, timestamp: Date.now() });
  }

  flushAnnouncements(): Array<{
    text: string;
    priority: AnnouncementPriority;
    timestamp: number;
  }> {
    const result = [...this.announcements];
    this.announcements = [];
    return result;
  }

  pendingCount(): number {
    return this.announcements.length;
  }

  describeList(items: string[], listType: 'ordered' | 'unordered' = 'unordered'): string {
    if (items.length === 0) return 'Empty list';
    const prefix = listType === 'ordered' ? 'Numbered list' : 'List';
    return `${prefix} with ${items.length} item${items.length === 1 ? '' : 's'}: ${items.join(', ')}`;
  }

  describeTable(rows: number, columns: number, caption?: string): string {
    const base = caption ? `Table "${caption}"` : 'Table';
    return `${base} with ${rows} row${rows === 1 ? '' : 's'} and ${columns} column${columns === 1 ? '' : 's'}`;
  }

  describeProgress(current: number, max: number, label?: string): string {
    const pct = max > 0 ? Math.round((current / max) * 100) : 0;
    const base = label ? `${label}: ` : '';
    return `${base}${pct}% complete`;
  }

  liveRegionAttributes(priority: AnnouncementPriority): Record<string, string> {
    return {
      'aria-live': priority,
      'aria-atomic': 'true',
      role: priority === 'assertive' ? 'alert' : 'status',
    };
  }

  skipLink(targetId: string, label?: string): { href: string; text: string; className: string } {
    return {
      href: `#${targetId}`,
      text: label ?? `Skip to ${targetId}`,
      className: 'sr-only focus:not-sr-only',
    };
  }
}
