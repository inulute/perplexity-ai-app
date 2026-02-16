const { app, BrowserWindow, ipcMain, BrowserView, Menu, MenuItem, globalShortcut, Tray, shell, net, Notification, clipboard, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const Store = require('electron-store');
const marked = require('marked');
const windowStateKeeper = require('electron-window-state');

// Migrate settings from older app versions if this is a fresh install
// Migration chain: perplexity-ai-app → simplexity-ai-app
(function migrateOldSettings() {
  try {
    const appDataBase = app.getPath('appData');
    const newAppDataDir = app.getPath('userData'); // .../simplexity-ai-app
    const newConfigPath = path.join(newAppDataDir, 'config.json');

    // Already has config — no migration needed
    if (fs.existsSync(newConfigPath)) return;

    // Try migrating from simplexity-ai-app first (most recent), then perplexity-ai-app (oldest)
    const oldDirs = [
      path.join(appDataBase, 'simplexity-ai-app'),
      path.join(appDataBase, 'perplexity-ai-app')
    ];

    for (const oldAppDataDir of oldDirs) {
      const oldConfigPath = path.join(oldAppDataDir, 'config.json');
      if (fs.existsSync(oldConfigPath)) {
        // Ensure new directory exists
        if (!fs.existsSync(newAppDataDir)) {
          fs.mkdirSync(newAppDataDir, { recursive: true });
        }

        // Copy config.json (settings)
        fs.copyFileSync(oldConfigPath, newConfigPath);
        console.log(`Migrated settings from ${path.basename(oldAppDataDir)}`);

        // Also copy window-state.json if it exists
        const oldWindowState = path.join(oldAppDataDir, 'window-state.json');
        const newWindowState = path.join(newAppDataDir, 'window-state.json');
        if (fs.existsSync(oldWindowState) && !fs.existsSync(newWindowState)) {
          fs.copyFileSync(oldWindowState, newWindowState);
          console.log(`Migrated window state from ${path.basename(oldAppDataDir)}`);
        }
        break; // Stop after first successful migration
      }
    }
  } catch (error) {
    console.error('Settings migration failed (non-fatal):', error.message);
  }
})();

const settings = new Store();
const NotificationManager = require('./notification-manager');
const SearchService = require('./search-service');

const isMac = process.platform === 'darwin';
const isWindows = process.platform === 'win32';
const isLinux = process.platform === 'linux';

if (process.platform === 'win32') {
  app.setAppUserModelId("SimplexityAI");
}

let mainWindow;
let currentView;
let views = {};
let findBarOpen = false;
let tray = null;
let settingsWindow = null;
let updateWindow = null;
let notificationManager;
let searchService;
let prefixSearchWindow = null; 
let launchedHidden = process.argv.includes('--hidden') || process.argv.includes('--start-minimized');
let layoutCheckInterval;

let autoStartEnabled = settings.get('autoStartEnabled', false);

let originalClipboardContent = '';

let lastUpdateCheck = 0;
let shortcutsRegistered = false;
const UPDATE_CHECK_INTERVAL = 12 * 60 * 60 * 1000; // Check twice per day (every 12 hours)

function configureAutoStart(enable) {
  try {
    if (isMac) {
      // macOS implementation
      app.setLoginItemSettings({
        openAtLogin: enable,
        openAsHidden: true  
      });
    } else if (isWindows) {
      // Windows implementation with hidden flag
      app.setLoginItemSettings({
        openAtLogin: enable,
        path: process.execPath,
        args: ['--hidden'] 
      });
    } else {
      // Linux implementation (depends on desktop environment)
      app.setLoginItemSettings({
        openAtLogin: enable
      });
    }
    
    // Save the setting
    settings.set('autoStartEnabled', enable);
    autoStartEnabled = enable;
    
    console.log(`Autostart ${enable ? 'enabled' : 'disabled'} (in tray mode)`);
    return true;
  } catch (error) {
    console.error('Error configuring autostart:', error);
    return false;
  }
}

// Process command line arguments for searching
function processCommandLineArgs(argv) {
  const searchArg = argv.find(arg => 
    arg.startsWith('--search-text=') || 
    arg.startsWith('--explain=') || 
    arg.startsWith('--meaning=')
  );
  
  if (searchArg) {
    let searchText = '';
    let searchPrefix = '';
    let argType = '';
    
    if (searchArg.startsWith('--search-text=')) {
      argType = '--search-text=';
      searchText = searchArg.substring(argType.length);
    } else if (searchArg.startsWith('--explain=')) {
      argType = '--explain=';
      searchText = searchArg.substring(argType.length);
      searchPrefix = 'explain ';
    } else if (searchArg.startsWith('--meaning=')) {
      argType = '--meaning=';
      searchText = searchArg.substring(argType.length);
      searchPrefix = 'meaning of ';
    }
    
    searchText = searchText.trim();
    
    if (searchText.startsWith('"') && searchText.endsWith('"')) {
      searchText = searchText.slice(1, -1);
    }
    
    try {
      searchText = decodeURIComponent(searchText);
    } catch (e) {
      console.log('Error decoding URI component:', e);
    }
    
    console.log('Processed search text:', searchText);
    
    if (searchText) {
      return {
        formattedText: searchPrefix + searchText.trim(),
        searchUrl: `https://www.perplexity.ai/search?q=${encodeURIComponent(searchPrefix + searchText.trim())}`
      };
    }
  }
  
  return null;
}

const defaultShortcuts = isMac
  ? {
      perplexityAI: { key: 'Command+1', enabled: false },
      perplexityLabs: { key: 'Command+2', enabled: false },
      sendToTray: { key: 'Command+W', enabled: false },
      restoreApp: { key: 'Command+Shift+Q', enabled: false },
      quickSearch: { key: 'Command+Shift+P', enabled: false },
      customPrefixSearch: { key: 'Command+Shift+C', enabled: false }
    }
  : {
      perplexityAI: { key: 'Control+1', enabled: false },
      perplexityLabs: { key: 'Control+2', enabled: false },
      sendToTray: { key: 'Alt+Shift+W', enabled: false },
      restoreApp: { key: 'Alt+Shift+Q', enabled: false },
      quickSearch: { key: 'Alt+Shift+X', enabled: false },
      customPrefixSearch: { key: 'Alt+Shift+D', enabled: false }
    };

let shortcuts = settings.get('shortcuts', defaultShortcuts);

function ensureShortcutsFormat() {
  let updated = false;
  for (const [key, value] of Object.entries(shortcuts)) {
    if (typeof value === 'string') {
      shortcuts[key] = {
        key: value,
        enabled: false 
      };
      updated = true;
    }
  }
  
  if (updated) {
    settings.set('shortcuts', shortcuts);
  }
  
  const validShortcutKeys = Object.keys(defaultShortcuts);
  let hasRemovedShortcuts = false;
  
  for (const key of Object.keys(shortcuts)) {
    if (!validShortcutKeys.includes(key)) {
      delete shortcuts[key];
      hasRemovedShortcuts = true;
    }
  }
  
  if (hasRemovedShortcuts) {
    settings.set('shortcuts', shortcuts);
  }
}

ensureShortcutsFormat();

function registerShortcuts() {
  globalShortcut.unregisterAll();

  const shortcutActions = {
    perplexityAI: () => switchView('https://perplexity.ai'),
    perplexityLabs: () => switchView('https://labs.perplexity.ai'),
    sendToTray: () => mainWindow.hide(),
    restoreApp: () => {
      if (mainWindow.isMinimized() || !mainWindow.isVisible()) {
        mainWindow.show();
        mainWindow.focus();
        setTimeout(() => adjustViewBounds(), 100);
      }
    },
    quickSearch: () => {
      if (searchService) {
        searchService.searchSelectedText();
      }
    },
    customPrefixSearch: () => {
      if (searchService) {
        showPrefixSearchWindow();
      }
    }
  };

  for (const [key, shortcutData] of Object.entries(shortcuts)) {
    const shortcutKey = typeof shortcutData === 'object' ? shortcutData.key : shortcutData;
    const isEnabled = typeof shortcutData === 'object' ? shortcutData.enabled === true : false;

    if (isEnabled && shortcutKey && shortcutActions[key]) {
      try {
        globalShortcut.register(shortcutKey, shortcutActions[key]);
      } catch (error) {
        console.error(`Failed to register shortcut for ${key}:`, error);
      }
    }
  }
  shortcutsRegistered = true;
}

/**
 * Gets selected text directly from X11 selections
 * Uses xclip to access both primary (mouse) and clipboard selections
 * @returns {Promise<string>} The selected text or empty string if no selection
 */
function getX11SelectionText() {
  return new Promise((resolve) => {
    const { exec } = require('child_process');
    
    // Try primary selection first (mouse selection)
    exec('xclip -o -selection primary 2>/dev/null', { timeout: 1000 }, (primaryError, primaryText) => {
      if (!primaryError && primaryText && primaryText.trim()) {
        console.log('Got text from primary selection');
        resolve(primaryText.trim());
      } else {
        // Fall back to clipboard selection
        exec('xclip -o -selection clipboard 2>/dev/null', { timeout: 1000 }, (clipboardError, clipboardText) => {
          if (!clipboardError && clipboardText && clipboardText.trim()) {
            console.log('Got text from clipboard selection');
            resolve(clipboardText.trim());
          } else {
            // Last resort: Use the existing clipboard content
            const clipboardContent = clipboard.readText().trim();
            console.log('Using clipboard content as fallback', clipboardContent ? 'has content' : 'is empty');
            resolve(clipboardContent);
          }
        });
      }
    });
  });
}

function showPrefixSearchWindow() {
  originalClipboardContent = clipboard.readText();
  
  if (isLinux) {
    getX11SelectionText().then((selectedText) => {
      if (!selectedText) {
        const notification = new Notification({
          title: 'No text selected',
          body: 'Please select text before searching or install xclip: sudo pacman -S xclip'
        });
        notification.show();
        
        clipboard.writeText(originalClipboardContent);
        return;
      }
      
      createPrefixSearchWindow(selectedText);
    });
    return;
  }
  
  clipboard.writeText('');
  
  searchService.copySelectedText().then(() => {
    setTimeout(() => {
      const selectedText = clipboard.readText().trim();
      
      if (!selectedText) {
        const notification = new Notification({
          title: 'No text selected',
          body: 'Please select text before searching.'
        });
        notification.show();
        
        clipboard.writeText(originalClipboardContent);
        return;
      }
      
      createPrefixSearchWindow(selectedText);
    }, 400);
  });
}

/**
 * Creates and displays the prefix search window with the selected text
 * Extracted to a separate function for better code organization
 * @param {string} selectedText - The text that was selected by the user
 */
function createPrefixSearchWindow(selectedText) {
  if (!prefixSearchWindow || prefixSearchWindow.isDestroyed()) {
    const windowPosition = calculatePrefixWindowPosition();
    
    prefixSearchWindow = new BrowserWindow({
      width: 560,
      height: 420,
      x: windowPosition.x,
      y: windowPosition.y,
      frame: false,
      resizable: false,
      transparent: false,
      alwaysOnTop: true,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, 'src', 'js', 'preload', 'preload_prefix.js'),
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false, 
        devTools: false, 
        offscreen: false,
        disableBlinkFeatures: 'Accelerated2dCanvas,AcceleratedSmil'
      }
    });
    
    prefixSearchWindow.loadFile('prefix-search.html', { cache: false });
    
    prefixSearchWindow.once('ready-to-show', () => {
      prefixSearchWindow.webContents.send('set-selected-text', selectedText);
      prefixSearchWindow.show();
      prefixSearchWindow.focus();
    });
    
    prefixSearchWindow.on('blur', () => {
      if (prefixSearchWindow && !prefixSearchWindow.isDestroyed()) {
        prefixSearchWindow.close();
        
        setTimeout(() => {
          clipboard.writeText(originalClipboardContent);
        }, 500);
      }
    });
    
    prefixSearchWindow.on('closed', () => {
      setTimeout(() => {
        if (clipboard.readText() !== originalClipboardContent) {
          clipboard.writeText(originalClipboardContent);
        }
      }, 200);
    });
  } else {
    prefixSearchWindow.webContents.send('set-selected-text', selectedText);
    prefixSearchWindow.show();
    prefixSearchWindow.focus();
  }
}

