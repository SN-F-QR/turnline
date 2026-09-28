import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';
import { normalizeWidth, SIDEBAR_DEFAULT_WIDTH, SIDEBAR_MIN_WIDTH } from '../lib/outlineSettings';

type OpenDirection = { x: 'left' | 'right'; y: 'up' | 'down' };
type ResizePreview = { width: number; direction: OpenDirection };
type ResizeSession = ResizePreview & {
    pointerId: number;
    startX: number;
    startWidth: number;
    handle: HTMLElement;
    bodyStyles: { cursor: string; userSelect: string };
};

export function useSidebarResize({ isOpen, enabled, width, direction, updateWidth }: {
    isOpen: boolean;
    enabled: boolean;
    width: number;
    direction: OpenDirection;
    updateWidth: (width: number) => void;
}) {
    const [preview, setPreview] = useState<ResizePreview | null>(null);
    const sessionRef = useRef<ResizeSession | null>(null);
    const updateWidthRef = useRef(updateWidth);
    updateWidthRef.current = updateWidth;
    const isResizing = preview !== null;

    const finishResize = useCallback((save: boolean) => {
        const session = sessionRef.current;
        if (!session) return;
        sessionRef.current = null;
        try { session.handle.releasePointerCapture(session.pointerId); } catch {}
        document.body.style.cursor = session.bodyStyles.cursor;
        document.body.style.userSelect = session.bodyStyles.userSelect;
        setPreview(null);
        if (save) updateWidthRef.current(session.width);
    }, []);

    useEffect(() => {
        if (!isOpen || !enabled) finishResize(false);
    }, [isOpen, enabled, finishResize]);

    useEffect(() => {
        if (!isResizing) return;
        const move = (event: globalThis.PointerEvent) => {
            const session = sessionRef.current;
            if (!session || event.pointerId !== session.pointerId) return;
            event.preventDefault();
            const delta = (event.clientX - session.startX) * (session.direction.x === 'left' ? -1 : 1);
            session.width = normalizeWidth(Math.max(SIDEBAR_MIN_WIDTH, session.startWidth + delta));
            setPreview({ width: session.width, direction: session.direction });
        };
        const end = (event: globalThis.PointerEvent) => {
            if (event.pointerId === sessionRef.current?.pointerId) finishResize(event.type === 'pointerup');
        };
        window.addEventListener('pointermove', move, true);
        window.addEventListener('pointerup', end, true);
        window.addEventListener('pointercancel', end, true);
        return () => {
            window.removeEventListener('pointermove', move, true);
            window.removeEventListener('pointerup', end, true);
            window.removeEventListener('pointercancel', end, true);
            finishResize(false);
        };
    }, [isResizing, finishResize]);

    const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
        if (!enabled || event.button !== 0 || sessionRef.current) return;
        event.preventDefault();
        event.stopPropagation();
        const handle = event.currentTarget;
        sessionRef.current = {
            width,
            direction,
            pointerId: event.pointerId,
            startX: event.clientX,
            startWidth: handle.parentElement!.getBoundingClientRect().width,
            handle,
            bodyStyles: { cursor: document.body.style.cursor, userSelect: document.body.style.userSelect },
        };
        handle.setPointerCapture(event.pointerId);
        handle.focus();
        document.body.style.cursor = 'ew-resize';
        document.body.style.userSelect = 'none';
        setPreview({ width, direction });
    };

    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (!enabled || isResizing || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
        event.preventDefault();
        event.stopPropagation();
        const delta = (event.key === 'ArrowRight' ? 10 : -10) * (direction.x === 'left' ? -1 : 1);
        updateWidth(normalizeWidth(width + delta));
    };

    const onDoubleClick = (event: MouseEvent<HTMLDivElement>) => {
        if (!enabled) return;
        event.preventDefault();
        event.stopPropagation();
        finishResize(false);
        updateWidth(SIDEBAR_DEFAULT_WIDTH);
    };

    return { preview, isResizing, onPointerDown, onKeyDown, onDoubleClick };
}
