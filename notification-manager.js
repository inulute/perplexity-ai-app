// notification-manager.js
const { BrowserWindow, net, ipcMain } = require('electron');
const path = require('path');
const marked = require('marked');
const Store = require('electron-store');

class NotificationManager {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.store = new Store();
    this.notificationWindow = null;
    this.panelWindow = null;
    
    
    this.notifications = this.store.get('notifications', {
      items: [],
      unreadCount: 0
    });

    this.dismissedNotifications = this.store.get('dismissedNotifications', []);
    
    this.repoOwner = 'inulute'; 
    this.repoName = 'simplexityai-app';
    this.repoBranch = 'main';
    
    // Cache control
    this.lastFetchTime = 0;
    this.fetchCooldown = 3600000; // 1 hours in milliseconds
    
    // Notification check interval (1 hours)
    this.checkInterval = 3600000; // 1 hours in milliseconds
    this.intervalId = null;
    
    this.startPeriodicChecks();
  }
  
  
  startPeriodicChecks() {
    // Clear any existing interval first
    this.stopPeriodicChecks();
    
    console.log('Starting periodic notification checks (every 1 hours)');
    
    this.checkForNotifications();
    
    this.intervalId = setInterval(() => {
      console.log('Running scheduled notification check');
      this.checkForNotifications();
    }, this.checkInterval);
  }
  
  stopPeriodicChecks() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('Stopped periodic notification checks');
    }
  }
  
  cleanup() {
    this.stopPeriodicChecks();
    this.closeNotificationWindow();
    this.closePanelWindow();
  }

  async checkForNotifications() {
    try {
      const now = Date.now();
      if (now - this.lastFetchTime < this.fetchCooldown) {
        console.log('Skipping notification check - checked recently');
        return;
      }
      this.lastFetchTime = now;
      
      console.log('Checking for notifications at', new Date().toLocaleString());
      
      const manifest = await this.fetchNotificationManifest();
      if (!manifest) {
        console.log('No manifest data received');
        return;
      }
      const manifestNotificationIds = manifest.notifications.map(notif => notif.id);
      console.log('Manifest notification IDs:', manifestNotificationIds);

      const notificationsToRemove = [];
      
      this.notifications.items.forEach(localNotif => {
        if (this.dismissedNotifications.includes(localNotif.id)) {
          return;
        }
        
        if (!manifestNotificationIds.includes(localNotif.id)) {
          console.log(`Notification #${localNotif.id} was removed from manifest - removing from app`);
          notificationsToRemove.push(localNotif.id);
        }
      });

      if (notificationsToRemove.length > 0) {
        console.log(`Removing ${notificationsToRemove.length} deleted notifications`);
        
        notificationsToRemove.forEach(id => {
          const index = this.notifications.items.findIndex(n => n.id === id);
          if (index !== -1) {
            const notification = this.notifications.items[index];
            if (!notification.read) {
              this.notifications.unreadCount = Math.max(0, this.notifications.unreadCount - 1);
            }
            this.notifications.items.splice(index, 1);
          }
        });
        
        this.saveNotifications();
        this.updateBadge();
      }

      let newNotificationsFound = false;
      let highPriorityNotification = null;

      for (const notif of manifest.notifications) {
        if (this.dismissedNotifications.includes(notif.id)) {
          continue;
        }

        const existing = this.notifications.items.find(item => item.id === notif.id);
        
        if (!existing) {
          const newNotif = {
            ...notif,
            read: false,
            receivedAt: new Date().toISOString(),
            content: null 
          };

          this.notifications.items.push(newNotif);
          this.notifications.unreadCount++;
          newNotificationsFound = true;

          if (notif.priority === 'high' && (!highPriorityNotification || 
              new Date(notif.date) > new Date(highPriorityNotification.date))) {
            highPriorityNotification = newNotif;
          }
        }
      }

      if (newNotificationsFound || notificationsToRemove.length > 0) {
        if (newNotificationsFound) {
          console.log(`Found ${this.notifications.unreadCount} new notification(s)`);
        }
        this.saveNotifications();

        this.updateBadge();

        if (highPriorityNotification) {
          await this.showNotification(highPriorityNotification);
        }
      } else {
        console.log('No notification changes detected');
      }
    } catch (error) {
      console.error('Error checking for notifications:', error);
    }
  }

  async fetchNotificationManifest() {
    return new Promise(async (resolve) => {
      const timestamp = Date.now();
      const cdnUrl = `https://cdn.jsdelivr.net/gh/${this.repoOwner}/${this.repoName}@${this.repoBranch}/notifications/notification-manifest.json?_=${timestamp}`;

      console.log('Fetching notifications from:', cdnUrl);
      
      let retryCount = 0;
      const maxRetries = 3;
      
      const fetchWithRetry = async () => {
        try {
          const request = net.request({
            url: cdnUrl,
            method: 'GET',
            headers: {
              'Cache-Control': 'no-cache, no-store, must-revalidate',
              'Pragma': 'no-cache',
              'Expires': '0'
            }
          });
          
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Fetch timed out')), 15000);
          });
          
          const fetchPromise = new Promise((resolveFetch, rejectFetch) => {
            let data = '';
            
            request.on('response', (response) => {
              if (response.statusCode !== 200) {
                rejectFetch(new Error(`Failed to fetch notification manifest: HTTP ${response.statusCode}`));
                return;
              }
              
              response.on('data', (chunk) => {
                data += chunk;
              });
              
              response.on('end', () => {
                try {
                  const manifest = JSON.parse(data);
                  resolveFetch(manifest);
                } catch (error) {
                  rejectFetch(new Error('Error parsing notification manifest: ' + error.message));
                }
              });
            });
            
            request.on('error', (error) => {
              rejectFetch(new Error('Error fetching notification manifest: ' + error.message));
            });
            
            request.end();
          });
          
          const result = await Promise.race([fetchPromise, timeoutPromise]);
          return result;
        } catch (error) {
          if (retryCount < maxRetries) {
            retryCount++;
            console.log(`Retry attempt ${retryCount}/${maxRetries}: ${error.message}`);
            await new Promise(r => setTimeout(r, 1000 * Math.pow(2, retryCount)));
            return fetchWithRetry();
          } else {
            console.error('All retry attempts failed:', error);
            return null;
          }
        }
      };
      
      const manifest = await fetchWithRetry();
      resolve(manifest);
    });
  }

  async fetchNotificationContent(filename) {
    return new Promise(async (resolve) => {
      const timestamp = Date.now();
      const url = `https://cdn.jsdelivr.net/gh/${this.repoOwner}/${this.repoName}@${this.repoBranch}/notifications/${filename}?_=${timestamp}`;
      
      let retryCount = 0;
      const maxRetries = 3;
      
      const fetchWithRetry = async () => {
        try {
          const request = net.request({
            url: url,
            method: 'GET',
            headers: {
              'Cache-Control': 'no-cache, no-store, must-revalidate',
              'Pragma': 'no-cache',
              'Expires': '0'
            }
          });
          
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Content fetch timed out')), 15000); // 15 second timeout
          });
          
          const fetchPromise = new Promise((resolveFetch, rejectFetch) => {
            let data = '';
            
            request.on('response', (response) => {
              if (response.statusCode !== 200) {
                rejectFetch(new Error(`Failed to fetch notification content: HTTP ${response.statusCode}`));
                return;
              }
              
              response.on('data', (chunk) => {
                data += chunk;
              });
              
              response.on('end', () => {
                resolveFetch(data);
              });
            });
            
            request.on('error', (error) => {
              rejectFetch(new Error('Error fetching notification content: ' + error.message));
            });
            
            request.end();
          });
          
          const result = await Promise.race([fetchPromise, timeoutPromise]);
          return result;
        } catch (error) {
          if (retryCount < maxRetries) {
            retryCount++;
            console.log(`Retry attempt ${retryCount}/${maxRetries}: ${error.message}`);
            await new Promise(r => setTimeout(r, 1000 * Math.pow(2, retryCount)));
            return fetchWithRetry();
          } else {
            console.error('All retry attempts failed:', error);
            return null;
          }
        }
      };
      
      const content = await fetchWithRetry();
      resolve(content);
    });
  }

  async showNotification(notification) {
    try {
      if (this.notificationWindow) {
        this.closeNotificationWindow();
      }
  
      if (!notification.content) {
        const content = await this.fetchNotificationContent(notification.filename);
        if (!content) return;
        notification.content = content;
        this.saveNotifications();
      }
  
      const htmlContent = marked.parse(notification.content);
  
      this.notificationWindow = new BrowserWindow({
        width: 500,
        height: 400,
        parent: this.mainWindow,
        modal: false,
        show: false,
        frame: false,
        resizable: true,
        webPreferences: {
          preload: path.join(__dirname, 'src', 'js', 'preload', 'preload_notification.js'),
          contextIsolation: true,
          nodeIntegration: false,
        },
      });
  
      this.setupNotificationWindowHandlers();
      
      await this.notificationWindow.loadFile('notification.html');
  
      this.notificationWindow.once('ready-to-show', () => {
        this.notificationWindow.webContents.send('notification-data', {
          title: notification.title,
          content: htmlContent,
          id: notification.id
        });
        
        this.notificationWindow.show();
        
        this.notificationWindow.focus();
      });
  
      this.notificationWindow.once('closed', () => {
        this.notificationWindow = null;
      });
    } catch (error) {
      console.error('Error showing notification window:', error);
      this.closeNotificationWindow();
    }
  }
  
  setupNotificationWindowHandlers() {
    ipcMain.once('close-notification', () => {
      this.closeNotificationWindow();
    });
    
    ipcMain.once('mark-notification-read', (event, id) => {
      this.markAsRead(id);
      this.closeNotificationWindow();
    });
    
    ipcMain.once('open-external-link', (event, url) => {
      require('electron').shell.openExternal(url).catch(err => {
        console.error('Failed to open external link:', err);
      });
    });
  }

  closeNotificationWindow() {
    if (this.notificationWindow && !this.notificationWindow.isDestroyed()) {
      this.notificationWindow.close();
      this.notificationWindow = null;
    }
  }

  markAsRead(notificationId) {
    const notification = this.notifications.items.find(n => n.id === notificationId);
    if (notification && !notification.read) {
      notification.read = true;
      notification.readAt = new Date().toISOString();
      this.notifications.unreadCount = Math.max(0, this.notifications.unreadCount - 1);
      this.saveNotifications();
      this.updateBadge();
    }
  }

  deleteNotification(notificationId) {
    if (!this.dismissedNotifications.includes(notificationId)) {
      this.dismissedNotifications.push(notificationId);
      this.store.set('dismissedNotifications', this.dismissedNotifications);
    }
    
    const index = this.notifications.items.findIndex(n => n.id === notificationId);
    if (index !== -1) {
      const notification = this.notifications.items[index];
      if (!notification.read) {
        this.notifications.unreadCount = Math.max(0, this.notifications.unreadCount - 1);
      }
      this.notifications.items.splice(index, 1);
      this.saveNotifications();
      this.updateBadge();
    }
  }

  markAllAsRead() {
    let updated = false;
    this.notifications.items.forEach(notification => {
      if (!notification.read) {
        notification.read = true;
        notification.readAt = new Date().toISOString();
        updated = true;
      }
    });

    if (updated) {
      this.notifications.unreadCount = 0;
      this.saveNotifications();
      this.updateBadge();
    }
  }

  clearAllNotifications() {
    const notificationIds = this.notifications.items.map(item => item.id);
    
    notificationIds.forEach(id => {
      if (!this.dismissedNotifications.includes(id)) {
        this.dismissedNotifications.push(id);
      }
    });
    
    this.store.set('dismissedNotifications', this.dismissedNotifications);
    
    this.notifications.items = [];
    this.notifications.unreadCount = 0;
    this.saveNotifications();
    this.updateBadge();
  }

  saveNotifications() {
    this.store.set('notifications', this.notifications);
  }

  updateBadge() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('notification-badge-update', 
        this.notifications.unreadCount);
    }
  }

  async showNotificationPanel() {
    if (this.panelWindow) {
      this.closePanelWindow();
      return;
    }

    try {
      const isFullScreen = this.mainWindow.isFullScreen();
      
      this.panelWindow = new BrowserWindow({
        width: 500,
        height: 600,
        parent: isFullScreen ? null : this.mainWindow, // Don't set parent if in fullscreen
        modal: false,
        show: false,
        frame: false,
        resizable: true,
        fullscreenable: false, // Prevent fullscreen capability
        webPreferences: {
          preload: path.join(__dirname, 'src', 'js', 'preload', 'preload_notification_panel.js'),
          contextIsolation: true,
          nodeIntegration: false,
        },
      });

      if (isFullScreen) {
        const bounds = this.mainWindow.getBounds();
        this.panelWindow.setPosition(
          bounds.x + bounds.width - 520, 
          bounds.y + 80
        );
      }

      const htmlPath = path.join(__dirname, 'notification-panel.html');
      console.log('Loading notification panel from:', htmlPath);
      
      await this.panelWindow.loadFile('notification-panel.html').catch(err => {
        console.error('Error loading notification panel:', err);
        throw err;
      });

      this.panelWindow.webContents.send('notifications-list', this.notifications.items);

      this.panelWindow.once('ready-to-show', () => {
        this.panelWindow.show();
        this.panelWindow.focus();
      });

      this.panelClosedHandler = () => {
        this.panelWindow = null;
        setTimeout(() => {
          if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.focus();
          }
        }, 100);
      };

      this.panelWindow.once('closed', this.panelClosedHandler);
    } catch (error) {
      console.error('Failed to create notification panel:', error);
      this.closePanelWindow();
    }
  }

  closePanelWindow() {
    if (this.panelWindow && !this.panelWindow.isDestroyed()) {
      this.panelWindow.hide();
      
      setTimeout(() => {
        if (this.panelWindow && !this.panelWindow.isDestroyed()) {
          this.panelWindow.close();
          this.panelWindow = null;
        }
        
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.focus();
        }
      }, 50);
    }
  }

  getNotificationById(id) {
    return this.notifications.items.find(n => n.id === id);
  }

  async getNotificationContent(id) {
    const notification = this.getNotificationById(id);
    if (!notification) return null;

    if (!notification.content) {
      notification.content = await this.fetchNotificationContent(notification.filename);
      this.saveNotifications();
    }

    return notification.content;
  }
  
  async getRealTimeContent(id) {
    const notification = this.getNotificationById(id);
    if (!notification) return null;
    
    console.log(`Fetching real-time content for notification #${id}`);
    
    return await this.fetchNotificationContent(notification.filename);
  }

  getUnreadCount() {
    return this.notifications.unreadCount;
  }
  
  resetDismissedNotifications() {
    this.dismissedNotifications = [];
    this.store.set('dismissedNotifications', []);
    console.log('Dismissed notifications reset');
  }
}

module.exports = NotificationManager;