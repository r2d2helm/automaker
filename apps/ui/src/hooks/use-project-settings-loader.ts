import { useEffect, useRef } from 'react';
import { useAppStore } from '@/store/app-store';
import { getHttpApiClient } from '@/lib/http-api-client';

/**
 * Hook that loads project settings from the server when the current project changes.
 * This ensures that settings like board backgrounds are properly restored when
 * switching between projects or restarting the app.
 */
export function useProjectSettingsLoader() {
  const currentProject = useAppStore((state) => state.currentProject);
  const setBoardBackground = useAppStore((state) => state.setBoardBackground);
  const setCardOpacity = useAppStore((state) => state.setCardOpacity);
  const setColumnOpacity = useAppStore((state) => state.setColumnOpacity);
  const setColumnBorderEnabled = useAppStore((state) => state.setColumnBorderEnabled);
  const setCardGlassmorphism = useAppStore((state) => state.setCardGlassmorphism);
  const setCardBorderEnabled = useAppStore((state) => state.setCardBorderEnabled);
  const setCardBorderOpacity = useAppStore((state) => state.setCardBorderOpacity);
  const setHideScrollbar = useAppStore((state) => state.setHideScrollbar);

  const loadingRef = useRef<string | null>(null);

  useEffect(() => {
    if (!currentProject?.path) {
      return;
    }

    // Prevent loading the same project multiple times
    if (loadingRef.current === currentProject.path) {
      return;
    }

    loadingRef.current = currentProject.path;

    const loadProjectSettings = async () => {
      try {
        const httpClient = getHttpApiClient();
        const result = await httpClient.settings.getProject(currentProject.path);

        if (result.success && result.settings?.boardBackground) {
          const bg = result.settings.boardBackground;
          const projectPath = currentProject.path;

          // Update store with loaded settings (without triggering server save)
          setBoardBackground(projectPath, bg.imagePath);

          const settingsMap = {
            cardOpacity: setCardOpacity,
            columnOpacity: setColumnOpacity,
            columnBorderEnabled: setColumnBorderEnabled,
            cardGlassmorphism: setCardGlassmorphism,
            cardBorderEnabled: setCardBorderEnabled,
            cardBorderOpacity: setCardBorderOpacity,
            hideScrollbar: setHideScrollbar,
          } as const;

          for (const [key, setter] of Object.entries(settingsMap)) {
            const value = bg[key as keyof typeof bg];
            if (value !== undefined) {
              (setter as (path: string, val: typeof value) => void)(projectPath, value);
            }
          }
        }
      } catch (error) {
        console.error('Failed to load project settings:', error);
        // Don't show error toast - just log it
      }
    };

    loadProjectSettings();
  }, [
    currentProject?.path,
    setBoardBackground,
    setCardOpacity,
    setColumnOpacity,
    setColumnBorderEnabled,
    setCardGlassmorphism,
    setCardBorderEnabled,
    setCardBorderOpacity,
    setHideScrollbar,
  ]);
}
