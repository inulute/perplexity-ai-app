// renderer.js

document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('settings-container')) {
    const shortcutFields = {
      perplexityAI: document.getElementById('shortcut-perplexityAI'),
      perplexityLabs: document.getElementById('shortcut-perplexityLabs'),
      sendToTray: document.getElementById('shortcut-sendToTray'),
      restoreApp: document.getElementById('shortcut-restoreApp'),
      quickSearch: document.getElementById('shortcut-quickSearch'),
      customPrefixSearch: document.getElementById('shortcut-customPrefixSearch')
    };
    
    const shortcutToggles = {
      perplexityAI: document.getElementById('toggle-perplexityAI'),
      perplexityLabs: document.getElementById('toggle-perplexityLabs'),
      sendToTray: document.getElementById('toggle-sendToTray'),
      restoreApp: document.getElementById('toggle-restoreApp'),
      quickSearch: document.getElementById('toggle-quickSearch'),
      customPrefixSearch: document.getElementById('toggle-customPrefixSearch')
    };
    
    const defaultAISelect = document.getElementById('defaultAI');
    let newShortcuts = {};
    let savedShortcuts = {};
    const isMac = window.electronAPI.platform === 'darwin';

    function cleanupNumpadKeys(shortcut) {
      if (!shortcut) return '';
      
      const numpadMap = {
        'Numpad0': '0', 'Numpad1': '1', 'Numpad2': '2', 'Numpad3': '3', 'Numpad4': '4',
        'Numpad5': '5', 'Numpad6': '6', 'Numpad7': '7', 'Numpad8': '8', 'Numpad9': '9',
        'NumpadAdd': '+', 'NumpadSubtract': '-', 'NumpadMultiply': '*', 'NumpadDivide': '/',
        'NumpadDecimal': '.', 'NumpadEnter': 'Enter'
      };
      
      let cleanedShortcut = shortcut;
      Object.entries(numpadMap).forEach(([numpadKey, regularKey]) => {
        cleanedShortcut = cleanedShortcut.replace(new RegExp(numpadKey, 'g'), regularKey);
      });
      
      return cleanedShortcut;
    }

    for (const key in shortcutToggles) {
      if (shortcutToggles[key]) {
        shortcutToggles[key].addEventListener('change', (event) => {
          updateToggleState(key, event.target.checked);
        });
      }
    }
    
    function updateToggleState(key, isEnabled) {
      if (shortcutFields[key]) {
        shortcutFields[key].disabled = !isEnabled;
      }
      
      if (typeof newShortcuts[key] === 'object') {
        newShortcuts[key].enabled = isEnabled;
      } else if (newShortcuts[key]) {
        newShortcuts[key] = {
          key: newShortcuts[key],
          enabled: isEnabled
        };
      } else {
        const defaultKey = isMac ? 
          getDefaultMacShortcut(key) : 
          getDefaultWindowsShortcut(key);
        
        newShortcuts[key] = {
          key: defaultKey,
          enabled: isEnabled
        };
      }
    }

    function loadCurrentShortcuts() {
      for (const [key, input] of Object.entries(shortcutFields)) {
        if (!input) continue;
        
        const shortcutData = savedShortcuts[key];
        let shortcutKey, isEnabled;
        
        if (typeof shortcutData === 'object' && shortcutData !== null) {
          shortcutKey = shortcutData.key;
          isEnabled = shortcutData.enabled === true; 
        } else {
          shortcutKey = shortcutData;
          isEnabled = false; 
        }
        
        if (shortcutKey) {
          shortcutKey = cleanupNumpadKeys(shortcutKey);
          
          if (typeof savedShortcuts[key] === 'object') {
            savedShortcuts[key].key = shortcutKey;
            newShortcuts[key].key = shortcutKey;
          }
        }
        
        const displayValue = isMac 
          ? (shortcutKey || '').replace(/Control/g, 'Ctrl') 
          : (shortcutKey || '').replace(/Command/g, 'Ctrl');
          
        input.value = displayValue;
        
        if (shortcutToggles[key]) {
          shortcutToggles[key].checked = isEnabled;
          updateToggleState(key, isEnabled);
        }
      }
    }

    window.electronAPI.getSettings();

    window.electronAPI.onSettingsReceived((data) => {
      if (!data) {
        console.error("Received invalid settings data");
        return;
      }
      
      const processedShortcuts = {};
      
      if (data.shortcuts) {
        for (const [key, value] of Object.entries(data.shortcuts)) {
          if (typeof value === 'string') {
            processedShortcuts[key] = {
              key: value,
              enabled: false 
            };
          } else {
            processedShortcuts[key] = value;
          }
        }
      }
      
      newShortcuts = { ...processedShortcuts };
      savedShortcuts = { ...processedShortcuts };
    
      loadCurrentShortcuts();
      
      if (defaultAISelect) {
        defaultAISelect.value = data.defaultAI || 'https://perplexity.ai';
      }
      
      const autostartToggle = document.getElementById('toggle-autostart');
      if (autostartToggle) {
        autostartToggle.checked = data.autoStartEnabled || false;

        autostartToggle.addEventListener('change', (event) => {
          window.electronAPI.toggleAutostart(event.target.checked);
        });
      }

      const closeToTrayToggle = document.getElementById('toggle-closeToTray');
      if (closeToTrayToggle) {
        closeToTrayToggle.checked = data.closeToTray !== false;
      }
    });

    for (const [key, input] of Object.entries(shortcutFields)) {
      if (!input) continue; 
      
      input.addEventListener('focus', () => {
        input.classList.add('active');
      });

      input.addEventListener('blur', () => {
        input.classList.remove('active');
        checkForDuplicates();
      });

      input.addEventListener('keydown', (event) => {
        event.preventDefault();
        
        const toggle = shortcutToggles[key];
        if (toggle && !toggle.checked) {
          return;
        }

        if (event.code === 'NumLock' || event.code === 'CapsLock' || event.code === 'ScrollLock') {
          return;
        }

        let modifiers = [];
        if (isMac) {
          if (event.metaKey) modifiers.push('Cmd');
          if (event.altKey) modifiers.push('Alt');
          if (event.shiftKey) modifiers.push('Shift');
        } else {
          if (event.ctrlKey) modifiers.push('Ctrl');
          if (event.altKey) modifiers.push('Alt');
          if (event.shiftKey) modifiers.push('Shift');
        }

        const modifierKeyCodes = [
          'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight'
        ];

        if (modifierKeyCodes.includes(event.code)) return;

        if (modifiers.length === 0) {
          alert('Shortcuts must include at least one modifier key (Ctrl or Cmd, Alt, Shift).');
          input.value = '';
          return;
        }

        let keyName;
        if (event.code.startsWith('Numpad')) {
          const numpadMap = {
            'Numpad0': '0', 'Numpad1': '1', 'Numpad2': '2', 'Numpad3': '3', 'Numpad4': '4',
            'Numpad5': '5', 'Numpad6': '6', 'Numpad7': '7', 'Numpad8': '8', 'Numpad9': '9',
            'NumpadAdd': '+', 'NumpadSubtract': '-', 'NumpadMultiply': '*', 'NumpadDivide': '/',
            'NumpadDecimal': '.', 'NumpadEnter': 'Enter'
          };
          keyName = numpadMap[event.code] || event.code;
        } else {
          keyName = event.code.startsWith('Key') ? event.code.slice(3).toUpperCase() : event.key;
        }
        
        const keyCombo = [...modifiers, keyName].join('+');
        input.value = keyCombo;

        const normalizedKey = keyCombo
          .replace(/Cmd/g, 'Command')
          .replace(/Ctrl/g, 'Control');
          
        if (typeof newShortcuts[key] === 'object') {
          newShortcuts[key].key = normalizedKey;
        } else {
          newShortcuts[key] = {
            key: normalizedKey,
            enabled: true
          };
        }

        checkForDuplicates();
      });
    }

    const installContextMenuButton = document.getElementById('install-context-menu');
    if (installContextMenuButton) {
      installContextMenuButton.addEventListener('click', () => {
        window.electronAPI.installContextMenu();
      });
    }
    
    const instructionsButton = document.querySelector('.instructions-button');
    if (instructionsButton) {
      instructionsButton.addEventListener('click', () => {
        window.electronAPI.getShortcutInstructions();
        
        const instructionsContainer = document.getElementById('instructions-container');
        if (instructionsContainer) {
          instructionsContainer.style.display = 'block';
        }
      });
    }
    
    window.electronAPI.onShortcutInstructions((html) => {
      const instructionsContent = document.getElementById('instructions-content');
      if (instructionsContent) {
        instructionsContent.innerHTML = html;
        
        instructionsContent.addEventListener('click', (event) => {
          if (event.target.tagName === 'A' && event.target.href) {
            event.preventDefault(); 
            
            window.electronAPI.openExternalLink(event.target.href);
          }
        });
      }
    });

    document.getElementById('restore-button').addEventListener('click', () => {
      const defaultShortcuts = isMac
        ? {
            perplexityAI: { key: 'Command+1', enabled: false },
            perplexityLabs: { key: 'Command+2', enabled: false },
            sendToTray: { key: 'Command+T', enabled: false },
            restoreApp: { key: 'Command+Shift+T', enabled: false },
            quickSearch: { key: 'Command+Shift+X', enabled: false },
            customPrefixSearch: { key: 'Command+Shift+D', enabled: false }
          }
        : {
            perplexityAI: { key: 'Control+1', enabled: false },
            perplexityLabs: { key: 'Control+2', enabled: false },
            sendToTray: { key: 'Alt+Shift+W', enabled: false },
            restoreApp: { key: 'Alt+Shift+Q', enabled: false },
            quickSearch: { key: 'Alt+Shift+X', enabled: false },
            customPrefixSearch: { key: 'Alt+Shift+D', enabled: false }
          };

      newShortcuts = { ...defaultShortcuts };
      savedShortcuts = { ...defaultShortcuts };
      loadCurrentShortcuts();
    });

    document.getElementById('settings-form').addEventListener('submit', (event) => {
      event.preventDefault();
      if (checkForDuplicates(true)) {
        const autostartToggle = document.getElementById('toggle-autostart');
        
        const closeToTrayToggle = document.getElementById('toggle-closeToTray');

        const settingsToSave = {
          shortcuts: newShortcuts,
          defaultAI: defaultAISelect.value,
          disableHardwareAcceleration: document.getElementById('toggle-hardware-acceleration')
            ? document.getElementById('toggle-hardware-acceleration').checked
            : false,
          autoStartEnabled: autostartToggle ? autostartToggle.checked : false,
          closeToTray: closeToTrayToggle ? closeToTrayToggle.checked : true
        };
        window.electronAPI.setSettings(settingsToSave);
        savedShortcuts = { ...newShortcuts };
        window.electronAPI.closeSettings();
      }
    });

    function checkForDuplicates(finalCheck = false) {
      let valid = true;
      const shortcutValues = {};
      
      document.querySelectorAll(".warning").forEach(warning => {
        warning.textContent = '';
      });
    
      for (const [key, input] of Object.entries(shortcutFields)) {
        if (!input) continue; 
        
        const toggle = shortcutToggles[key];
        const isEnabled = toggle ? toggle.checked : false;
        
        if (!isEnabled) continue;
        
        const value = input.value.trim();
    
        if (!value && finalCheck && isEnabled) {
          valid = false;
          showWarning(key, `Please set a shortcut for "${getFriendlyName(key)}".`);
          continue;
        }
    
        if (isEnabled && value) {
          const normalizedShortcut = normalizeShortcut(
            typeof newShortcuts[key] === 'object' ? newShortcuts[key].key : newShortcuts[key]
          );
      
          if (shortcutValues[normalizedShortcut]) {
            valid = false;
            const existingKey = shortcutValues[normalizedShortcut];
            showWarning(key, `Shortcut "${value}" is already assigned to "${getFriendlyName(existingKey)}".`);
            showWarning(existingKey, `Shortcut "${value}" is already assigned to "${getFriendlyName(key)}".`);
          } else {
            shortcutValues[normalizedShortcut] = key;
          }
        }
      }
    
      return valid;
    }

    function showWarning(key, message) {
      const input = shortcutFields[key];
      if (!input) return;
      
      const shortcutItem = input.closest('.shortcut-item');
      if (!shortcutItem) return;
      
      let warningEl = shortcutItem.querySelector('.warning');
      if (!warningEl) {
        warningEl = document.createElement('div');
        warningEl.className = 'warning';
        shortcutItem.appendChild(warningEl);
      }
      
      warningEl.textContent = message;
    }

    function normalizeShortcut(shortcut) {
      if (!shortcut) return '';
      
      shortcut = String(shortcut)
        .replace(/Command/g, 'Cmd')
        .replace(/Control/g, 'Ctrl')
        .replace(/Option/g, 'Alt')
        .replace(/Shift/g, 'Shift')
        .replace(/ /g, '');
      const parts = shortcut.split('+');
      const modifiers = [];
      let key = '';
      parts.forEach((part) => {
        if (['Ctrl', 'Cmd', 'Alt', 'Shift'].includes(part)) {
          modifiers.push(part);
        } else {
          key = part.toLowerCase();
        }
      });
      const modifierOrder = isMac ? ['Cmd', 'Alt', 'Shift'] : ['Ctrl', 'Alt', 'Shift'];
      modifiers.sort((a, b) => modifierOrder.indexOf(a) - modifierOrder.indexOf(b));
      return [...modifiers, key].join('+').toLowerCase();
    }

    function getFriendlyName(key) {
      const nameMap = {
        perplexityAI: 'AI Search',
        perplexityLabs: 'AI Labs',
        sendToTray: 'Send to Tray',
        restoreApp: 'Restore App',
        quickSearch: 'Quick Search',
        customPrefixSearch: 'Custom Prefix'
      };
      return nameMap[key] || key;
    }
    
    function getDefaultMacShortcut(key) {
      const defaults = {
        perplexityAI: 'Command+1',
        perplexityLabs: 'Command+2',
        sendToTray: 'Command+T',
        restoreApp: 'Command+Shift+T',
        quickSearch: 'Command+Shift+P',
        customPrefixSearch: 'Command+Shift+C'
      };
      return defaults[key] || '';
    }
    
    function getDefaultWindowsShortcut(key) {
      const defaults = {
        perplexityAI: 'Control+1',
        perplexityLabs: 'Control+2',
        sendToTray: 'Alt+Shift+W',
        restoreApp: 'Alt+Shift+Q',
        quickSearch: 'Alt+Shift+X',
        customPrefixSearch: 'Alt+Shift+D'
      };
      return defaults[key] || '';
    }
  } else if (document.getElementById('prefix-search-container')) {
    const prefixButtons = document.querySelectorAll('.prefix-button');
    const selectedTextElement = document.getElementById('selected-text');
    let selectedText = '';
    
    window.electronAPI.onSelectedText((text) => {
      selectedText = text;
      
      if (selectedTextElement) {
        if (text.length > 100) {
          selectedTextElement.textContent = text.substring(0, 100) + '...';
        } else {
          selectedTextElement.textContent = text;
        }
      }
    });
    
    prefixButtons.forEach(button => {
      button.addEventListener('click', () => {
        const prefix = button.getAttribute('data-prefix') || '';
        
        window.electronAPI.performPrefixSearch({
          text: selectedText,
          prefix: prefix
        });
      });
    });
    
    const closeButton = document.getElementById('close-button');
    if (closeButton) {
      closeButton.addEventListener('click', () => {
        window.electronAPI.closePrefixSearch();
      });
    }
    
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        window.electronAPI.closePrefixSearch();
      }
      
      if (['1', '2', '3', '4', '5', '6'].includes(event.key)) {
        const index = parseInt(event.key) - 1;
        const buttons = document.querySelectorAll('.prefix-button');
        
        if (index >= 0 && index < buttons.length) {
          buttons[index].click();
        }
      }
    });
  } else {
    const loading = document.getElementById('loading');
    if (loading) {
      window.electronAPI.onPageLoading((isLoading) => {
        if (isLoading) {
          loading.classList.add('show');
        } else {
          loading.classList.remove('show');
        }
      });
    }

    window.electronAPI.getAppVersion().then((version) => {
      const versionDisplay = document.querySelector('.version-display');
      if (versionDisplay) {
        versionDisplay.textContent = `v${version}`;
      }
    });
    
    initNavigationButtons();

    initNotifications();

    initQuickSearch();

    initFindBar();
  }
});

