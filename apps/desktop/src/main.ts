import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  app,
  BrowserWindow,
  clipboard,
  desktopCapturer,
  dialog,
  ipcMain,
  Menu,
  nativeTheme,
  session,
  shell,
  type DesktopCapturerSource,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
  type MenuItemConstructorOptions,
  type WebContents,
} from 'electron';
import { parseChangelog, type ChangelogEntry } from './changelog';
import { readSettings, savedBounds, writeSettings } from './settings';
import { handoffCode, navigationFor, originOf, serverOrigin, signInRequest } from './urls';

// Game Central for Windows: the Game Central website in its own window. Nothing of the site is bundled, so
// every update to the website shows up here straight away, with nothing to reinstall.

const STATIC = path.join(__dirname, '..', 'static');
const PRELOAD = path.join(__dirname, 'preload.js');
const page = (name: string) => path.join(STATIC, name);

/** The site the app was built for (package.json "siteUrl"). */
const BUILT_FOR: string = (() => {
  const pkg = JSON.parse(fs.readFileSync(path.join(app.getAppPath(), 'package.json'), 'utf8')) as {
    siteUrl?: string;
  };
  return serverOrigin(pkg.siteUrl ?? '') ?? 'https://gamecentral.app';
})();

let appOrigin = serverOrigin(readSettings().serverUrl ?? '') ?? BUILT_FOR;
let main: BrowserWindow | null = null;

const background = () => (nativeTheme.shouldUseDarkColors ? '#07080f' : '#f3f4fb');

// Windows needs this for notifications to show (it must match the installer's app id).
app.setAppUserModelId('com.gamecentral.desktop');

// Look like the Chrome this is, so sites (sign-in pages especially) treat it as a browser. The
// GameCentralDesktop part lets Game Central tell it's the app, should it ever need to.
app.userAgentFallback = `${app.userAgentFallback
  .replace(/ Electron\/\S+/, '')
  .replace(new RegExp(` ${app.getName()}\\/\\S+`, 'i'), '')
  .replace(/ gamecentral-desktop\/\S+/i, '')} GameCentralDesktop/${app.getVersion()}`;

// ── The window ──────────────────────────────────────────────────────────────

function createWindow(): BrowserWindow {
  const bounds = savedBounds();
  const win = new BrowserWindow({
    width: bounds?.width ?? 1280,
    height: bounds?.height ?? 820,
    x: bounds?.x,
    y: bounds?.y,
    minWidth: 400,
    minHeight: 480,
    show: false,
    title: 'Game Central',
    icon: page('icon.png'),
    backgroundColor: background(),
    // The menu (back, reload, zoom, server address...) shows when you press Alt.
    autoHideMenuBar: true,
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: true,
      // Keep voice calls and live updates running while the window is minimised.
      backgroundThrottling: false,
      // An app can make sound without a click first (browsers make websites wait), so a
      // mention is heard even if the window was opened and left in the background. The site's
      // own settings still decide what plays (sounds, and whether videos start on their own).
      autoplayPolicy: 'no-user-gesture-required',
    },
  });
  // The loading screen shows until the site has loaded (or failed to, which shows the "can't
  // reach" page), so a slow connection never looks like the app didn't open. Not 'ready-to-show':
  // that comes with the first blank frame, before the site has even answered.
  win.webContents.once('did-finish-load', () => reveal(win));
  setTimeout(() => reveal(win), 30_000);
  win.on('close', () => {
    writeSettings({ bounds: win.getNormalBounds(), maximized: win.isMaximized() });
  });
  // The mouse's back and forward buttons.
  win.on('app-command', (_e, command) => {
    const history = win.webContents.navigationHistory;
    if (command === 'browser-backward' && history.canGoBack()) history.goBack();
    if (command === 'browser-forward' && history.canGoForward()) history.goForward();
  });
  guard(win.webContents);
  addContextMenu(win);
  win.webContents.on('did-fail-load', (_e, code, description, url, isMainFrame) => {
    // -3 is a cancelled load (a download, or a link sent to the browser): nothing went wrong.
    if (!isMainFrame || code === -3 || url.startsWith('file:')) return;
    void win.loadFile(page('offline.html'), { query: { url, error: description } });
  });
  win.webContents.on('render-process-gone', (_e, details) => {
    if (details.reason !== 'clean-exit') win.webContents.reload();
  });
  void win.loadURL(appOrigin);
  return win;
}

