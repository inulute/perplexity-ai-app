document.addEventListener('DOMContentLoaded', () => {
  const notificationsList = document.getElementById('notifications-list');
  const emptyState = document.getElementById('empty-state');
  const listView = document.getElementById('list-view');
  const detailView = document.getElementById('detail-view');
  const notificationDetail = document.getElementById('notification-detail');
  const closeButton = document.getElementById('close-button');
  const markAllReadButton = document.getElementById('mark-all-read');
  const backButton = document.getElementById('back-button');
  
  let notifications = [];
  let activeNotificationId = null;

  window.notificationPanelAPI.onNotificationsList((data) => {
    notifications = data;
    renderNotificationsList();
  });

  function renderNotificationsList() {
    notificationsList.innerHTML = '';
    
    if (notifications.length === 0) {
      emptyState.style.display = 'flex';
      return;
    }
    
    emptyState.style.display = 'none';
    
    const sortedNotifications = [...notifications].sort((a, b) => {
      if (a.read !== b.read) {
        return a.read ? 1 : -1;
      }
      return new Date(b.receivedAt) - new Date(a.receivedAt);
    });
    
    sortedNotifications.forEach(notification => {
      const notificationItem = document.createElement('div');
      notificationItem.className = `notification-item ${notification.read ? '' : 'unread'}`;
      notificationItem.dataset.id = notification.id;
      
      const date = new Date(notification.receivedAt);
      const formattedDate = new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric'
      }).format(date);
      
      notificationItem.innerHTML = `
        <div class="notification-title">
          ${notification.read ? '' : '<span class="unread-marker"></span>'}
          ${notification.title}
        </div>
        <div class="notification-date">${formattedDate}</div>
        <div class="notification-actions">
          ${notification.read ? 
            '' : 
            '<button class="item-action mark-read-btn">Mark as read</button>'}
          <button class="item-action delete-btn">Delete</button>
        </div>
      `;
      
      notificationItem.addEventListener('click', (e) => {
        if (!e.target.classList.contains('item-action')) {
          openNotificationDetail(notification.id);
        }
      });
      
      notificationsList.appendChild(notificationItem);
    });
    
    document.querySelectorAll('.mark-read-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const notificationId = e.target.closest('.notification-item').dataset.id;
        markAsRead(notificationId);
      });
    });
    
    document.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const notificationId = e.target.closest('.notification-item').dataset.id;
        deleteNotification(notificationId);
      });
    });
  }

  async function openNotificationDetail(id) {
    activeNotificationId = id;
    
    markAsRead(id);
    
    notificationDetail.innerHTML = '<div style="text-align: center; padding: 20px;">Loading...</div>';
    
    const content = await window.notificationPanelAPI.getNotificationContent(id);
    if (!content) {
      notificationDetail.innerHTML = '<div style="text-align: center; padding: 20px;">Failed to load notification content</div>';
      return;
    }
    
    const notification = notifications.find(n => n.id === id);
    if (!notification) return;
    
    let htmlContent;
    try {
      htmlContent = marked.parse(content);
    } catch (error) {
      console.error('Error parsing markdown:', error);
      htmlContent = `<p>${content}</p>`;
    }
    
    notificationDetail.innerHTML = `
      <h1>${notification.title}</h1>
      <div>${htmlContent}</div>
    `;
    
    setupExternalLinks();
    
    listView.classList.add('hidden');
    detailView.classList.add('active');
  }
  
  function setupExternalLinks() {
    const links = notificationDetail.querySelectorAll('a[href]');
    
    links.forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        
        const url = link.getAttribute('href');
        
        console.log('Link clicked:', url);
        
        window.notificationPanelAPI.openExternalLink(url);
      });
    });
  }

  function markAsRead(id) {
    window.notificationPanelAPI.markAsRead(id);
    
    const notification = notifications.find(n => n.id === id);
    if (notification) {
      notification.read = true;
      
      const item = document.querySelector(`.notification-item[data-id="${id}"]`);
      if (item) {
        item.classList.remove('unread');
        const marker = item.querySelector('.unread-marker');
        if (marker) marker.remove();
        
        const readBtn = item.querySelector('.mark-read-btn');
        if (readBtn) readBtn.remove();
      }
    }
  }

  function deleteNotification(id) {
    window.notificationPanelAPI.deleteNotification(id);
    
    const index = notifications.findIndex(n => n.id === id);
    if (index !== -1) {
      notifications.splice(index, 1);
      
      const item = document.querySelector(`.notification-item[data-id="${id}"]`);
      if (item) {
        item.remove();
      }
      
      if (notifications.length === 0) {
        emptyState.style.display = 'flex';
      }
      
      if (activeNotificationId === id) {
        backToList();
      }
    }
  }

  function backToList() {
    activeNotificationId = null;
    detailView.classList.remove('active');
    listView.classList.remove('hidden');
  }

  closeButton.addEventListener('click', () => {
    window.notificationPanelAPI.closePanel();
  });
  
  markAllReadButton.addEventListener('click', () => {
    window.notificationPanelAPI.markAllAsRead();
    
    notifications.forEach(notification => {
      notification.read = true;
    });
    renderNotificationsList();
  });
  
  backButton.addEventListener('click', backToList);
});