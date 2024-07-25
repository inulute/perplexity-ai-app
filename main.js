const { app, BrowserWindow, shell, globalShortcut } = require('electron');
const path = require('path');

app.allowRendererProcessReuse = true;

let windows = {};
let mainWindow;

const createWindow = (name, url) => {
  const win = new BrowserWindow({
    width: 1000,
    height: 758,
    backgroundColor: "#272829",
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    autoHideMenuBar: true,
  });

  win.loadURL(url);

  // Handle external links
  win.webContents.setWindowOpenHandler(({ url }) => {
    const isExternal = /^https?:\/\//i.test(url);

    if (isExternal) {
      shell.openExternal(url).catch(err => console.error('Failed to open URL:', err));
      return { action: 'deny' }; // Prevent Electron from creating a new window
    }

    return { action: 'allow' }; // Allow internal links to open in the window
  });

  win.on('closed', () => {
    windows[name] = null;
  });

  return win;
};

const minimizeAllWindows = () => {
  for (const key in windows) {
    if (windows[key]) {
      windows[key].minimize();
    }
  }
};

const restoreAllWindows = () => {
  for (const key in windows) {
    if (windows[key] && windows[key].isMinimized()) {
      windows[key].restore();
    }
  }
};

const areAllWindowsMinimized = () => {
  return Object.values(windows).every(win => win && win.isMinimized());
};

app.on('ready', () => {
  // Create the main window
  mainWindow = createWindow('main', 'file://' + path.join(__dirname, 'initial.html'));
  windows['main'] = mainWindow;

  // Open all external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const isExternal = /^https?:\/\//i.test(url);

    if (isExternal) {
      shell.openExternal(url).catch(err => console.error('Failed to open URL:', err));
      return { action: 'deny' }; // Prevent Electron from creating a new window
    }

    return { action: 'allow' }; // Allow internal links to open in the window
  });

  // Handle URL redirections
  mainWindow.webContents.on('did-navigate', (event, url) => {
    if (url.includes('https://www.perplexity.ai/auth/verify-request')) {
      mainWindow.loadFile(path.join(__dirname, 'url-open.html'));
    }
  });

  mainWindow.webContents.on('did-navigate-in-page', (event, url) => {
    if (url.includes('https://www.perplexity.ai/auth/verify-request')) {
      mainWindow.loadFile(path.join(__dirname, 'url-open.html'));
    }
  });

  // Minimize or restore all windows
  globalShortcut.register('CmdOrCtrl+M', () => {
    if (areAllWindowsMinimized()) {
      restoreAllWindows();
    } else {
      minimizeAllWindows();
    }
  });

  // Open or restore Perplexity Labs
  globalShortcut.register('CmdOrCtrl+7', () => {
    if (windows['labs']) {
      windows['labs'].restore();
      windows['labs'].focus();
    } else {
      windows['labs'] = createWindow('labs', 'https://labs.perplexity.ai');
    }
  });

  // Open or restore Perplexity AI
  globalShortcut.register('CmdOrCtrl+6', () => {
    if (windows['ai']) {
      windows['ai'].restore();
      windows['ai'].focus();
    } else {
      windows['ai'] = createWindow('ai', 'https://perplexity.ai');
    }
  });

  mainWindow.on('closed', () => {
    windows['main'] = null;
  });
});

app.on('window-all-closed', () => {
  app.quit();
});