/**
 * A sign-in request from the main window's sign-in or sign-up page (where the Discord, Google
 * and Twitch buttons are), so a link to it posted anywhere else can't take the window over.
 */
function signInRequestFrom(contents: WebContents, url: string) {
  if (contents !== main?.webContents) return null;
  const from = new URL(contents.getURL() || 'about:blank');
  if (from.origin !== appOrigin || !['/sign-in', '/sign-up'].includes(from.pathname)) return null;
  return signInRequest(url, appOrigin);
}

/** Keep a window on Game Central (and its sign-in pages); everything else goes to the browser. */
function guard(contents: WebContents) {
  const check = (e: Electron.Event, url: string) => {
    // The site asking to sign in with Discord, Google or Twitch: that happens in the browser.
    const request = signInRequestFrom(contents, url);
    if (request) {
      e.preventDefault();
      startBrowserSignIn(request.provider, request.next);
      return;
    }
    const where = navigationFor(url, appOrigin);
    if (where === 'allow') return;
    e.preventDefault();
    if (where === 'external') void shell.openExternal(url);
  };
  contents.on('will-navigate', (e) => check(e, e.url));
  contents.on('will-redirect', (e) => check(e, e.url));
  contents.setWindowOpenHandler(({ url }) => {
    const request = signInRequestFrom(contents, url);
    if (request) {
      startBrowserSignIn(request.provider, request.next);
      return { action: 'deny' };
    }
    const where = navigationFor(url, appOrigin);
    if (where === 'allow') void contents.loadURL(url);
    else if (where === 'external') void shell.openExternal(url);
    return { action: 'deny' };
  });
}

function addContextMenu(win: BrowserWindow) {
  const contents = win.webContents;
  contents.on('context-menu', (_e, p) => {
    const items: MenuItemConstructorOptions[] = [];
    const separate = () => {
      if (items.length && items.at(-1)?.type !== 'separator') items.push({ type: 'separator' });
    };
    for (const word of p.dictionarySuggestions.slice(0, 5)) {
      items.push({ label: word, click: () => contents.replaceMisspelling(word) });
    }
    if (p.misspelledWord) {
      items.push({
        label: 'Add to dictionary',
        click: () => contents.session.addWordToSpellCheckerDictionary(p.misspelledWord),
      });
    }
    separate();
    if (/^(https?|mailto):/.test(p.linkURL)) {
      items.push(
        { label: 'Open link in browser', click: () => void shell.openExternal(p.linkURL) },
        { label: 'Copy link address', click: () => clipboard.writeText(p.linkURL) },
      );
      separate();
    }
    if (p.mediaType === 'image' && /^https?:/.test(p.srcURL)) {
      items.push(
        { label: 'Copy image', click: () => contents.copyImageAt(p.x, p.y) },
        { label: 'Save image as…', click: () => contents.downloadURL(p.srcURL) },
      );
      separate();
    }
    if (p.isEditable) {
      items.push(
        { role: 'cut', enabled: p.editFlags.canCut },
        { role: 'copy', enabled: p.editFlags.canCopy },
        { role: 'paste', enabled: p.editFlags.canPaste },
        { role: 'selectAll' },
      );
    } else if (p.selectionText.trim()) {
      items.push({ role: 'copy' });
    }
    if (items.at(-1)?.type === 'separator') items.pop();
    if (items.length) Menu.buildFromTemplate(items).popup({ window: win });
  });
}

// ── The loading screen ──────────────────────────────────────────────────────

let splash: BrowserWindow | null = null;
let revealed = false;

/** A small window with the logo while the site loads, instead of an empty one. */
function showSplash() {
  const win = new BrowserWindow({
    width: 360,
    height: 420,
    frame: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    center: true,
    show: false,
    title: 'Game Central',
    icon: page('icon.png'),
    backgroundColor: background(),
    webPreferences: { preload: PRELOAD, contextIsolation: true, sandbox: true },
  });
  splash = win;
  win.once('ready-to-show', () => {
    if (!revealed) win.show();
  });
  win.on('closed', () => {
    splash = null;
    // Closed (Alt+F4) before Game Central appeared: they've changed their mind.
    if (!revealed) app.quit();
  });
  guard(win.webContents);
  void win.loadFile(page('loading.html'));
}

