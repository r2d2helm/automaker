import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskExecutor } from '@/services/auto-mode/task-executor.js';
import type { ParsedTask } from '@automaker/types';
import type { TaskExecutionContext } from '@/services/auto-mode/types.js';

// Use vi.hoisted for mock functions
const { mockBuildTaskPrompt, mockProcessStream } = vi.hoisted(() => ({
  mockBuildTaskPrompt: vi.fn(),
  mockProcessStream: vi.fn(),
}));

// Mock dependencies
vi.mock('@automaker/prompts', () => ({
  buildTaskPrompt: mockBuildTaskPrompt,
}));

vi.mock('@automaker/utils', async () => {
  const actual = await vi.importActual('@automaker/utils');
  return {
    ...actual,
    processStream: mockProcessStream,
  };
});

describe('TaskExecutor', () => {
  let executor: TaskExecutor;
  let mockEvents: { emit: ReturnType<typeof vi.fn> };
  let mockProvider: { executeQuery: ReturnType<typeof vi.fn> };
  let mockContext: TaskExecutionContext;
  let mockTasks: ParsedTask[];

  beforeEach(() => {
    vi.clearAllMocks();

    mockEvents = { emit: vi.fn() };
    mockProvider = {
      executeQuery: vi.fn().mockReturnValue(
        (async function* () {
          yield { type: 'text', text: 'Task output' };
        })()
      ),
    };

    mockContext = {
      featureId: 'feature-1',
      projectPath: '/project',
      workDir: '/project/worktree',
      model: 'claude-sonnet-4-20250514',
      maxTurns: 100,
      allowedTools: ['Read', 'Write'],
      abortController: new AbortController(),
      planContent: '# Plan\nTask list',
      userFeedback: undefined,
    };

    mockTasks = [
      { id: '1', description: 'Task 1', phase: 'Phase 1' },
      { id: '2', description: 'Task 2', phase: 'Phase 1' },
      { id: '3', description: 'Task 3', phase: 'Phase 2' },
    ];

    mockBuildTaskPrompt.mockReturnValue('Generated task prompt');
    mockProcessStream.mockResolvedValue({ text: 'Processed output', toolUses: [] });

    executor = new TaskExecutor(mockEvents as any);
  });

  describe('constructor', () => {
    it('should create executor instance', () => {
      expect(executor).toBeInstanceOf(TaskExecutor);
    });
  });

  describe('executeAll', () => {
    it('should yield started and completed events for each task', async () => {
      const results: any[] = [];
      for await (const progress of executor.executeAll(
        mockTasks,
        mockContext,
        mockProvider as any
      )) {
        results.push(progress);
      }

      // Should have 2 events per task (started + completed)
      expect(results).toHaveLength(6);
      expect(results[0]).toEqual({
        taskId: '1',
        taskIndex: 0,
        tasksTotal: 3,
        status: 'started',
      });
      expect(results[1]).toEqual({
        taskId: '1',
        taskIndex: 0,
        tasksTotal: 3,
        status: 'completed',
        output: 'Processed output',
        phaseComplete: undefined,
      });
    });

    it('should emit task started events', async () => {
      const results: any[] = [];
      for await (const progress of executor.executeAll(
        mockTasks,
        mockContext,
        mockProvider as any
      )) {
        results.push(progress);
      }

      expect(mockEvents.emit).toHaveBeenCalledWith('auto-mode:event', {
        type: 'auto_mode_task_started',
        featureId: 'feature-1',
        projectPath: '/project',
        taskId: '1',
        taskDescription: 'Task 1',
        taskIndex: 0,
        tasksTotal: 3,
      });
    });

    it('should emit task complete events', async () => {
      const results: any[] = [];
      for await (const progress of executor.executeAll(
        mockTasks,
        mockContext,
        mockProvider as any
      )) {
        results.push(progress);
      }

      expect(mockEvents.emit).toHaveBeenCalledWith('auto-mode:event', {
        type: 'auto_mode_task_complete',
        featureId: 'feature-1',
        projectPath: '/project',
        taskId: '1',
        tasksCompleted: 1,
        tasksTotal: 3,
      });
    });

    it('should throw on abort', async () => {
      mockContext.abortController.abort();

      const results: any[] = [];
      await expect(async () => {
        for await (const progress of executor.executeAll(
          mockTasks,
          mockContext,
          mockProvider as any
        )) {
          results.push(progress);
        }
      }).rejects.toThrow('Feature execution aborted');
    });

    it('should call provider executeQuery with correct options', async () => {
      const results: any[] = [];
      for await (const progress of executor.executeAll(
        mockTasks,
        mockContext,
        mockProvider as any
      )) {
        results.push(progress);
      }

      expect(mockProvider.executeQuery).toHaveBeenCalledWith({
        prompt: 'Generated task prompt',
        model: 'claude-sonnet-4-20250514',
        maxTurns: 50, // Limited to 50 per task
        cwd: '/project/worktree',
        allowedTools: ['Read', 'Write'],
        abortController: mockContext.abortController,
      });
    });

    it('should detect phase completion', async () => {
      const results: any[] = [];
      for await (const progress of executor.executeAll(
        mockTasks,
        mockContext,
        mockProvider as any
      )) {
        results.push(progress);
      }

      // Task 2 completes Phase 1 (next task is Phase 2)
      const task2Completed = results.find((r) => r.taskId === '2' && r.status === 'completed');
      expect(task2Completed?.phaseComplete).toBe(1);

      // Task 3 completes Phase 2 (no more tasks)
      const task3Completed = results.find((r) => r.taskId === '3' && r.status === 'completed');
      expect(task3Completed?.phaseComplete).toBe(2);
    });

    it('should emit phase complete events', async () => {
      const results: any[] = [];
      for await (const progress of executor.executeAll(
        mockTasks,
        mockContext,
        mockProvider as any
      )) {
        results.push(progress);
      }

      expect(mockEvents.emit).toHaveBeenCalledWith('auto-mode:event', {
        type: 'auto_mode_phase_complete',
        featureId: 'feature-1',
        projectPath: '/project',
        phaseNumber: 1,
      });
    });

    it('should yield failed status on error', async () => {
      mockProcessStream.mockRejectedValueOnce(new Error('Task failed'));

      const results: any[] = [];
      await expect(async () => {
        for await (const progress of executor.executeAll(
          mockTasks,
          mockContext,
          mockProvider as any
        )) {
          results.push(progress);
        }
      }).rejects.toThrow('Task failed');

      expect(results).toContainEqual({
        taskId: '1',
        taskIndex: 0,
        tasksTotal: 3,
        status: 'failed',
        output: 'Task failed',
      });
    });
  });

  describe('executeOne', () => {
    it('should execute a single task and return output', async () => {
      const result = await executor.executeOne(
        mockTasks[0],
        mockTasks,
        0,
        mockContext,
        mockProvider as any
      );

      expect(result).toBe('Processed output');
    });

    it('should build prompt with correct parameters', async () => {
      await executor.executeOne(mockTasks[0], mockTasks, 0, mockContext, mockProvider as any);

      expect(mockBuildTaskPrompt).toHaveBeenCalledWith(
        mockTasks[0],
        mockTasks,
        0,
        mockContext.planContent,
        mockContext.userFeedback
      );
    });

    it('should emit progress events for text output', async () => {
      mockProcessStream.mockImplementation(async (_stream, options) => {
        options.onText?.('Some output');
        return { text: 'Some output', toolUses: [] };
      });

      await executor.executeOne(mockTasks[0], mockTasks, 0, mockContext, mockProvider as any);

      expect(mockEvents.emit).toHaveBeenCalledWith('auto-mode:event', {
        type: 'auto_mode_progress',
        featureId: 'feature-1',
        content: 'Some output',
      });
    });

    it('should emit tool events for tool use', async () => {
      mockProcessStream.mockImplementation(async (_stream, options) => {
        options.onToolUse?.('Read', { path: '/file.txt' });
        return { text: 'Output', toolUses: [] };
      });

      await executor.executeOne(mockTasks[0], mockTasks, 0, mockContext, mockProvider as any);

      expect(mockEvents.emit).toHaveBeenCalledWith('auto-mode:event', {
        type: 'auto_mode_tool',
        featureId: 'feature-1',
        tool: 'Read',
        input: { path: '/file.txt' },
      });
    });
  });

  describe('phase detection', () => {
    it('should not detect phase completion for tasks without phase', async () => {
      const tasksNoPhase = [
        { id: '1', description: 'Task 1' },
        { id: '2', description: 'Task 2' },
      ];

      const results: any[] = [];
      for await (const progress of executor.executeAll(
        tasksNoPhase,
        mockContext,
        mockProvider as any
      )) {
        results.push(progress);
      }

      const completedResults = results.filter((r) => r.status === 'completed');
      expect(completedResults.every((r) => r.phaseComplete === undefined)).toBe(true);
    });

    it('should detect phase change when next task has different phase', async () => {
      const results: any[] = [];
      for await (const progress of executor.executeAll(
        mockTasks,
        mockContext,
        mockProvider as any
      )) {
        results.push(progress);
      }

      // Task 2 (Phase 1) -> Task 3 (Phase 2) = phase complete
      const task2Completed = results.find((r) => r.taskId === '2' && r.status === 'completed');
      expect(task2Completed?.phaseComplete).toBe(1);
    });
  });
});