function calculatePrefixWindowPosition() {
  const screenBounds = require('electron').screen.getPrimaryDisplay().workAreaSize;
  const windowBounds = mainWindow ? mainWindow.getBounds() : { x: 0, y: 0, width: 800, height: 600 };
  
  return {
    x: Math.min(Math.max(windowBounds.x + windowBounds.width / 2 - 180, 0), screenBounds.width - 360),
    y: Math.min(Math.max(windowBounds.y + windowBounds.height / 2 - 230, 0), screenBounds.height - 460)
  };
}

function startLayoutChecks() {
  if (layoutCheckInterval) {
    clearInterval(layoutCheckInterval);
  }
  
  layoutCheckInterval = setInterval(() => {
    if (mainWindow && !mainWindow.isMinimized() && mainWindow.isVisible()) {
      adjustViewBounds();
    }
  }, 120000); // Once every 2 minutes instead of every minute for better performance
}

function configureAppForBetterPerformance() {
  const disableHardwareAcceleration = settings.get('disableHardwareAcceleration', false);
  
  if (disableHardwareAcceleration) {
    app.disableHardwareAcceleration();
  }
  
  // Set chromium flags to reduce memory usage
  app.commandLine.appendSwitch('js-flags', '--max-old-space-size=256');
  app.commandLine.appendSwitch('disable-gpu-compositing');
  app.commandLine.appendSwitch('disable-smooth-scrolling');
  
  // Optimize for low GPU memory
  app.commandLine.appendSwitch('gpu-rasterization-msaa-sample-count', '0');
  app.commandLine.appendSwitch('num-raster-threads', '1');
  
  app.commandLine.appendSwitch('enable-zero-copy'); 
  app.commandLine.appendSwitch('enable-gpu-memory-buffer-compositor-resources');
  app.commandLine.appendSwitch('enable-checker-imaging');
  app.commandLine.appendSwitch('tile-width', '256');
  app.commandLine.appendSwitch('tile-height', '256');
}