/** Swap the loading screen for the main window, once. */
function reveal(win: BrowserWindow) {
  if (revealed || win.isDestroyed()) return;
  revealed = true;
  if (readSettings().maximized) win.maximize();
  win.show();
  splash?.close();
  setTimeout(() => void showWhatsNewIfUpdated(), 1500);
}

// ── Permissions: the microphone, screen sharing and notifications, for Game Central only ──────────

const ALLOWED = new Set([
  'media',
  'display-capture',
  'notifications',
  'clipboard-sanitized-write',
  'fullscreen',
  'speaker-selection',
  'screen-wake-lock',
]);

/**
 * Check spelling in the languages Windows is set to. The app only carries the interface
 * languages the site comes in, so it can't rely on its own language for this.
 */
function useSystemSpellingLanguages(ses: Electron.Session) {
  try {
    const available = ses.availableSpellCheckerLanguages;
    const base = (code: string) => code.toLowerCase().split('-')[0];
    const pick = (wanted: string) =>
      available.find((a) => a.toLowerCase() === wanted.toLowerCase()) ??
      available.find((a) => base(a) === base(wanted));
    const languages = [
      ...new Set(
        app
          .getPreferredSystemLanguages()
          .map(pick)
          .filter((l): l is string => !!l),
      ),
    ];
    if (languages.length) ses.setSpellCheckerLanguages(languages.slice(0, 3));
  } catch (err) {
    console.error('Could not set spelling languages:', err);
  }
}

function setUpSession() {
  const ses = session.defaultSession;
  useSystemSpellingLanguages(ses);
  ses.setPermissionRequestHandler((_contents, permission, callback, details) => {
    callback(originOf(details.requestingUrl) === appOrigin && ALLOWED.has(permission));
  });
  ses.setPermissionCheckHandler(
    (_contents, permission, origin) => originOf(origin) === appOrigin && ALLOWED.has(permission),
  );
  ses.setDisplayMediaRequestHandler((request, callback) => {
    // Electron refuses the request when given null (its types don't say so).
    const refuse = () => callback(null as unknown as Electron.Streams);
    if (originOf(request.securityOrigin) !== appOrigin || !main) return refuse();
    void pickSource(main, request.audioRequested).then((choice) => {
      if (!choice) return refuse();
      callback(
        choice.audio ? { video: choice.source, audio: 'loopback' } : { video: choice.source },
      );
    });
  });
  // Show download progress on the taskbar button.
  ses.on('will-download', (_e, item) => {
    item.on('updated', () => {
      const total = item.getTotalBytes();
      main?.setProgressBar(total ? item.getReceivedBytes() / total : 2);
    });
    item.once('done', () => main?.setProgressBar(-1));
  });
}

// ── Screen sharing: choose a screen or window ───────────────────────────────

interface Picker {
  win: BrowserWindow;
  sources: DesktopCapturerSource[];
  audio: boolean;
  finish: (choice: { source: DesktopCapturerSource; audio: boolean } | null) => void;
}
let picker: Picker | null = null;

async function pickSource(parent: BrowserWindow, audioRequested: boolean) {
  if (picker) return null; // One at a time.
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 320, height: 180 },
  });
  return new Promise<{ source: DesktopCapturerSource; audio: boolean } | null>((resolve) => {
    const win = new BrowserWindow({
      parent,
      modal: true,
      width: 780,
      height: 600,
      minWidth: 420,
      minHeight: 360,
      show: false,
      title: 'Share your screen',
      icon: page('icon.png'),
      backgroundColor: background(),
      autoHideMenuBar: true,
      minimizable: false,
      maximizable: false,
      webPreferences: { preload: PRELOAD, contextIsolation: true, sandbox: true },
    });
    const state: Picker = {
      win,
      sources,
      audio: audioRequested,
      finish: (choice) => {
        if (picker !== state) return;
        picker = null;
        resolve(choice);
        if (!win.isDestroyed()) win.close();
      },
    };
    picker = state;
    win.on('closed', () => state.finish(null));
    win.once('ready-to-show', () => win.show());
    guard(win.webContents);
    void win.loadFile(page('picker.html'));
  });
}

// ── Choosing another server ─────────────────────────────────────────────────

let serverWindow: BrowserWindow | null = null;

