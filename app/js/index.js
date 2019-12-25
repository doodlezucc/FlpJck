"use strict";

const app = require("electron").remote;
const dialog = app.dialog;
const fs = require("fs");
const path = require("path");

$(document).ready(function() {
	//console.log("be ready");
});

function selectExecutable() {
	dialog.showOpenDialog(app.getCurrentWindow(), {
		properties: ["openFile"],
		filters: [
			{ name: "pleb test", extensions: ["js"] },
			{ name: "Windows Executable", extensions: ["exe"] },
		]
	}).then(result => {
		if (!result.canceled) {
			const file = result.filePaths[0];
			setExecPath(file);
		}
	}).catch(err => {
		console.log(err);
	});
}

function setExecPath(path) {
	console.log("Setting exec path to " + path);
	$("#execPath").val(path);
	preferences.execPath = path;
}

// -----
//
// Fruity Loops related
//

async function flRender(flp, out) {
	return new Promise((resolve, reject) => {
		console.log("Rendering " + flp + " to " + out);
		setTimeout(() => {
			resolve(out);
		}, 2500);
	});
}

// -----
//
// IO
//

const savefile = path.join(app.app.getPath("userData"), "user.json");
let preferences = {
	execPath: ""
};

function savePreferences() {
	fs.writeFile(savefile, JSON.stringify(preferences, null, 2), function(err) {
		if (err) {
			return console.error(err);
		}
		console.log("Saved preferences!");
	});
}

function loadPreferences() {
	if (fs.existsSync(savefile)) {
		preferences = JSON.parse(fs.readFileSync(savefile, "utf8"));
		console.log(preferences);
		setExecPath(preferences.execPath);
	}
}

loadPreferences();

app.getCurrentWindow().on("close", function() {
	savePreferences();
});