function createWindow() {
  let mainWindowState = windowStateKeeper({
    defaultWidth: 1200,
    defaultHeight: 800
  });

  mainWindow = new BrowserWindow({
    x: mainWindowState.x,
    y: mainWindowState.y,
    width: mainWindowState.width,
    height: mainWindowState.height,
    show: !launchedHidden, // Don't show if launched with --hidden flag
    webPreferences: {
      preload: path.join(__dirname, 'src', 'js', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      disableBlinkFeatures: 'Accelerated2dCanvas,AcceleratedSmil',
      enableBlinkFeatures: 'PaintHolding',
      backgroundThrottling: true
    },
    backgroundColor: '#FFFFFF',
    autoHideMenuBar: true
  });

  mainWindowState.manage(mainWindow);

  // Application menu with Find and Zoom accelerators (menu bar hidden, accelerators still work)
  const appMenu = Menu.buildFromTemplate([
    {
      label: 'Edit',
      submenu: [
        {
          label: 'Find',
          accelerator: 'CmdOrCtrl+F',
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('toggle-find-bar');
            }
          }
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Zoom In',
          accelerator: 'CmdOrCtrl+=',
          click: () => {
            if (currentView) {
              const current = currentView.webContents.getZoomLevel();
              currentView.webContents.setZoomLevel(current + 0.5);
            }
          }
        },
        {
          label: 'Zoom Out',
          accelerator: 'CmdOrCtrl+-',
          click: () => {
            if (currentView) {
              const current = currentView.webContents.getZoomLevel();
              currentView.webContents.setZoomLevel(current - 0.5);
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Reset Zoom',
          accelerator: 'CmdOrCtrl+0',
          click: () => {
            if (currentView) {
              currentView.webContents.setZoomLevel(0);
            }
          }
        }
      ]
    }
  ]);
  Menu.setApplicationMenu(appMenu);
  mainWindow.setMenuBarVisibility(false);

  mainWindow.loadFile('index.html').catch(console.error);

  mainWindow.webContents.on('did-finish-load', () => {
    if (!launchedHidden) {
      mainWindow.show();
    }
    registerShortcuts();
    loadDefaultAI();
    checkForUpdates();
    
    notificationManager.checkForNotifications();
    
    notificationManager.updateBadge();
    
    configureAutoStart(autoStartEnabled);
  });

  let resizeTimeout = null;
  mainWindow.on('resize', () => {
    if (resizeTimeout) clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => adjustViewBounds(), 200);
  });

  mainWindow.on('focus', () => {
    setTimeout(() => adjustViewBounds(), 200);
    if (!settingsWindow) {
      reattachShortcuts();
    }
  });

  mainWindow.on('restore', () => {
    setTimeout(() => adjustViewBounds(), 200);
    if (!settingsWindow) {
      reattachShortcuts();
    }
  });

  mainWindow.on('show', () => {
    setTimeout(() => adjustViewBounds(), 200);
    startLayoutChecks();
    if (!settingsWindow) {
      reattachShortcuts();
    }
  });

  mainWindow.on('blur', () => {
    detachAllShortcuts();
  });

  mainWindow.on('minimize', () => {
    detachAllShortcuts();
  });

  mainWindow.on('hide', () => {
    detachAllShortcuts();
  });

  mainWindow.on('close', (event) => {
    if (app.isQuitting) {
      return;
    }

    const closeToTray = settings.get('closeToTray', true);

    if (closeToTray) {
      event.preventDefault();
      mainWindow.hide();

      if (!settings.get('hasShownTrayNotification', false)) {
        const notification = new Notification({
          title: 'SimplexityAI',
          body: 'Application is now running in the system tray'
        });
        notification.show();
        settings.set('hasShownTrayNotification', true);
      }
    } else {
      app.isQuitting = true;
    }
  });
  
  notificationManager = new NotificationManager(mainWindow);
  
  searchService = new SearchService(mainWindow, switchView);
  
  setInterval(() => cleanupUnusedResources(), 300000); // Every 5 minutes
}

