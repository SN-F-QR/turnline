import { useEffect } from 'react';
import { matchesToggleSidebar } from '../lib/shortcuts';

export function useShortcuts(enabled: boolean, toggleSidebar: () => void): void {
  useEffect(() => {
    if (!enabled) return;

    const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!matchesToggleSidebar(event, isMac)) return;

      // Do not filter by target: composed events from the extension's Shadow DOM
      // and the host chat editor must both be able to toggle the outline.
      event.preventDefault();
      event.stopImmediatePropagation();
      toggleSidebar();
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [enabled, toggleSidebar]);
}
