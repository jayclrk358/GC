import { contextBridge, ipcRenderer } from 'electron';

// Only the app's own pages (the loading screen, screen picker, server address, sign-in and
// offline pages, which are files inside the app) get these. Game Central itself, and any
// other site, never sees them.
if (location.protocol === 'file:') {
  contextBridge.exposeInMainWorld('desktop', {
    sources: () => ipcRenderer.invoke('picker:sources'),
    choose: (id: string, audio: boolean) => ipcRenderer.send('picker:choose', id, audio),
    cancel: () => ipcRenderer.send('local:cancel'),
    server: () => ipcRenderer.invoke('server:get'),
    setServer: (url: string) => ipcRenderer.invoke('server:set', url),
    openServerSettings: () => ipcRenderer.send('server:open'),
    loading: () => ipcRenderer.invoke('loading:get'),
    onLatest: (callback: (latest: unknown) => void) => {
      ipcRenderer.on('loading:latest', (_e, latest: unknown) => callback(latest));
    },
    signIn: () => ipcRenderer.invoke('signin:get'),
    reopenSignIn: () => ipcRenderer.send('signin:reopen'),
    signInHere: () => ipcRenderer.send('signin:here'),
    cancelSignIn: () => ipcRenderer.send('signin:cancel'),
  });
}
