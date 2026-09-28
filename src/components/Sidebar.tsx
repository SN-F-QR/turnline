import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Turn } from '../types';
import type { ExportBlock } from '../types/messages';
import { findScrollable } from '../lib/scroll';
import { describeHistory, getHistoryCoverage, type HistoryResult } from '../lib/chatHistory';
import { toExportBlocks, toJsonTurns } from '../lib/conversationExport';
import { chatgpt } from '../providers/chatgpt';
import { claude } from '../providers/claude';
import { gemini } from '../providers/gemini';
import { showToast as emitToast, type ToastType } from '../services/toast';
import { renderMarkdownToHtml, stripMarkdown } from '../lib/markdownUtil';
import { downloadFile } from '../lib/download';
import { generateExportFilename, getChatTitle } from '../lib/exportFilenames';
import { getPdfStyles, getPdfFooter, formatPdfDate } from '../lib/pdfStyles';
import { printHtmlAsPdf } from '../lib/pdfPrint';
import { buildConversationBlocks, type Block } from '../lib/conversationBlocks';
import { filterOutlineBlocks } from '../lib/outlineFilter';
import { getHeadingLevel, getOutlineWidth, SIDEBAR_DEFAULT_WIDTH, SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH } from '../lib/outlineSettings';
import type { OutlineSettingsController } from '../hooks/useOutlineSettings';
import { useSidebarResize } from '../hooks/useSidebarResize';
import { useSidebarHover } from '../hooks/useSidebarHover';
import SettingsPanel from './SettingsPanel';
import DOMPurify from 'dompurify';
const CONTEXT_HINT_KEY = 'scroll-pro-context-hint-seen';
const LINE_CLAMP_KEY = 'scroll-pro-line-clamp';
const COPY_MARKDOWN_KEY = 'scroll-pro-copy-markdown';
const CHATGPT_CAPTURE_CONSENT_KEY = 'scroll-pro-chatgpt-capture-consent';
const SIDEBAR_POSITION_KEY_PREFIX = 'scroll-pro-sidebar-position';
const SIDEBAR_TOGGLE_SIZE = 42;
const SIDEBAR_MARGIN = 18;
const SIDEBAR_DEFAULT_TOP = 72;
const SIDEBAR_GAP = 10;
const SIDEBAR_LONG_PRESS_MS = 450;

type SidebarAnchorX = 'left' | 'right';

type SidebarPosition = {
    x: number;
    y: number;
    anchorX: SidebarAnchorX;
    offsetX: number;
};

type SidebarOpenDirection = {
    x: 'left' | 'right';
    y: 'up' | 'down';
};

const clampNumber = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const getSidebarBounds = () => {
    const minX = SIDEBAR_MARGIN;
    const minY = SIDEBAR_MARGIN;
    if (typeof window === 'undefined') {
        return { minX, minY, maxX: minX, maxY: SIDEBAR_DEFAULT_TOP };
    }

    return {
        minX,
        minY,
        maxX: Math.max(minX, window.innerWidth - SIDEBAR_MARGIN - SIDEBAR_TOGGLE_SIZE),
        maxY: Math.max(minY, window.innerHeight - SIDEBAR_MARGIN - SIDEBAR_TOGGLE_SIZE),
    };
};

const getSidebarAnchorX = (x: number): SidebarAnchorX => {
    if (typeof window === 'undefined') return 'right';
    const leftDistance = x - SIDEBAR_MARGIN;
    const rightDistance = window.innerWidth - SIDEBAR_MARGIN - (x + SIDEBAR_TOGGLE_SIZE);
    return rightDistance < leftDistance ? 'right' : 'left';
};

const resolveSidebarPosition = (anchorX: SidebarAnchorX, offsetX: number, y: number): SidebarPosition => {
    const fallback = {
        x: SIDEBAR_MARGIN,
        y: SIDEBAR_DEFAULT_TOP,
        anchorX,
        offsetX,
    };

    if (typeof window === 'undefined') return fallback;
    const bounds = getSidebarBounds();
    const rawX = anchorX === 'left'
        ? offsetX
        : window.innerWidth - SIDEBAR_TOGGLE_SIZE - offsetX;
    const clampedX = clampNumber(rawX, bounds.minX, bounds.maxX);
    const clampedY = clampNumber(y, bounds.minY, bounds.maxY);
    return {
        x: clampedX,
        y: clampedY,
        anchorX,
        offsetX,
    };
};

const createSidebarPositionFromPoint = (pos: { x: number; y: number }, anchorX?: SidebarAnchorX): SidebarPosition => {
    if (typeof window === 'undefined') {
        return {
            x: SIDEBAR_MARGIN,
            y: SIDEBAR_DEFAULT_TOP,
            anchorX: anchorX ?? 'right',
            offsetX: SIDEBAR_MARGIN,
        };
    }

    const bounds = getSidebarBounds();
    const clampedX = clampNumber(pos.x, bounds.minX, bounds.maxX);
    const clampedY = clampNumber(pos.y, bounds.minY, bounds.maxY);
    const resolvedAnchor = anchorX ?? getSidebarAnchorX(clampedX);
    const rawOffsetX = resolvedAnchor === 'left'
        ? clampedX
        : window.innerWidth - SIDEBAR_TOGGLE_SIZE - clampedX;
    return {
        x: clampedX,
        y: clampedY,
        anchorX: resolvedAnchor,
        offsetX: rawOffsetX,
    };
};

const getDefaultSidebarPosition = (): SidebarPosition => (
    resolveSidebarPosition('right', SIDEBAR_MARGIN, SIDEBAR_DEFAULT_TOP)
);

const getSidebarStorageKey = (providerName: string) => `${SIDEBAR_POSITION_KEY_PREFIX}:${providerName || 'unknown'}`;

const loadSidebarPosition = (storageKey: string): SidebarPosition => {
    const fallback = getDefaultSidebarPosition();
    if (typeof window === 'undefined') return fallback;

    try {
        const raw = localStorage.getItem(storageKey);
        if (!raw) return fallback;
        const parsed = JSON.parse(raw);
        if (parsed?.anchorX === 'left' || parsed?.anchorX === 'right') {
            if (typeof parsed?.offsetX === 'number' && typeof parsed?.y === 'number') {
                return resolveSidebarPosition(parsed.anchorX, parsed.offsetX, parsed.y);
            }
        }
        if (typeof parsed?.x === 'number' && typeof parsed?.y === 'number') {
            return createSidebarPositionFromPoint({ x: parsed.x, y: parsed.y });
        }
        return fallback;
    } catch {
        return fallback;
    }
};

const getEstimatedSidebarSize = (preferredWidth = SIDEBAR_DEFAULT_WIDTH) => {
    if (typeof window === 'undefined') {
        return { width: preferredWidth, height: 480 };
    }

    const width = Math.min(preferredWidth, window.innerWidth - SIDEBAR_MARGIN * 2);
    const maxHeight = Math.max(140, window.innerHeight - SIDEBAR_MARGIN * 2);
    const height = Math.min(window.innerHeight * 0.72, maxHeight);
    return { width, height };
};

const getSidebarOpenDirection = (pos: SidebarPosition, preferredWidth = SIDEBAR_DEFAULT_WIDTH): SidebarOpenDirection => {
    if (typeof window === 'undefined') {
        return { x: 'right', y: 'down' };
    }

    const { width, height } = getEstimatedSidebarSize(preferredWidth);
    const spaceLeft = pos.x + SIDEBAR_TOGGLE_SIZE - SIDEBAR_MARGIN;
    const spaceRight = window.innerWidth - SIDEBAR_MARGIN - pos.x;
    const spaceUp = pos.y - SIDEBAR_MARGIN;
    const spaceDown = window.innerHeight - SIDEBAR_MARGIN - (pos.y + SIDEBAR_TOGGLE_SIZE);

    const fitsRight = spaceRight >= width;
    const fitsLeft = spaceLeft >= width;
    const openX = fitsRight === fitsLeft
        ? (spaceRight >= spaceLeft ? 'right' : 'left')
        : (fitsRight ? 'right' : 'left');

    const fitsDown = spaceDown >= height + SIDEBAR_GAP;
    const fitsUp = spaceUp >= height + SIDEBAR_GAP;
    const openY = fitsDown === fitsUp
        ? (spaceDown >= spaceUp ? 'down' : 'up')
        : (fitsDown ? 'down' : 'up');

    return { x: openX, y: openY };
};

