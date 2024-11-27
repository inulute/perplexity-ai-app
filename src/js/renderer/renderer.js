// renderer.js

document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('settings-container')) {
    const shortcutFields = {
      perplexityAI: document.getElementById('shortcut-perplexityAI'),
      perplexityLabs: document.getElementById('shortcut-perplexityLabs'),
      minimizeApp: document.getElementById('shortcut-minimizeApp'),
      sendToTray: document.getElementById('shortcut-sendToTray'),
      restoreApp: document.getElementById('shortcut-restoreApp'),
      reload: document.getElementById('shortcut-reload'),
    };

    const defaultAISelect = document.getElementById('defaultAI');
    let newShortcuts = {};
    let savedShortcuts = {};
    const isMac = window.electronAPI.platform === 'darwin';

    function loadCurrentShortcuts() {
      for (const [key, input] of Object.entries(shortcutFields)) {
        const savedShortcut = savedShortcuts[key]
          .replace(/Control/g, 'Ctrl')
          .replace(/Command/g, 'Cmd');
        input.value = isMac ? savedShortcut.replace(/Ctrl/g, 'Cmd') : savedShortcut.replace(/Cmd/g, 'Ctrl');
        input.nextElementSibling.textContent = '';
      }
    }

    function detachShortcuts() {
      for (const input of Object.values(shortcutFields)) {
        input.value = '';
        input.nextElementSibling.textContent = '';
      }
    }
    

    function reattachShortcuts() {
      loadCurrentShortcuts();
    }

    window.electronAPI.getSettings();

    window.electronAPI.onSettingsReceived((data) => {
      newShortcuts = { ...data.shortcuts };
      savedShortcuts = { ...data.shortcuts };
    
      loadCurrentShortcuts();
      defaultAISelect.value = data.defaultAI || 'https://perplexity.ai';
    
      const toggleShortcuts = document.getElementById('toggleShortcuts');
      toggleShortcuts.checked = data.shortcutEnabled !== false; // Default to true if undefined
      if (!toggleShortcuts.checked) {
        detachShortcuts();
        for (const input of Object.values(shortcutFields)) {
          input.disabled = true;
        }
      }
    });
    

    for (const [key, input] of Object.entries(shortcutFields)) {
      input.addEventListener('focus', () => {
        input.classList.add('active');
        const warning = input.nextElementSibling;
        warning.textContent = '';
      });

      input.addEventListener('blur', () => {
        input.classList.remove('active');
        checkForDuplicates();
      });

      input.addEventListener('keydown', (event) => {
        event.preventDefault();

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

        const keyName = event.code.startsWith('Key') ? event.code.slice(3).toUpperCase() : event.key;
        const keyCombo = [...modifiers, keyName].join('+');
        input.value = keyCombo;

        newShortcuts[key] = keyCombo.replace(/Cmd/g, 'Command').replace(/Ctrl/g, 'Control');

        checkForDuplicates();
      });
    }

    document.getElementById('restore-button').addEventListener('click', () => {
      newShortcuts = { ...savedShortcuts };
      loadCurrentShortcuts();
    });

    document.getElementById('settings-form').addEventListener('submit', (event) => {
      event.preventDefault();
      if (checkForDuplicates(true)) {
        const toggleShortcuts = document.getElementById('toggleShortcuts');
        const settingsToSave = {
          shortcuts: newShortcuts,
          defaultAI: defaultAISelect.value,
          shortcutEnabled: toggleShortcuts.checked, // Save toggle state
        };
        window.electronAPI.setSettings(settingsToSave);
        savedShortcuts = { ...newShortcuts };
        window.electronAPI.closeSettings();
      }
    });
    

    document.getElementById('toggleShortcuts').addEventListener('change', (event) => {
      const shortcutEnabled = event.target.checked;
      if (!shortcutEnabled) {
        detachShortcuts();
      } else {
        reattachShortcuts();
      }
    
      for (const input of Object.values(shortcutFields)) {
        input.disabled = !shortcutEnabled;
      }
    });
    

    document.querySelector('.close-button').addEventListener('click', () => {
      reattachShortcuts();
      window.electronAPI.closeSettings();
    });

    function checkForDuplicates(finalCheck = false) {
      let valid = true;
    
      const toggleShortcuts = document.getElementById('toggleShortcuts');
      if (!toggleShortcuts.checked) {
        return true;
      }
    
      const shortcutValues = {};
      document.querySelectorAll(".tooltip").forEach((tooltip) => tooltip.remove());
    
      for (const [key, input] of Object.entries(shortcutFields)) {
        const value = input.value.trim();
    
        if (!value && finalCheck) {
          valid = false;
          showTooltip(input, `Please set a shortcut for "${getFriendlyName(key)}".`);
          continue;
        }
    
        const normalizedShortcut = normalizeShortcut(newShortcuts[key] || value);
    
        if (shortcutValues[normalizedShortcut]) {
          valid = false;
          const existingKey = shortcutValues[normalizedShortcut];
          showTooltip(input, `Shortcut "${value}" is already assigned to "${getFriendlyName(existingKey)}".`);
          showTooltip(shortcutFields[existingKey], `Shortcut "${value}" is already assigned to "${getFriendlyName(key)}".`);
        } else if (value) {
          shortcutValues[normalizedShortcut] = key;
        }
      }
    
      return valid;
    }
    

    function normalizeShortcut(shortcut) {
      shortcut = shortcut
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
        perplexityAI: 'Perplexity AI',
        perplexityLabs: 'Perplexity Labs',
        minimizeApp: 'Minimize App',
        sendToTray: 'Send to Tray',
        restoreApp: 'Restore App',
        reload: 'Reload',
      };
      return nameMap[key] || key;
    }


    function showTooltip(input, message) {

  let existingTooltip = input.parentElement.querySelector('.tooltip');
  if (existingTooltip) existingTooltip.remove();


  const tooltip = document.createElement('div');
  tooltip.className = 'tooltip visible';
  tooltip.textContent = message;

  input.parentElement.appendChild(tooltip);

  const rect = input.getBoundingClientRect();
  tooltip.style.top = `${rect.top + window.scrollY - tooltip.offsetHeight - 5}px`;
  tooltip.style.left = `${rect.left + window.scrollX + input.offsetWidth / 2 - tooltip.offsetWidth / 2}px`;
}

    document.querySelector('.close-button').addEventListener('click', () => {
      window.electronAPI.closeSettings();
    });
  } else {

    const loading = document.getElementById('loading');
    window.electronAPI.onPageLoading((isLoading) => {
      if (isLoading) {
        loading.classList.add('show');
      } else {
        loading.classList.remove('show');
      }
    });

    window.electronAPI.getAppVersion().then((version) => {
      const versionDisplay = document.querySelector('.version-display');
      if (versionDisplay) {
        versionDisplay.textContent = `v${version}`;
      }
    });
  }
});

