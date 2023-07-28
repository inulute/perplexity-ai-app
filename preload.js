const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electron", {
  print: async (arg) => {
    try {
      await ipcRenderer.invoke("print", arg);
    } catch (error) {
      console.error("Error invoking print:", error);
    }
  },
});
