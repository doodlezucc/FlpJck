const el = require("electron");

// Enable live reload for all the files inside your project directory
require("electron-reload")(__dirname);

const isWin = process.platform === "win32";

function createWindow() {
	//el.Menu.setApplicationMenu(null);

	let win = new el.BrowserWindow({
		width: 850,
		height: 500,
		webPreferences: {
			nodeIntegration: true,
			enableRemoteModule: true
		},
		frame: !isWin,
		titleBarStyle: isWin ? "default" : "hidden",
		icon: "app/style/icon/icon.png",
		show: false
	});

	win.webContents.setBackgroundThrottling(false);

	win.webContents.on("did-finish-load", () => {
		win.show();
	})
	win.loadFile("app/index.html");
}

el.app.on("ready", createWindow);
