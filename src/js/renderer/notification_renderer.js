document.addEventListener('DOMContentLoaded', () => {
  const titleElement = document.getElementById('notification-title');
  const contentElement = document.getElementById('notification-content');
  const closeButton = document.getElementById('close-button');
  const okButton = document.getElementById('ok-button');
  
  let currentNotificationId = null;
  
  console.log('Notification renderer loaded');
  
  window.notificationAPI.onNotificationData((data) => {
    console.log('Notification data received:', data);
    
    if (!data) {
      console.error('No notification data received');
      contentElement.innerHTML = '<p>Error: No content to display</p>';
      return;
    }
    
    if (data.title) titleElement.textContent = data.title;
    if (data.content) {
      contentElement.innerHTML = data.content;
      setTimeout(() => contentElement.style.opacity = '1', 10);
    } else {
      contentElement.innerHTML = '<p>No content available</p>';
    }
    
    currentNotificationId = data.id;
    
    setupExternalLinks();
  });

  closeButton.addEventListener('click', () => {
    console.log('Close button clicked');
    window.notificationAPI.closeNotification();
  });

  okButton.addEventListener('click', () => {
    console.log('OK button clicked');
    if (currentNotificationId) {
      window.notificationAPI.markAsRead(currentNotificationId);
    }
    window.notificationAPI.closeNotification();
  });
  
  function setupExternalLinks() {
    const links = contentElement.querySelectorAll('a[href]');
    
    console.log(`Setting up ${links.length} external links`);
    
    links.forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        
        const url = link.getAttribute('href');
        
        console.log('Link clicked:', url);
        
        window.notificationAPI.openExternalLink(url);
      });
    });
  }
});