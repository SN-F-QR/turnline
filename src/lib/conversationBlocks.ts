import type { Turn } from '../types/index.ts';
import { getHeadingDepths } from './outlineDepth.ts';

export type Block<T extends Pick<Turn, 'id' | 'role' | 'text' | 'headings' | 'contextLabel' | 'timeLabel'> = Turn> = {
    key: string;
    kind: 'exchange' | 'assistant' | 'prompt';
    title: string;
    prompt?: T;
    answer?: T;
    headings: T['headings'];
    headingDepths: number[];
};

const label = <T extends Pick<Turn, 'text' | 'headings' | 'contextLabel' | 'timeLabel'>>(turn: T) => {
    const context = turn.contextLabel?.trim();
    const time = turn.timeLabel?.trim();
    const heading = turn.headings.find(item => !item.isPlaceholder && item.innerText.trim())?.innerText.trim();
    const summary = turn.text.trim().replace(/\s+/g, ' ').slice(0, 120);
    const main = context || heading || summary;
    return [time, main].filter(Boolean).join(' · ') || 'Assistant update';
};

export function buildConversationBlocks<T extends Pick<Turn, 'id' | 'role' | 'text' | 'headings' | 'contextLabel' | 'timeLabel'>>(turns: readonly T[]): Block<T>[] {
    const blocks: Block<T>[] = [];
    for (let i = 0; i < turns.length; i++) {
        const turn = turns[i];
        if (turn.role === 'user') {
            const next = turns[i + 1];
            const answer = next?.role === 'assistant' && !next.contextLabel ? next : undefined;
            blocks.push({
                key: `block-${turn.id}`,
                kind: answer ? 'exchange' : 'prompt',
                title: turn.text.trim() || 'Prompt',
                prompt: turn,
                answer,
                headings: answer?.headings || [],
                headingDepths: getHeadingDepths(answer?.headings || []),
            });
            if (answer) i++;
        } else {
            blocks.push({
                key: `block-${turn.id}`,
                kind: 'assistant',
                title: label(turn),
                answer: turn,
                headings: turn.headings,
                headingDepths: getHeadingDepths(turn.headings),
            });
        }
    }
    return blocks;
}
