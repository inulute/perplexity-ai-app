const { app, BrowserWindow, dialog } = require("electron");
const path = require("path");

app.allowRendererProcessReuse = true;

let mainWindow;
let dialogWindow;

app.on("ready", () => {
  const window = require("./src/window");
  mainWindow = window.createBrowserWindow(app);
  mainWindow.setMenu(null);

  const createCustomDialog = () => {
    dialogWindow = new BrowserWindow({
      parent: mainWindow,
      modal: true,
      show: false,
      width: 400,
      height: 570,
      backgroundColor: "#272829",
      webPreferences: {
        preload: path.join(__dirname, "preload.js"),
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    // Load HTTPS URLs
    const promptObject = {
      type: "question",
      title: "Choose an AI to navigate",
      message: "Choose an AI to navigate:",
      buttons: ["Perplexity AI: AI Search", "Labs Perplexity AI: AI Chat"],
    };

    dialog.showMessageBox(mainWindow, promptObject)
      .then((response) => {
        const chosenWebsite = promptObject.buttons[response.response];
        if (chosenWebsite === "Perplexity AI: AI Search") {
          mainWindow.loadURL("https://perplexity.ai");
        } else if (chosenWebsite === "Labs Perplexity AI: AI Chat") {
          mainWindow.loadURL("https://labs.perplexity.ai");
        }
      })
      .catch((error) => {
        console.error(error);
      });
  };

  // Load dialog window on app ready
  createCustomDialog();

  // Rest of your code...

});

app.on("window-all-closed", () => {
  app.quit();
});
