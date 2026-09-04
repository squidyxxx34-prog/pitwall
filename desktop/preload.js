const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('pitwallDesktop', {
  isDesktop: true,
});
