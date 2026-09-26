export type CapturedTurn = {
    id: string;
    role: 'user' | 'assistant';
    text: string;
    headings?: string[];
    contextLabel?: string;
    timeLabel?: string;
};

export type ExportBlock = {
    prompt?: string;
    answer?: string;
    headings?: string[];
    kind: 'exchange' | 'assistant' | 'prompt';
    title: string;
};
