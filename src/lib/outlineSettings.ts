import type { Heading } from '../types/index.ts';

export const HEADING_DEPTH_KEY = 'scroll-pro-heading-depth';
export const SIDEBAR_WIDTH_KEY = 'scroll-pro-sidebar-width';
export const THEME_MODE_KEY = 'scroll-pro-theme-mode';
export const ACCENT_PRESET_KEY = 'scroll-pro-accent-preset';
export const OUTLINE_FONT_SIZE_KEY = 'scroll-pro-outline-font-size';
export const CUSTOM_ACCENT_KEY = 'scroll-pro-custom-accent';
export const CUSTOM_BACKGROUND_KEY = 'scroll-pro-custom-background';

export type ThemeMode = 'system' | 'light' | 'dark';
export type AccentPreset = 'blue' | 'green' | 'yellow' | 'pink' | 'orange' | 'purple';

const THEME_MODES: ThemeMode[] = ['system', 'light', 'dark'];
const ACCENT_PRESETS: AccentPreset[] = ['blue', 'green', 'yellow', 'pink', 'orange', 'purple'];
const LEGACY_ACCENT_PRESETS: Record<string, AccentPreset> = { amber: 'yellow', violet: 'purple', rose: 'pink', teal: 'green' };
const LEGACY_FONT_SIZES: Record<string, number> = { small: 12, default: 13, large: 14, 'extra-large': 16 };

export const validDepth = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 6;
export const normalizeDepth = (value: unknown) => validDepth(value) ? value : 4;
export const normalizeWidth = (value: unknown) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 320 || value > 640) return 420;
    return [320, 420, 640].reduce((nearest, preset) => Math.abs(preset - value) < Math.abs(nearest - value) ? preset : nearest);
};
export const normalizeThemeMode = (value: unknown): ThemeMode => THEME_MODES.includes(value as ThemeMode) ? value as ThemeMode : 'system';
export const normalizeAccentPreset = (value: unknown): AccentPreset => {
    if (ACCENT_PRESETS.includes(value as AccentPreset)) return value as AccentPreset;
    return typeof value === 'string' ? LEGACY_ACCENT_PRESETS[value] ?? 'blue' : 'blue';
};
export const parseOutlineFontSize = (value: unknown): number | null => {
    const parsed = typeof value === 'number'
        ? value
        : typeof value === 'string' && /^\d{1,2}(?:px)?$/i.test(value.trim())
            ? Number.parseInt(value, 10)
            : NaN;
    return Number.isInteger(parsed) && parsed >= 10 && parsed <= 24 ? parsed : null;
};
export const normalizeOutlineFontSize = (value: unknown): number => {
    if (typeof value === 'string' && value in LEGACY_FONT_SIZES) return LEGACY_FONT_SIZES[value];
    return parseOutlineFontSize(value) ?? 13;
};
export const normalizeHexColor = (value: unknown): string | null => {
    if (typeof value !== 'string') return null;
    const match = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(value.trim());
    if (!match) return null;
    const hex = match[1].length === 3
        ? match[1].split('').map(character => character.repeat(2)).join('')
        : match[1];
    return `#${hex.toUpperCase()}`;
};

export const getHexColorTone = (value: string): 'light' | 'dark' => {
    const normalized = normalizeHexColor(value) ?? '#000000';
    const channels = [1, 3, 5].map(index => parseInt(normalized.slice(index, index + 2), 16) / 255);
    const [red, green, blue] = channels.map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
    const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    return luminance > 0.179 ? 'light' : 'dark';
};

export const getOutlineFontSizes = (size: number) => {
    const title = normalizeOutlineFontSize(size);
    return { title, secondary: title - 1 };
};

export const getHeadingLevel = (heading: Pick<Heading, 'outlineLevel' | 'tagName'>) => {
    if (validDepth(heading.outlineLevel)) return heading.outlineLevel;
    const match = /^H([1-6])$/i.exec(heading.tagName);
    return match ? Number(match[1]) : 6;
};

export const getOutlineWidth = (preferred: number, viewport: number, x: number, direction: 'left' | 'right') =>
    Math.max(0, Math.min(normalizeWidth(preferred), direction === 'left' ? x + 42 - 18 : viewport - x - 18));
