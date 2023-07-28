const { ipcMain, BrowserWindow } = require("electron");

ipcMain.handle("print", async (event, arg) => {
  let printWindow = new BrowserWindow({ autoHideMenuBar: true });

  printWindow.webContents.on("did-finish-load", () => {
    printWindow.webContents.print({ silent: false });
  });

  printWindow.loadURL(arg);
});
