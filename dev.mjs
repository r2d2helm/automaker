#!/usr/bin/env node

/**
 * Automaker - Development Mode Launch Script
 *
 * This script starts the application in development mode with hot reloading.
 * It uses Vite dev server for fast HMR during development.
 *
 * Usage: npm run dev
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { statSync } from 'fs';
import { execSync } from 'child_process';

import {
  createRestrictedFs,
  log,
  runNpm,
  runNpmAndWait,
  printHeader,
  printModeMenu,
  resolvePortConfiguration,
  createCleanupHandler,
  setupSignalHandlers,
  startServerAndWait,
  ensureDependencies,
  prompt,
} from './scripts/launcher-utils.mjs';

const require = createRequire(import.meta.url);
const crossSpawn = require('cross-spawn');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create restricted fs for this script's directory
const fs = createRestrictedFs(__dirname, 'dev.mjs');

// Track background processes for cleanup
const processes = {
  server: null,
  web: null,
  electron: null,
  docker: null,
};

/**
 * Sanitize a project name to be safe for use in shell commands and Docker image names.
 * Converts to lowercase and removes any characters that aren't alphanumeric.
 */
function sanitizeProjectName(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Check if Docker images need to be rebuilt based on Dockerfile or package.json changes
 */
function shouldRebuildDockerImages() {
  try {
    const dockerfilePath = path.join(__dirname, 'Dockerfile');
    const packageJsonPath = path.join(__dirname, 'package.json');

    // Get modification times of source files
    const dockerfileMtime = statSync(dockerfilePath).mtimeMs;
    const packageJsonMtime = statSync(packageJsonPath).mtimeMs;
    const latestSourceMtime = Math.max(dockerfileMtime, packageJsonMtime);

    // Get project name from docker-compose config, falling back to directory name
    let projectName;
    try {
      const composeConfig = execSync('docker compose config --format json', {
        encoding: 'utf-8',
        cwd: __dirname,
      });
      const config = JSON.parse(composeConfig);
      projectName = config.name;
    } catch (error) {
      // Fallback handled below
    }

    // Sanitize project name (whether from config or fallback)
    // This prevents command injection and ensures valid Docker image names
    const sanitizedProjectName = sanitizeProjectName(
      projectName || path.basename(__dirname)
    );
    const serverImageName = `${sanitizedProjectName}_server`;
    const uiImageName = `${sanitizedProjectName}_ui`;

    // Check if images exist and get their creation times
    let needsRebuild = false;

    try {
      // Check server image
      const serverImageInfo = execSync(
        `docker image inspect ${serverImageName} --format "{{.Created}}" 2>/dev/null || echo ""`,
        { encoding: 'utf-8', cwd: __dirname }
      ).trim();

      // Check UI image
      const uiImageInfo = execSync(
        `docker image inspect ${uiImageName} --format "{{.Created}}" 2>/dev/null || echo ""`,
        { encoding: 'utf-8', cwd: __dirname }
      ).trim();

      // If either image doesn't exist, we need to rebuild
      if (!serverImageInfo || !uiImageInfo) {
        return true;
      }

      // Parse image creation times (ISO 8601 format)
      const serverCreated = new Date(serverImageInfo).getTime();
      const uiCreated = new Date(uiImageInfo).getTime();
      const oldestImageTime = Math.min(serverCreated, uiCreated);

      // If source files are newer than images, rebuild
      needsRebuild = latestSourceMtime > oldestImageTime;
    } catch (error) {
      // If images don't exist or inspect fails, rebuild
      needsRebuild = true;
    }

    return needsRebuild;
  } catch (error) {
    // If we can't check, err on the side of rebuilding
    log('Could not check Docker image status, will rebuild to be safe', 'yellow');
    return true;
  }
}

/**
 * Install Playwright browsers (dev-only dependency)
 */
async function installPlaywrightBrowsers() {
  log('Checking Playwright browsers...', 'yellow');
  try {
    const exitCode = await new Promise((resolve) => {
      const playwright = crossSpawn('npx', ['playwright', 'install', 'chromium'], {
        stdio: 'inherit',
        cwd: path.join(__dirname, 'apps', 'ui'),
      });
      playwright.on('close', (code) => resolve(code));
      playwright.on('error', () => resolve(1));
    });

    if (exitCode === 0) {
      log('Playwright browsers ready', 'green');
    } else {
      log('Playwright installation failed (browser automation may not work)', 'yellow');
    }
  } catch {
    log('Playwright installation skipped', 'yellow');
  }
}

/**
 * Main function
 */
async function main() {
  // Change to script directory
  process.chdir(__dirname);

  printHeader('Automaker Development Environment');

  // Ensure dependencies are installed
  await ensureDependencies(fs, __dirname);

  // Install Playwright browsers (dev-only)
  await installPlaywrightBrowsers();

  // Resolve port configuration (check/kill/change ports)
  const { webPort, serverPort, corsOriginEnv } = await resolvePortConfiguration();

  // Show mode selection menu
  printModeMenu();

  // Setup cleanup handlers
  const cleanup = createCleanupHandler(processes);
  setupSignalHandlers(cleanup);

  // Prompt for choice
  while (true) {
    const choice = await prompt('Enter your choice (1, 2, or 3): ');

    if (choice === '1') {
      console.log('');
      log('Launching Web Application (Development Mode)...', 'blue');

      // Build shared packages once
      log('Building shared packages...', 'blue');
      await runNpmAndWait(['run', 'build:packages'], { stdio: 'inherit' }, __dirname);

      // Start the backend server in dev mode
      processes.server = await startServerAndWait({
        serverPort,
        corsOriginEnv,
        npmArgs: ['run', '_dev:server'],
        cwd: __dirname,
        fs,
        baseDir: __dirname,
      });

      if (!processes.server) {
        await cleanup();
        process.exit(1);
      }

      log(`The application will be available at: http://localhost:${webPort}`, 'green');
      console.log('');

      // Start web app with Vite dev server (HMR enabled)
      processes.web = runNpm(
        ['run', '_dev:web'],
        {
          stdio: 'inherit',
          env: {
            TEST_PORT: String(webPort),
            VITE_SERVER_URL: `http://localhost:${serverPort}`,
          },
        },
        __dirname
      );

      await new Promise((resolve) => {
        processes.web.on('close', resolve);
      });

      break;
    } else if (choice === '2') {
      console.log('');
      log('Launching Desktop Application (Development Mode)...', 'blue');
      log('(Electron will start its own backend server)', 'yellow');
      console.log('');

      // Pass selected ports through to Vite + Electron backend
      processes.electron = runNpm(
        ['run', 'dev:electron'],
        {
          stdio: 'inherit',
          env: {
            TEST_PORT: String(webPort),
            PORT: String(serverPort),
            VITE_SERVER_URL: `http://localhost:${serverPort}`,
            CORS_ORIGIN: corsOriginEnv,
          },
        },
        __dirname
      );

      await new Promise((resolve) => {
        processes.electron.on('close', resolve);
      });

      break;
    } else if (choice === '3') {
      console.log('');
      log('Launching Docker Container (Isolated Mode)...', 'blue');

      // Check if Dockerfile or package.json changed and rebuild if needed
      const needsRebuild = shouldRebuildDockerImages();
      const buildFlag = needsRebuild ? ['--build'] : [];

      if (needsRebuild) {
        log('Dockerfile or package.json changed - rebuilding images...', 'yellow');
      } else {
        log('Starting Docker containers...', 'yellow');
      }
      console.log('');

      // Check if ANTHROPIC_API_KEY is set
      if (!process.env.ANTHROPIC_API_KEY) {
        log('Warning: ANTHROPIC_API_KEY environment variable is not set.', 'yellow');
        log('The server will require an API key to function.', 'yellow');
        log('Set it with: export ANTHROPIC_API_KEY=your-key', 'yellow');
        console.log('');
      }

      // Start containers with docker-compose
      // Will rebuild if Dockerfile or package.json changed
      processes.docker = crossSpawn('docker', ['compose', 'up', ...buildFlag], {
        stdio: 'inherit',
        cwd: __dirname,
        env: {
          ...process.env,
        },
      });

      log('Docker containers starting...', 'blue');
      log('UI will be available at: http://localhost:3007', 'green');
      log('API will be available at: http://localhost:3008', 'green');
      console.log('');
      log('Press Ctrl+C to stop the containers.', 'yellow');

      await new Promise((resolve) => {
        processes.docker.on('close', resolve);
      });

      break;
    } else {
      log('Invalid choice. Please enter 1, 2, or 3.', 'red');
    }
  }
}

// Run main function
main().catch(async (err) => {
  console.error(err);
  const cleanup = createCleanupHandler(processes);
  try {
    await cleanup();
  } catch (cleanupErr) {
    console.error('Cleanup error:', cleanupErr);
  }
  process.exit(1);
});
