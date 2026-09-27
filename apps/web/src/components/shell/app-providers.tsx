'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Toaster } from 'sonner';
import type { Prefs } from '@magnox/shared';
import { TooltipProvider } from '@/components/ui/tooltip';
import { PrefsProvider } from './prefs-provider';
import { ShortcutsProvider, useShortcut } from './shortcuts-provider';
import { ShortcutHelp } from './shortcut-help';

// Only a few visitors open the palette, so its code (cmdk) loads the first time it's opened.
const CommandPalette = React.lazy(() =>
  import('./command-palette').then((m) => ({ default: m.CommandPalette })),
);

const PaletteContext = React.createContext<{ openPalette: () => void; openHelp: () => void }>({
  openPalette: () => {},
  openHelp: () => {},
});

export function usePalette() {
  return React.useContext(PaletteContext);
}

function GlobalShortcuts({ signedIn, children }: { signedIn: boolean; children: React.ReactNode }) {
  const router = useRouter();
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [helpOpen, setHelpOpen] = React.useState(false);
  const [paletteUsed, setPaletteUsed] = React.useState(false);
  if (paletteOpen && !paletteUsed) setPaletteUsed(true);

  useShortcut('palette', () => setPaletteOpen((o) => !o));
  useShortcut('search', () => setPaletteOpen(true));
  useShortcut('help', () => setHelpOpen(true));
  useShortcut('go-home', () => router.push('/'));
  useShortcut('go-explore', () => router.push('/explore'));
  useShortcut('go-servers', () => router.push('/servers'));
  useShortcut('go-notifications', () => router.push('/notifications'));
  useShortcut('go-settings', () => router.push('/settings/accessibility'));

  const ctx = React.useMemo(
    () => ({ openPalette: () => setPaletteOpen(true), openHelp: () => setHelpOpen(true) }),
    [],
  );

  return (
    <PaletteContext.Provider value={ctx}>
      {children}
      {paletteUsed && (
        <React.Suspense fallback={null}>
          <CommandPalette
            open={paletteOpen}
            onOpenChange={setPaletteOpen}
            onShowShortcuts={() => setHelpOpen(true)}
            signedIn={signedIn}
          />
        </React.Suspense>
      )}
      <ShortcutHelp open={helpOpen} onOpenChange={setHelpOpen} />
    </PaletteContext.Provider>
  );
}

export function AppProviders({
  prefs,
  signedIn,
  children,
}: {
  prefs: Prefs;
  signedIn: boolean;
  children: React.ReactNode;
}) {
  return (
    <PrefsProvider initial={prefs}>
      <ShortcutsProvider>
        <TooltipProvider>
          <GlobalShortcuts signedIn={signedIn}>{children}</GlobalShortcuts>
          <Toaster
            position="bottom-right"
            closeButton
            toastOptions={{
              className: '!bg-surface !text-fg !border-border !font-sans',
            }}
          />
        </TooltipProvider>
      </ShortcutsProvider>
    </PrefsProvider>
  );
}
