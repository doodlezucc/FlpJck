"use strict";

const app = require("electron").remote;
const dialog = app.dialog;
const fs = require("fs");
const path = require("path");

$(document).ready(function() {
	//console.log("be ready");
	const task = new RenderTask("/home/tappi/test1.flp");
	task.enqueue();
});

//
// Task related
//

const States = {
	NIRVANA: -1,
	ENQUEUED: 0,
};

class RenderTask {
	constructor(flp) {
		this.state = States.NIRVANA;
		this.flp = flp;
		this.jq = $();
	}

	enqueue() {
		this.jq = $("<div></div>")
			.addClass("task")
			.append(
				$("<h2></h2>")
					.text(this.fileName)
			)
			.append(
				$("<div></div>")
					.addClass("progressbar")
					.append(
						$("<div></div>")
							.addClass("progress")
					)
			).appendTo($(".task-container"))

		this.setState(States.ENQUEUED);
	}

	/**
	 * 
	 * @param {Number} progress
	 */
	setProgress(progress) {
		this.jq.find(".progress").css("width", (100 * progress) + "%");
	}

	get fileName() {
		return path.basename(this.flp);
	}

	setState(state) {
		this.state = state;
		this.setProgress(0);
	}

	async flRender(out) {
		return new Promise((resolve, reject) => {
			console.log("Rendering " + this.flp + " to " + out);
			setTimeout(() => {
				resolve(out);
			}, 2500);
		});
	}
}

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