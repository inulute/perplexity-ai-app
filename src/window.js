const path = require("path");
const { BrowserWindow } = require("electron");

exports.createBrowserWindow = () => {
  return new BrowserWindow({
    width: 1000,
    height: 768,
    minWidth: 400, 
    minHeight: 600,
    icon: path.join(__dirname, "assets/icons/png/favicon.png"),
    backgroundColor: "#fff",
    autoHideMenuBar: true,
    webPreferences: {
      devTools: false,
      contextIsolation: true,
      webviewTag: true,
      preload: path.join(__dirname, "../preload.js"),
      nodeIntegration: false,
      nativeWindowOpen: true,
      webSecurity: true,
    },
  });
};