const getLineClamp = () => {
    try {
        const raw = localStorage.getItem(LINE_CLAMP_KEY);
        const parsed = raw ? parseInt(raw, 10) : 2;
        if (Number.isNaN(parsed)) return 2;
        return Math.min(Math.max(parsed, 1), 8);
    } catch {
        return 2;
    }
};

const copyToClipboard = (text: string) => {
    if (!text) return;
    if (navigator?.clipboard?.writeText) {
        navigator.clipboard.writeText(text).catch(err => {
            console.error('Failed to copy text:', err);
        });
        return;
    }

    try {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'absolute';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
    } catch (err) {
        console.error('Failed to copy text (fallback):', err);
    }
};

type SidebarProps = {
    turns: Turn[];
    history: HistoryResult;
    discoverHistory: () => Promise<HistoryResult>;
    cancelHistory: () => void;
    navigateToTurn: (id: string, headingIndex?: number) => Promise<boolean>;
    providerName: string;
    container: HTMLElement | null;
    isOpen: boolean;
    isPaused: boolean;
    onToggle: () => void;
    onOpenChange: (open: boolean) => void;
    settings: OutlineSettingsController;
};

export default function Sidebar({ turns, history, discoverHistory, cancelHistory, navigateToTurn, providerName, container, isOpen, isPaused, onToggle, onOpenChange, settings }: SidebarProps) {
    const { depth, width } = settings;
    const widthRef = useRef(width);
    widthRef.current = width;
    const [showSettings, setShowSettings] = useState(false);
    const [search, setSearch] = useState('');
    const [collapsedBlocks, setCollapsedBlocks] = useState<Set<string>>(() => new Set());
    const conversationPath = window.location.pathname;
    useEffect(() => { setCollapsedBlocks(new Set()); }, [providerName, conversationPath]);
    const [progress, setProgress] = useState(0);
    const [lineClamp, setLineClamp] = useState<number>(() => getLineClamp());
    const [activeKey, setActiveKey] = useState<string | null>(null);
    const pointerInSidebar = useRef(false);
    const listRef = useRef<HTMLDivElement | null>(null);
    const outlineScrollTopRef = useRef(0);
    const [focusedIndex, setFocusedIndex] = useState<number>(-1);
    const [exportFormat, setExportFormat] = useState<'md' | 'pdf' | 'txt' | 'json'>('md');
    const captureInProgressRef = useRef(false);
    const [showCaptureConsent, setShowCaptureConsent] = useState(false);
    const [hasCaptureConsent, setHasCaptureConsent] = useState<boolean>(() => {
        try {
            return localStorage.getItem(CHATGPT_CAPTURE_CONSENT_KEY) === 'true';
        } catch {
            return false;
        }
    });
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; block: Block } | null>(null);
    const contextMenuRef = useRef<HTMLDivElement | null>(null);
    const [exportFormatMenu, setExportFormatMenu] = useState<{ x: number; y: number } | null>(null);
    const exportFormatMenuRef = useRef<HTMLDivElement | null>(null);
    const [copyFormatMenu, setCopyFormatMenu] = useState<{ x: number; y: number } | null>(null);
    const copyFormatMenuRef = useRef<HTMLDivElement | null>(null);
    const [copyWithMarkdown, setCopyWithMarkdown] = useState<boolean>(false);
    const contextHintShown = useRef(false);
    const storageKey = getSidebarStorageKey(providerName);
    const [sidebarPosition, setSidebarPosition] = useState<SidebarPosition>(() => loadSidebarPosition(storageKey));
    const [isDragging, setIsDragging] = useState(false);
    const [isTogglePressed, setIsTogglePressed] = useState(false);
    const itemRefs = useRef<Map<string, HTMLElement>>(new Map());
    const sidebarShellRef = useRef<HTMLDivElement | null>(null);
    const toggleButtonRef = useRef<HTMLButtonElement | null>(null);
    const settingsButtonRef = useRef<HTMLButtonElement | null>(null);
    const sidebarPositionRef = useRef<SidebarPosition>(sidebarPosition);
    const dragPositionRef = useRef<SidebarPosition | null>(null);
    const dragOpenDirectionRef = useRef<SidebarOpenDirection | null>(null);
    const dragStateRef = useRef({
        pointerId: null as number | null,
        offsetX: 0,
        offsetY: 0,
        lastX: 0,
        lastY: 0,
        isDragging: false,
    });
    const longPressTimerRef = useRef<number | null>(null);
    const suppressClickRef = useRef(false);
    const dragBodyStyleRef = useRef<{ userSelect: string; cursor: string } | null>(null);
    const ignoreNextPositionWriteRef = useRef(false);
    const resize = useSidebarResize({
        isOpen,
        enabled: !isDragging && !isTogglePressed,
        width,
        direction: getSidebarOpenDirection(sidebarPosition, width),
        updateWidth: settings.updateWidth,
    });
    const hover = useSidebarHover({
        enabled: settings.hoverMode,
        isOpen,
        paused: isTogglePressed || isDragging || resize.isResizing || showCaptureConsent,
        hasMenu: Boolean(contextMenu || exportFormatMenu || copyFormatMenu),
        shellRef: sidebarShellRef,
        onOpenChange,
    });

    const turnsRef = useRef(turns);
    useEffect(() => { turnsRef.current = turns; }, [turns]);

    const providerLabel = useMemo(() => {
        if (providerName === 'chatgpt') return 'ChatGPT';
        if (providerName === 'claude') return 'Claude';
        if (providerName === 'gemini') return 'Gemini';
        return 'your assistant';
    }, [providerName]);

    const applySidebarPosition = useCallback((pos: { x: number; y: number }) => {
        const resolved = createSidebarPositionFromPoint(pos);
        dragPositionRef.current = resolved;
        const direction = getSidebarOpenDirection(resolved, widthRef.current);
        dragOpenDirectionRef.current = direction;

        const shell = sidebarShellRef.current;
        if (shell) {
            shell.style.setProperty('--sidebar-x', `${resolved.x}px`);
            shell.style.setProperty('--sidebar-y', `${resolved.y}px`);
            shell.dataset.openX = direction.x;
            shell.dataset.openY = direction.y;
            shell.style.setProperty('--sidebar-width', `${getOutlineWidth(widthRef.current, window.innerWidth, resolved.x, direction.x)}px`);
        }
    }, []);

    const setDragStyles = useCallback((active: boolean) => {
        if (typeof document === 'undefined') return;
        if (active) {
            if (!dragBodyStyleRef.current) {
                dragBodyStyleRef.current = {
                    userSelect: document.body.style.userSelect,
                    cursor: document.body.style.cursor,
                };
            }
            document.body.style.userSelect = 'none';
            document.body.style.cursor = 'grabbing';
            return;
        }

        if (dragBodyStyleRef.current) {
            document.body.style.userSelect = dragBodyStyleRef.current.userSelect;
            document.body.style.cursor = dragBodyStyleRef.current.cursor;
            dragBodyStyleRef.current = null;
        }
    }, []);

    const beginDrag = useCallback(() => {
        dragStateRef.current.isDragging = true;
        suppressClickRef.current = true;
        setIsDragging(true);
        setDragStyles(true);

        const nextPos = {
            x: dragStateRef.current.lastX - dragStateRef.current.offsetX,
            y: dragStateRef.current.lastY - dragStateRef.current.offsetY,
        };
        applySidebarPosition(nextPos);
    }, [applySidebarPosition, setDragStyles]);

    const handleTogglePointerMove = useCallback((event: PointerEvent) => {
        if (dragStateRef.current.pointerId !== event.pointerId) return;
        dragStateRef.current.lastX = event.clientX;
        dragStateRef.current.lastY = event.clientY;

        if (!dragStateRef.current.isDragging) return;
        event.preventDefault();

        const nextPos = {
            x: event.clientX - dragStateRef.current.offsetX,
            y: event.clientY - dragStateRef.current.offsetY,
        };
        applySidebarPosition(nextPos);
    }, [applySidebarPosition]);

    const handleTogglePointerUp = useCallback((event: PointerEvent) => {
        if (dragStateRef.current.pointerId !== event.pointerId) return;

        if (longPressTimerRef.current) {
            window.clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }

        window.removeEventListener('pointermove', handleTogglePointerMove, true);
        window.removeEventListener('pointerup', handleTogglePointerUp, true);
        window.removeEventListener('pointercancel', handleTogglePointerUp, true);

        try {
            toggleButtonRef.current?.releasePointerCapture(event.pointerId);
        } catch {
        }

        const wasDragging = dragStateRef.current.isDragging;
        dragStateRef.current.isDragging = false;
        dragStateRef.current.pointerId = null;
        setIsTogglePressed(false);

        if (wasDragging) {
            setIsDragging(false);
            setDragStyles(false);
            const finalPos = dragPositionRef.current ?? sidebarPositionRef.current;
            dragPositionRef.current = null;
            dragOpenDirectionRef.current = null;
            setSidebarPosition(resolveSidebarPosition(finalPos.anchorX, finalPos.offsetX, finalPos.y));

            suppressClickRef.current = true;
            window.setTimeout(() => {
                suppressClickRef.current = false;
            }, 0);
        } else {
            suppressClickRef.current = false;
        }
    }, [handleTogglePointerMove, setDragStyles]);

    const handleTogglePointerDown = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
        if (event.button !== 0 || resize.isResizing) return;
        event.stopPropagation();
        setIsTogglePressed(true);

        if (longPressTimerRef.current) {
            window.clearTimeout(longPressTimerRef.current);
        }

        const currentPos = dragPositionRef.current ?? sidebarPositionRef.current;
        const resolvedPos = resolveSidebarPosition(currentPos.anchorX, currentPos.offsetX, currentPos.y);
        dragStateRef.current.pointerId = event.pointerId;
        dragStateRef.current.offsetX = event.clientX - resolvedPos.x;
        dragStateRef.current.offsetY = event.clientY - resolvedPos.y;
        dragStateRef.current.lastX = event.clientX;
        dragStateRef.current.lastY = event.clientY;
        dragStateRef.current.isDragging = false;
        suppressClickRef.current = false;

        toggleButtonRef.current?.setPointerCapture(event.pointerId);
        longPressTimerRef.current = window.setTimeout(beginDrag, SIDEBAR_LONG_PRESS_MS);

        window.addEventListener('pointermove', handleTogglePointerMove, true);
        window.addEventListener('pointerup', handleTogglePointerUp, true);
        window.addEventListener('pointercancel', handleTogglePointerUp, true);
    }, [beginDrag, handleTogglePointerMove, handleTogglePointerUp, resize.isResizing]);

    const handleToggleClick = useCallback(() => {
        if (suppressClickRef.current) {
            suppressClickRef.current = false;
            return;
        }
        onToggle();
    }, [onToggle]);

    const openSettings = useCallback(() => {
        outlineScrollTopRef.current = listRef.current?.scrollTop ?? outlineScrollTopRef.current;
        setContextMenu(null);
        setExportFormatMenu(null);
        setCopyFormatMenu(null);
        setShowSettings(true);
    }, []);

    const closeSettings = useCallback(() => {
        setShowSettings(false);
        requestAnimationFrame(() => settingsButtonRef.current?.focus());
    }, []);

    const assignListRef = useCallback((node: HTMLDivElement | null) => {
        listRef.current = node;
        if (!node) return;
        requestAnimationFrame(() => {
            if (listRef.current === node) node.scrollTop = outlineScrollTopRef.current;
        });
    }, []);

    useEffect(() => {
        sidebarPositionRef.current = sidebarPosition;
    }, [sidebarPosition]);

    useEffect(() => {
        if (ignoreNextPositionWriteRef.current) {
            ignoreNextPositionWriteRef.current = false;
            return;
        }
        try {
            localStorage.setItem(storageKey, JSON.stringify(sidebarPosition));
        } catch {
        }
    }, [sidebarPosition, storageKey]);

    useEffect(() => {
        ignoreNextPositionWriteRef.current = true;
        const next = loadSidebarPosition(storageKey);
        setSidebarPosition(next);
        dragPositionRef.current = null;
        dragOpenDirectionRef.current = null;
        dragStateRef.current.isDragging = false;
        setIsTogglePressed(false);
        setIsDragging(false);
        setDragStyles(false);
    }, [storageKey, setDragStyles]);

    useEffect(() => {
        const handleResize = () => {
            const basePos = dragPositionRef.current ?? sidebarPositionRef.current;
            const next = resolveSidebarPosition(basePos.anchorX, basePos.offsetX, basePos.y);
            if (dragStateRef.current.isDragging) {
                applySidebarPosition({ x: next.x, y: next.y });
            }
            setSidebarPosition(next);
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [applySidebarPosition]);

    useEffect(() => {
        return () => {
            if (longPressTimerRef.current) {
                window.clearTimeout(longPressTimerRef.current);
                longPressTimerRef.current = null;
            }
            window.removeEventListener('pointermove', handleTogglePointerMove, true);
            window.removeEventListener('pointerup', handleTogglePointerUp, true);
            window.removeEventListener('pointercancel', handleTogglePointerUp, true);
            const pointerId = dragStateRef.current.pointerId;
            if (pointerId !== null) {
                try { toggleButtonRef.current?.releasePointerCapture(pointerId); } catch {}
            }
            dragStateRef.current.pointerId = null;
            dragStateRef.current.isDragging = false;
            setIsTogglePressed(false);
            dragPositionRef.current = null;
            dragOpenDirectionRef.current = null;
            setIsDragging(false);
            setDragStyles(false);
        };
    }, [isOpen, handleTogglePointerMove, handleTogglePointerUp, setDragStyles]);

    const preserveSidebarScroll = (callback: () => void) => {
        const list = listRef.current;
        if (!list) {
            callback();
            return;
        }

        const scrollTop = list.scrollTop;
        callback();

        requestAnimationFrame(() => {
            if (list.scrollTop !== scrollTop) {
                list.scrollTop = scrollTop;
            }
        });
    };

    const showToast = useCallback((message: string, type: ToastType = 'success') => {
        emitToast(message, type, 900, 'sidebar');
    }, []);

    const maybeShowContextHint = useCallback(() => {
        if (contextHintShown.current) return;
        contextHintShown.current = true;
        try { localStorage.setItem(CONTEXT_HINT_KEY, 'true'); } catch {}
        setTimeout(() => {
            emitToast('Tip: right-click for more formats', 'info', 2500, 'sidebar');
        }, 1200);
    }, []);

    const snippet = (value?: string, max = 120) => {
        if (!value) return '…';
        const clean = stripMarkdown(value).replace(/\s+/g, ' ').trim();
        return clean.length > max ? `${clean.slice(0, max)}…` : clean;
    };

    const chatTitle = getChatTitle();

    const generateChatTitle = useCallback((turnList: Turn[]) => {
        if (providerName) {
            const provider = [chatgpt, claude, gemini].find(p => p.name === providerName);
            const scrapedTitle = provider?.getChatTitle?.();
            if (scrapedTitle) return scrapedTitle;
        }

        const firstPrompt = turnList.find(t => t.role === 'user')?.text;
        if (!firstPrompt) return 'Untitled Chat';
        const clean = firstPrompt.trim();
        const slice = clean.slice(0, 60);
        return clean.length > 60 ? `${slice}…` : clean;
    }, [providerName]);

    useEffect(() => {
        try {
            const saved = localStorage.getItem(COPY_MARKDOWN_KEY);
            if (saved === 'true') setCopyWithMarkdown(true);
            if (localStorage.getItem(CONTEXT_HINT_KEY) === 'true') {
                contextHintShown.current = true;
            }
        } catch {}
    }, []);

    useEffect(() => {
        try {
            localStorage.setItem(COPY_MARKDOWN_KEY, copyWithMarkdown ? 'true' : 'false');
        } catch {}
    }, [copyWithMarkdown]);

    const getTurnCopyText = useCallback((turn: Turn | undefined) => {
        if (!turn) return '';
        return copyWithMarkdown ? turn.text : stripMarkdown(turn.text);
    }, [copyWithMarkdown]);

    const blocks: Block[] = useMemo(() => buildConversationBlocks(turns), [turns]);
    const collapsibleKeys = useMemo(() => blocks.filter(block => block.answer &&
        (block.headings.length > 0 || !!block.answer.text)
    ).map(block => block.key), [blocks]);
    const allCollapsed = collapsibleKeys.length > 0 && collapsibleKeys.every(key => collapsedBlocks.has(key));

    const filteredBlocks = useMemo(() => filterOutlineBlocks(blocks, search, depth), [blocks, search, depth]);

    type FocusItem =
        | { key: string; kind: 'block'; block: Block }
        | { key: string; kind: 'heading'; block: Block; heading?: Turn['headings'][number] };

    const focusableItems: FocusItem[] = useMemo(() => {
        const items: FocusItem[] = [];

        filteredBlocks.forEach(({ block, headingIndices }) => {
            items.push({ key: block.key, kind: 'block', block });
            if (block.answer && !collapsedBlocks.has(block.key)) {
                if (block.headings.length > 0) {
                    headingIndices.forEach(index => {
                        items.push({ key: `${block.key}-heading-${index}`, kind: 'heading', block, heading: block.headings[index] });
                    });
                } else if (block.answer.text) {
                    items.push({ key: `${block.key}-heading-0`, kind: 'heading', block, heading: undefined });
                }
            }
        });
        return items;
    }, [filteredBlocks, collapsedBlocks]);

    const focusIndexByKey = useMemo(() => {
        const map = new Map<string, number>();
        focusableItems.forEach((item, idx) => map.set(item.key, idx));
        return map;
    }, [focusableItems]);

    const collapseReadingHeading = (keys: readonly string[]) => {
        const item = focusableItems.find(item => item.key === activeKey);
        if (item?.kind === 'heading' && keys.includes(item.block.key)) setActiveKey(item.block.key);
    };

    const toggleAllCollapsed = () => {
        setCollapsedBlocks(previous => {
            const next = new Set(previous);
            collapsibleKeys.forEach(key => {
                if (allCollapsed) next.delete(key);
                else next.add(key);
            });
            return next;
        });
        if (!allCollapsed) collapseReadingHeading(collapsibleKeys);
    };

    const getCurrentExportBlocks = useCallback(() => toExportBlocks(blocks), [blocks]);
    const coverage = useMemo(() => providerName === 'chatgpt' ? getHistoryCoverage(history, turns.length) : { complete: null, scanStatus: 'not-scanned', description: 'Detected messages' }, [providerName, history, turns.length]);
    const scopeLabel = coverage.description;
    const navigate = (turn: Turn | undefined, headingIndex?: number) => {
        if (turn) void navigateToTurn(turn.id, headingIndex).then(found => {
            if (!found) showToast('Message is no longer available on this page', 'info');
        });
    };

    const exportChat = useCallback(async (format: 'md' | 'pdf' | 'txt' | 'json' = exportFormat, exportBlocks?: ExportBlock[], exportCoverage = coverage) => {
        const rangeLabel = exportCoverage.description;
        const turns = exportBlocks ?? getCurrentExportBlocks();
        if (!turns.length) {
            showToast('Nothing to export yet');
            return;
        }

        const filename = generateExportFilename({ type: 'chat', provider: providerName, title: chatTitle, format });

        if (format === 'md') {
            const lines: string[] = [];
            lines.push(`# Chat Export (${providerName}) - ${new Date().toLocaleString()}`, '', rangeLabel, '');
            turns.forEach((block, idx) => {
                lines.push(`## Turn ${idx + 1}`, '');
                if (block.prompt !== undefined) lines.push('**User**', block.prompt || '…', '');
                if (block.answer) {
                    lines.push('**Assistant**');
                    lines.push(block.answer || '…', '');
                }
                lines.push('---', '');
            });
            downloadFile(lines.join('\n'), 'text/markdown', filename);
            return;
        }

        if (format === 'txt') {
            const lines: string[] = [];
            lines.push(`CHAT EXPORT (${providerName})`, `Exported: ${new Date().toLocaleString()}`, rangeLabel, '', '='.repeat(60), '');
            turns.forEach((block, idx) => {
                const promptPlain = stripMarkdown(block.prompt || '');
                const answerPlain = stripMarkdown(block.answer || '');

                lines.push(`[${idx + 1}]${block.prompt !== undefined ? ' User:' : ''}`);
                if (block.prompt !== undefined) lines.push(promptPlain || '…', '');
                if (block.answer) {
                    lines.push('Assistant:', answerPlain || '…', '');
                }
                lines.push('-'.repeat(60), '');
            });
            downloadFile(lines.join('\n'), 'text/plain', filename);
            return;
        }

        if (format === 'json') {
            const data = {
                coverage: exportCoverage,
                exported: new Date().toISOString(),
                provider: providerName,
                url: window.location.href,
                turns: toJsonTurns(turns),
            };
            downloadFile(JSON.stringify(data, null, 2), 'application/json', filename);
            return;
        }

        if (format === 'pdf') {
            const renderedTurns = await Promise.all(turns.map(async (block) => ({
                promptHtml: block.prompt !== undefined ? await renderMarkdownToHtml(block.prompt || '…') : '',
                answerHtml: block.answer !== undefined ? await renderMarkdownToHtml(block.answer || '…') : ''
            })));

            const body = `
              <div class="header">
                <h1>${DOMPurify.sanitize(chatTitle)}</h1>
                <div class="header-meta">
                  <span>${DOMPurify.sanitize(providerName)}</span>
                  <span>${formatPdfDate(Date.now())}</span>
                  <span>${turns.length} turns</span>
                </div>
              </div>
              ${renderedTurns
                    .map(
                        (block) => `
                    <div class="turn">
                      ${block.promptHtml ? `<div class="content-section">
                        <div class="section-label">You</div>
                        <div class="prompt">${block.promptHtml}</div>
                      </div>` : ''}
                      ${block.answerHtml
                                ? `<div class="content-section">
                        <div class="section-label">Assistant</div>
                        <div class="response">${block.answerHtml}</div>
                      </div>`
                                : ''
                            }
                    </div>
                  `
                    )
                    .join('')}
            `;
            const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${DOMPurify.sanitize(chatTitle)} - Export</title>${getPdfStyles()}</head><body><p>${DOMPurify.sanitize(rangeLabel)}</p>${body}</body></html>`;
            await printHtmlAsPdf(html);
        }
    }, [chatTitle, exportFormat, getCurrentExportBlocks, providerName, showToast, coverage]);

    const startExport = useCallback(async (format: 'md' | 'pdf' | 'txt' | 'json' = exportFormat, consentJustGranted = false) => {
        if (captureInProgressRef.current) return;

        if (providerName === 'chatgpt') {
            if (!hasCaptureConsent && !consentJustGranted) {
                setShowCaptureConsent(true);
                return;
            }

            captureInProgressRef.current = true;
            try {
                const result = await discoverHistory();
                if (result.status === 'cancelled' || result.status === 'failed') {
                    showToast(result.reason, 'info');
                    return;
                }
                const exportBlocks = toExportBlocks(buildConversationBlocks(result.turns));
                await exportChat(format, exportBlocks, getHistoryCoverage(result, result.turns.length));
                showToast('Discovered range exported');
                maybeShowContextHint();
            } catch (err) {
                showToast('Export failed');
            } finally {
                captureInProgressRef.current = false;
            }
            return;
        }

        await exportChat(format);
        maybeShowContextHint();
    }, [discoverHistory, exportChat, exportFormat, hasCaptureConsent, providerName, showToast, maybeShowContextHint]);

    const handleConsentAccept = useCallback(() => {
        try {
            localStorage.setItem(CHATGPT_CAPTURE_CONSENT_KEY, 'true');
        } catch {
        }
        setHasCaptureConsent(true);
        setShowCaptureConsent(false);
        startExport(exportFormat, true);
    }, [exportFormat, startExport]);

    const handleConsentDismiss = useCallback(() => {
        setShowCaptureConsent(false);
    }, []);

    // Reading activity never moves keyboard focus or scrolls the chat.
    useEffect(() => {
        if (!isOpen || isPaused || history.status === 'scanning') return;
        let frame = 0;
        const update = () => {
            frame = 0;
            const scroller = findScrollable(container);
            const viewport = scroller === document.scrollingElement ? { top: 0, bottom: innerHeight } : scroller.getBoundingClientRect();
            let line = Math.max(0, viewport.top) + 25;
            const live = turns.filter(turn => turn.element.isConnected && turn.element.getClientRects().length);
            let turn = live.find(item => {
                const rect = item.element.getBoundingClientRect();
                return rect.top <= line && rect.bottom > line;
            }) || live.find(item => {
                const rect = item.element.getBoundingClientRect();
                return rect.top >= line && rect.top < Math.min(innerHeight, viewport.bottom);
            });
            const range = scroller.scrollHeight - scroller.clientHeight;
            const reversed = getComputedStyle(scroller).flexDirection === 'column-reverse';
            const atBottom = range > 2 && (reversed ? scroller.scrollTop >= -2 : scroller.scrollTop >= range - 2);
            const last = live[live.length - 1];
            if (atBottom && last) {
                const rect = last.element.getBoundingClientRect();
                if (rect.top < viewport.bottom && rect.bottom > viewport.top) {
                    turn = last;
                    line = Math.min(rect.bottom, viewport.bottom) - 1;
                }
            }
            const result = filteredBlocks.find(({ block }) => block.prompt?.id === turn?.id || block.answer?.id === turn?.id);
            const block = result?.block;
            const headingIndices = result?.headingIndices ?? [];
            let key = block?.key || null;
            if (block && turn?.id === block.answer?.id && !collapsedBlocks.has(block.key)) {
                let index = -1;
                block.headings.forEach((heading, i) => {
                    if (heading.element.isConnected && heading.element.getClientRects().length && heading.element.getBoundingClientRect().top <= line) index = i;
                });
                if (index >= 0) {
                    let level = getHeadingLevel(block.headings[index]);
                    if (!headingIndices.includes(index)) {
                        // Walk ancestors, skipping preceding siblings of the hidden heading.
                        while (--index >= 0) {
                            const candidate = getHeadingLevel(block.headings[index]);
                            if (candidate < level) {
                                level = candidate;
                                if (headingIndices.includes(index)) break;
                            }
                        }
                    }
                    if (index >= 0) key = `${block.key}-heading-${index}`;
                } else if (!block.headings.length && block.answer?.text) key = `${block.key}-heading-0`;
            }
            setActiveKey(key);
        };
        const schedule = (event?: Event) => {
            if (event?.composedPath().includes(sidebarShellRef.current!)) return;
            if (!frame) frame = requestAnimationFrame(update);
        };
        update();
        window.addEventListener('scroll', schedule, true);
        window.addEventListener('resize', schedule);
        return () => {
            cancelAnimationFrame(frame);
            window.removeEventListener('scroll', schedule, true);
            window.removeEventListener('resize', schedule);
        };
    }, [container, isOpen, isPaused, turns, filteredBlocks, history.status, collapsedBlocks]);

    const previousFocusItems = useRef(focusableItems);
    useEffect(() => {
        const previous = previousFocusItems.current[focusedIndex];
        previousFocusItems.current = focusableItems;
        if (previous) {
            let next = focusableItems.findIndex(item => item.key === previous.key);
            if (next < 0 && previous.kind === 'heading') {
                const originalIndex = previous.block.headings.indexOf(previous.heading!);
                const parent = previous.block.headings.slice(0, originalIndex).map((heading, index) => ({ heading, index })).reverse().find(({ index }) => focusIndexByKey.has(`${previous.block.key}-heading-${index}`));
                const parentKey = parent ? `${previous.block.key}-heading-${parent.index}` : previous.block.key;
                next = focusableItems.findIndex(item => item.key === parentKey);
                if (next < 0) next = focusableItems.findIndex(item => item.key === previous.block.key);
            }
            if (next >= 0) { setFocusedIndex(next); return; }
        }
        if (focusedIndex >= focusableItems.length && focusableItems.length > 0) {
            setFocusedIndex(focusableItems.length - 1);
        }
    }, [focusableItems, focusIndexByKey]);

    useEffect(() => {
        const handleStorage = (event: StorageEvent) => {
            if (event.key === LINE_CLAMP_KEY) {
                setLineClamp(getLineClamp());
            }
            if (event.key === 'scroll-pro-export-format' && event.newValue) {
                if (event.newValue === 'md' || event.newValue === 'pdf' || event.newValue === 'txt' || event.newValue === 'json') {
                    setExportFormat(event.newValue);
                }
            }
        };
        window.addEventListener('storage', handleStorage);
        return () => window.removeEventListener('storage', handleStorage);
    }, []);

    useEffect(() => {
        if (!isOpen && contextMenu) {
            setContextMenu(null);
        }
        if (!isOpen && exportFormatMenu) {
            setExportFormatMenu(null);
        }
        if (!isOpen && copyFormatMenu) {
            setCopyFormatMenu(null);
        }
        if (!isOpen && showSettings) {
            setShowSettings(false);
        }
    }, [isOpen, contextMenu, exportFormatMenu, copyFormatMenu, showSettings]);

    useEffect(() => {
        const menu = contextMenuRef.current || exportFormatMenuRef.current || copyFormatMenuRef.current;
        menu?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    }, [contextMenu, exportFormatMenu, copyFormatMenu]);

    useEffect(() => {
        if (!contextMenu) return;
        const close = (event: Event) => { if (history.status !== 'scanning' && !event.composedPath().includes(sidebarShellRef.current!)) setContextMenu(null); };
        window.addEventListener('scroll', close, true);
        window.addEventListener('resize', close);
        return () => {
            window.removeEventListener('scroll', close, true);
            window.removeEventListener('resize', close);
        };
    }, [contextMenu, history.status]);

    useEffect(() => {
        if (!exportFormatMenu) return;
        const close = (event: Event) => { if (history.status !== 'scanning' && !event.composedPath().includes(sidebarShellRef.current!)) setExportFormatMenu(null); };
        window.addEventListener('scroll', close, true);
        window.addEventListener('resize', close);
        return () => {
            window.removeEventListener('scroll', close, true);
            window.removeEventListener('resize', close);
        };
    }, [exportFormatMenu, history.status]);

    useEffect(() => {
        if (!copyFormatMenu) return;
        const close = (event: Event) => { if (history.status !== 'scanning' && !event.composedPath().includes(sidebarShellRef.current!)) setCopyFormatMenu(null); };
        window.addEventListener('scroll', close, true);
        window.addEventListener('resize', close);
        return () => {
            window.removeEventListener('scroll', close, true);
            window.removeEventListener('resize', close);
        };
    }, [copyFormatMenu, history.status]);

    useEffect(() => {
        const scrollEl = findScrollable(container || null);
        if (!scrollEl) return;
        const computeProgress = () => {
            const scrolled = scrollEl.scrollTop;
            const max = Math.max(scrollEl.scrollHeight - scrollEl.clientHeight, 0);
            const reverse = getComputedStyle(scrollEl).flexDirection === 'column-reverse';
            const pct = max > 0 ? Math.round(((reverse ? max + scrolled : scrolled) / max) * 100) : 0;
            setProgress(pct);
        };
        computeProgress();
        scrollEl.addEventListener('scroll', computeProgress, { passive: true });
        return () => scrollEl.removeEventListener('scroll', computeProgress);
    }, [container, turns]);

    useEffect(() => {
        const handleExportEvent = (e: Event) => {
            const customEvent = e as CustomEvent;
            const { format } = customEvent.detail;
            if (providerName) {
                startExport(format);
            }
        };
        window.addEventListener('scroll-pro-export-chat', handleExportEvent as EventListener);
        return () => window.removeEventListener('scroll-pro-export-chat', handleExportEvent as EventListener);
    }, [providerName, startExport]);

    const copyChat = useCallback((format: 'text' | 'md' | 'json') => {
        const exportBlocks = getCurrentExportBlocks();
        if (format === 'json') {
            copyToClipboard(JSON.stringify({ provider: providerName, url: location.href,
                coverage,
                turns: toJsonTurns(exportBlocks),
            }, null, 2));
        } else {
            const lines = [scopeLabel, ''];
            exportBlocks.forEach(block => {
                if (block.prompt !== undefined) lines.push(format === 'md' ? `**User:** ${block.prompt}` : `User: ${stripMarkdown(block.prompt)}`, '');
                if (block.answer !== undefined) lines.push(format === 'md' ? `**Assistant:** ${block.answer}` : `Assistant: ${stripMarkdown(block.answer)}`, '');
                lines.push('---', '');
            });
            copyToClipboard(lines.join('\n'));
        }
        showToast('Discovered range copied');
        maybeShowContextHint();
    }, [getCurrentExportBlocks, providerName, scopeLabel, coverage, showToast, maybeShowContextHint]);
    const handleCopyFullChat = () => copyChat(copyWithMarkdown ? 'md' : 'text');

    // Capture-phase contextmenu handler (beats host page interception)
    const filteredBlocksRef = useRef(filteredBlocks);
    filteredBlocksRef.current = filteredBlocks;
    const focusIndexByKeyRef = useRef(focusIndexByKey);
    focusIndexByKeyRef.current = focusIndexByKey;

    useEffect(() => {
        if (!isOpen || isPaused) return;

        const handler = (e: MouseEvent) => {
            const shell = sidebarShellRef.current;
            if (!shell) return;

            const path = e.composedPath();
            if (!path.includes(shell)) return;

            const target = path[0] as HTMLElement;
            if (!target || typeof target.closest !== 'function') return;

            const itemEl = target.closest('[data-block-key]') as HTMLElement | null;
            if (itemEl) {
                const key = itemEl.getAttribute('data-block-key');
                const block = key ? filteredBlocksRef.current.find(item => item.block.key === key)?.block : null;
                if (block) {
                    e.preventDefault();
                    e.stopPropagation();
                    const focusIdx = key ? (focusIndexByKeyRef.current.get(key) ?? -1) : -1;
                    if (focusIdx >= 0) setFocusedIndex(focusIdx);
                    const menuWidth = 220;
                    const menuHeight = 180;
                    const x = Math.min(e.clientX, window.innerWidth - menuWidth);
                    const y = Math.min(e.clientY, window.innerHeight - menuHeight);
                    setContextMenu({ x, y, block });
                }
                return;
            }

            const copyBtn = target.closest('[data-action="copy-format"]') as HTMLElement | null;
            if (copyBtn) {
                e.preventDefault();
                e.stopPropagation();
                setCopyFormatMenu({ x: e.clientX, y: e.clientY });
                return;
            }

            const exportBtn = target.closest('[data-action="export-format"]') as HTMLElement | null;
            if (exportBtn) {
                e.preventDefault();
                e.stopPropagation();
                setExportFormatMenu({ x: e.clientX, y: e.clientY });
                return;
            }

            e.preventDefault();
        };

        window.addEventListener('contextmenu', handler, true);
        return () => window.removeEventListener('contextmenu', handler, true);
    }, [isOpen, isPaused]);

    useEffect(() => {
        const list = listRef.current;
        const item = activeKey ? itemRefs.current.get(activeKey) : undefined;
        if (!list || !item || pointerInSidebar.current) return;
        const viewport = list.getBoundingClientRect();
        // Blocks contain their headings; use only the main title's rectangle.
        const rect = (item.querySelector('.scroll-pro-item-title') || item).getBoundingClientRect();
        if (rect.top < viewport.top) list.scrollTop += rect.top - viewport.top;
        else if (rect.bottom > viewport.bottom) list.scrollTop += rect.bottom - viewport.bottom;
    }, [activeKey]);

    const renderContextMenu = () => {
        if (!contextMenu) return null;
        const { block } = contextMenu;
        const hasAnswer = Boolean(block.answer);

        const onCopyPrompt = () => {
            copyToClipboard(getTurnCopyText(block.prompt));
            showToast(copyWithMarkdown ? 'Prompt copied (markdown)' : 'Prompt copied');
            setContextMenu(null);
        };

        const onCopyResponse = () => {
            if (!block.answer) return;
            copyToClipboard(getTurnCopyText(block.answer));
            showToast(copyWithMarkdown ? 'Response copied (markdown)' : 'Response copied');
            setContextMenu(null);
        };

        const onCopyQA = () => {
            if (!block.prompt || !block.answer) return;
            const promptText = getTurnCopyText(block.prompt);
            const answerText = getTurnCopyText(block.answer);
            const text = `Q: ${promptText}\n\nA: ${answerText}`;
            copyToClipboard(text);
            showToast(copyWithMarkdown ? 'Prompt and response copied (markdown)' : 'Prompt and response copied');
            setContextMenu(null);
        };

        return (
            <div
                className="scroll-pro-context-menu"
                data-hover-region
                onPointerEnter={hover.onPointerEnter}
                onPointerLeave={hover.onPointerLeave}
                style={{ top: contextMenu.y, left: contextMenu.x }}
                ref={contextMenuRef}
                onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                        event.stopPropagation();
                        setContextMenu(null);
                    }
                }}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onContextMenu={(e) => e.preventDefault()}
            >
                <button className="scroll-pro-context-item" onClick={onCopyResponse} disabled={!hasAnswer}>
                    <span className="scroll-pro-context-label">Copy response</span>
                </button>
                <button className="scroll-pro-context-item" onClick={onCopyQA} disabled={!block.prompt || !hasAnswer}>
                    <span className="scroll-pro-context-label">Copy Q&A</span>
                </button>
                <button className="scroll-pro-context-item" onClick={onCopyPrompt} disabled={!block.prompt}>
                    <span className="scroll-pro-context-label">Copy prompt</span>
                </button>
                <div className="scroll-pro-context-divider" role="separator" />
                <button
                    className="scroll-pro-context-item"
                    onClick={() => setCopyWithMarkdown((prev) => !prev)}
                    role="menuitemcheckbox"
                    aria-checked={copyWithMarkdown}
                    aria-label="Toggle copy markdown"
                >
                    <span className="scroll-pro-context-check" aria-hidden="true">{copyWithMarkdown ? '✓' : ''}</span>
                    <span className="scroll-pro-context-label">Markdown</span>
                </button>
            </div>
        );
    };

    const renderExportFormatMenu = () => {
        if (!exportFormatMenu) return null;

        type FormatOption = 'md' | 'pdf' | 'txt' | 'json';
        const formats: Array<{ value: FormatOption; label: string }> = [
            { value: 'md', label: 'Markdown' },
            { value: 'pdf', label: 'PDF' },
            { value: 'txt', label: 'Text' },
            { value: 'json', label: 'JSON' },
        ];

        const handleFormatSelect = (format: FormatOption) => {
            try {
                localStorage.setItem('scroll-pro-export-format', format);
            } catch {}
            setExportFormat(format);

            startExport(format);
            if (providerName === 'chatgpt') {
                showToast('Preparing discovered range...');
            } else {
                showToast(`Exported as ${format.toUpperCase()}`);
            }

            setExportFormatMenu(null);
        };

        const menuWidth = 200; // Approximate context menu width
        const menuHeight = formats.length * 36 + 8; // Approximate height (36px per item + padding)
        const { x, y } = exportFormatMenu;

        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        let adjustedX = x;
        if (x + menuWidth > viewportWidth) {
            adjustedX = x - menuWidth;
        }

        let adjustedY = y;
        if (y + menuHeight > viewportHeight) {
            adjustedY = y - menuHeight;
        }

        return (
            <div
                className="scroll-pro-context-menu"
                data-hover-region
                onPointerEnter={hover.onPointerEnter}
                onPointerLeave={hover.onPointerLeave}
                style={{ top: adjustedY, left: adjustedX }}
                ref={exportFormatMenuRef}
                onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                        event.stopPropagation();
                        setExportFormatMenu(null);
                    }
                }}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onContextMenu={(e) => e.preventDefault()}
            >
                {formats.map((format) => (
                    <button
                        key={format.value}
                        className="scroll-pro-context-item"
                        onClick={() => handleFormatSelect(format.value)}
                    >
                        <span className="scroll-pro-context-label">{format.label}</span>
                        <span className="scroll-pro-context-kbd">{format.value.toUpperCase()}</span>
                    </button>
                ))}
            </div>
        );
    };

    const renderCopyFormatMenu = () => {
        if (!copyFormatMenu) return null;

        type CopyOption = { value: string; label: string; action: () => void };
        const options: CopyOption[] = [
            { value: 'text', label: 'Plain text', action: () => copyChat('text') },
            { value: 'md', label: 'Markdown', action: () => copyChat('md') },
            { value: 'json', label: 'JSON', action: () => copyChat('json') },
        ];

        const menuWidth = 200;
        const menuHeight = options.length * 36 + 8;
        const { x, y } = copyFormatMenu;

        let adjustedX = x;
        if (x + menuWidth > window.innerWidth) {
            adjustedX = x - menuWidth;
        }

        let adjustedY = y;
        if (y + menuHeight > window.innerHeight) {
            adjustedY = y - menuHeight;
        }

        return (
            <div
                className="scroll-pro-context-menu"
                data-hover-region
                onPointerEnter={hover.onPointerEnter}
                onPointerLeave={hover.onPointerLeave}
                style={{ top: adjustedY, left: adjustedX }}
                ref={copyFormatMenuRef}
                onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                        event.stopPropagation();
                        setCopyFormatMenu(null);
                    }
                }}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onContextMenu={(e) => e.preventDefault()}
            >
                {options.map((option) => (
                    <button
                        key={option.value}
                        className="scroll-pro-context-item"
                        onClick={() => {
                            option.action();
                            setCopyFormatMenu(null);
                        }}
                    >
                        <span className="scroll-pro-context-label">{option.label}</span>
                        <span className="scroll-pro-context-kbd">{option.value.toUpperCase()}</span>
                    </button>
                ))}
            </div>
        );
    };

    const effectivePosition = isDragging && dragPositionRef.current
        ? dragPositionRef.current
        : sidebarPosition;
    const effectiveDirection = isDragging && dragOpenDirectionRef.current
        ? dragOpenDirectionRef.current
        : resize.preview?.direction ?? getSidebarOpenDirection(effectivePosition, width);
    const effectiveWidth = resize.preview?.width ?? width;

    return (
        <div
            ref={sidebarShellRef}
            className={`scroll-pro-sidebar-shell ${isOpen ? 'is-open' : ''} ${isDragging ? 'is-dragging' : ''} ${resize.isResizing ? 'is-resizing' : ''}`}
            data-open-x={effectiveDirection.x}
            data-open-y={effectiveDirection.y}
            style={{
                ['--sidebar-line-clamp' as string]: lineClamp,
                ['--sidebar-width' as string]: `${getOutlineWidth(effectiveWidth, window.innerWidth, effectivePosition.x, effectiveDirection.x)}px`,
                ['--sidebar-x' as string]: `${effectivePosition.x}px`,
                ['--sidebar-y' as string]: `${effectivePosition.y}px`,
            }}
        >
            <button
                ref={toggleButtonRef}
                onClick={handleToggleClick}
                onPointerDown={handleTogglePointerDown}
                data-hover-region
                onPointerEnter={hover.onToggleEnter}
                onPointerLeave={hover.onPointerLeave}
                className="scroll-pro-toggle-icon"
                aria-label="Toggle outline"
                aria-expanded={isOpen}
                title="Toggle outline (press and hold to move)"
            >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="3" y1="6" x2="21" y2="6" />
                    <line x1="3" y1="12" x2="21" y2="12" />
                    <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
            </button>

            {isOpen && (
                <div
                    className="scroll-pro-sidebar"
                    data-hover-region
                    onPointerEnter={hover.onPointerEnter}
                    onPointerLeave={hover.onPointerLeave}
                    role="complementary"
                    aria-label="Turnline outline"
                    onMouseEnter={() => { pointerInSidebar.current = true; }}
                    onMouseLeave={() => { pointerInSidebar.current = false; }}

                >
                    <div
                        className="scroll-pro-resize-handle"
                        role="separator"
                        aria-label="Outline width"
                        aria-orientation="vertical"
                        aria-valuemin={SIDEBAR_MIN_WIDTH}
                        aria-valuemax={SIDEBAR_MAX_WIDTH}
                        aria-valuenow={effectiveWidth}
                        tabIndex={0}
                        onPointerDown={resize.onPointerDown}
                        onKeyDown={resize.onKeyDown}
                        onDoubleClick={resize.onDoubleClick}
                    />
                    {showSettings ? (
                        <SettingsPanel
                            settings={settings}
                            onBack={closeSettings}
                        />
                    ) : (
                        <>
                    <div className="scroll-pro-sidebar-head">
                        <div className="scroll-pro-sidebar-row">
                            <span className="scroll-pro-outline-label">All</span>
                            <div className="scroll-pro-actions" role="group" aria-label="Chat actions">
                                <button ref={settingsButtonRef} className="scroll-pro-action-btn" aria-label="Outline settings" aria-expanded="false" onClick={openSettings}>
                                    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h9m4 0h3M4 17h3m4 0h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></svg>
                                </button>
                                <button
                                    data-action="copy-format"
                                    onClick={handleCopyFullChat}
                                    onContextMenu={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setCopyFormatMenu({
                                            x: e.clientX,
                                            y: e.clientY,
                                        });
                                    }}
                                    className="scroll-pro-action-btn"
                                    title="Copy discovered chat - Right-click for format"
                                >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                                    </svg>
                                </button>
                                <button
                                    data-action="export-format"
                                    onClick={() => startExport()}
                                    onContextMenu={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setExportFormatMenu({
                                            x: e.clientX,
                                            y: e.clientY,
                                        });
                                    }}
                                    className="scroll-pro-action-btn"
                                    title={`Export chat (${exportFormat.toUpperCase()}) - Right-click for format`}
                                >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                        <polyline points="7 10 12 15 17 10"></polyline>
                                        <line x1="12" y1="15" x2="12" y2="3"></line>
                                    </svg>
                                </button>
                            </div>
                        </div>

                        <div className="scroll-pro-search">
                            <svg className="scroll-pro-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                            <input
                                type="text"
                                placeholder="Filter…"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="scroll-pro-search-input"
                            />
                            {search && (
                                <button
                                    type="button"
                                    className="scroll-pro-search-clear"
                                    aria-label="Clear filter"
                                    onClick={() => setSearch('')}
                                >
                                    <svg aria-hidden="true" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="scroll-pro-history-status">
                        <span role="status">{describeHistory(history, turns.length)}</span>
                        <button
                            type="button"
                            className="scroll-pro-history-control"
                            onClick={toggleAllCollapsed}
                            disabled={collapsibleKeys.length === 0}
                            aria-label={allCollapsed ? 'Expand all turns' : 'Collapse all turns'}
                            title={allCollapsed ? 'Expand all turns' : 'Collapse all turns'}
                        >
                            <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                {allCollapsed ? <><path d="m8 8 4-4 4 4" /><path d="m8 16 4 4 4-4" /></> : <><path d="m8 4 4 4 4-4" /><path d="m8 20 4-4 4 4" /></>}
                                <path d="M5 12h14" />
                            </svg>
                        </button>
                        {providerName === 'chatgpt' && (history.status === 'scanning'
                            ? <button type="button" className="scroll-pro-history-control" onClick={cancelHistory} aria-label="Stop refreshing history" title="Stop refreshing history">
                                <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><rect x="9" y="9" width="6" height="6" rx="1" fill="currentColor" stroke="none" /></svg>
                            </button>
                            : <button type="button" className="scroll-pro-history-control" onClick={() => void discoverHistory()} aria-label="Refresh history" title="Refresh history">
                                <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 11a8 8 0 1 0-2.3 6.7" /><path d="M20 4v7h-7" /></svg>
                            </button>)}
                    </div>
                    <div
                        className="scroll-pro-sidebar-list"
                        ref={assignListRef}
                        onScroll={event => { outlineScrollTopRef.current = event.currentTarget.scrollTop; }}
                    >
                        {turns.length === 0 ? (
                            <div className="scroll-pro-empty">
                                <div className="scroll-pro-empty-card">
                                    <div className="scroll-pro-empty-title">
                                        Your chat outline will appear here as you talk with {providerLabel}
                                    </div>
                                    <div className="scroll-pro-empty-tip">
                                        Navigate your chat by clicking on prompts
                                    </div>
                                </div>
                            </div>
                        ) : filteredBlocks.map(({ block, headingIndices }) => {
                            const focusIdx = focusIndexByKey.get(block.key) ?? -1;
                            const isCollapsed = collapsedBlocks.has(block.key);
                            const canCollapse = block.answer &&
                                (block.headings.length > 0 ? headingIndices.length > 0 : !!block.answer.text);
                            return (
                                <div
                                    key={block.key}
                                    data-block-key={block.key}
                                    ref={(el) => {
                                        if (el) {
                                            itemRefs.current.set(block.key, el);
                                        } else {
                                            itemRefs.current.delete(block.key);
                                        }
                                    }}
                                    onContextMenu={(e) => {
                                        e.preventDefault();
                                        if (focusIdx >= 0) setFocusedIndex(focusIdx);
                                        const menuWidth = 220;
                                        const menuHeight = 180;
                                        const x = Math.min(e.clientX, window.innerWidth - menuWidth);
                                        const y = Math.min(e.clientY, window.innerHeight - menuHeight);
                                        setContextMenu({ x, y, block });
                                    }}
                                    className={`scroll-pro-sidebar-item ${focusedIndex === focusIdx ? 'is-focused' : ''} ${activeKey === block.key ? 'is-reading' : ''}`}
                                    aria-current={activeKey === block.key ? 'location' : undefined}
                                    aria-selected={focusedIndex === focusIdx}
                                >
                                    <div className="scroll-pro-item-body">
                                        <div className="scroll-pro-item-header">
                                            {canCollapse ? (
                                                <button
                                                    type="button"
                                                    className="scroll-pro-collapse-btn"
                                                    aria-label={isCollapsed ? 'Expand answer outline' : 'Collapse answer outline'}
                                                    aria-expanded={!isCollapsed}
                                                    title={isCollapsed ? 'Expand answer outline' : 'Collapse answer outline'}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setFocusedIndex(focusIdx);
                                                        setCollapsedBlocks(previous => {
                                                            const next = new Set(previous);
                                                            if (next.has(block.key)) next.delete(block.key);
                                                            else next.add(block.key);
                                                            return next;
                                                        });
                                                        if (!isCollapsed) collapseReadingHeading([block.key]);
                                                    }}
                                                >
                                                    <svg
                                                        aria-hidden="true"
                                                        className="scroll-pro-collapse-icon"
                                                        width="12"
                                                        height="12"
                                                        viewBox="0 0 24 24"
                                                        fill="none"
                                                        stroke="currentColor"
                                                        strokeWidth="2.2"
                                                        strokeLinecap="round"
                                                        strokeLinejoin="round"
                                                    >
                                                        <polyline points="9 18 15 12 9 6" />
                                                    </svg>
                                                </button>
                                            ) : (
                                                <span className="scroll-pro-collapse-spacer" aria-hidden="true" />
                                            )}
                                            <button
                                                type="button"
                                                className="scroll-pro-item-title"
                                                onFocus={() => setFocusedIndex(focusIdx)}
                                                onClick={() => {
                                                    if (contextMenu) return;
                                                    if (focusIdx >= 0) setFocusedIndex(focusIdx);
                                                    navigate(block.prompt || block.answer);
                                                }}
                                            >
                                                {block.title || '…'}
                                            </button>
                                        </div>
                                        {block.answer && !isCollapsed && (
                                            <div className="scroll-pro-subheading-list">
                                                {block.headings.length > 0 ? (
                                                    headingIndices.map(i => {
                                                        const h = block.headings[i];
                                                        const headingKey = `${block.key}-heading-${i}`;
                                                        const headingFocusIndex = focusIndexByKey.get(headingKey) ?? -1;
                                                        return (
                                                            <button
                                                                key={headingKey}
                                                                data-outline-level={getHeadingLevel(h)}
                                                                title={h.innerText}
                                                                style={{ paddingLeft: `${26 + (getHeadingLevel(h) - 1) * 12}px` }}
                                                                ref={(el) => {
                                                                    if (el) {
                                                                        itemRefs.current.set(headingKey, el);
                                                                    } else {
                                                                        itemRefs.current.delete(headingKey);
                                                                    }
                                                                }}
                                                                className={`scroll-pro-subheading ${focusedIndex === headingFocusIndex ? 'is-focused' : ''} ${activeKey === headingKey ? 'is-reading' : ''}`}
                                                                aria-current={activeKey === headingKey ? 'location' : undefined}
                                                                onFocus={() => setFocusedIndex(headingFocusIndex)}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    if (headingFocusIndex >= 0) setFocusedIndex(headingFocusIndex);
                                                                    navigate(block.answer, i);
                                                                }}
                                                            >
                                                                {h.innerText}
                                                            </button>
                                                        );
                                                    })
                                                ) : (
                                                    block.answer.text && (
                                                        <button
                                                            key={`${block.key}-heading-0`}
                                                            ref={(el) => {
                                                                const headingKey = `${block.key}-heading-0`;
                                                                if (el) {
                                                                    itemRefs.current.set(headingKey, el);
                                                                } else {
                                                                    itemRefs.current.delete(headingKey);
                                                                }
                                                            }}
                                                            className={`scroll-pro-subheading ${focusedIndex === focusIndexByKey.get(`${block.key}-heading-0`) ? 'is-focused' : ''} ${activeKey === `${block.key}-heading-0` ? 'is-reading' : ''}`}
                                                            aria-current={activeKey === `${block.key}-heading-0` ? 'location' : undefined}
                                                            style={{ paddingLeft: '26px' }}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                const headingFocusIndex = focusIndexByKey.get(`${block.key}-heading-0`) ?? -1;
                                                                if (headingFocusIndex >= 0) setFocusedIndex(headingFocusIndex);
                                                                navigate(block.answer);
                                                            }}
                                                        >
                                                            {snippet(block.answer.text, 80)}
                                                        </button>
                                                    )
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}

                        {filteredBlocks.length === 0 && turns.length > 0 && (
                            <div className="scroll-pro-empty">No items found</div>
                        )}
                    </div>
                        </>
                    )}
                </div>
            )}
            {contextMenu && (
                <div
                    className="scroll-pro-context-backdrop"
                    onPointerDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setContextMenu(null);
                    }}
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setContextMenu(null);
                    }}
                />
            )}
            {renderContextMenu()}
            {exportFormatMenu && (
                <div
                    className="scroll-pro-context-backdrop"
                    onPointerDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setExportFormatMenu(null);
                    }}
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setExportFormatMenu(null);
                    }}
                />
            )}
            {renderExportFormatMenu()}
            {copyFormatMenu && (
                <div
                    className="scroll-pro-context-backdrop"
                    onPointerDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setCopyFormatMenu(null);
                    }}
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setCopyFormatMenu(null);
                    }}
                />
            )}
            {renderCopyFormatMenu()}
            {showCaptureConsent && (
                <div className="scroll-pro-modal-backdrop">
                    <div className="scroll-pro-modal" role="dialog" aria-modal="true" aria-labelledby="scroll-pro-capture-title">
                        <div className="scroll-pro-modal-header">
                            <span className="scroll-pro-modal-badge">Discover history</span>
                            <h3 id="scroll-pro-capture-title">Load more of this chat</h3>
                            <p className="scroll-pro-modal-sub">Turnline will search for older messages and load hidden content, then restore your reading position. You can stop the scan. Exports include the discovered range and indicate when completeness is unverified.</p>
                        </div>
                        <ul className="scroll-pro-modal-list">
                            <li>Searches toward older messages</li>
                            <li>Waits for content to load as we scroll</li>
                            <li>Runs only while you keep this page open</li>
                        </ul>
                        <div className="scroll-pro-modal-actions">
                            <button className="scroll-pro-btn-primary" onClick={handleConsentAccept}>Allow scrolling</button>
                            <button className="scroll-pro-btn-ghost" onClick={handleConsentDismiss}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
