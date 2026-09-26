import type { Block } from './conversationBlocks';
import type { ExportBlock } from '../types/messages';

// Turn.text is the provider's full Markdown snapshot, independent of live DOM,
// virtualization, search and the outline's depth filter.
export function toExportBlocks(blocks: readonly Block[]): ExportBlock[] {
    return blocks.map(block => ({
        prompt: block.prompt?.text.trim(),
        answer: block.answer?.text.trim(),
        headings: block.headings.map(heading => heading.innerText),
        kind: block.kind,
        title: block.title,
    }));
}

export function toJsonTurns(blocks: readonly ExportBlock[]) {
    return blocks.map(block => ({
        prompt: block.prompt ?? null,
        response: block.answer || '',
        headings: block.headings || [],
        kind: block.kind,
        title: block.title,
    }));
}