app.on('before-quit', () => {
  app.isQuitting = true;
  if (layoutCheckInterval) {
    clearInterval(layoutCheckInterval);
  }
});

function loadDefaultAI() {
  const defaultAI = settings.get('defaultAI', 'https://perplexity.ai');
  switchView(defaultAI);
}

function adjustViewBounds() {
  if (currentView && mainWindow) {
    const bounds = mainWindow.getContentBounds();
    const sidebarWidth = 60;
    const findBarHeight = findBarOpen ? 36 : 0;

    const viewWidth = Math.max(bounds.width - sidebarWidth, 500);
    const viewHeight = Math.max(bounds.height - findBarHeight, 400);

    currentView.setBounds({
      x: sidebarWidth,
      y: findBarHeight,
      width: viewWidth,
      height: viewHeight,
    });
    
    if (process.platform === 'win32' && mainWindow.isVisible() && !mainWindow.isMinimized()) {
      mainWindow.webContents.invalidate();
    }
  }
}

function switchView(url) {
  if (url === 'refresh' && currentView) {
    
    const currentUrl = currentView.webContents.getURL();
    let baseUrl;
    
    if (currentUrl.includes('labs.perplexity.ai')) {
      baseUrl = 'https://labs.perplexity.ai';
    } else if (currentUrl.includes('perplexity.ai')) {
      baseUrl = 'https://perplexity.ai';
    } else {
      baseUrl = settings.get('defaultAI', 'https://perplexity.ai');
    }
    
    console.log(`Refreshing to base URL: ${baseUrl}`);
    currentView.webContents.loadURL(baseUrl);
    return;
  }

  if (currentView) {
    mainWindow.removeBrowserView(currentView);
  }

  if (url.startsWith('search:')) {
    const searchQuery = url.substring(7).trim();
    if (searchQuery) {
      url = `https://www.perplexity.ai/search?q=${encodeURIComponent(searchQuery)}`;
    } else {
      url = 'https://perplexity.ai';
    }
  }

  const maxCachedViews = 2; 
  const viewUrls = Object.keys(views);
  if (viewUrls.length > maxCachedViews && !views[url]) {
    const oldestUrl = viewUrls[0];
    const oldView = views[oldestUrl];
    if (oldView) {
      oldView.webContents.destroy();
    }
    delete views[oldestUrl];
  }

  if (views[url]) {
    currentView = views[url];
  } else {
    currentView = new BrowserView({
      webPreferences: {
        contextIsolation: true,
        preload: path.join(__dirname, 'src', 'js', 'preload', 'preload_inject.js'),
        backgroundThrottling: true,
        worldSafeExecuteJavaScript: true,
        sandbox: false,
        spellcheck: true,
        webgl: true,
        enableWebSQL: false,
        // Memory optimization settings
        disableBlinkFeatures: 'Accelerated2dCanvas',
        enableBlinkFeatures: 'PaintHolding',
      },
    });
    
   
    if (currentView.webContents.setBackgroundThrottling) {
      currentView.webContents.setBackgroundThrottling(true);
    }
    
   
    if (currentView.webContents.session && currentView.webContents.session.webRequest) {
      currentView.webContents.session.webRequest.onBeforeSendHeaders((details, callback) => {
        callback({cancel: false, requestHeaders: details.requestHeaders});
      });
    }
    
    currentView.webContents.loadURL(url);
    views[url] = currentView;

    currentView.webContents.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url);
      return { action: 'deny' };
    });

    // Context menu with spell check, copy link, and standard editing
    const viewRef = currentView;
    viewRef.webContents.on('context-menu', (event, params) => {
      const menuItems = [];

      // Spell check suggestions first (most actionable)
      if (params.dictionarySuggestions && params.dictionarySuggestions.length > 0) {
        for (const suggestion of params.dictionarySuggestions) {
          menuItems.push({
            label: suggestion,
            click: () => viewRef.webContents.replaceMisspelling(suggestion)
          });
        }
        menuItems.push({ type: 'separator' });
      }

      if (params.misspelledWord) {
        menuItems.push({
          label: 'Add to dictionary',
          click: () => viewRef.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord)
        });
        menuItems.push({ type: 'separator' });
      }

      // Only show editing options that are actually available
      if (params.editFlags.canCut) {
        menuItems.push({ label: 'Cut', role: 'cut' });
      }
      if (params.selectionText.trim().length > 0) {
        menuItems.push({ label: 'Copy', role: 'copy' });
      }
      if (params.editFlags.canPaste) {
        menuItems.push({ label: 'Paste', role: 'paste' });
      }
      if (params.editFlags.canSelectAll) {
        menuItems.push({ label: 'Select All', role: 'selectAll' });
      }

      // Copy Link (only visible when right-clicking a link)
      if (params.linkURL) {
        if (menuItems.length > 0) {
          menuItems.push({ type: 'separator' });
        }
        menuItems.push({
          label: 'Copy Link',
          click: () => clipboard.writeText(params.linkURL)
        });
      }

      if (menuItems.length > 0) {
        const menu = Menu.buildFromTemplate(menuItems);
        menu.popup(mainWindow);
      }
    });

    // Forward find-in-page results to the main window renderer
    viewRef.webContents.on('found-in-page', (event, result) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('find-result', {
          activeMatchOrdinal: result.activeMatchOrdinal,
          matches: result.matches
        });
      }
    });

    // Intercept keyboard shortcuts at the BrowserView level before the website can handle them
    viewRef.webContents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return;

      const key = input.key.toLowerCase();

      // Escape → close find bar if open
      if (key === 'escape' && findBarOpen) {
        event.preventDefault();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('toggle-find-bar');
        }
        return;
      }

      const mod = process.platform === 'darwin' ? input.meta : input.control;
      if (!mod) return;

      // Ctrl/Cmd+F → toggle find bar
      if (key === 'f' && !input.alt && !input.shift) {
        event.preventDefault();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('toggle-find-bar');
        }
        return;
      }

      // Ctrl/Cmd+= or Ctrl/Cmd+Shift+= → zoom in
      if (key === '=' || key === '+') {
        event.preventDefault();
        const current = viewRef.webContents.getZoomLevel();
        viewRef.webContents.setZoomLevel(current + 0.5);
        return;
      }

      // Ctrl/Cmd+- → zoom out
      if (key === '-') {
        event.preventDefault();
        const current = viewRef.webContents.getZoomLevel();
        viewRef.webContents.setZoomLevel(current - 0.5);
        return;
      }

      // Ctrl/Cmd+0 → reset zoom
      if (key === '0') {
        event.preventDefault();
        viewRef.webContents.setZoomLevel(0);
        return;
      }
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
          
          // Add CSS to optimize rendering performance
          const style = document.createElement('style');
          style.textContent = 'img { will-change: auto !important; } .will-change-transform { will-change: auto !important; }';
          document.head.appendChild(style);
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

