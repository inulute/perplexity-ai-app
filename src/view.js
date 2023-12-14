const { BrowserView } = require("electron");

exports.createBrowserView = (mainWindow) => {
  const view = new BrowserView();
  mainWindow.setBrowserView(view);
  view.setBounds({ x: 0, y: 0, width: 1000, height: 768 });

  // Get the selected website from the dropdown menu
  const selectedWebsite = mainWindow.webContents.getViewById("websiteDropdown").value;

  // Load the selected website in the browser view
  view.webContents.loadURL(selectedWebsite);
};