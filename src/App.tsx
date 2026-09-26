import { useState, useEffect, useCallback } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import Sidebar from './components/Sidebar';
import { Toast } from './components/Toast';
import { useChatTurns } from './hooks/useChatTurns';
import { useShortcuts } from './hooks/useShortcuts';

/** Check if the current URL is an active chat page (not settings, home, etc.) */
function checkIsChatPage(providerName: string): boolean {
  const path = window.location.pathname;
  switch (providerName) {
    case 'chatgpt':
      // /c/{id} or /g/{id} (GPT chats)
      return /^\/(c|g)\//.test(path);
    case 'claude':
      // /chat/{id}
      return /^\/chat\//.test(path);
    case 'gemini':
      // /app/{id} (but not /app alone which is the home page)
      return /^\/app\/.+/.test(path);
    default:
      return false;
  }
}

const App = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { turns, provider, container, history, discoverHistory, cancelHistory, navigateToTurn } = useChatTurns(isSidebarOpen);
  const isProviderSupported = !!provider && ['chatgpt', 'claude', 'gemini'].includes(provider.name);

  // Track whether we're on a chat page (reactive to SPA navigation)
  const [isChatPage, setIsChatPage] = useState(() =>
    isProviderSupported ? checkIsChatPage(provider!.name) : false
  );

  const updateChatPageStatus = useCallback(() => {
    if (provider) {
      setIsChatPage(checkIsChatPage(provider.name));
    }
  }, [provider]);

  // React to URL changes (SPA navigation)
  useEffect(() => {
    if (!isProviderSupported) return;
    updateChatPageStatus();

    // MutationObserver on document catches SPA navigations (URL changes before DOM settles)
    let lastUrl = location.href;
    const observer = new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        updateChatPageStatus();
      }
    });
    observer.observe(document, { subtree: true, childList: true });

    window.addEventListener('popstate', updateChatPageStatus);
    const timer = window.setInterval(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        updateChatPageStatus();
      }
    }, 250);
    return () => {
      observer.disconnect();
      window.removeEventListener('popstate', updateChatPageStatus);
      window.clearInterval(timer);
    };
  }, [isProviderSupported, updateChatPageStatus]);

  const showSidebar = isProviderSupported && isChatPage;

  useEffect(() => {
    if (!showSidebar) setIsSidebarOpen(false);
  }, [showSidebar]);

  const toggleSidebar = useCallback(() => setIsSidebarOpen(prev => !prev), []);
  useShortcuts(showSidebar, toggleSidebar);

  return (
    <div className="font-sans text-slate-900">
      {showSidebar && (
        <ErrorBoundary>
          <Sidebar
            turns={turns}
            history={history}
            discoverHistory={discoverHistory}
            cancelHistory={cancelHistory}
            navigateToTurn={navigateToTurn}
            providerName={provider?.name || 'unknown'}
            container={container}
            isOpen={isSidebarOpen}
            isPaused={false}
            onToggle={toggleSidebar}
          />
        </ErrorBoundary>
      )}
      <ErrorBoundary>
        <Toast />
      </ErrorBoundary>
    </div>
  );
};

export default App;
