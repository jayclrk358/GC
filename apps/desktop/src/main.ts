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
import { readSettings, savedBounds, writeSettings } from './settings';
import { navigationFor, originOf, serverOrigin } from './urls';

// Magnox for Windows: the Magnox website in its own window. Nothing of the site is bundled, so
// every update to the website shows up here straight away, with nothing to reinstall.

const STATIC = path.join(__dirname, '..', 'static');
const PRELOAD = path.join(__dirname, 'preload.js');
const page = (name: string) => path.join(STATIC, name);

/** The site the app was built for (package.json "magnoxUrl"). */
const BUILT_FOR: string = (() => {
  const pkg = JSON.parse(fs.readFileSync(path.join(app.getAppPath(), 'package.json'), 'utf8')) as {
    magnoxUrl?: string;
  };
  return serverOrigin(pkg.magnoxUrl ?? '') ?? 'https://magnoxresources.com';
})();

let appOrigin = serverOrigin(readSettings().serverUrl ?? '') ?? BUILT_FOR;
let main: BrowserWindow | null = null;

const background = () => (nativeTheme.shouldUseDarkColors ? '#07080f' : '#f3f4fb');

// Windows needs this for notifications to show (it must match the installer's app id).
app.setAppUserModelId('com.magnox.desktop');

// Look like the Chrome this is, so sites (sign-in pages especially) treat it as a browser. The
// MagnoxDesktop part lets Magnox tell it's the app, should it ever need to.
app.userAgentFallback = `${app.userAgentFallback
  .replace(/ Electron\/\S+/, '')
  .replace(new RegExp(` ${app.getName()}\\/\\S+`, 'i'), '')
  .replace(/ magnox-desktop\/\S+/i, '')} MagnoxDesktop/${app.getVersion()}`;

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
    title: 'Magnox',
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
    },
  });
  // Shown straight away (in the site's background colour) rather than once the site has drawn,
  // so a slow connection doesn't look like the app failed to open.
  if (readSettings().maximized) win.maximize();
  win.show();
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

/** Keep a window on Magnox (and its sign-in pages); everything else goes to the browser. */
function guard(contents: WebContents) {
  const check = (e: Electron.Event, url: string) => {
    const where = navigationFor(url, appOrigin);
    if (where === 'allow') return;
    e.preventDefault();
    if (where === 'external') void shell.openExternal(url);
  };
  contents.on('will-navigate', (e) => check(e, e.url));
  contents.on('will-redirect', (e) => check(e, e.url));
  contents.setWindowOpenHandler(({ url }) => {
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

// ── Permissions: the microphone, screen sharing and notifications, for Magnox only ──────────

const ALLOWED = new Set([
  'media',
  'display-capture',
  'notifications',
  'clipboard-sanitized-write',
  'fullscreen',
  'speaker-selection',
  'screen-wake-lock',
]);

function setUpSession() {
  const ses = session.defaultSession;
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
  if (!origin) return 'Enter a web address, like magnox.example.com.';
  appOrigin = origin;
  writeSettings({ serverUrl: origin === BUILT_FOR ? undefined : origin });
  void main?.loadURL(origin);
  BrowserWindow.fromWebContents(e.sender)?.close();
  return null;
});

ipcMain.on('server:open', (e) => {
  if (fromOwnPage(e)) openServerSettings();
});

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
        {
          label: 'Open this page in your browser',
          click: () => {
            const url = contents()?.getURL() ?? '';
            if (/^https?:/.test(url)) void shell.openExternal(url);
          },
        },
        {
          label: 'About Magnox',
          click: () =>
            void dialog.showMessageBox({
              type: 'info',
              title: 'About Magnox',
              message: `Magnox for Windows ${app.getVersion()}`,
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
  app.on('second-instance', () => {
    if (!main) return;
    if (main.isMinimized()) main.restore();
    main.focus();
  });
  app.on('window-all-closed', () => app.quit());
  void app.whenReady().then(() => {
    setUpSession();
    buildMenu();
    main = createWindow();
    main.on('closed', () => (main = null));
  });
}
