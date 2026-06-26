// ==============================================================================
// GHITA CODING AGENT - Notification Template Tests
// ==============================================================================

import { describe, it, expect } from 'vitest';
import { NotificationTemplate } from './template.js';

describe('NotificationTemplate', () => {
  const tpl = new NotificationTemplate();

  it('should render simple variable', () => {
    const result = tpl.render('Hello {{name}}', { name: 'World' });
    expect(result).toBe('Hello World');
  });

  it('should render nested variable', () => {
    const result = tpl.render('{{user.name}}', { user: { name: 'Alice' } });
    expect(result).toBe('Alice');
  });

  it('should use default value', () => {
    const result = tpl.render('{{missing|Default}}', {});
    expect(result).toBe('Default');
  });

  it('should escape HTML', () => {
    const result = tpl.render('{{content}}', { content: '<script>alert("xss")</script>' });
    expect(result).not.toContain('<script>');
    expect(result).toContain('&lt;script&gt;');
  });

  it('should handle pluralization', () => {
    const result1 = tpl.render('{{count|message|messages}}', { count: 1 });
    expect(result1).toContain('message');
    const result2 = tpl.render('{{count|message|messages}}', { count: 5 });
    expect(result2).toContain('messages');
  });

  it('should render raw blocks without escaping', () => {
    const result = tpl.render('{{#raw}}<b>bold</b>{{/raw}}', {});
    expect(result).toBe('<b>bold</b>');
  });

  it('should render both title and body', () => {
    const result = tpl.renderNotification('Alert: {{type}}', 'Details: {{message}}', {
      type: 'error',
      message: 'disk full',
    });
    expect(result.title).toBe('Alert: error');
    expect(result.body).toBe('Details: disk full');
  });
});
