const el = require("electron");

// Enable live reload for all the files inside your project directory
require("electron-reload")(__dirname);

const isWin = process.platform === "win32";

function createWindow() {
	//el.Menu.setApplicationMenu(null);

	let win = new el.BrowserWindow({
		width: 650,
		height: 400,
		webPreferences: {
			nodeIntegration: true
		},
		frame: !isWin,
		titleBarStyle: isWin ? "default" : "hidden",
		icon: "app/style/icon.ico"
	});

	win.loadFile("app/index.html");
}

el.app.on("ready", createWindow);
