"use strict";

const app = require("electron").remote;
const dialog = app.dialog;
const fs = require("fs");
const path = require("path");

$(document).ready(function() {
	//console.log("be ready");
	const task = new RenderTask("/home/tappi/test1.flp");
	task.enqueue();

	const notFlpButFlp = new FLP("/home/tappi/jon.png");
});

class FLP {
	constructor(file) {
		this.file = file;
		this.stats = fs.statSync(file);
		this.jqFile = $("<tr/>").addClass("file")
			.append($("<td/>").text(this.fileName))
			.append($("<td/>").text(this.directory))
			.appendTo(".file-container")
	}

	get directory() {
		return path.dirname(this.file);
	}

	get fileName() {
		return path.basename(this.file);
	}

	get lastRender() {
		const flp = userData.flps.find(function(flp) {
			return flp.file === this.file;
		});
		if (flp) {
			if (flp.lastRender) {
				return new Date(flp.lastRender);
			}
		}
		return null;
	}
}

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

	/**
	 * 
	 * @param {string} out 
	 */
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
let userData = {
	preferences: {
		execPath: "",
		directories: []
	},
	flps: []
};

function saveData() {
	fs.writeFile(savefile, JSON.stringify(userData, null, 2), function(err) {
		if (err) {
			return console.error(err);
		}
		console.log("Saved data!");
	});
}

function loadData() {
	if (fs.existsSync(savefile)) {
		userData = JSON.parse(fs.readFileSync(savefile, "utf8"));
		console.log(userData);
		setExecPath(userData.preferences.execPath);
	}
}

loadData();

app.getCurrentWindow().on("close", function() {
	saveData();
});