function cleanupUnusedResources() {
  if (global.gc) {
    global.gc();
  }
  
  const currentTime = Date.now();
  const viewUrls = Object.keys(views);
  
  for (const url of viewUrls) {
    if (views[url] === currentView) continue;
    
    if (!views[url].lastAccessTime || (currentTime - views[url].lastAccessTime > 300000)) {
      if (views[url].webContents) {
        views[url].webContents.destroy();
      }
      delete views[url];
    }
  }
}

function createTray() {
  let iconPath;

  if (isWindows) {
    iconPath = path.join(__dirname, 'assets', 'icons', 'win', 'icon.ico');
  } else if (isMac) {
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
    tray.setToolTip('SimplexityAI');

    const contextMenu = Menu.buildFromTemplate([
      { 
        label: 'Quick Search', 
        click: () => {
          if (searchService) {
            searchService.searchSelectedText();
          }
        }
      },
      { 
        label: 'Show App', 
        click: () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
            setTimeout(() => adjustViewBounds(), 100);
          }
        } 
      },
      { type: 'separator' },
      {
        label: 'Disable Hardware Acceleration',
        type: 'checkbox',
        checked: settings.get('disableHardwareAcceleration', false),
        click: (menuItem) => {
          settings.set('disableHardwareAcceleration', menuItem.checked);
          dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: 'Restart Required',
            message: 'Please restart the application for this change to take effect.',
            buttons: ['OK']
          });
        }
      },
      { type: 'separator' },
      { 
        label: 'Quit', 
        click: () => {
          app.isQuitting = true;
          app.quit();
        } 
      }
    ]);
    
    tray.setContextMenu(contextMenu);
    
    tray.on('click', () => {
      if (mainWindow && (mainWindow.isMinimized() || !mainWindow.isVisible())) {
        mainWindow.show();
        setTimeout(() => adjustViewBounds(), 100);
      }
      mainWindow?.focus();
    });

  } catch (error) {
    console.error('Failed to create tray:', error);
  }
}

