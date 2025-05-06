// preload_notification_panel.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('notificationPanelAPI', {
  onNotificationsList: (callback) => 
    ipcRenderer.on('notifications-list', (event, data) => callback(data)),
  
getNotificationContent: (id) => 
  ipcRenderer.invoke('get-notification-content', id, true),

  markAsRead: (id) => 
    ipcRenderer.send('mark-notification-read', id),
  
  deleteNotification: (id) => 
    ipcRenderer.send('delete-notification', id),
  
  markAllAsRead: () => 
    ipcRenderer.send('mark-all-notifications-read'),
  
  clearAllNotifications: () => 
    ipcRenderer.send('clear-all-notifications'),
  
  closePanel: () => 
    ipcRenderer.send('close-notification-panel'),
    
  openExternalLink: (url) => 
    ipcRenderer.send('open-external-link', url)
});