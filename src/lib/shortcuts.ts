export const TOGGLE_SIDEBAR_KEY = ';';

type ShortcutEvent = Pick<KeyboardEvent,
  'key' | 'repeat' | 'isComposing' | 'keyCode' | 'altKey' | 'shiftKey' | 'metaKey' | 'ctrlKey'>;

export function matchesToggleSidebar(event: ShortcutEvent, isMac: boolean): boolean {
  return event.key === TOGGLE_SIDEBAR_KEY &&
    !event.repeat &&
    !event.isComposing &&
    event.keyCode !== 229 &&
    !event.altKey &&
    !event.shiftKey &&
    (isMac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey);
}
