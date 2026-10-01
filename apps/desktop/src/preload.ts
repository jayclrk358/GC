import { contextBridge, ipcRenderer } from 'electron';

// Only the app's own pages (the screen picker, server address and offline pages, which are files
// inside the app) get these. Magnox itself, and any other site, never sees them.
if (location.protocol === 'file:') {
  contextBridge.exposeInMainWorld('desktop', {
    sources: () => ipcRenderer.invoke('picker:sources'),
    choose: (id: string, audio: boolean) => ipcRenderer.send('picker:choose', id, audio),
    cancel: () => ipcRenderer.send('local:cancel'),
    server: () => ipcRenderer.invoke('server:get'),
    setServer: (url: string) => ipcRenderer.invoke('server:set', url),
    openServerSettings: () => ipcRenderer.send('server:open'),
  });
}
