import { useState, useEffect, useCallback, type KeyboardEvent } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Play, Save, RotateCcw, Info, X } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import { getHttpApiClient } from '@/lib/http-api-client';
import { toast } from 'sonner';
import type { Project } from '@/lib/electron';

/** Preset dev server commands for quick selection */
const DEV_SERVER_PRESETS = [
  { label: 'npm run dev', command: 'npm run dev' },
  { label: 'yarn dev', command: 'yarn dev' },
  { label: 'pnpm dev', command: 'pnpm dev' },
  { label: 'bun dev', command: 'bun dev' },
  { label: 'npm start', command: 'npm start' },
  { label: 'cargo watch', command: 'cargo watch -x run' },
  { label: 'go run', command: 'go run .' },
] as const;

interface DevServerSectionProps {
  project: Project;
}

export function DevServerSection({ project }: DevServerSectionProps) {
  const [devCommand, setDevCommand] = useState('');
  const [originalDevCommand, setOriginalDevCommand] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Check if there are unsaved changes
  const hasChanges = devCommand !== originalDevCommand;

  // Load project settings when project changes
  useEffect(() => {
    let isCancelled = false;
    const currentPath = project.path;

    const loadProjectSettings = async () => {
      setIsLoading(true);
      try {
        const httpClient = getHttpApiClient();
        const response = await httpClient.settings.getProject(currentPath);

        // Avoid updating state if component unmounted or project changed
        if (isCancelled) return;

        if (response.success && response.settings) {
          const command = response.settings.devCommand || '';
          setDevCommand(command);
          setOriginalDevCommand(command);
        }
      } catch (error) {
        if (!isCancelled) {
          console.error('Failed to load project settings:', error);
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    loadProjectSettings();

    return () => {
      isCancelled = true;
    };
  }, [project.path]);

  // Save dev command
  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      const httpClient = getHttpApiClient();
      const normalizedCommand = devCommand.trim();
      const response = await httpClient.settings.updateProject(project.path, {
        devCommand: normalizedCommand || undefined,
      });

      if (response.success) {
        setDevCommand(normalizedCommand);
        setOriginalDevCommand(normalizedCommand);
        toast.success('Dev server command saved');
      } else {
        toast.error('Failed to save dev server command', {
          description: response.error,
        });
      }
    } catch (error) {
      console.error('Failed to save dev server command:', error);
      toast.error('Failed to save dev server command');
    } finally {
      setIsSaving(false);
    }
  }, [project.path, devCommand]);

  // Reset to original value
  const handleReset = useCallback(() => {
    setDevCommand(originalDevCommand);
  }, [originalDevCommand]);

  // Use a preset command
  const handleUsePreset = useCallback((command: string) => {
    setDevCommand(command);
  }, []);

  // Clear the command to use auto-detection
  const handleClear = useCallback(() => {
    setDevCommand('');
  }, []);

  // Handle keyboard shortcuts (Enter to save)
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && hasChanges && !isSaving) {
        e.preventDefault();
        handleSave();
      }
    },
    [hasChanges, isSaving, handleSave]
  );

  return (
    <div
      className={cn(
        'rounded-2xl overflow-hidden',
        'border border-border/50',
        'bg-gradient-to-br from-card/90 via-card/70 to-card/80 backdrop-blur-xl',
        'shadow-sm shadow-black/5'
      )}
    >
      <div className="p-6 border-b border-border/50 bg-gradient-to-r from-transparent via-accent/5 to-transparent">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500/20 to-brand-600/10 flex items-center justify-center border border-brand-500/20">
            <Play className="w-5 h-5 text-brand-500" />
          </div>
          <h2 className="text-lg font-semibold text-foreground tracking-tight">
            Dev Server Configuration
          </h2>
        </div>
        <p className="text-sm text-muted-foreground/80 ml-12">
          Configure how the development server is started for this project.
        </p>
      </div>

      <div className="p-6 space-y-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner size="md" />
          </div>
        ) : (
          <>
            {/* Dev Command Input */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="dev-command" className="text-foreground font-medium">
                  Dev Server Command
                </Label>
                {hasChanges && (
                  <span className="text-xs text-amber-500 font-medium">(unsaved changes)</span>
                )}
              </div>
              <div className="relative">
                <Input
                  id="dev-command"
                  value={devCommand}
                  onChange={(e) => setDevCommand(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="e.g., npm run dev, yarn dev, cargo watch, go run ."
                  className="font-mono text-sm pr-8"
                  data-testid="dev-command-input"
                />
                {devCommand && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClear}
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                    title="Clear to use auto-detection"
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground/80 leading-relaxed">
                The command to start the development server for this project. If not specified, the
                system will auto-detect based on your package manager (npm/yarn/pnpm/bun run dev).
              </p>
            </div>

            {/* Auto-detection Info */}
            <div className="flex items-start gap-3 p-3 rounded-lg bg-accent/20 border border-border/30">
              <Info className="w-4 h-4 text-brand-500 mt-0.5 shrink-0" />
              <div className="text-xs text-muted-foreground">
                <p className="font-medium text-foreground mb-1">Auto-detection</p>
                <p>
                  When no custom command is set, the dev server automatically detects your package
                  manager (npm, yarn, pnpm, or bun) and runs the &quot;dev&quot; script. Set a
                  custom command if your project uses a different script name (e.g., start, serve)
                  or requires additional flags.
                </p>
              </div>
            </div>

            {/* Quick Presets */}
            <div className="space-y-3">
              <Label className="text-foreground font-medium">Quick Presets</Label>
              <div className="flex flex-wrap gap-2">
                {DEV_SERVER_PRESETS.map((preset) => (
                  <Button
                    key={preset.command}
                    variant="outline"
                    size="sm"
                    onClick={() => handleUsePreset(preset.command)}
                    className="text-xs font-mono"
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground/80">
                Click a preset to use it as your dev server command. Press Enter to save.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleReset}
                disabled={!hasChanges || isSaving}
                className="gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={!hasChanges || isSaving}
                className="gap-1.5"
              >
                {isSaving ? <Spinner size="xs" /> : <Save className="w-3.5 h-3.5" />}
                Save
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
