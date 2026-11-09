import { Component, lazy, Suspense, useEffect, type ReactNode } from 'react';
import { Mark } from './brand/Logo';
import { CommandPalette } from './components/dialogs/CommandPalette';
import { MoveDialog } from './components/dialogs/MoveDialog';
import { NewDocDialog } from './components/dialogs/NewDocDialog';
import { SettingsDialog } from './components/dialogs/SettingsDialog';
import { SpaceDialog } from './components/dialogs/SpaceDialog';
import { Sidebar } from './components/sidebar/Sidebar';
import { TopBar } from './components/TopBar';
import { Button, cx } from './components/ui/Button';
import { EmptyState } from './components/ui/EmptyState';
import { ConfirmHost, MenuHost, ToastHost, TooltipHost } from './components/ui/Hosts';
import { SAVE_EVENT } from './lib/events';
import { navigate, paths, useRoute, type Route } from './lib/router';
import { openNewDocDialog } from './state/actions';
import { useConfirm, useMenu } from './state/feedback';
import { resolveTheme, useSettings } from './state/settings';
import { useUI } from './state/ui';
import { useWorkspace, WorkspaceProvider } from './state/workspace';
import { CalendarView } from './views/CalendarView';
import { ContentView } from './views/ContentView';
import { HomeView } from './views/HomeView';
import { PipelineView } from './views/PipelineView';
import { TrashView } from './views/TrashView';

// The editor (ProseMirror + TipTap) is most of the bundle; load it on demand.
const DocView = lazy(() => import('./editor/DocView'));