function closeSettings() {
  window.electronAPI.closeSettings();
}

function initNavigationButtons() {
  const perplexityAIButton = document.querySelector('.menu-item[onclick*="perplexity.ai"]');
  const perplexityLabsButton = document.querySelector('.menu-item[onclick*="labs.perplexity.ai"]');
  const refreshButton = document.querySelector('.menu-item[onclick*="refresh"]');
  
  if (perplexityAIButton) {
    perplexityAIButton.addEventListener('click', (event) => {
      event.preventDefault();
      window.electronAPI.switchAITool('https://perplexity.ai');
    });
  }
  
  if (perplexityLabsButton) {
    perplexityLabsButton.addEventListener('click', (event) => {
      event.preventDefault();
      window.electronAPI.switchAITool('https://labs.perplexity.ai');
    });
  }
  
  if (refreshButton) {
    refreshButton.addEventListener('click', (event) => {
      event.preventDefault();
      window.electronAPI.switchAITool('refresh');
    });
  }
  
  const settingsButton = document.querySelector('.menu-item[onclick*="openSettings"]');
  if (settingsButton) {
    settingsButton.addEventListener('click', (event) => {
      event.preventDefault();
      window.electronAPI.openSettings();
    });
  }
}

function initNotifications() {
  const notificationButton = document.getElementById('notification-button');
  const notificationBadge = document.getElementById('notification-badge');

  if (notificationButton && notificationBadge) {
    notificationButton.addEventListener('click', (event) => {
      event.preventDefault();
      window.electronAPI.openNotificationPanel();
    });

    window.electronAPI.onNotificationBadgeUpdate((count) => {
      if (count > 0) {
        notificationBadge.textContent = count > 99 ? '99+' : count;
        notificationBadge.style.display = 'flex';
      } else {
        notificationBadge.style.display = 'none';
      }
    });
  }
}