ipcMain.on('remind-tomorrow-update', () => {
  const almostOneDayAgo = Date.now() - (23 * 60 * 60 * 1000);
  lastUpdateCheck = almostOneDayAgo;
  settings.set('lastUpdateCheck', lastUpdateCheck);
  
  console.log('Update reminder scheduled for tomorrow');
  
  if (updateWindow) {
    updateWindow.close();
    updateWindow = null;
  }
});

ipcMain.on('download-update', () => {
  const downloadUrl = 'https://github.com/inulute/simplexity-ai-app/releases/latest';
  
  shell.openExternal(downloadUrl);
  
  // Close the update window
  if (updateWindow) {
    updateWindow.close();
    updateWindow = null;
  }
});

function checkForUpdates() {
  const currentTime = Date.now();
  
  if (lastUpdateCheck !== 0 && (currentTime - lastUpdateCheck < UPDATE_CHECK_INTERVAL)) {
    console.log('Skipping update check - checked recently');
    return;
  }
  
  const currentVersion = app.getVersion();
  console.log(`Checking for updates. Current version: ${currentVersion}`);
  
  const randomDelay = Math.floor(Math.random() * 5000); 
  setTimeout(() => performUpdateCheck(currentVersion, 0), randomDelay);
}

function performUpdateCheck(currentVersion, retryCount) {
  const maxRetries = 3;
  
  const timestamp = Date.now();
  const url = `https://raw.githubusercontent.com/inulute/simplexity-ai-app/main/package.json?_=${timestamp}`;
  
  const request = net.request({
    url: url,
    method: 'GET'
  });
  
  request.setHeader('User-Agent', `SimplexityAIDesktop/${currentVersion}`);
  
  let timeoutId = setTimeout(() => {
    console.error('Update check timed out');
    request.abort();
    
    if (retryCount < maxRetries) {
      const backoffTime = Math.pow(2, retryCount) * 3000; 
      console.log(`Retrying update check after ${backoffTime}ms (attempt ${retryCount + 1}/${maxRetries})`);
      setTimeout(() => performUpdateCheck(currentVersion, retryCount + 1), backoffTime);
    }
  }, 15000); 
  request.on('response', (response) => {
    clearTimeout(timeoutId);
    
    if (response.statusCode === 429) {
      console.log('Rate limited while checking for updates. Will try again later.');
      return;
    }
    
    if (response.statusCode !== 200) {
      console.error(`Failed to check for updates: HTTP ${response.statusCode}`);
      
      if (retryCount < maxRetries) {
        const backoffTime = Math.pow(2, retryCount) * 3000; // Exponential backoff
        console.log(`Retrying update check after ${backoffTime}ms (attempt ${retryCount + 1}/${maxRetries})`);
        setTimeout(() => performUpdateCheck(currentVersion, retryCount + 1), backoffTime);
      }
      return;
    }
    
    let body = '';
    response.on('data', (chunk) => (body += chunk));
    response.on('end', () => {
      try {
        const data = JSON.parse(body);
        const latestVersion = data.version;
        console.log(`Latest version: ${latestVersion}, Current version: ${currentVersion}`);

        lastUpdateCheck = Date.now();
        
        settings.set('lastUpdateCheck', lastUpdateCheck);

        if (compareVersions(latestVersion, currentVersion) === 1) {
          showUpdateWindow(latestVersion);
        }
      } catch (error) {
        console.error('Error parsing latest version:', error);
      }
    });
  });
  
  request.on('error', (error) => {
    clearTimeout(timeoutId);
    console.error('Error checking for updates:', error);
    
    if (retryCount < maxRetries) {
      const backoffTime = Math.pow(2, retryCount) * 3000; // Exponential backoff
      console.log(`Retrying update check after ${backoffTime}ms (attempt ${retryCount + 1}/${maxRetries})`);
      setTimeout(() => performUpdateCheck(currentVersion, retryCount + 1), backoffTime);
    }
  });
  
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
      disableBlinkFeatures: 'Accelerated2dCanvas'
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
  if (shortcutsRegistered) {
    globalShortcut.unregisterAll();
    shortcutsRegistered = false;
  }
}

