import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Store original platform and env
const originalPlatform = process.platform;
const originalEnv = { ...process.env };

describe('exec-utils.ts', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    // Restore original values
    Object.defineProperty(process, 'platform', { value: originalPlatform });
    process.env = { ...originalEnv };
  });

  describe('execAsync', () => {
    it('should be a promisified exec function', async () => {
      const { execAsync } = await import('@/lib/exec-utils.js');
      expect(typeof execAsync).toBe('function');
    });

    it('should execute shell commands successfully', async () => {
      const { execAsync } = await import('@/lib/exec-utils.js');
      const result = await execAsync('echo "hello"');
      expect(result.stdout.trim()).toBe('hello');
    });

    it('should reject on invalid commands', async () => {
      const { execAsync } = await import('@/lib/exec-utils.js');
      await expect(execAsync('nonexistent-command-12345')).rejects.toThrow();
    });
  });

  describe('extendedPath', () => {
    it('should include the original PATH', async () => {
      const { extendedPath } = await import('@/lib/exec-utils.js');
      expect(extendedPath).toContain(process.env.PATH);
    });

    it('should include additional Unix paths on non-Windows', async () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      vi.resetModules();

      const { extendedPath } = await import('@/lib/exec-utils.js');
      expect(extendedPath).toContain('/opt/homebrew/bin');
      expect(extendedPath).toContain('/usr/local/bin');
    });
  });

  describe('execEnv', () => {
    it('should have PATH set to extendedPath', async () => {
      const { execEnv, extendedPath } = await import('@/lib/exec-utils.js');
      expect(execEnv.PATH).toBe(extendedPath);
    });

    it('should include all original environment variables', async () => {
      const { execEnv } = await import('@/lib/exec-utils.js');
      // Should have common env vars
      expect(execEnv.HOME || execEnv.USERPROFILE).toBeDefined();
    });
  });

  describe('isENOENT', () => {
    it('should return true for ENOENT errors', async () => {
      const { isENOENT } = await import('@/lib/exec-utils.js');
      const error = { code: 'ENOENT' };
      expect(isENOENT(error)).toBe(true);
    });

    it('should return false for other error codes', async () => {
      const { isENOENT } = await import('@/lib/exec-utils.js');
      const error = { code: 'EACCES' };
      expect(isENOENT(error)).toBe(false);
    });

    it('should return false for null', async () => {
      const { isENOENT } = await import('@/lib/exec-utils.js');
      expect(isENOENT(null)).toBe(false);
    });

    it('should return false for undefined', async () => {
      const { isENOENT } = await import('@/lib/exec-utils.js');
      expect(isENOENT(undefined)).toBe(false);
    });

    it('should return false for non-objects', async () => {
      const { isENOENT } = await import('@/lib/exec-utils.js');
      expect(isENOENT('ENOENT')).toBe(false);
      expect(isENOENT(123)).toBe(false);
    });

    it('should return false for objects without code property', async () => {
      const { isENOENT } = await import('@/lib/exec-utils.js');
      expect(isENOENT({})).toBe(false);
      expect(isENOENT({ message: 'error' })).toBe(false);
    });

    it('should handle Error objects with code', async () => {
      const { isENOENT } = await import('@/lib/exec-utils.js');
      const error = new Error('File not found') as Error & { code: string };
      error.code = 'ENOENT';
      expect(isENOENT(error)).toBe(true);
    });
  });

  describe('Windows platform handling', () => {
    it('should use semicolon as path separator on Windows', async () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      process.env.LOCALAPPDATA = 'C:\\Users\\Test\\AppData\\Local';
      process.env.PROGRAMFILES = 'C:\\Program Files';
      vi.resetModules();

      const { extendedPath } = await import('@/lib/exec-utils.js');
      // Windows uses semicolon separator
      expect(extendedPath).toContain(';');
      expect(extendedPath).toContain('\\Git\\cmd');
    });
  });

  describe('Unix platform handling', () => {
    it('should use colon as path separator on Unix', async () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      process.env.HOME = '/home/testuser';
      vi.resetModules();

      const { extendedPath } = await import('@/lib/exec-utils.js');
      // Unix uses colon separator
      expect(extendedPath).toContain(':');
      expect(extendedPath).toContain('/home/linuxbrew/.linuxbrew/bin');
    });

    it('should include HOME/.local/bin path', async () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      process.env.HOME = '/Users/testuser';
      vi.resetModules();

      const { extendedPath } = await import('@/lib/exec-utils.js');
      expect(extendedPath).toContain('/Users/testuser/.local/bin');
    });
  });
});
