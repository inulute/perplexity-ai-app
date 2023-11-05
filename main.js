const { app, BrowserWindow, dialog } = require("electron");

app.allowRendererProcessReuse = true;
app.on("ready", () => {
  const mainWindow = new BrowserWindow();
  mainWindow.setMenu(null);

  // Load HTTPS URLs
  const promptObject = {
    type: "question",
    title: "Choose an AI to navigate",
    message: "Choose an AI to navigate:",
    buttons: ["Perplexity AI: AI Search", "Labs Perplexity AI: AI Chat"],
  };

  dialog.showMessageBox(mainWindow, promptObject).then((response) => {
    const chosenWebsite = promptObject.buttons[response.response];
    if (chosenWebsite === "Perplexity AI: AI Search") {
      mainWindow.loadURL("https://perplexity.ai");
    } else if (chosenWebsite === "Labs Perplexity AI: AI Chat") {
      mainWindow.loadURL("https://labs.perplexity.ai");
    }
  });

  const print = require("./src/print");
});

app.on("window-all-closed", () => {
  app.quit();
});