function reattachShortcuts() {
  if (!shortcutsRegistered) {
    registerShortcuts();
  }
}

app.on('second-instance', (event, commandLine, workingDirectory) => {
  console.log('Second instance detected with args:', commandLine);
  
  const searchInfo = processCommandLineArgs(commandLine);
  
  if (searchInfo) {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
      
      setTimeout(() => adjustViewBounds(), 100);
    }
    
    setTimeout(() => {
      switchView(searchInfo.searchUrl);
    }, 100);
  } else {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
      
      setTimeout(() => adjustViewBounds(), 100);
    }
  }
});

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
    settingsWindow.hide();
    
    const windowToClose = settingsWindow;
    settingsWindow = null;
    
    setTimeout(() => {
      if (!windowToClose.isDestroyed()) {
        windowToClose.close();
      }
      reattachShortcuts();
    }, 100);
  }
});

ipcMain.on('switch-ai-tool', (event, url) => {
  if (url.startsWith('http') || url === 'refresh' || url.startsWith('search:')) {
    switchView(url);
  }
});

ipcMain.on('set-settings', (event, data) => {
  if (data.shortcuts) {
    shortcuts = data.shortcuts;
    settings.set('shortcuts', shortcuts);
  }
  
  if (data.defaultAI) {
    settings.set('defaultAI', data.defaultAI);
  }
  
  if (data.disableHardwareAcceleration !== undefined) {
    settings.set('disableHardwareAcceleration', data.disableHardwareAcceleration);
  }
  
  if (data.autoStartEnabled !== undefined) {
    configureAutoStart(data.autoStartEnabled);
  }

  if (data.closeToTray !== undefined) {
    settings.set('closeToTray', data.closeToTray);
  }

  reattachShortcuts();
});

ipcMain.on('get-settings', (event) => {
  const data = {
    shortcuts,
    defaultAI: settings.get('defaultAI', 'https://perplexity.ai'),
    disableHardwareAcceleration: settings.get('disableHardwareAcceleration', false),
    autoStartEnabled: autoStartEnabled,
    closeToTray: settings.get('closeToTray', true)
  };
  event.sender.send('settings', data);
});

ipcMain.on('toggle-autostart', (event, enable) => {
  const success = configureAutoStart(enable);
  event.sender.send('autostart-status', { enabled: enable, success });
});

ipcMain.handle('get-autostart-status', () => {
  return autoStartEnabled;
});

ipcMain.handle('get-app-version', () => app.getVersion());

ipcMain.on('open-external', (event, url) => {
  shell.openExternal(url);
});


ipcMain.on('open-external-link', (event, url) => {
  if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
    shell.openExternal(url).catch(err => {
      console.error('Failed to open external link:', err);
    });
  } else {
    console.error('Invalid URL format:', url);
  }
});

