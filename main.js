// main.js

const { app, BrowserWindow, ipcMain, BrowserView, Menu, globalShortcut, Tray, shell, net } = require('electron');
const path = require('path');
const Store = require('electron-store');
const settings = new Store();

const isMac = process.platform === 'darwin';

let mainWindow;
let currentView;
let views = {};
let tray = null;
let settingsWindow = null;
let updateWindow = null;

const defaultShortcuts = isMac
  ? {
      perplexityAI: 'Command+1',
      perplexityLabs: 'Command+2',
      minimizeApp: 'Command+M',
      sendToTray: 'Command+T',
      restoreApp: 'Command+Shift+T',
      reload: 'Command+R',
    }
  : {
      perplexityAI: 'Control+1',
      perplexityLabs: 'Control+2',
      minimizeApp: 'Control+M',
      sendToTray: 'Control+T',
      restoreApp: 'Control+Shift+T',
      reload: 'Control+R',
    };

let shortcuts = settings.get('shortcuts', defaultShortcuts);
let shortcutEnabled = settings.get('shortcutEnabled', true);

function registerShortcuts() {
  if (!shortcutEnabled) return; 
  globalShortcut.unregisterAll();

  const shortcutActions = {
    perplexityAI: () => switchView('https://perplexity.ai'),
    perplexityLabs: () => switchView('https://labs.perplexity.ai'),
    minimizeApp: () => mainWindow.minimize(),
    sendToTray: () => mainWindow.hide(),
    restoreApp: () => {
      if (mainWindow.isMinimized() || !mainWindow.isVisible()) {
        mainWindow.show();
        mainWindow.focus();
      }
    },
    reload: () => {
      if (currentView) {
        currentView.webContents.reload();
      }
    },
  };

  for (const [key, shortcut] of Object.entries(shortcuts)) {
    if (shortcutActions[key]) {
      globalShortcut.register(shortcut, shortcutActions[key]);
    }
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'src', 'js', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  Menu.setApplicationMenu(null);

  mainWindow.loadFile('index.html').catch(console.error);

  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.show();
    registerShortcuts();
    loadDefaultAI();
    checkForUpdates();
  });

  mainWindow.on('resize', adjustViewBounds);

  mainWindow.on('close', (event) => {
     const choice = require('electron').dialog.showMessageBoxSync(mainWindow, {
       type: 'question',
      buttons: ['Yes', 'No'],
      title: 'Confirm',
    message: 'Are you sure you want to quit?'
    });
    if (choice !== 0) {
     event.preventDefault();
     return;
     }
  });
  
}

function loadDefaultAI() {
  const defaultAI = settings.get('defaultAI', 'https://perplexity.ai');
  switchView(defaultAI);
}

function adjustViewBounds() {
  if (currentView) {
    const bounds = mainWindow.getContentBounds();
    const sidebarWidth = 60;
    currentView.setBounds({
      x: sidebarWidth,
      y: 0,
      width: bounds.width - sidebarWidth,
      height: bounds.height,
    });
  }
}

function switchView(url) {
  if (url === 'refresh' && currentView) {
    currentView.webContents.reload();
    return;
  }

  if (currentView) {
    mainWindow.removeBrowserView(currentView);
  }

  if (views[url]) {
    currentView = views[url];
  } else {
    currentView = new BrowserView({
      webPreferences: {
        contextIsolation: true,
        preload: path.join(__dirname, 'src', 'js', 'preload', 'preload_inject.js'),
      },
    });
    currentView.webContents.loadURL(url);
    views[url] = currentView;

    currentView.webContents.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url); 
      return { action: 'deny' };
    });

    currentView.webContents.on('did-finish-load', () => {
      currentView.webContents.executeJavaScript(`
        (function removeNagScreens() {
          const nagScreenSelectors = [
            'div.max-w-\\\\[400px\\\\].rounded-xl',
            'div.rounded-lg.p-md.animate-in.fade-in',
            'div.flex.items-center.gap-sm',
          ];
          nagScreenSelectors.forEach((selector) => {
            document.querySelectorAll(selector).forEach((el) => el.remove());
          });
        })();
      `);
    });

    currentView.webContents.on('did-start-loading', () => {
      mainWindow.webContents.send('page-loading', true);
    });
    currentView.webContents.on('did-stop-loading', () => {
      mainWindow.webContents.send('page-loading', false);
    });
  }

  mainWindow.addBrowserView(currentView);
  adjustViewBounds();
}

