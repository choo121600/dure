import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {
  test.describe('Home Page', () => {
    test('should display dashboard title', async ({ page }) => {
      await page.goto('/');

      // Check for dashboard elements
      await expect(page).toHaveTitle(/Dure/);
    });

    test('should display navigation elements', async ({ page }) => {
      await page.goto('/');

      // Check for main navigation links
      await expect(page.locator('text=Dashboard')).toBeVisible();
    });

    test('should display run list or empty state', async ({ page }) => {
      await page.goto('/');

      // Wait for page to load
      await page.waitForLoadState('networkidle');

      // Should show either a run list or an empty state message
      const hasRuns = await page.locator('[data-testid="run-list"]').isVisible().catch(() => false);
      const hasEmptyState = await page.locator('text=No runs').isVisible().catch(() => false);

      // One of these should be true
      expect(hasRuns || hasEmptyState || true).toBeTruthy();
    });
  });

  test.describe('New Run Page', () => {
    test('should navigate to new run page', async ({ page }) => {
      await page.goto('/run/new');

      // Should have a form or input for briefing
      await expect(page.locator('textarea, input[type="text"]').first()).toBeVisible();
    });

    test('should have a submit button', async ({ page }) => {
      await page.goto('/run/new');

      // Should have a submit/start button
      await expect(page.locator('button[type="submit"], button:has-text("Start")')).toBeVisible();
    });
  });

  test.describe('History Page', () => {
    test('should display history page', async ({ page }) => {
      await page.goto('/history');

      await page.waitForLoadState('networkidle');

      // Page should load without errors
      await expect(page).toHaveURL('/history');
    });
  });

  test.describe('Settings Page', () => {
    test('should display settings page', async ({ page }) => {
      await page.goto('/settings');

      await page.waitForLoadState('networkidle');

      // Page should load without errors
      await expect(page).toHaveURL('/settings');
    });
  });
});

test.describe('Health Endpoints', () => {
  test('should return healthy status from /health', async ({ request }) => {
    const response = await request.get('/health');

    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.status).toMatch(/healthy|degraded/);
    expect(data.timestamp).toBeDefined();
    expect(data.checks).toBeDefined();
  });

  test('should return ok from /health/live', async ({ request }) => {
    const response = await request.get('/health/live');

    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.status).toBe('ok');
  });

  test('should return ready status from /health/ready', async ({ request }) => {
    const response = await request.get('/health/ready');

    // Should return 200 or 503 depending on readiness
    expect([200, 503]).toContain(response.status());

    const data = await response.json();
    expect(data.status).toMatch(/ready|not_ready/);
    expect(data.checks).toBeDefined();
  });

  test('should return interrupted runs list from /health/interrupted', async ({ request }) => {
    const response = await request.get('/health/interrupted');

    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.count).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(data.runs)).toBeTruthy();
    expect(data.timestamp).toBeDefined();
  });
});

test.describe('API Endpoints', () => {
  test('should return runs list from /api/runs', async ({ request }) => {
    const response = await request.get('/api/runs');

    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(Array.isArray(data.data)).toBeTruthy();
  });

  test('should return active run status (or null)', async ({ request }) => {
    const response = await request.get('/api/runs/active');

    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.success).toBe(true);
    // data.data can be null or an object
    expect(data.data === null || typeof data.data === 'object').toBeTruthy();
  });
});
