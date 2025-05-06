// search-service.js
const { clipboard, Notification, shell, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const { execFile, spawn, exec } = require('child_process');
const os = require('os');
const app = require('electron').app;

class SearchService {
  constructor(mainWindow, switchViewCallback) {
    this.mainWindow = mainWindow;
    this.switchView = switchViewCallback;
    this.isWindows = process.platform === 'win32';
    this.isMac = process.platform === 'darwin';
    this.isLinux = process.platform === 'linux';
    
    // Check for Linux dependencies on initialization
    if (this.isLinux) {
      this.checkLinuxDependencies();
    }
  }

  /**
   * Check if required Linux dependencies are installed
   * and notify user if they're missing
   */
  checkLinuxDependencies() {
    exec('which xclip', (clipError, clipStdout) => {
      if (clipError || !clipStdout) {
        setTimeout(() => {
          this.showNotification('Linux Dependency Missing', 
            'Please install xclip: sudo pacman -S xclip');
        }, 3000);
      }
    });
  }

  /**
   * Search for the currently selected text with auto-copy feature
   * Approach:
   * 1. Saves the current clipboard content
   * 2. Gets selected text directly from X11 selection
   * 3. Performs the search
   * 4. Restores the original clipboard content
   */
  async searchSelectedText() {
    // Store the original clipboard content
    const originalClipboardContent = clipboard.readText();
    
    try {
      // For Linux X11, try using xclip directly instead of simulating Ctrl+C
      if (this.isLinux) {
        const selectedText = await this.getX11Selection();
        
        if (!selectedText) {
          this.showNotification('No Text Selected', 
            'Please select text before searching or copy manually with Ctrl+C first.');
          return;
        }
        
        // Perform the search with the selected text
        this.performSearch(selectedText);
        
        // Restore the original clipboard content
        setTimeout(() => {
          clipboard.writeText(originalClipboardContent);
        }, 1000);
        
        return;
      }
      
      // For non-Linux
      clipboard.writeText('');
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Simulate Ctrl+C to copy the selected text
      await this.copySelectedText();
      
      const readDelay = 400;
      await new Promise(resolve => setTimeout(resolve, readDelay));
      
      const selectedText = clipboard.readText().trim();
      
      console.log('Copied text:', selectedText);
      
      if (!selectedText) {
        this.showNotification('No text selected', 'Please select text before searching.');
        this.showNotification('Tip', 'Try selecting text and copying it manually with Ctrl+C first.');
        return;
      }
      
      // Perform the search
      this.performSearch(selectedText);
      
      setTimeout(() => {
        clipboard.writeText(originalClipboardContent);
      }, 1000);
      
    } catch (error) {
      console.error('Error during auto-copy search:', error);
      this.showNotification('Error', 'Failed to get selected text.');
      
      if (this.isLinux) {
        this.showNotification('Linux Tip', 
          'Try copying text manually with Ctrl+C before using the shortcut.');
      } else {
        this.showNotification('Tip', 
          'Try copying text manually with Ctrl+C and then using the search shortcut.');
      }
      
      clipboard.writeText(originalClipboardContent);
    }
  }

  //Get selected text directly from X11 selection
  getX11Selection() {
    return new Promise((resolve) => {

      exec('xclip -o -selection primary', { timeout: 1000 }, (primaryError, primaryText) => {
        if (!primaryError && primaryText && primaryText.trim()) {
          console.log('Got text from primary selection');
          resolve(primaryText.trim());
        } else {
          exec('xclip -o -selection clipboard', { timeout: 1000 }, (clipboardError, clipboardText) => {
            if (!clipboardError && clipboardText && clipboardText.trim()) {
              console.log('Got text from clipboard selection');
              resolve(clipboardText.trim());
            } else {
            
              this.simulateCtrlC().then(() => {
              
                setTimeout(() => {
                  const clipText = clipboard.readText().trim();
                  console.log('After Ctrl+C simulation, got text:', clipText ? 'yes' : 'no');
                  resolve(clipText);
                }, 800);
              });
            }
          });
        }
      });
    });
  }

  /**
   * Uses multiple approaches in sequence to maximize chances of success
   */
  simulateCtrlC() {
    return new Promise((resolve) => {

      exec('xdotool key --clearmodifiers ctrl+c', (error1) => {
        if (error1) {
          console.log('First xdotool attempt failed, trying alternative');

          exec('xdotool keydown ctrl key c keyup ctrl', (error2) => {
            if (error2) {
              console.log('All xdotool attempts failed');
            }
            resolve();
          });
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Modified: Search with a custom prefix
   * Uses direct X11 selection for Linux systems
   */
  async searchWithCustomPrefix() {
    // Store the original clipboard content
    const originalClipboardContent = clipboard.readText();
    
    try {
      let selectedText;
      
      // For Linux X11, use direct selection method
      if (this.isLinux) {
        selectedText = await this.getX11Selection();
      } else {
        // For other platforms, use the original approach
        clipboard.writeText('');
        await new Promise(resolve => setTimeout(resolve, 50));
        
        // Simulate Ctrl+C to copy the selected text
        await this.copySelectedText();
        
        // Increased delay to ensure the clipboard is updated
        await new Promise(resolve => setTimeout(resolve, 400));
        
        // Get the newly copied text
        selectedText = clipboard.readText().trim();
      }
      
      // If no text was selected
      if (!selectedText) {
        if (this.isLinux) {
          this.showNotification('No Text Selected', 
            'Please select text before searching or copy manually with Ctrl+C first.');
        } else {
          this.showNotification('No text selected', 'Please select text before searching.');
        }
        this.showNotification('Tip', 'Try selecting text and copying it manually with Ctrl+C first.');
        
        // Restore the original clipboard content
        clipboard.writeText(originalClipboardContent);
        return;
      }
      
      // The actual prefix selection dialog is now handled by main.js through showPrefixSearchWindow()
  
      
    } catch (error) {
      console.error('Error during custom prefix search:', error);
      this.showNotification('Error', 'Failed to get selected text.');
      
      // Restore the original clipboard content
      clipboard.writeText(originalClipboardContent);
    }
  }

  /**
   * Simulate keyboard shortcut to copy text
   * Kept for non-Linux platforms and as a fallback for Linux
   */
  async copySelectedText() {
    return new Promise(async (resolve, reject) => {
      try {
        if (this.isWindows) {
          // Try multiple Windows approaches for better reliability
          try {
            // More robust PowerShell approach 
            await new Promise((innerResolve, innerReject) => {
              exec('powershell -WindowStyle Hidden -command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait(\'^c\')"', 
                { windowsHide: true, timeout: 1500 }, 
                (error) => {
                  if (error) {
                    console.log('Error with System.Windows.Forms approach:', error);
                    innerReject(error);
                  } else {
                    innerResolve();
                  }
                }
              );
            });
          } catch (err) {
            // Fallback to original method if the improved one fails
            exec('powershell -WindowStyle Hidden -command "$wshell = New-Object -ComObject wscript.shell; $wshell.SendKeys(\'^c\')"', 
              { windowsHide: true }, 
              (error) => {
                if (error) {
                  console.error('Fallback copy method error:', error);
                }
              }
            );
          }
        } else if (this.isMac) {
          // Improved AppleScript for macOS
          exec('osascript -e \'tell application "System Events" to keystroke "c" using {command down}\'', 
            (error) => {
              if (error) {
                console.error('Error simulating Cmd+C:', error);
              }
            }
          );
        } else {
          this.simulateCtrlC();
        }
        
        // Delay to ensure clipboard is updated
        await new Promise(resolve => setTimeout(resolve, 400));
        
        resolve();
      } catch (err) {
        console.error('Unexpected error in copySelectedText:', err);

        resolve();
      }
    });
  }

  /**
   * Perform search with the given text
   * @param {string} searchText - Text to search for
   * @param {string} [prefix=''] - Optional prefix for search query (e.g., 'explain ', 'meaning of ')
   */
  performSearch(searchText, prefix = '') {
    if (!searchText?.trim()) return;
    
    // Format search URL
    const formattedText = prefix + searchText.trim();
    const searchUrl = `https://www.perplexity.ai/search?q=${encodeURIComponent(formattedText)}`;
    
    this.switchView(searchUrl);
    
    // Show the main window if it's hidden
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      if (!this.mainWindow.isVisible()) {
        this.mainWindow.show();
      }
      this.mainWindow.focus();
    }
  }

  /**
   * Show a notification to the user
   * @param {string} title - Notification title
   * @param {string} body - Notification body text
   */
  showNotification(title, body) {
    const notification = new Notification({
      title,
      body
    });
    notification.show();
  }
}

module.exports = SearchService;