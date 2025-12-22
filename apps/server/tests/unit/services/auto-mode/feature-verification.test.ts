import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FeatureVerificationService } from '@/services/auto-mode/feature-verification.js';

// Mock dependencies
vi.mock('@automaker/platform', () => ({
  secureFs: {
    access: vi.fn(),
    readFile: vi.fn(),
  },
  getFeatureDir: vi.fn(
    (projectPath: string, featureId: string) => `${projectPath}/.automaker/features/${featureId}`
  ),
}));

vi.mock('@automaker/git-utils', () => ({
  runVerificationChecks: vi.fn(),
  hasUncommittedChanges: vi.fn(),
  commitAll: vi.fn(),
  shortHash: vi.fn((hash: string) => hash.substring(0, 7)),
}));

vi.mock('@automaker/prompts', () => ({
  extractTitleFromDescription: vi.fn((desc: string) => desc.split('\n')[0]),
}));

import { secureFs, getFeatureDir } from '@automaker/platform';
import { runVerificationChecks, hasUncommittedChanges, commitAll } from '@automaker/git-utils';

describe('FeatureVerificationService', () => {
  let service: FeatureVerificationService;
  let mockEvents: { emit: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    mockEvents = { emit: vi.fn() };
    service = new FeatureVerificationService(mockEvents as any);
  });

  describe('constructor', () => {
    it('should create service instance', () => {
      expect(service).toBeInstanceOf(FeatureVerificationService);
    });
  });

  describe('resolveWorkDir', () => {
    it('should return worktree path if it exists', async () => {
      vi.mocked(secureFs.access).mockResolvedValue(undefined);

      const result = await service.resolveWorkDir('/project', 'feature-1');

      expect(result).toBe('/project/.worktrees/feature-1');
      expect(secureFs.access).toHaveBeenCalledWith('/project/.worktrees/feature-1');
    });

    it('should return project path if worktree does not exist', async () => {
      vi.mocked(secureFs.access).mockRejectedValue(new Error('ENOENT'));

      const result = await service.resolveWorkDir('/project', 'feature-1');

      expect(result).toBe('/project');
    });
  });

  describe('verify', () => {
    it('should emit success event when verification passes', async () => {
      vi.mocked(secureFs.access).mockRejectedValue(new Error('ENOENT'));
      vi.mocked(runVerificationChecks).mockResolvedValue({ success: true });

      const result = await service.verify('/project', 'feature-1');

      expect(result.success).toBe(true);
      expect(mockEvents.emit).toHaveBeenCalledWith('auto-mode:event', {
        type: 'auto_mode_feature_complete',
        featureId: 'feature-1',
        passes: true,
        message: 'All verification checks passed',
      });
    });

    it('should emit failure event when verification fails', async () => {
      vi.mocked(secureFs.access).mockRejectedValue(new Error('ENOENT'));
      vi.mocked(runVerificationChecks).mockResolvedValue({
        success: false,
        failedCheck: 'lint',
      });

      const result = await service.verify('/project', 'feature-1');

      expect(result.success).toBe(false);
      expect(result.failedCheck).toBe('lint');
      expect(mockEvents.emit).toHaveBeenCalledWith('auto-mode:event', {
        type: 'auto_mode_feature_complete',
        featureId: 'feature-1',
        passes: false,
        message: 'Verification failed: lint',
      });
    });

    it('should use worktree path if available', async () => {
      vi.mocked(secureFs.access).mockResolvedValue(undefined);
      vi.mocked(runVerificationChecks).mockResolvedValue({ success: true });

      await service.verify('/project', 'feature-1');

      expect(runVerificationChecks).toHaveBeenCalledWith('/project/.worktrees/feature-1');
    });
  });

  describe('commit', () => {
    it('should return null hash when no changes', async () => {
      vi.mocked(secureFs.access).mockRejectedValue(new Error('ENOENT'));
      vi.mocked(hasUncommittedChanges).mockResolvedValue(false);

      const result = await service.commit('/project', 'feature-1', null);

      expect(result.hash).toBeNull();
      expect(commitAll).not.toHaveBeenCalled();
    });

    it('should commit changes and return hash', async () => {
      vi.mocked(secureFs.access).mockRejectedValue(new Error('ENOENT'));
      vi.mocked(hasUncommittedChanges).mockResolvedValue(true);
      vi.mocked(commitAll).mockResolvedValue('abc123def456');

      const result = await service.commit('/project', 'feature-1', {
        id: 'feature-1',
        description: 'Add login button\nWith authentication',
      } as any);

      expect(result.hash).toBe('abc123def456');
      expect(result.shortHash).toBe('abc123d');
      expect(commitAll).toHaveBeenCalledWith(
        '/project',
        expect.stringContaining('feat: Add login button')
      );
    });

    it('should use provided worktree path', async () => {
      vi.mocked(secureFs.access).mockResolvedValue(undefined);
      vi.mocked(hasUncommittedChanges).mockResolvedValue(true);
      vi.mocked(commitAll).mockResolvedValue('abc123');

      await service.commit('/project', 'feature-1', null, '/custom/worktree');

      expect(hasUncommittedChanges).toHaveBeenCalledWith('/custom/worktree');
    });

    it('should fall back to project path if provided worktree does not exist', async () => {
      vi.mocked(secureFs.access).mockRejectedValue(new Error('ENOENT'));
      vi.mocked(hasUncommittedChanges).mockResolvedValue(false);

      await service.commit('/project', 'feature-1', null, '/nonexistent/worktree');

      expect(hasUncommittedChanges).toHaveBeenCalledWith('/project');
    });

    it('should use feature ID in commit message when no feature provided', async () => {
      vi.mocked(secureFs.access).mockRejectedValue(new Error('ENOENT'));
      vi.mocked(hasUncommittedChanges).mockResolvedValue(true);
      vi.mocked(commitAll).mockResolvedValue('abc123');

      await service.commit('/project', 'feature-123', null);

      expect(commitAll).toHaveBeenCalledWith(
        '/project',
        expect.stringContaining('feat: Feature feature-123')
      );
    });

    it('should emit event on successful commit', async () => {
      vi.mocked(secureFs.access).mockRejectedValue(new Error('ENOENT'));
      vi.mocked(hasUncommittedChanges).mockResolvedValue(true);
      vi.mocked(commitAll).mockResolvedValue('abc123def');

      await service.commit('/project', 'feature-1', null);

      expect(mockEvents.emit).toHaveBeenCalledWith('auto-mode:event', {
        type: 'auto_mode_feature_complete',
        featureId: 'feature-1',
        passes: true,
        message: expect.stringContaining('Changes committed:'),
      });
    });

    it('should return null hash when commit fails', async () => {
      vi.mocked(secureFs.access).mockRejectedValue(new Error('ENOENT'));
      vi.mocked(hasUncommittedChanges).mockResolvedValue(true);
      vi.mocked(commitAll).mockResolvedValue(null);

      const result = await service.commit('/project', 'feature-1', null);

      expect(result.hash).toBeNull();
    });
  });

  describe('contextExists', () => {
    it('should return true if context file exists', async () => {
      vi.mocked(secureFs.access).mockResolvedValue(undefined);

      const result = await service.contextExists('/project', 'feature-1');

      expect(result).toBe(true);
      expect(secureFs.access).toHaveBeenCalledWith(
        '/project/.automaker/features/feature-1/agent-output.md'
      );
    });

    it('should return false if context file does not exist', async () => {
      vi.mocked(secureFs.access).mockRejectedValue(new Error('ENOENT'));

      const result = await service.contextExists('/project', 'feature-1');

      expect(result).toBe(false);
    });
  });

  describe('loadContext', () => {
    it('should return context content if file exists', async () => {
      vi.mocked(secureFs.readFile).mockResolvedValue('# Agent Output\nSome content');

      const result = await service.loadContext('/project', 'feature-1');

      expect(result).toBe('# Agent Output\nSome content');
      expect(secureFs.readFile).toHaveBeenCalledWith(
        '/project/.automaker/features/feature-1/agent-output.md',
        'utf-8'
      );
    });

    it('should return null if file does not exist', async () => {
      vi.mocked(secureFs.readFile).mockRejectedValue(new Error('ENOENT'));

      const result = await service.loadContext('/project', 'feature-1');

      expect(result).toBeNull();
    });
  });
});
