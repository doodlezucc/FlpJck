"use strict";

const app = window.require("electron").remote;
const dialog = app.dialog;
const fs = window.require("fs");

$(document).ready(function() {
	//console.log("be ready");
});

function selectExecutable() {
	dialog.showOpenDialog(app.getCurrentWindow(), {
		properties: ["openFile"],
		filters: [
			{ name: "Windows Executables", extensions: ["exe"] },
			{ name: "pleb test", extensions: ["png"] }
		]
	}).then(result => {
		//console.log(result.canceled);
		//console.log(result.filePaths);
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
}