import type { Turn } from '../types/index.ts';
import type { Block } from './conversationBlocks.ts';
import { getHeadingLevel } from './outlineSettings.ts';

type OutlineTurn = Pick<Turn, 'id' | 'role' | 'text' | 'headings' | 'contextLabel' | 'timeLabel'>;

export type FilteredBlock<T extends OutlineTurn = Turn> = {
    block: Block<T>;
    headingIndices: number[];
};

export function filterOutlineBlocks<T extends OutlineTurn>(blocks: readonly Block<T>[], search: string, depth: number): FilteredBlock<T>[] {
    const term = search.toLowerCase().trim();
    const results: FilteredBlock<T>[] = [];
    for (const block of blocks) {
        const promptMatches = !term || !!block.prompt?.text.toLowerCase().includes(term);
        const headingIndices: number[] = [];
        block.headings.forEach((heading, index) => {
            if (getHeadingLevel(heading) <= depth && (promptMatches || heading.innerText.toLowerCase().includes(term))) {
                headingIndices.push(index);
            }
        });
        if (promptMatches || headingIndices.length > 0) results.push({ block, headingIndices });
    }
    return results;
}
