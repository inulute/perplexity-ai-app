const { app, BrowserWindow, dialog } = require("electron");

app.allowRendererProcessReuse = true;

app.on("ready", () => {
  const mainWindow = new BrowserWindow();

  // Hide the top menu bar
  mainWindow.setMenu(null);

  mainWindow.loadURL(`file://${__dirname}/index.html`, {
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.116 Safari/537.36",
  });

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
