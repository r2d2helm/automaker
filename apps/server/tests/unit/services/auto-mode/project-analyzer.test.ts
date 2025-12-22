import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted for mock functions that need to be used in vi.mock factories
const {
  mockExecuteQuery,
  mockProcessStream,
  mockMkdir,
  mockWriteFile,
  mockValidateWorkingDirectory,
} = vi.hoisted(() => ({
  mockExecuteQuery: vi.fn(),
  mockProcessStream: vi.fn(),
  mockMkdir: vi.fn(),
  mockWriteFile: vi.fn(),
  mockValidateWorkingDirectory: vi.fn(),
}));

// Mock dependencies
vi.mock('@automaker/platform', () => ({
  secureFs: {
    mkdir: mockMkdir,
    writeFile: mockWriteFile,
  },
  getAutomakerDir: (projectPath: string) => `${projectPath}/.automaker`,
}));

vi.mock('@automaker/utils', async () => {
  const actual = await vi.importActual('@automaker/utils');
  return {
    ...actual,
    processStream: mockProcessStream,
  };
});

vi.mock('@automaker/model-resolver', () => ({
  resolveModelString: () => 'claude-sonnet-4-20250514',
  DEFAULT_MODELS: { claude: 'claude-sonnet-4-20250514' },
}));

vi.mock('@/providers/provider-factory.js', () => ({
  ProviderFactory: {
    getProviderForModel: () => ({
      executeQuery: mockExecuteQuery,
    }),
  },
}));

vi.mock('@/lib/sdk-options.js', () => ({
  validateWorkingDirectory: mockValidateWorkingDirectory,
}));

import { ProjectAnalyzer } from '@/services/auto-mode/project-analyzer.js';

describe('ProjectAnalyzer', () => {
  let analyzer: ProjectAnalyzer;
  let mockEvents: { emit: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    mockEvents = { emit: vi.fn() };

    mockExecuteQuery.mockReturnValue(
      (async function* () {
        yield { type: 'text', text: 'Analysis result' };
      })()
    );

    mockProcessStream.mockResolvedValue({
      text: '# Project Analysis\nThis is a test project.',
      toolUses: [],
    });

    analyzer = new ProjectAnalyzer(mockEvents as any);
  });

  describe('constructor', () => {
    it('should create analyzer instance', () => {
      expect(analyzer).toBeInstanceOf(ProjectAnalyzer);
    });
  });

  describe('analyze', () => {
    it('should validate working directory', async () => {
      await analyzer.analyze('/project');

      expect(mockValidateWorkingDirectory).toHaveBeenCalledWith('/project');
    });

    it('should emit start event', async () => {
      await analyzer.analyze('/project');

      expect(mockEvents.emit).toHaveBeenCalledWith(
        'auto-mode:event',
        expect.objectContaining({
          type: 'auto_mode_feature_start',
          projectPath: '/project',
        })
      );
    });

    it('should call provider executeQuery with correct options', async () => {
      await analyzer.analyze('/project');

      expect(mockExecuteQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          cwd: '/project',
          maxTurns: 5,
          allowedTools: ['Read', 'Glob', 'Grep'],
        })
      );
    });

    it('should save analysis to file', async () => {
      await analyzer.analyze('/project');

      expect(mockMkdir).toHaveBeenCalledWith('/project/.automaker', { recursive: true });
      expect(mockWriteFile).toHaveBeenCalledWith(
        '/project/.automaker/project-analysis.md',
        '# Project Analysis\nThis is a test project.'
      );
    });

    it('should emit complete event on success', async () => {
      await analyzer.analyze('/project');

      expect(mockEvents.emit).toHaveBeenCalledWith(
        'auto-mode:event',
        expect.objectContaining({
          type: 'auto_mode_feature_complete',
          passes: true,
          message: 'Project analysis completed',
        })
      );
    });

    it('should emit error event on failure', async () => {
      mockProcessStream.mockRejectedValue(new Error('Analysis failed'));

      await analyzer.analyze('/project');

      expect(mockEvents.emit).toHaveBeenCalledWith(
        'auto-mode:event',
        expect.objectContaining({
          type: 'auto_mode_error',
          error: expect.stringContaining('Analysis failed'),
        })
      );
    });

    it('should handle stream with onText callback', async () => {
      await analyzer.analyze('/project');

      expect(mockProcessStream).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          onText: expect.any(Function),
        })
      );
    });
  });
});