ipcMain.on('close-update-window', () => {
  if (updateWindow) {
    updateWindow.close();
    updateWindow = null;
  }
});

ipcMain.on('perform-prefix-search', (event, data) => {
  if (prefixSearchWindow && !prefixSearchWindow.isDestroyed()) {
    prefixSearchWindow.close();
  }
  
  if (searchService) {
    const { text, prefix } = data;
    searchService.performSearch(text, prefix);
    
    if (mainWindow && (mainWindow.isMinimized() || !mainWindow.isVisible())) {
      mainWindow.show();
      mainWindow.focus();
      setTimeout(() => adjustViewBounds(), 100);
    }
    
    setTimeout(() => {
      clipboard.writeText(originalClipboardContent);
    }, 1000);
  }
});

ipcMain.on('close-prefix-search', () => {
  if (prefixSearchWindow && !prefixSearchWindow.isDestroyed()) {
    prefixSearchWindow.close();
    
    setTimeout(() => {
      clipboard.writeText(originalClipboardContent);
    }, 500);
  }
});

ipcMain.on('mark-notification-read', (event, id) => {
  notificationManager.markAsRead(id);
});

ipcMain.on('delete-notification', (event, id) => {
  notificationManager.deleteNotification(id);
});

ipcMain.on('mark-all-notifications-read', () => {
  notificationManager.markAllAsRead();
});

ipcMain.on('open-notification-panel', () => {
  notificationManager.showNotificationPanel();
});

ipcMain.on('close-notification-panel', () => {
  if (notificationManager.panelWindow) {
    notificationManager.closePanelWindow();
  }
});

ipcMain.on('close-notification', () => {
  if (notificationManager.notificationWindow) {
    notificationManager.closeNotificationWindow();
  }
});


ipcMain.handle('get-notification-content', async (event, id, fromPanel = false) => {
  if (notificationManager) {
    if (fromPanel) {
      return await notificationManager.getRealTimeContent(id);
    } else {
      return await notificationManager.getNotificationContent(id);
    }
  }
  return null;
});

ipcMain.on('perform-quick-search', (event, searchText) => {
  if (searchService) {
    searchService.performSearch(searchText);
  }
});

// Find bar state management
ipcMain.on('find-bar-opened', () => {
  findBarOpen = true;
  adjustViewBounds();
});

ipcMain.on('find-bar-closed', () => {
  findBarOpen = false;
  adjustViewBounds();
});

// Find in page
ipcMain.on('find-in-page', (event, text, options) => {
  if (currentView && text) {
    currentView.webContents.findInPage(text, {
      forward: options.forward !== false,
      matchCase: false
    });
  }
});

ipcMain.on('stop-find-in-page', (event, action) => {
  if (currentView) {
    currentView.webContents.stopFindInPage(action || 'clearSelection');
  }
});

ipcMain.on('get-shortcut-instructions', (event) => {
  try {
    const instructionsPath = path.join(__dirname, 'shortcut-instructions.md');
    if (fs.existsSync(instructionsPath)) {
      const markdown = fs.readFileSync(instructionsPath, 'utf8');
      const html = marked.parse(markdown);
      event.sender.send('shortcut-instructions', html);
    } else {
      event.sender.send('shortcut-instructions', 'Instructions file not found.');
    }
  } catch (error) {
    console.error('Error getting shortcut instructions:', error);
    event.sender.send('shortcut-instructions', 'Error loading instructions.');
  }
});

function openSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 500,
    height: 745,
    parent: mainWindow,
    modal: true,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'src', 'js', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      disableBlinkFeatures: 'Accelerated2dCanvas'
    },
    show: false,
    backgroundColor: '#2b2b2b',
    paintWhenInitiallyHidden: true
  });

  settingsWindow.loadFile('settings.html')
    .then(() => {
      settingsWindow.show();
    })
    .catch(console.error);

  settingsWindow.on('closed', () => {
    settingsWindow = null;
    reattachShortcuts();
  });
}

ipcMain.on('close-settings', () => {
  if (settingsWindow) {
    settingsWindow.hide();
    
    reattachShortcuts();
    
    // Close the window after a short delay
    setTimeout(() => {
      if (settingsWindow) {
        settingsWindow.close();
        settingsWindow = null;
      }
    }, 100);
  }
});

configureAppForBetterPerformance();

app.whenReady().then(() => {
  lastUpdateCheck = settings.get('lastUpdateCheck', 0);
  
  if (!app.requestSingleInstanceLock()) {
    app.quit();
  } else {
    const searchInfo = processCommandLineArgs(process.argv);
    
    createWindow();
    createTray();
    
    startLayoutChecks();
    
    if (searchInfo) {
      setTimeout(() => {
        switchView(searchInfo.searchUrl);
      }, 500);
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      } else {
        mainWindow.show();
        setTimeout(() => adjustViewBounds(), 100);
      }
    });
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll(); // Unregister all shortcuts
});