function openServerSettings() {
  if (serverWindow) return serverWindow.focus();
  const win = new BrowserWindow({
    parent: main ?? undefined,
    modal: Boolean(main),
    width: 600,
    height: 340,
    resizable: false,
    minimizable: false,
    maximizable: false,
    show: false,
    title: 'Server address',
    icon: page('icon.png'),
    backgroundColor: background(),
    autoHideMenuBar: true,
    webPreferences: { preload: PRELOAD, contextIsolation: true, sandbox: true },
  });
  serverWindow = win;
  win.on('closed', () => (serverWindow = null));
  win.once('ready-to-show', () => win.show());
  guard(win.webContents);
  void win.loadFile(page('server.html'));
}

// Messages from the app's own pages only (never from a website).
function fromOwnPage(e: IpcMainEvent | IpcMainInvokeEvent): boolean {
  const url = e.senderFrame?.url ?? '';
  return url.startsWith('file:') && url.includes('/static/');
}

ipcMain.handle('picker:sources', (e) => {
  if (!fromOwnPage(e) || !picker || e.sender !== picker.win.webContents) return null;
  return {
    audio: picker.audio,
    sources: picker.sources.map((s) => ({
      id: s.id,
      name: s.name,
      screen: s.id.startsWith('screen:'),
      thumbnail: s.thumbnail.toDataURL(),
    })),
  };
});

ipcMain.on('picker:choose', (e, id: unknown, audio: unknown) => {
  if (!fromOwnPage(e) || !picker || e.sender !== picker.win.webContents) return;
  const source = picker.sources.find((s) => s.id === id);
  // Windows can only share the computer's sound along with a whole screen.
  if (source) picker.finish({ source, audio: audio === true && source.id.startsWith('screen:') });
});

ipcMain.on('local:cancel', (e) => {
  if (!fromOwnPage(e)) return;
  BrowserWindow.fromWebContents(e.sender)?.close();
});

ipcMain.handle('server:get', (e) =>
  fromOwnPage(e) ? { current: appOrigin, builtFor: BUILT_FOR } : null,
);

ipcMain.handle('server:set', (e, input: unknown) => {
  if (!fromOwnPage(e) || typeof input !== 'string') return 'Something went wrong.';
  const origin = serverOrigin(input);
  if (!origin) return 'Enter a web address, like gamecentral.example.com.';
  appOrigin = origin;
  writeSettings({ serverUrl: origin === BUILT_FOR ? undefined : origin });
  void main?.loadURL(origin);
  BrowserWindow.fromWebContents(e.sender)?.close();
  return null;
});

ipcMain.on('server:open', (e) => {
  if (fromOwnPage(e)) openServerSettings();
});

// ── Signing in with Discord, Google or Twitch, through the browser ─────────────
//
// People are usually signed in to these in their browser already, and Google refuses to sign in
// inside apps. So the app opens the browser at the site's /desktop/sign-in page with a challenge
// (the SHA-256 of a secret only this app knows); once signed in there, the browser hands back a
// one-time code through a gamecentral://auth link, which the app trades, with the secret, for a
// session of its own. See packages/auth/src/desktop-handoff.ts on the site.

const PROTOCOL = 'gamecentral';
const PROVIDERS: Record<string, string> = {
  discord: 'Discord',
  google: 'Google',
  twitch: 'Twitch',
};
const SIGN_IN_MINUTES = 10;

interface PendingSignIn {
  verifier: string;
  origin: string;
  provider: string;
  next: string;
  started: number;
  redeeming: boolean;
  error?: string;
}
let pendingSignIn: PendingSignIn | null = null;

function browserSignInUrl(p: PendingSignIn): string {
  const challenge = createHash('sha256').update(p.verifier).digest('base64url');
  return `${p.origin}/desktop/sign-in?${new URLSearchParams({ provider: p.provider, challenge })}`;
}

function startBrowserSignIn(provider: string, next: string) {
  if (!Object.hasOwn(PROVIDERS, provider) || !main) return;
  pendingSignIn = {
    verifier: randomBytes(32).toString('base64url'),
    origin: appOrigin,
    provider,
    next,
    started: Date.now(),
    redeeming: false,
  };
  openBrowser(pendingSignIn);
  void main.loadFile(page('browser-sign-in.html'));
}

function openBrowser(p: PendingSignIn) {
  shell.openExternal(browserSignInUrl(p)).catch(() => {
    if (pendingSignIn !== p) return;
    p.error = 'Your browser didn’t open. Try again, or sign in in this window instead.';
    void main?.loadFile(page('browser-sign-in.html'));
  });
}

