import { useCallback, useEffect, useState } from 'react';
import {
    ACCENT_PRESET_KEY,
    CUSTOM_ACCENT_KEY,
    CUSTOM_BACKGROUND_KEY,
    HEADING_DEPTH_KEY,
    HOVER_MODE_KEY,
    OUTLINE_FONT_SIZE_KEY,
    SIDEBAR_DEFAULT_WIDTH,
    SIDEBAR_WIDTH_KEY,
    THEME_MODE_KEY,
    normalizeAccentPreset,
    normalizeDepth,
    normalizeHexColor,
    normalizeHoverMode,
    normalizeOutlineFontSize,
    normalizeThemeMode,
    normalizeWidth,
    type AccentPreset,
    type ThemeMode,
} from '../lib/outlineSettings';

export type OutlineSettingsController = {
    depth: number;
    width: number;
    hoverMode: boolean;
    themeMode: ThemeMode;
    accentPreset: AccentPreset;
    customAccent: string | null;
    customBackground: string | null;
    fontSize: number;
    updateDepth: (value: number) => void;
    updateWidth: (value: number) => void;
    updateHoverMode: (value: boolean) => void;
    updateThemeMode: (value: ThemeMode) => void;
    updateAccentPreset: (value: AccentPreset) => void;
    updateCustomAccent: (value: string | null) => void;
    updateCustomBackground: (value: string | null) => void;
    updateFontSize: (value: number) => void;
};

// Adapted-from: https://github.com/dezhonger/scroll/commit/c8a9b6d997fc0a9d1aef58f329835e1833a2f739
// Keep outline preferences here; no Latest or Section Copy dependencies.
export function useOutlineSettings() {
    const [depth, setDepth] = useState(4);
    const [width, setWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
    const [hoverMode, setHoverMode] = useState(false);
    const [themeMode, setThemeMode] = useState<ThemeMode>('system');
    const [accentPreset, setAccentPreset] = useState<AccentPreset>('blue');
    const [customAccent, setCustomAccent] = useState<string | null>(null);
    const [customBackground, setCustomBackground] = useState<string | null>(null);
    const [fontSize, setFontSize] = useState(13);
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
            if (HOVER_MODE_KEY in changes) {
                changedKeys.add(HOVER_MODE_KEY);
                setHoverMode(normalizeHoverMode(changes[HOVER_MODE_KEY].newValue));
            }
            if (THEME_MODE_KEY in changes) {
                changedKeys.add(THEME_MODE_KEY);
                setThemeMode(normalizeThemeMode(changes[THEME_MODE_KEY].newValue));
            }
            if (ACCENT_PRESET_KEY in changes) {
                changedKeys.add(ACCENT_PRESET_KEY);
                setAccentPreset(normalizeAccentPreset(changes[ACCENT_PRESET_KEY].newValue));
            }
            if (CUSTOM_ACCENT_KEY in changes) {
                changedKeys.add(CUSTOM_ACCENT_KEY);
                setCustomAccent(normalizeHexColor(changes[CUSTOM_ACCENT_KEY].newValue));
            }
            if (CUSTOM_BACKGROUND_KEY in changes) {
                changedKeys.add(CUSTOM_BACKGROUND_KEY);
                setCustomBackground(normalizeHexColor(changes[CUSTOM_BACKGROUND_KEY].newValue));
            }
            if (OUTLINE_FONT_SIZE_KEY in changes) {
                changedKeys.add(OUTLINE_FONT_SIZE_KEY);
                setFontSize(normalizeOutlineFontSize(changes[OUTLINE_FONT_SIZE_KEY].newValue));
            }
        };
        chrome.storage.onChanged.addListener(onChanged);
        void chrome.storage.local.get([HEADING_DEPTH_KEY, SIDEBAR_WIDTH_KEY, HOVER_MODE_KEY, THEME_MODE_KEY, ACCENT_PRESET_KEY, OUTLINE_FONT_SIZE_KEY, CUSTOM_ACCENT_KEY, CUSTOM_BACKGROUND_KEY]).then(values => {
            if (disposed) return;
            if (!changedKeys.has(HEADING_DEPTH_KEY)) setDepth(normalizeDepth(values[HEADING_DEPTH_KEY]));
            if (!changedKeys.has(SIDEBAR_WIDTH_KEY)) setWidth(normalizeWidth(values[SIDEBAR_WIDTH_KEY]));
            if (!changedKeys.has(HOVER_MODE_KEY)) setHoverMode(normalizeHoverMode(values[HOVER_MODE_KEY]));
            if (!changedKeys.has(THEME_MODE_KEY)) setThemeMode(normalizeThemeMode(values[THEME_MODE_KEY]));
            if (!changedKeys.has(ACCENT_PRESET_KEY)) setAccentPreset(normalizeAccentPreset(values[ACCENT_PRESET_KEY]));
            if (!changedKeys.has(CUSTOM_ACCENT_KEY)) setCustomAccent(normalizeHexColor(values[CUSTOM_ACCENT_KEY]));
            if (!changedKeys.has(CUSTOM_BACKGROUND_KEY)) setCustomBackground(normalizeHexColor(values[CUSTOM_BACKGROUND_KEY]));
            if (!changedKeys.has(OUTLINE_FONT_SIZE_KEY)) setFontSize(normalizeOutlineFontSize(values[OUTLINE_FONT_SIZE_KEY]));
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
    const updateHoverMode = useCallback((value: boolean) => {
        const next = normalizeHoverMode(value);
        setHoverMode(next);
        void chrome.storage.local.set({ [HOVER_MODE_KEY]: next }).catch(() => {});
    }, []);
    const updateThemeMode = useCallback((value: ThemeMode) => {
        const next = normalizeThemeMode(value);
        setThemeMode(next);
        void chrome.storage.local.set({ [THEME_MODE_KEY]: next }).catch(() => {});
    }, []);
    const updateAccentPreset = useCallback((value: AccentPreset) => {
        const next = normalizeAccentPreset(value);
        setAccentPreset(next);
        setCustomAccent(null);
        void chrome.storage.local.set({ [ACCENT_PRESET_KEY]: next, [CUSTOM_ACCENT_KEY]: null }).catch(() => {});
    }, []);
    const updateCustomAccent = useCallback((value: string | null) => {
        const next = normalizeHexColor(value);
        setCustomAccent(next);
        void chrome.storage.local.set({ [CUSTOM_ACCENT_KEY]: next }).catch(() => {});
    }, []);
    const updateCustomBackground = useCallback((value: string | null) => {
        const next = normalizeHexColor(value);
        setCustomBackground(next);
        void chrome.storage.local.set({ [CUSTOM_BACKGROUND_KEY]: next }).catch(() => {});
    }, []);
    const updateFontSize = useCallback((value: number) => {
        const next = normalizeOutlineFontSize(value);
        setFontSize(next);
        void chrome.storage.local.set({ [OUTLINE_FONT_SIZE_KEY]: next }).catch(() => {});
    }, []);
    return { depth, width, hoverMode, themeMode, accentPreset, customAccent, customBackground, fontSize, updateDepth, updateWidth, updateHoverMode, updateThemeMode, updateAccentPreset, updateCustomAccent, updateCustomBackground, updateFontSize };
}
