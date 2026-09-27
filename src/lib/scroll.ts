// Nudge target down slightly so it renders at the top of the visible area (avoids sticky headers)
const SCROLL_OFFSET = 24;
const SCROLL_DURATION = 700;
// Follow delayed rendering after arrival, but never keep controlling the page indefinitely.
const SCROLL_SETTLE_DURATION = 1200;

const findScrollContainer = (node: HTMLElement): HTMLElement | Window => {
  let scrollContainer: HTMLElement | Window = window;
  let parent = node.parentElement;
  while (parent) {
    const overflow = window.getComputedStyle(parent).overflowY;
    if (overflow === 'auto' || overflow === 'scroll') {
      scrollContainer = parent;
      break;
    }
    parent = parent.parentElement;
  }
  return scrollContainer;
};

const prefersReducedMotion = () => {
  try {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

const computeTargetPosition = (
  node: HTMLElement,
  scrollContainer: HTMLElement | Window,
  containerIsWindow: boolean
) => {
  const rect = node.getBoundingClientRect();
  const containerRect = containerIsWindow ? undefined : (scrollContainer as HTMLElement).getBoundingClientRect();
  const scrollTop = containerIsWindow ? window.scrollY : (scrollContainer as HTMLElement).scrollTop;
  const rawTarget = containerIsWindow
    ? rect.top + window.scrollY
    : rect.top + scrollTop - (containerRect?.top ?? 0);
  if (containerIsWindow) return Math.max(0, rawTarget - SCROLL_OFFSET);
  const element = scrollContainer as HTMLElement;
  const range = Math.max(0, element.scrollHeight - element.clientHeight);
  const reversed = window.getComputedStyle(element).flexDirection === 'column-reverse';
  return Math.min(reversed ? 0 : range, Math.max(reversed ? -range : 0, rawTarget - SCROLL_OFFSET));
};

let cancelActiveScroll: (() => void) | undefined;
export const cancelScroll = () => { cancelActiveScroll?.(); };

export const findScrollable = (start: HTMLElement | null): HTMLElement => {
  let node = start;
  while (node) {
    if (/(auto|scroll|overlay)/.test(getComputedStyle(node).overflowY)) return node;
    node = node.parentElement;
  }
  return (document.scrollingElement || document.documentElement) as HTMLElement;
};

const smoothScroll = (scrollContainer: HTMLElement | Window, targetPosition: number, node: HTMLElement, resolveTarget?: () => HTMLElement | undefined) => {
  cancelScroll();
  let containerIsWindow = scrollContainer === window;
  const getScroll = () => (containerIsWindow ? window.scrollY : (scrollContainer as HTMLElement).scrollTop);
  const setScroll = (value: number) => {
    if (containerIsWindow) {
      window.scrollTo({ top: value, behavior: 'instant' });
    } else {
      (scrollContainer as HTMLElement).scrollTo({ top: value, behavior: 'instant' });
    }
  };

  const duration = prefersReducedMotion() ? 0 : SCROLL_DURATION;
  const start = getScroll();
  let lastTarget = targetPosition;
  // Reduced-motion navigation must position immediately, including callers
  // that have just materialized a virtualized turn.
  if (duration === 0) setScroll(targetPosition);

  const cancelEvents: (keyof DocumentEventMap)[] = ['wheel', 'touchstart', 'mousedown', 'keydown'];
  let canceled = false;
  let frame = 0;

  const cancel = () => {
    canceled = true;
    cancelAnimationFrame(frame);
    cleanup();
  };

  const cleanup = () => {
    if (cancelActiveScroll === cancel) cancelActiveScroll = undefined;
    cancelEvents.forEach((event) => window.removeEventListener(event, cancel, true));
  };

  cancelActiveScroll = cancel;
  cancelEvents.forEach((event) => window.addEventListener(event, cancel, { passive: true, capture: true }));

  const startTime = performance.now();
  const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

  const step = () => {
    if (canceled) return;
    const now = performance.now();
    const elapsed = now - startTime;
    const replacement = resolveTarget?.();
    if (replacement?.isConnected && replacement !== node) {
      node = replacement;
      scrollContainer = findScrollContainer(node);
      containerIsWindow = scrollContainer === window;
    }
    const t = duration ? Math.min(1, elapsed / duration) : 1;
    const eased = easeOutCubic(t);
    // Keep moving toward the last known position while virtualization remounts
    // the target. A detached node has no usable bounding rectangle.
    if (node.isConnected) lastTarget = computeTargetPosition(node, scrollContainer, containerIsWindow);
    const next = start + (lastTarget - start) * eased;
    if (Math.abs(getScroll() - next) > 1) setScroll(next);

    if (elapsed < duration + SCROLL_SETTLE_DURATION) {
      frame = requestAnimationFrame(step);
    } else {
      cleanup();
    }
  };

  frame = requestAnimationFrame(step);
};

const scrollNodeIntoViewWithOffset = (node: HTMLElement, resolveTarget?: () => HTMLElement | undefined) => {
  const scrollContainer = findScrollContainer(node);
  const containerIsWindow = scrollContainer === window;
  const targetPosition = computeTargetPosition(node, scrollContainer, containerIsWindow);

  smoothScroll(scrollContainer, targetPosition, node, resolveTarget);

  return { scrollContainer, targetPosition };
};

export const highlightNode = (node: HTMLElement) => {
  // Add highlight with animation
  node.classList.add('scroll-pro-highlight', 'scroll-pro-highlight-active');

  // Trigger fade out after 1.5s
  setTimeout(() => {
    node.classList.remove('scroll-pro-highlight-active');
    // Remove base class after animation completes (0.5s transition)
    setTimeout(() => node.classList.remove('scroll-pro-highlight'), 500);
  }, 1500);
};

export const scrollToElement = (element: HTMLElement | undefined, resolveTarget?: () => HTMLElement | undefined) => {
  if (!element?.isConnected) return;
  scrollNodeIntoViewWithOffset(element, resolveTarget);
};