/** A gamecentral:// link, from the browser by way of Windows. */
function handleLink(url: string) {
  const code = handoffCode(url);
  const p = pendingSignIn;
  if (!code || !p || p.redeeming) return;
  if (Date.now() - p.started > SIGN_IN_MINUTES * 60_000 || p.origin !== appOrigin) {
    pendingSignIn = null;
    return;
  }
  p.redeeming = true;
  void redeem(p, code);
}

async function redeem(p: PendingSignIn, code: string) {
  let ok = false;
  try {
    // The session cookie it sets lands in the app's own cookie store.
    const res = await session.defaultSession.fetch(`${p.origin}/api/auth/desktop/redeem`, {
      method: 'POST',
      // Says it comes from the site itself, as Better Auth wants whenever cookies go with it.
      headers: { 'content-type': 'application/json', origin: p.origin },
      body: JSON.stringify({ code, verifier: p.verifier }),
      credentials: 'include',
      cache: 'no-store',
    });
    ok = res.ok;
  } catch {
    ok = false;
  }
  p.redeeming = false;
  if (pendingSignIn !== p) return;
  if (ok) {
    pendingSignIn = null;
    void main?.loadURL(new URL(p.next, p.origin).toString());
  } else {
    p.error = 'Signing in didn’t finish. Please try again in your browser.';
    void main?.loadFile(page('browser-sign-in.html'));
  }
}

function registerProtocol() {
  if (process.defaultApp) {
    // Run with `electron .` (while working on the app): Windows must start Electron with it.
    if (process.argv[1]) {
      app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
    }
  } else if (!app.isDefaultProtocolClient(PROTOCOL)) {
    // The installer registers it; this covers a copy run without installing.
    app.setAsDefaultProtocolClient(PROTOCOL);
  }
}

ipcMain.handle('signin:get', (e) => {
  if (!fromOwnPage(e) || e.sender !== main?.webContents || !pendingSignIn) return null;
  return { provider: PROVIDERS[pendingSignIn.provider], error: pendingSignIn.error ?? null };
});

ipcMain.on('signin:reopen', (e) => {
  if (!fromOwnPage(e) || e.sender !== main?.webContents || !pendingSignIn) return;
  pendingSignIn.error = undefined;
  openBrowser(pendingSignIn);
});

/** Sign in inside the app after all (the site's page signs in right there without a challenge). */
ipcMain.on('signin:here', (e) => {
  if (!fromOwnPage(e) || e.sender !== main?.webContents || !pendingSignIn) return;
  const { origin, provider, next } = pendingSignIn;
  pendingSignIn = null;
  void main.loadURL(`${origin}/desktop/sign-in?${new URLSearchParams({ provider, next })}`);
});

ipcMain.on('signin:cancel', (e) => {
  if (!fromOwnPage(e) || e.sender !== main?.webContents) return;
  const next = pendingSignIn?.next ?? '/';
  pendingSignIn = null;
  void main.loadURL(`${appOrigin}/sign-in?${new URLSearchParams({ next })}`);
});

// ── What's new ──────────────────────────────────────────────────────────────

let whatsNewWindow: BrowserWindow | null = null;
/** Someone who used the app before this version (a fresh install has nothing to catch up on). */
const updatedFromEarlier = Boolean(readSettings().bounds) && !readSettings().seenChangelog;

const latestOf = (entries: ChangelogEntry[] | undefined) =>
  entries?.[0] ? { title: entries[0].title, date: entries[0].date } : null;

function cachedChangelog(): ChangelogEntry[] {
  return parseChangelog({ entries: readSettings().changelog }) ?? [];
}

