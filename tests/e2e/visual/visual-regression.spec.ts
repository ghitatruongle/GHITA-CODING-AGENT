import { test, expect } from '@playwright/test';

test.describe('Visual Regression', () => {
  test('main layout renders correctly', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('main-layout.png');
  });

  test('code editor renders correctly', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const editor = page.locator('[data-testid="code-editor"]');
    if (await editor.isVisible()) {
      await expect(editor).toHaveScreenshot('code-editor.png');
    }
  });

  test('terminal renders correctly', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const terminal = page.locator('[data-testid="terminal"]');
    if (await terminal.isVisible()) {
      await expect(terminal).toHaveScreenshot('terminal.png');
    }
  });

  test('chat panel renders correctly', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const chat = page.locator('[data-testid="chat-panel"]');
    if (await chat.isVisible()) {
      await expect(chat).toHaveScreenshot('chat-panel.png');
    }
  });

  test('settings panel renders correctly', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const settings = page.locator('[data-testid="settings"]');
    if (await settings.isVisible()) {
      await expect(settings).toHaveScreenshot('settings.png');
    }
  });
});
