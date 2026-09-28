import { useCallback, useEffect, useRef, type PointerEvent, type RefObject } from 'react';

const CLOSE_DELAY = 200;

export function useSidebarHover({ enabled, isOpen, paused, hasMenu, shellRef, onOpenChange }: {
    enabled: boolean;
    isOpen: boolean;
    paused: boolean;
    hasMenu: boolean;
    shellRef: RefObject<HTMLDivElement | null>;
    onOpenChange: (open: boolean) => void;
}) {
    const configRef = useRef({ enabled, isOpen, paused, onOpenChange });
    configRef.current = { enabled, isOpen, paused, onOpenChange };
    const insideRef = useRef(false);
    const pointRef = useRef<{ x: number; y: number } | null>(null);
    const timerRef = useRef<number | null>(null);
    const previousRef = useRef({ enabled, paused, hasMenu });

    const clearClose = useCallback(() => {
        if (timerRef.current !== null) window.clearTimeout(timerRef.current);
        timerRef.current = null;
    }, []);

    const scheduleClose = useCallback(() => {
        const config = configRef.current;
        if (!config.enabled || !config.isOpen || config.paused || insideRef.current || timerRef.current !== null) return;
        timerRef.current = window.setTimeout(() => {
            timerRef.current = null;
            const current = configRef.current;
            if (current.enabled && current.isOpen && !current.paused && !insideRef.current) current.onOpenChange(false);
        }, CLOSE_DELAY);
    }, []);

    const checkPointer = useCallback(() => {
        const point = pointRef.current;
        insideRef.current = Boolean(point && Array.from(shellRef.current?.querySelectorAll<HTMLElement>('[data-hover-region]') ?? []).some(element => {
            const rect = element.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
        }));
        if (insideRef.current) clearClose();
        else scheduleClose();
    }, [shellRef, clearClose, scheduleClose]);

    useEffect(() => {
        const move = (event: globalThis.PointerEvent) => {
            if (event.pointerType !== 'mouse') return;
            pointRef.current = { x: event.clientX, y: event.clientY };
            const current = configRef.current;
            if (current.enabled && current.isOpen && !current.paused) checkPointer();
        };
        const leaveWindow = (event: globalThis.PointerEvent) => {
            if (event.pointerType !== 'mouse' || event.relatedTarget !== null) return;
            pointRef.current = null;
            insideRef.current = false;
            scheduleClose();
        };
        window.addEventListener('pointermove', move, true);
        window.addEventListener('pointerout', leaveWindow, true);
        return () => {
            window.removeEventListener('pointermove', move, true);
            window.removeEventListener('pointerout', leaveWindow, true);
            clearClose();
        };
    }, [checkPointer, clearClose, scheduleClose]);

    useEffect(() => {
        const previous = previousRef.current;
        previousRef.current = { enabled, paused, hasMenu };
        if (!enabled || !isOpen || paused) clearClose();
        else if (previous.paused || previous.enabled !== enabled || previous.hasMenu !== hasMenu) checkPointer();
    }, [enabled, isOpen, paused, hasMenu, checkPointer, clearClose]);

    const onPointerEnter = (event: PointerEvent<HTMLElement>) => {
        if (event.pointerType !== 'mouse') return;
        pointRef.current = { x: event.clientX, y: event.clientY };
        insideRef.current = true;
        clearClose();
    };
    const onPointerLeave = (event: PointerEvent<HTMLElement>) => {
        if (event.pointerType !== 'mouse') return;
        pointRef.current = { x: event.clientX, y: event.clientY };
        insideRef.current = false;
        scheduleClose();
    };
    const onToggleEnter = (event: PointerEvent<HTMLButtonElement>) => {
        onPointerEnter(event);
        if (event.pointerType === 'mouse' && enabled && !paused) onOpenChange(true);
    };

    return { onPointerEnter, onPointerLeave, onToggleEnter };
}
