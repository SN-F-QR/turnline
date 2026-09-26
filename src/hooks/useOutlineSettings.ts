import { useCallback, useEffect, useState } from 'react';
import { HEADING_DEPTH_KEY, SIDEBAR_WIDTH_KEY, normalizeDepth, normalizeWidth } from '../lib/outlineSettings';

// Adapted-from: https://github.com/dezhonger/scroll/commit/c8a9b6d997fc0a9d1aef58f329835e1833a2f739
// Keep only depth/width preferences; no Latest or Section Copy dependencies.
export function useOutlineSettings() {
    const [depth, setDepth] = useState(4);
    const [width, setWidth] = useState(420);
    useEffect(() => {
        let disposed = false;
        const changedKeys = new Set<string>();
        const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
            if (area !== 'local' || disposed) return;
            if (HEADING_DEPTH_KEY in changes) {
                changedKeys.add(HEADING_DEPTH_KEY);
                setDepth(normalizeDepth(changes[HEADING_DEPTH_KEY].newValue));
            }
            if (SIDEBAR_WIDTH_KEY in changes) {
                changedKeys.add(SIDEBAR_WIDTH_KEY);
                setWidth(normalizeWidth(changes[SIDEBAR_WIDTH_KEY].newValue));
            }
        };
        chrome.storage.onChanged.addListener(onChanged);
        void chrome.storage.local.get([HEADING_DEPTH_KEY, SIDEBAR_WIDTH_KEY]).then(values => {
            if (disposed) return;
            if (!changedKeys.has(HEADING_DEPTH_KEY)) setDepth(normalizeDepth(values[HEADING_DEPTH_KEY]));
            if (!changedKeys.has(SIDEBAR_WIDTH_KEY)) setWidth(normalizeWidth(values[SIDEBAR_WIDTH_KEY]));
        }).catch(() => {});
        return () => {
            disposed = true;
            chrome.storage.onChanged.removeListener(onChanged);
        };
    }, []);
    const updateDepth = useCallback((value: number) => {
        const next = normalizeDepth(value);
        setDepth(next);
        void chrome.storage.local.set({ [HEADING_DEPTH_KEY]: next }).catch(() => {});
    }, []);
    const updateWidth = useCallback((value: number) => {
        const next = normalizeWidth(value);
        setWidth(next);
        void chrome.storage.local.set({ [SIDEBAR_WIDTH_KEY]: next }).catch(() => {});
    }, []);
    return { depth, width, updateDepth, updateWidth };
}