function createTray() {
  let iconPath;

  if (process.platform === 'win32') {
    iconPath = path.join(__dirname, 'assets', 'icons', 'win', 'icon.ico');
  } else if (process.platform === 'darwin') {
    iconPath = path.join(__dirname, 'assets', 'icons', 'mac', 'favicon.icns');
  } else {
    iconPath = path.join(__dirname, 'assets', 'icons', 'png', 'favicon.png');
  }

  if (!fs.existsSync(iconPath)) {
    console.error(`Tray icon not found at path: ${iconPath}`);
    return;
  }

  try {
    tray = new Tray(iconPath);
    tray.setToolTip('Perplexity AI');

    tray.on('click', () => {
      if (mainWindow && (mainWindow.isMinimized() || !mainWindow.isVisible())) {
        mainWindow.show();
      }
      mainWindow?.focus(); 
    });

  } catch (error) {
    console.error('Failed to create tray:', error);
  }
}


app.once('before-quit', () => {
  app.quit();
});

module.exports = { createTray };

function checkForUpdates() {
  const currentVersion = app.getVersion();
  const request = net.request('https://raw.githubusercontent.com/inulute/perplexity-ai-app/main/package.json');

  request.on('response', (response) => {
    let body = '';
    response.on('data', (chunk) => (body += chunk));
    response.on('end', () => {
      try {
        const data = JSON.parse(body);
        const latestVersion = data.version;

        if (compareVersions(latestVersion, currentVersion) === 1) {
          showUpdateWindow(latestVersion);
        }
      } catch (error) {
        console.error('Error parsing latest version:', error);
      }
    });
  });
  request.on('error', console.error);
  request.end();
}

function compareVersions(v1, v2) {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const part1 = parts1[i] || 0;
    const part2 = parts2[i] || 0;

    if (part1 > part2) return 1;
    if (part1 < part2) return -1;
  }
  return 0;
}

function showUpdateWindow(latestVersion) {
  if (updateWindow) return;

  updateWindow = new BrowserWindow({
    width: 550,
    height: 520,
    parent: mainWindow,
    modal: true,
    show: false,
    frame: false,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'src', 'js', 'preload', 'preload_update.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  updateWindow.loadFile('update.html');

  updateWindow.once('ready-to-show', () => {
    updateWindow.webContents.send('latest-version', latestVersion);
    updateWindow.show();
  });

  updateWindow.on('closed', () => {
    updateWindow = null;
  });
}

function detachAllShortcuts() {
  globalShortcut.unregisterAll();
}

function reattachShortcuts() {
  registerShortcuts();
}

ipcMain.on('get-shortcuts', (event) => {
  event.sender.send('shortcuts', shortcuts);
});

ipcMain.on('set-shortcuts', (event, newShortcuts) => {
  shortcuts = newShortcuts;
  settings.set('shortcuts', shortcuts);
  reattachShortcuts();
});

ipcMain.on('open-settings', () => {
  detachAllShortcuts();
  openSettingsWindow();
});

ipcMain.on('close-settings', () => {
  if (settingsWindow) {
    settingsWindow.close();
    settingsWindow = null;
    reattachShortcuts();
  }
});

ipcMain.on('switch-ai-tool', (event, url) => {
  if (url.startsWith('http') || url === 'refresh') {
    switchView(url);
  }
});

ipcMain.on('set-settings', (event, data) => {
  if (data.shortcutEnabled !== undefined) {
    shortcutEnabled = data.shortcutEnabled;
    settings.set('shortcutEnabled', shortcutEnabled);

    if (shortcutEnabled) {
      registerShortcuts();
    } else {
      globalShortcut.unregisterAll();
    }
  }
});

ipcMain.on('get-settings', (event) => {
  const data = {
    shortcuts,
    defaultAI: settings.get('defaultAI', 'https://perplexity.ai'),
    shortcutEnabled,
  };
  event.sender.send('settings', data);
});

ipcMain.handle('get-app-version', () => app.getVersion());

ipcMain.on('open-external', (event, url) => {
  shell.openExternal(url);
});

ipcMain.on('close-update-window', () => {
  if (updateWindow) {
    updateWindow.close();
    updateWindow = null;
  }
});

ipcMain.on('download-update', () => {
  shell.openExternal('https://github.com/inulute/perplexity-ai-app/releases/latest');
});

function openSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 500,
    height: 700,
    parent: mainWindow,
    modal: true,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'src', 'js', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  settingsWindow.loadFile('settings.html').catch(console.error);

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

app.whenReady().then(() => {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
  } else {
    createWindow();
    createTray();

    app.on('second-instance', () => {
      if (mainWindow) {
        if (!mainWindow.isVisible() || mainWindow.isMinimized()) {
          mainWindow.show();
        }
        mainWindow.focus();
      }
    });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      } else {
        mainWindow.show();
      }
    });
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

