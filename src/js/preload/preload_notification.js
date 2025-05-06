const { contextBridge, ipcRenderer } = require('electron');

console.log('Notification preload script running');

contextBridge.exposeInMainWorld('notificationAPI', {
  onNotificationData: (callback) => {
    console.log('Registering notification data handler');
    
    ipcRenderer.on('notification-data', (event, data) => {
      console.log('Received notification data event:', data ? 'contains data' : 'empty');
      callback(data);
    });
  },
  markAsRead: (id) => {
    console.log('Marking notification as read:', id);
    ipcRenderer.send('mark-notification-read', id);
  },
  closeNotification: () => {
    console.log('Closing notification window');
    ipcRenderer.send('close-notification');
  },
  openExternalLink: (url) => {
    console.log('Opening external link:', url);
    ipcRenderer.send('open-external-link', url);
  }
});

console.log('Notification preload bridges created');