function useTheme() {
  const pref = useSettings((s) => s.theme);
  useEffect(() => {
    const apply = () => {
      const theme = resolveTheme(pref);
      document.documentElement.dataset.theme = theme;
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#07080a' : '#f3f3f1');
    };
    apply();
    if (pref !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [pref]);
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const mod = e.metaKey || e.ctrlKey;
      const ui = useUI.getState();
      const key = e.key.toLowerCase();
      const dialogOpen = !!(ui.newDoc || ui.spaceDialog || ui.moveItem || ui.settingsOpen || useConfirm.getState().request || useMenu.getState().menu);

      if (mod && key === 'k' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        ui.set({ paletteOpen: !ui.paletteOpen });
      } else if (mod && key === 's') {
        e.preventDefault();
        window.dispatchEvent(new Event(SAVE_EVENT));
      } else if (mod && e.key === '\\') {
        e.preventDefault();
        if (window.matchMedia('(min-width: 1024px)').matches) ui.set({ sidebarHidden: !ui.sidebarHidden });
        else ui.set({ sidebarOpen: !ui.sidebarOpen });
      } else if (mod && e.shiftKey && key === 'f') {
        if (window.location.hash.startsWith('#/doc/')) {
          e.preventDefault();
          ui.set({ focusMode: !ui.focusMode });
        }
      } else if (e.key === 'Escape' && ui.focusMode && !dialogOpen && !ui.paletteOpen) {
        ui.set({ focusMode: false });
      } else if (!mod && !e.altKey && key === 'n' && !isTyping(e.target) && !dialogOpen && !ui.paletteOpen) {
        e.preventDefault();
        openNewDocDialog();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

/** Ask the browser not to evict local data. Chromium/Safari grant silently;
 *  Firefox would show a prompt, so there it is left to Settings. */
function usePersistentStorage() {
  useEffect(() => {
    if (/firefox/i.test(navigator.userAgent)) return;
    void navigator.storage?.persisted?.().then((p) => {
      if (!p) void navigator.storage.persist?.();
    });
  }, []);
}

function Splash() {
  return (
    <div className="flex h-dvh items-center justify-center bg-frame">
      <Mark className="h-8 w-auto animate-pulse text-fg" title="Loading" />
    </div>
  );
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error(error);
  }
  render() {
    if (!this.state.error) return this.props.children;
    const storage = /indexeddb|database|quota|dexie/i.test(String(this.state.error?.message ?? '') + String(this.state.error?.name ?? ''));
    return (
      <div className="flex h-dvh items-center justify-center bg-frame px-6">
        <div className="max-w-md text-center">
          <Mark className="mx-auto mb-6 h-8 w-auto text-fg" />
          <h1 className="text-[18px] font-semibold text-fg">{storage ? 'Local storage is unavailable' : 'Something went wrong'}</h1>
          <p className="mt-2 text-[13.5px] leading-relaxed text-fg-3">
            {storage
              ? 'Infin8 Content OS keeps everything in your browser’s storage, which is blocked here — often by a private window or strict privacy settings. Open it in a normal window.'
              : 'An unexpected error interrupted the app. Your saved work is safe in this browser.'}
          </p>
          <pre className="mt-4 max-h-24 overflow-auto rounded-lg bg-sunken p-3 text-left text-[11px] text-fg-4">{String(this.state.error?.message ?? this.state.error)}</pre>
          <Button className="mt-5" variant="primary" onClick={() => window.location.reload()}>
            Reload
          </Button>
        </div>
      </div>
    );
  }
}

function RouteView({ route }: { route: Route }) {
  const ws = useWorkspace();
  switch (route.name) {
    case 'home':
      return <HomeView />;
    case 'doc':
      return (
        <Suspense fallback={<TopBar crumbs={[]} />}>
          <DocView id={route.id} />
        </Suspense>
      );
    case 'library':
      return <ContentView scope={{ kind: 'library' }} />;
    case 'pipeline':
      return <PipelineView />;
    case 'calendar':
      return <CalendarView />;
    case 'trash':
      return <TrashView />;
    case 'space': {
      const space = ws.spaceById.get(route.id);
      if (space && !space.deletedAt) return <ContentView key={space.id} scope={{ kind: 'space', space }} />;
      break;
    }
    case 'folder': {
      const folder = ws.folderById.get(route.id);
      const space = folder ? ws.spaceById.get(folder.spaceId) : undefined;
      if (folder && space && !folder.deletedAt && !space.deletedAt) return <ContentView key={folder.id} scope={{ kind: 'folder', folder, space }} />;
      break;
    }
  }
  return (
    <>
      <TopBar crumbs={[{ label: 'Not found' }]} />
      <EmptyState
        title="Nothing here"
        body="This page doesn’t exist — it may have been moved to the Trash."
        action={<Button onClick={() => navigate(paths.home())}>Go home</Button>}
      />
    </>
  );
}

function Shell() {
  const route = useRoute();
  const focusMode = useUI((s) => s.focusMode);
  const sidebarHidden = useUI((s) => s.sidebarHidden);
  const showSidebar = !focusMode;
  return (
    <div className="flex h-dvh overflow-hidden bg-frame print:block print:h-auto print:overflow-visible">
      {showSidebar && <Sidebar />}
      <main
        className={cx(
          'relative flex min-w-0 flex-1 flex-col overflow-hidden bg-canvas print:block print:overflow-visible print:border-0',
          'lg:my-2 lg:mr-2 lg:rounded-[16px] lg:border lg:border-line lg:shadow-[0_0_0_1px_rgb(0_0_0/0.2),0_20px_60px_-30px_rgb(0_0_0/0.6)]',
          (!showSidebar || sidebarHidden) && 'lg:ml-2',
        )}
      >
        <RouteView route={route} />
      </main>
      <CommandPalette />
      <NewDocDialog />
      <SpaceDialog />
      <MoveDialog />
      <SettingsDialog />
      <MenuHost />
      <ConfirmHost />
      <ToastHost />
      <TooltipHost />
    </div>
  );
}

export function App() {
  useTheme();
  useShortcuts();
  usePersistentStorage();
  return (
    <ErrorBoundary>
      <WorkspaceProvider fallback={<Splash />}>
        <Shell />
      </WorkspaceProvider>
    </ErrorBoundary>
  );
}