/** The site's latest updates, kept for next time. */
async function refreshChangelog(): Promise<ChangelogEntry[] | null> {
  try {
    const res = await session.defaultSession.fetch(`${appOrigin}/api/changelog`, {
      credentials: 'omit',
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    const body = res.ok ? await readCapped(res, 256 * 1024) : null;
    if (!body) return null;
    const entries = parseChangelog(JSON.parse(body));
    if (entries) writeSettings({ changelog: entries });
    return entries;
  } catch {
    return null;
  }
}

/** A response's text, or null if it's bigger than `max` bytes (stops reading as soon as it is). */
async function readCapped(res: Response, max: number): Promise<string | null> {
  if (Number(res.headers.get('content-length') ?? 0) > max) return null;
  const reader = res.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      void reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function showWhatsNewIfUpdated() {
  const entries = (await refreshChangelog()) ?? cachedChangelog();
  const newest = entries[0]?.id;
  if (!newest) return;
  const seen = readSettings().seenChangelog;
  if (seen === newest) return;
  if (seen || updatedFromEarlier) openWhatsNew();
  else writeSettings({ seenChangelog: newest });
}

function openWhatsNew() {
  if (whatsNewWindow) return whatsNewWindow.focus();
  const newest = cachedChangelog()[0]?.id;
  if (newest) writeSettings({ seenChangelog: newest });
  const win = new BrowserWindow({
    parent: main ?? undefined,
    width: 560,
    height: 640,
    minWidth: 380,
    minHeight: 360,
    show: false,
    title: 'What’s new',
    icon: page('icon.png'),
    backgroundColor: background(),
    autoHideMenuBar: true,
    minimizable: false,
    maximizable: false,
    webPreferences: { preload: PRELOAD, contextIsolation: true, sandbox: true },
  });
  whatsNewWindow = win;
  win.on('closed', () => (whatsNewWindow = null));
  win.once('ready-to-show', () => win.show());
  guard(win.webContents);
  void win.loadFile(page('whats-new.html'));
}

ipcMain.handle('changelog:get', async (e) =>
  fromOwnPage(e) && e.sender === whatsNewWindow?.webContents
    ? { entries: (await refreshChangelog()) ?? cachedChangelog() }
    : null,
);

ipcMain.on('changelog:open', (e) => {
  if (!fromOwnPage(e) || e.sender !== whatsNewWindow?.webContents) return;
  void main?.loadURL(`${appOrigin}/changelog`);
  whatsNewWindow.close();
});

ipcMain.handle('loading:get', (e) =>
  fromOwnPage(e) && e.sender === splash?.webContents
    ? {
        host: new URL(appOrigin).host,
        version: app.getVersion(),
        latest: latestOf(cachedChangelog()),
      }
    : null,
);

// ── Menu (press Alt to show it) ─────────────────────────────────────────────

function buildMenu() {
  const contents = () => main?.webContents;
  const template: MenuItemConstructorOptions[] = [
    {
      label: '&File',
      submenu: [
        { label: 'Server address…', click: openServerSettings },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    {
      label: '&View',
      submenu: [
        {
          label: 'Back',
          accelerator: 'Alt+Left',
          click: () => contents()?.navigationHistory.goBack(),
        },
        {
          label: 'Forward',
          accelerator: 'Alt+Right',
          click: () => contents()?.navigationHistory.goForward(),
        },
        { label: 'Home', accelerator: 'Alt+Home', click: () => void main?.loadURL(appOrigin) },
        { type: 'separator' },
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: () => contents()?.reload() },
        {
          label: 'Reload without cache',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: () => contents()?.reloadIgnoringCache(),
        },
        { type: 'separator' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { role: 'resetZoom' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'toggleDevTools' },
      ],
    },
    {
      label: '&Help',
      submenu: [
        { label: 'What’s new', click: openWhatsNew },
        { type: 'separator' },
        {
          label: 'Open this page in your browser',
          click: () => {
            const url = contents()?.getURL() ?? '';
            if (/^https?:/.test(url)) void shell.openExternal(url);
          },
        },
        {
          label: 'About Game Central',
          click: () =>
            void dialog.showMessageBox({
              type: 'info',
              title: 'About Game Central',
              message: `Game Central for Windows ${app.getVersion()}`,
              detail: `Showing ${appOrigin}\nElectron ${process.versions.electron}, Chrome ${process.versions.chrome}`,
            }),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ── Start ───────────────────────────────────────────────────────────────────

if (!app.requestSingleInstanceLock()) {
  // Already open: that copy comes to the front instead (see 'second-instance').
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    if (main) {
      if (main.isMinimized()) main.restore();
      main.focus();
    }
    // Windows starts a second copy for a gamecentral:// link; it hands the link over and quits.
    const link = argv.find((arg) => arg.startsWith(`${PROTOCOL}:`));
    if (link) handleLink(link);
  });
  app.on('window-all-closed', () => app.quit());
  void app.whenReady().then(() => {
    registerProtocol();
    setUpSession();
    buildMenu();
    showSplash();
    // The latest update for the loading screen, in case it's newer than the remembered one.
    void refreshChangelog().then((entries) => {
      if (entries) splash?.webContents.send('loading:latest', latestOf(entries));
    });
    main = createWindow();
    main.on('closed', () => (main = null));
  });
}
