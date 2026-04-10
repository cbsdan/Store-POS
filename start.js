const setupEvents = require('./installers/setupEvents')
 if (setupEvents.handleSquirrelEvent()) {
    return;
 }

const serverReady = require('./server');
const {app, BrowserWindow, ipcMain, screen, dialog} = require('electron');
const path = require('path')

const contextMenu = require('electron-context-menu');

let mainWindow

function createWindow() {
  var primaryDisplay = screen.getPrimaryDisplay();
  var screenDimensions = primaryDisplay.workAreaSize;
  mainWindow = new BrowserWindow({
    width: screenDimensions.width,
    height: screenDimensions.height,
    frame: false,
    minWidth: 1200, 
    minHeight: 750,
    
    webPreferences: {
      nodeIntegration: true,
      enableRemoteModule: true,
      contextIsolation: false
    },
  });

  mainWindow.maximize();
  mainWindow.show();
  mainWindow.webContents.openDevTools();

  // Normalize zoom shortcuts across keyboard layouts:
  // Ctrl/Cmd + +, =, NumpadAdd, -, NumpadSubtract, and 0.
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;

    const isCtrlOrCmd = input.control || input.meta;
    if (!isCtrlOrCmd) return;

    const key = (input.key || '').toLowerCase();
    const code = (input.code || '').toLowerCase();
    const currentZoom = mainWindow.webContents.getZoomFactor();

    const isZoomIn =
      key === '+' ||
      key === '=' ||
      key === 'add' ||
      code === 'equal' ||
      code === 'numpadadd';

    const isZoomOut =
      key === '-' ||
      key === 'subtract' ||
      code === 'minus' ||
      code === 'numpadsubtract';

    const isZoomReset = key === '0' || code === 'digit0' || code === 'numpad0';

    if (isZoomIn) {
      event.preventDefault();
      mainWindow.webContents.setZoomFactor(Math.min(currentZoom + 0.1, 3));
    } else if (isZoomOut) {
      event.preventDefault();
      mainWindow.webContents.setZoomFactor(Math.max(currentZoom - 0.1, 0.25));
    } else if (isZoomReset) {
      event.preventDefault();
      mainWindow.webContents.setZoomFactor(1);
    }
  });

  mainWindow.loadURL(
    `file://${path.join(__dirname, 'index.html')}`
  )

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}


app.on('ready', async () => {
  await serverReady;
  createWindow();
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow()
  }
})



ipcMain.on('app-quit', (evt, arg) => {
  app.quit()
})


ipcMain.on('app-reload', (event, arg) => {
  mainWindow.reload();
});

ipcMain.handle('dialog:save-pdf', async (event, defaultFileName = 'productList.pdf') => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Product List',
    defaultPath: path.join(app.getPath('downloads'), defaultFileName),
    filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
  });

  if (canceled || !filePath) return null;
  return filePath;
});



contextMenu({
  prepend: (params, browserWindow) => [
     
      {label: 'DevTools',
       click(item, focusedWindow){
        focusedWindow.toggleDevTools();
      }
    },
     { 
      label: "Reload", 
        click() {
          mainWindow.reload();
      } 
    // },
    // {  label: 'Quit',  click:  function(){
    //    mainWindow.destroy();
    //     mainWindow.quit();
    // } 
  }  
  ],

});
