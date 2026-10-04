// Desktop shell: serves the built game from an app:// protocol (ES modules + audio need a real origin) in a full-screen window.
//   LeaveTheLightOn.exe              normal (GPU)
//   LeaveTheLightOn.exe --compat     GPU, but the simpler "compatibility" renderer (no custom HDR post-processing)
//   LeaveTheLightOn.exe --software   no GPU at all: CPU rendering (slow, but the most predictable)
const { app, BrowserWindow, protocol, net } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

const args = process.argv.slice(1);
const software = args.includes('--software');
const compat = args.includes('--compat') || software;

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetch: true, stream: true, corsEnabled: true } }]);
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
if (software) {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('use-gl', 'angle');
  app.commandLine.appendSwitch('use-angle', 'swiftshader');
  app.commandLine.appendSwitch('enable-unsafe-swiftshader');
}

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
  const q = [];
  if (compat) q.push('compat=1');
  if (software) q.push('preset=LOW', 'noprobe');   // CPU rendering is the reference: no need to test it
  win.loadURL('app://game/index.html?' + q.join('&'));
  // F11 toggles full screen; Alt+F4 / closing the window quits
  win.webContents.on('before-input-event', (e, i) => { if (i.type === 'keyDown' && i.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); } });
});
app.on('window-all-closed', () => app.quit());
