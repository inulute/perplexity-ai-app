const { app, BrowserWindow } = require("electron");
const path = require("path");

app.allowRendererProcessReuse = true;

let mainWindow;


app.on("ready", () => {
  // Create BrowserWindow for the main application
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 758,
    backgroundColor: "#272829",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    }, // Hide window frame (including menu bar)
    autoHideMenuBar: true,
  });

  // Load your initial HTML file
  mainWindow.loadFile(path.join(__dirname, "initial.html"));

  // Check if the current URL requires a redirect
  mainWindow.webContents.on('did-finish-load', () => {
    const currentURL = mainWindow.webContents.getURL();
    
    // Check if the current URL is the specified one that requires redirection
    if (currentURL === "https://www.perplexity.ai/auth/verify-request") {

        mainWindow.loadFile('./url-open.html');
    }
  });

  // Dialog logic can be included here if needed

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
});

app.on("window-all-closed", () => {
  app.quit();
});
