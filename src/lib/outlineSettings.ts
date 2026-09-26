import type { Heading } from '../types/index.ts';

export const HEADING_DEPTH_KEY = 'scroll-pro-heading-depth';
export const SIDEBAR_WIDTH_KEY = 'scroll-pro-sidebar-width';
export const validDepth = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 6;
export const normalizeDepth = (value: unknown) => validDepth(value) ? value : 4;
export const normalizeWidth = (value: unknown) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 320 || value > 640) return 420;
    return [320, 420, 640].reduce((nearest, preset) => Math.abs(preset - value) < Math.abs(nearest - value) ? preset : nearest);
};
export const getHeadingLevel = (heading: Pick<Heading, 'outlineLevel' | 'tagName'>) => {
    if (validDepth(heading.outlineLevel)) return heading.outlineLevel;
    const match = /^H([1-6])$/i.exec(heading.tagName);
    return match ? Number(match[1]) : 6;
};

export const getOutlineWidth = (preferred: number, viewport: number, x: number, direction: 'left' | 'right') =>
    Math.max(0, Math.min(normalizeWidth(preferred), direction === 'left' ? x + 42 - 18 : viewport - x - 18));
