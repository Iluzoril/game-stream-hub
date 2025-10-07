const { app, BrowserWindow, ipcMain, desktopCapturer } = require('electron');
const path = require('path');
const io = require('socket.io-client');

let mainWindow;
let socket;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            enableRemoteModule: true
        }
    });

    mainWindow.loadFile('index.html');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// IPC handlers for communication with renderer process
ipcMain.handle('get-sources', async () => {
    const sources = await desktopCapturer.getSources({
        types: ['screen', 'window']
    });
    return sources;
});

ipcMain.handle('connect-to-server', (event, serverUrl) => {
    socket = io(serverUrl);
    
    socket.on('connect', () => {
        event.reply('server-connected');
    });

    socket.on('client-input', (data) => {
        // Здесь будет код для эмуляции ввода на хосте
        console.log('Received input:', data);
    });

    return socket.id;
});

ipcMain.handle('create-session', (event, gameData) => {
    socket.emit('create-session', gameData);
});