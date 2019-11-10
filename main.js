const el = require("electron");

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