function initQuickSearch() {
  const searchButton = document.getElementById('search-button');

  if (searchButton) {
    searchButton.addEventListener('click', () => {
      navigator.clipboard.readText()
        .then(text => {
          if (text && text.trim()) {
            window.electronAPI.performQuickSearch(text.trim());
          } else {
            console.log("No text in clipboard");
          }
        })
        .catch(err => {
          console.error('Failed to read clipboard contents: ', err);
        });
    });
  }
}

function initFindBar() {
  const findBar = document.getElementById('find-bar');
  const findInput = document.getElementById('find-input');
  const findMatches = document.getElementById('find-matches');
  const findPrev = document.getElementById('find-prev');
  const findNext = document.getElementById('find-next');
  const findClose = document.getElementById('find-close');

  if (!findBar || !findInput) return;

  let isOpen = false;

  function openFindBar() {
    findBar.classList.add('visible');
    window.electronAPI.findBarOpened();
    findInput.focus();
    findInput.select();
    isOpen = true;
  }

  function closeFindBar() {
    findBar.classList.remove('visible');
    findInput.value = '';
    findMatches.textContent = '0 / 0';
    window.electronAPI.stopFindInPage('clearSelection');
    window.electronAPI.findBarClosed();
    isOpen = false;
  }

  // Listen for toggle from main process (Ctrl+F menu accelerator)
  window.electronAPI.onToggleFindBar(() => {
    if (isOpen) {
      closeFindBar();
    } else {
      openFindBar();
    }
  });

  // Live search as user types
  findInput.addEventListener('input', () => {
    const text = findInput.value;
    if (text) {
      window.electronAPI.findInPage(text, { forward: true });
    } else {
      window.electronAPI.stopFindInPage('clearSelection');
      findMatches.textContent = '0 / 0';
    }
  });

  // Keyboard navigation
  findInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeFindBar();
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) {
        window.electronAPI.findInPage(findInput.value, { forward: false });
      } else {
        window.electronAPI.findInPage(findInput.value, { forward: true });
      }
    }
  });

  findPrev.addEventListener('click', () => {
    if (findInput.value) {
      window.electronAPI.findInPage(findInput.value, { forward: false });
    }
  });

  findNext.addEventListener('click', () => {
    if (findInput.value) {
      window.electronAPI.findInPage(findInput.value, { forward: true });
    }
  });

  findClose.addEventListener('click', closeFindBar);

  // Update match count from search results
  window.electronAPI.onFindResult((result) => {
    findMatches.textContent = `${result.activeMatchOrdinal} / ${result.matches}`;
  });
}