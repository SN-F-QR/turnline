import type { Heading } from '../types/index.ts';
import { getHeadingLevel } from './outlineSettings.ts';

// Compute actual nesting within one response, without occupying skipped HTML
// levels or changing the provider's original headings.
export function getHeadingDepths(headings: readonly Pick<Heading, 'tagName' | 'outlineLevel'>[]): number[] {
    const ancestors: number[] = [];
    return headings.map(heading => {
        const level = getHeadingLevel(heading);
        while (ancestors.length && ancestors[ancestors.length - 1] >= level) ancestors.pop();
        ancestors.push(level);
        return ancestors.length;
    });
}
