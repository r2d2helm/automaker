/**
 * Settings Marketing Content Toggle Tests
 *
 * Tests for the "Hide marketing content" setting in the Appearance section.
 */

import { test, expect } from "@playwright/test";
import * as fs from "fs";

import {
  waitForNetworkIdle,
  createTestGitRepo,
  cleanupTempDir,
  createTempDirPath,
  setupProjectWithPathNoWorktrees,
  navigateToSettings,
} from "./utils";

// Create unique temp dir for this test run
const TEST_TEMP_DIR = createTempDirPath("settings-marketing-tests");

interface TestRepo {
  path: string;
  cleanup: () => Promise<void>;
}

// Configure all tests to run serially
test.describe.configure({ mode: "serial" });

test.describe("Settings Marketing Content Tests", () => {
  let testRepo: TestRepo;

  test.beforeAll(async () => {
    // Create test temp directory
    if (!fs.existsSync(TEST_TEMP_DIR)) {
      fs.mkdirSync(TEST_TEMP_DIR, { recursive: true });
    }
  });

  test.beforeEach(async () => {
    // Create a fresh test repo for each test
    testRepo = await createTestGitRepo(TEST_TEMP_DIR);
  });

  test.afterEach(async () => {
    // Cleanup test repo after each test
    if (testRepo) {
      await testRepo.cleanup();
    }
  });

  test.afterAll(async () => {
    // Cleanup temp directory
    cleanupTempDir(TEST_TEMP_DIR);
  });

  test("should show course promo badge by default", async ({ page }) => {
    // Setup project without worktrees for simpler testing
    await setupProjectWithPathNoWorktrees(page, testRepo.path);
    await page.goto("/");
    await waitForNetworkIdle(page);

    // Wait for sidebar to load
    await expect(page.locator('[data-testid="sidebar"]')).toBeVisible({
      timeout: 10000,
    });

    // Course promo badge should be visible by default
    const promoBadge = page.locator('[data-testid="course-promo-badge"]');
    await expect(promoBadge).toBeVisible({ timeout: 5000 });
  });

  test("should hide course promo badge when setting is enabled", async ({
    page,
  }) => {
    // Setup project
    await setupProjectWithPathNoWorktrees(page, testRepo.path);
    await page.goto("/");
    await waitForNetworkIdle(page);

    // Navigate to settings
    await navigateToSettings(page);

    // Click on Appearance tab in settings navigation
    const appearanceTab = page.getByRole("button", { name: /appearance/i });
    await appearanceTab.click();

    // Find and click the hide marketing content checkbox
    const hideMarketingCheckbox = page.locator(
      '[data-testid="hide-marketing-content-checkbox"]'
    );
    await expect(hideMarketingCheckbox).toBeVisible({ timeout: 5000 });
    await hideMarketingCheckbox.click();

    // Navigate back to board to see the sidebar
    await page.goto("/board");
    await waitForNetworkIdle(page);

    // Course promo badge should now be hidden
    const promoBadge = page.locator('[data-testid="course-promo-badge"]');
    await expect(promoBadge).not.toBeVisible({ timeout: 5000 });
  });

  test("should persist hide marketing setting across page reloads", async ({
    page,
  }) => {
    // Setup project
    await setupProjectWithPathNoWorktrees(page, testRepo.path);
    await page.goto("/");
    await waitForNetworkIdle(page);

    // Navigate to settings and enable hide marketing
    await navigateToSettings(page);

    const appearanceTab = page.getByRole("button", { name: /appearance/i });
    await appearanceTab.click();

    const hideMarketingCheckbox = page.locator(
      '[data-testid="hide-marketing-content-checkbox"]'
    );
    await hideMarketingCheckbox.click();

    // Reload the page
    await page.reload();
    await waitForNetworkIdle(page);

    // Course promo badge should still be hidden after reload
    const promoBadge = page.locator('[data-testid="course-promo-badge"]');
    await expect(promoBadge).not.toBeVisible({ timeout: 5000 });
  });

  test("should show course promo badge again when setting is disabled", async ({
    page,
  }) => {
    // Setup project with hide marketing already enabled via localStorage
    await page.addInitScript(() => {
      const state = {
        state: {
          hideMarketingContent: true,
          projects: [],
          currentProject: null,
          theme: "dark",
          sidebarOpen: true,
        },
        version: 2,
      };
      localStorage.setItem("automaker-storage", JSON.stringify(state));
    });

    await setupProjectWithPathNoWorktrees(page, testRepo.path);
    await page.goto("/");
    await waitForNetworkIdle(page);

    // Verify promo is hidden initially
    const promoBadge = page.locator('[data-testid="course-promo-badge"]');
    await expect(promoBadge).not.toBeVisible({ timeout: 5000 });

    // Navigate to settings and disable hide marketing
    await navigateToSettings(page);

    const appearanceTab = page.getByRole("button", { name: /appearance/i });
    await appearanceTab.click();

    const hideMarketingCheckbox = page.locator(
      '[data-testid="hide-marketing-content-checkbox"]'
    );
    await hideMarketingCheckbox.click(); // Uncheck

    // Navigate back to board
    await page.goto("/board");
    await waitForNetworkIdle(page);

    // Course promo badge should now be visible again
    await expect(promoBadge).toBeVisible({ timeout: 5000 });
  });
});
