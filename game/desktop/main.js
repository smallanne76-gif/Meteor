// Desktop shell: serves the built game from an app:// protocol (ES modules + audio need a real origin) in a full-screen window.
const { app, BrowserWindow, protocol, net, globalShortcut } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetch: true, stream: true, corsEnabled: true } }]);
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('ignore-gpu-blocklist');

const root = path.join(__dirname, 'game');

app.whenReady().then(() => {
  protocol.handle('app', (req) => {
    const p = decodeURIComponent(new URL(req.url).pathname);
    const file = path.normalize(path.join(root, p === '/' ? 'index.html' : p));
    if (!file.startsWith(root)) return new Response('forbidden', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
  const win = new BrowserWindow({ fullscreen: true, backgroundColor: '#000000', autoHideMenuBar: true, title: 'Leave the Light On', webPreferences: { backgroundThrottling: false } });
  win.setMenuBarVisibility(false);
  win.loadURL('app://game/index.html?skipwarn=0');
  // F11 toggles full screen; Alt+F4 / closing the window quits
  win.webContents.on('before-input-event', (e, i) => { if (i.type === 'keyDown' && i.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); } });
});
app.on('window-all-closed', () => app.quit());
