const el = require("electron");

// Enable live reload for all the files inside your project directory
require("electron-reload")(__dirname);

function createWindow() {
  // var menu = el.Menu.buildFromTemplate([
  // 	{
  // 		label: 'Menu',
  // 		submenu: [
  // 			{
  // 				label: 'Exit',
  // 				click() {
  // 					app.quit();
  // 				}
  // 			}
  // 		]
  // 	}
  // ]);
  // el.Menu.setApplicationMenu(menu);

  let win = new el.BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true
    }
  });

  win.loadFile("app/index.html");
}

el.app.on("ready", createWindow);
