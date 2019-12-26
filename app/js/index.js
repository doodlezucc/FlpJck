"use strict";

const app = require("electron").remote;
const dialog = app.dialog;
const fs = require("fs");
const p = require("path");

$(document).ready(function() {
	//console.log("be ready");
	const task = new RenderTask("/home/tappi/test1.flp");
	task.enqueue();

	let notFlpButFlp = new FLP("/home/tappi/jon.png");
	notFlpButFlp = new FLP("/home/tappi/Downloads/crouton");

	let dir = new Directory("/home/tappi/Downloads");
});

/**
 * @type {Directory[]}
 */
let directories = [];
/**
 * @type {FLP[]}
 */
let flps = [];

/**
 * 
 * @param {string} dir 
 * @param {(err: NodeJS.ErrnoException | null, files: string[]) => void} done
 */
function walk(dir, done) {
	let results = [];
	fs.readdir(dir, function(err, list) {
		if (err) return done(err);
		let pending = list.length;
		if (!pending) return done(null, results);
		list.forEach(function(file) {
			file = p.resolve(dir, file);
			fs.stat(file, function(err, stat) {
				if (stat && stat.isDirectory()) {
					walk(file, function(err, res) {
						results = results.concat(res);
						if (!--pending) done(null, results);
					});
				} else {
					results.push(file);
					if (!--pending) done(null, results);
				}
			});
		});
	});
};

class Directory {
	constructor(path) {
		directories.push(this);
		const ref = this;
		this.path = path;
		this.jq = $("<li/>", { title: path })
			.addClass("directory loading")
			.append($("<span/>").text(this.name))
			.append($("<button/>")
				.addClass("remove")
				.text("remove")
				.click(function() {
					ref.remove();
				})
			)
			.appendTo(".directories");
		this.files = [];
		this.refreshFiles();
	}

	remove() {
		directories = directories.filter((d) => d !== this);
		this.jq.remove();
		flps.forEach((flp) => {
			if (flp.directory === this) {
				flp.remove();
			}
		});
	}

	refreshFiles() {
		walk(this.path, (err, results) => {
			if (err) {
				return console.log(err);
			}
			this.files = results;
			this.flpFiles = results.filter((f) => p.extname(f) === ".mp3");
			this.flpFiles.forEach((f) => {
				if (!flps.some((flp) => flp.file === f)) {
					new FLP(f, this);
				}
			});

			this.jq.removeClass("loading");
		});
	}

	get name() {
		return p.basename(this.path);
	}
}

class FLP {
	/**
	 * @param {string} file 
	 * @param {Directory} directory
	 */
	constructor(file, directory) {
		flps.push(this);
		const ref = this;
		this.file = file;
		this.directory = directory;
		this.stats = fs.statSync(file);
		this.jqFile = $("<tr/>").addClass("file")
			.append($("<td/>").text(this.fileName))
			.append($("<td/>").text(this.directoryName))
			.append($("<td/>").text(this.lastModified.toLocaleString()))
			.append($("<td/>").text(this.lastRender ? this.lastRender.toLocaleString() : "Never"))
			.appendTo(".file-container")
			.click(function() {
				console.log("clicked " + ref.fileName);
			});
	}

	get directoryName() {
		return p.basename(p.dirname(this.file));
	}

	get fileName() {
		return p.basename(this.file);
	}

	get lastModified() {
		return this.stats.mtime;
	}

	get lastRender() {
		return null;
	}

	remove() {
		this.jqFile.remove();
		flps = flps.filter((flp) => flp !== this);
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
		this.jq = $("<div/>")
			.addClass("task")
			.append($("<h2/>").text(this.fileName))
			.append(
				$("<div/>")
					.addClass("progressbar")
					.append($("<div/>").addClass("progress"))
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
		return p.basename(this.flp);
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
		return new Promise((resolve) => {
			console.log("Rendering " + this.flp + " to " + out);
			setTimeout(() => {
				resolve(out);
			}, 2500);
		});
	}
}

function userAddDirectory() {
	dialog.showOpenDialog(app.getCurrentWindow(), {
		properties: ["openDirectory"],
	}).then(result => {
		if (!result.canceled) {
			const file = result.filePaths[0];
			new Directory(file);
		}
	}).catch(err => {
		console.log(err);
	});
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
}

function getExecPath() {
	return $("#execPath").val();
}

//
// IO
//

const savefile = p.join(app.app.getPath("userData"), "user.json");

function saveData() {
	fs.writeFile(savefile, JSON.stringify(
		{
			execPath: getExecPath(),
			directories: directories.map((d) => d.path),
			flps: []
		}, null, 2), function(err) {
			if (err) {
				return console.error(err);
			}
			console.log("Saved data!");
		});
}

function loadData() {
	if (fs.existsSync(savefile)) {
		const userData = JSON.parse(fs.readFileSync(savefile, "utf8"));
		console.log(userData);
		setExecPath(userData.execPath);
		userData.directories.forEach((path) => new Directory(path));
	}
}

loadData();

app.getCurrentWindow().on("close", function() {
	saveData();
});