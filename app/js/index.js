"use strict";

const app = require("electron").remote;
const dialog = app.dialog;
const fs = require("fs");
const p = require("path");

$(document).ready(function() {
	//console.log("be ready");
	$("#execPath").click(function() {
		selectExecutable();
	});
	$("#addSrcDir").click(function() {
		userAddDirectory();
	});
	$("#enqueue").click(function() {
		flps.forEach((flp) => {
			if (flp.jq.hasClass("selected") && !flp.jq.hasClass("enqueued")) {
				flp.enqueue();
			}
		});
		$(this).prop("disabled", true);
	});
	$(".file-container").click(function(e) {
		if (e.target.tagName === "TABLE") {
			multiSelectTable.clearSelection();
			multiSelectTable.gatherSelected();
		}
	});

	// window.setTimeout(() => {
	// 	flps[0].enqueue();
	// }, 1000);
});

class MultiSelectTable {
	constructor() {
		this.jq = $(".rows");
		this.pivot = 0;
	}

	/**
	 * @param {JQuery} row 
	 */
	register(row) {
		row.click((e) => this.onclick(row, e));
	}

	/**
	 * @param {JQuery} row 
	 * @param {JQuery.ClickEvent} event 
	 */
	onclick(row, event) {
		if (event.shiftKey) {
			if (row.hasClass("enqueued")) return;
			if (!event.ctrlKey) {
				this.clearSelection();
			}
			this.selectRange(this.pivot, this.getIndex(row));
		} else if (event.ctrlKey) {
			if (row.hasClass("enqueued")) return;
			this.pivot = this.getIndex(row);
			row.toggleClass("selected");
		} else {
			this.clearSelection();
			if (row.hasClass("enqueued")) return;
			row.addClass("selected");
			this.pivot = this.getIndex(row);
		}
		this.gatherSelected();
	}

	gatherSelected() {
		const sel = this.jq.children(".selected").not(".enqueued");
		$("#enqueue").prop("disabled", sel.length == 0);
	}

	clearSelection() {
		this.jq.children().removeClass("selected");
	}

	getIndex(row) {
		return this.jq.children().index(row);
	}

	getRow(index) {
		return this.jq.children().eq(index);
	}

	/**
	 * @param {number} ia 
	 * @param {number} ib 
	 */
	selectRange(ia, ib) {
		const start = Math.min(ia, ib);
		const end = Math.max(ia, ib);

		for (let i = start; i <= end; i++) {
			const row = this.getRow(i);
			if (!row.hasClass("enqueued")) {
				row.addClass("selected");
			}
		}
	}
}

const multiSelectTable = new MultiSelectTable();

/**
 * @type {Directory[]}
 */
let directories = [];
/**
 * @type {FLP[]}
 */
let flps = [];


const { Menu, MenuItem } = app;

const menu = new Menu()
menu.append(new MenuItem({ label: "Start rendering", click() { console.log("yeesh") } }))
menu.append(new MenuItem({ type: 'separator' }))
menu.append(new MenuItem({ label: 'MenuItem2', type: 'checkbox', checked: true }))

window.addEventListener('contextmenu', (e) => {
	e.preventDefault();
	menu.popup({ window: app.getCurrentWindow() });
}, false);



/**
 * get all files inside a directory (recursive)
 * @param {string} dir 
 * @param {(file: string) => void} fileFound
 * @param {(err: NodeJS.ErrnoException | null, files: string[]) => void} done
 */
function walk(dir, fileFound, done) {
	let results = [];
	fs.readdir(dir, function(err, list) {
		if (err) return done(err);
		let pending = list.length;
		if (!pending) return done(null, results);
		list.forEach(function(file) {
			file = p.resolve(dir, file);
			fs.stat(file, function(err, stat) {
				if (stat && stat.isDirectory()) {
					walk(file, fileFound, function(err, res) {
						results = results.concat(res);
						if (!--pending) done(null, results);
					});
				} else {
					results.push(file);
					fileFound(file);
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
		this.jq = $("<span/>", { title: "Unlink \"" + path + "\"" })
			.addClass("directory loading")
			.text(this.name)
			.click(function() {
				ref.remove();
			});
		$(".directories").children().last().before(this.jq);
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
		walk(this.path, (file) => {
			if (p.extname(file) === ".png" && !flps.some((flp) => flp.file === file)) {
				new FLP(file, this);
			}
		}, (err, results) => {
			if (err) {
				return console.log(err);
			}
			this.files = results;
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
		this.stats = fs.statSync(file);
		this.lmao = this.stats.mtime.toLocaleString();
		this.lastRender = null;
		this.file = file;
		this.directory = directory;
		let index = -1;
		for (let i = 0; i < flps.length; i++) {
			if (this.lastModified > flps[i].lastModified) {
				index = i;
				break;
			}
		}
		if (index < 0) {
			flps.push(this);
		} else if (index == 0) {
			flps.unshift(this);
		} else {
			flps.splice(index, 0, this);
		}
		//console.log(this.fileName + " | " + this.lastModified);
		//console.log(flps);
		//console.log(index);
		this.jq = $("<tr/>").addClass("file")
			.append($("<td/>").text(this.fileName))
			.append($("<td/>").text(this.directoryName))
			.append($("<td/>").text(this.lastModified.toLocaleString()))
			.append($("<td/>").text(this.lastRender ? this.lastRender.toLocaleString() : "Never"));
		if (multiSelectTable.jq.children().length == 0) {
			multiSelectTable.jq.append(this.jq);
		} else {
			multiSelectTable.jq.children().eq(index).after(this.jq);
		}
		multiSelectTable.register(this.jq);
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

	remove() {
		this.jq.remove();
		flps = flps.filter((flp) => flp !== this);
	}

	enqueue() {
		this.jq.removeClass("selected");
		this.jq.addClass("enqueued");
		this.task = new RenderTask(this);
		RenderTask.checkQueue();
	}

	onRenderTaskDone() {
		this.task = null;
		this.jq.removeClass("enqueued");
		this.lastRender = new Date();
		this.jq.children().eq(3).text(this.lastRender.toLocaleString());
	}
}

class RenderTaskState {
	constructor(name) {
		this.name = name;
	}
}

const States = {
	ENQUEUED: new RenderTaskState("Enqueued"),
	OPENING_FILE: new RenderTaskState("Opening file"),
	RENDERING: new RenderTaskState("Rendering"),
};

class RenderTask {
	/**
	 * @type {RenderTask[]}
	 */
	static taskQueue = [];
	static isRendering = false;

	/**
	 * @param {FLP} flp 
	 */
	constructor(flp) {
		this.state = States.OPENING_FILE;
		this.flp = flp;
		this.jq = $("<div/>")
			.addClass("task")
			.append($("<h2/>").text(this.fileName))
			.append(
				$("<div/>")
					.addClass("progressbar")
					.append($("<div/>").addClass("progress"))
			).appendTo($(".task-container"));
		RenderTask.taskQueue.push(this);
		this.setState(States.ENQUEUED);
		RenderTask.checkQueue();
	}

	/**
	 * @param {Number} progress
	 */
	setProgress(progress) {
		this.progress = progress;
		this.jq.css("--progress", (100 * this.progress) + "%");
	}

	get fileName() {
		return this.flp.fileName;
	}

	setState(state) {
		this.state = state;
		this.setProgress(0);
	}

	flRender() {
		console.log("Rendering " + this.fileName);
		RenderTask.isRendering = true;
		let i = 0;
		const timeout = setInterval(() => {
			this.setProgress(i / 100);
			i++;
			if (i >= 100) {
				clearInterval(timeout);
				this.onRenderDone();
			}
		}, 250);
	}

	onRenderDone() {
		console.log("done!");
		RenderTask.isRendering = false;
		this.jq.remove();
		this.flp.onRenderTaskDone();
		RenderTask.checkQueue();
	}

	static checkQueue() {
		if (!this.isRendering) {
			if (this.taskQueue.length) {
				const next = this.taskQueue.shift();
				next.flRender();
			} else {
				console.log("nothing to unqueue");
			}
		}
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
	//console.log("Setting exec path to " + path);
	$("#execPath").text(path);
}

function getExecPath() {
	return $("#execPath").text();
}

//
// IO
//

const savefile = p.join(app.app.getPath("userData"), "user.json");

function saveDataSync() {
	fs.writeFileSync(savefile, JSON.stringify(
		{
			execPath: getExecPath(),
			directories: directories.map((d) => d.path),
			flps: []
		}, null, 2));
	console.log("Saved!");
}

function loadData() {
	if (fs.existsSync(savefile)) {
		const userData = JSON.parse(fs.readFileSync(savefile, "utf8"));
		//console.log(userData);
		setExecPath(userData.execPath);
		userData.directories.forEach((path) => new Directory(path));
	}
}

loadData();

app.getCurrentWindow().removeAllListeners();

app.getCurrentWindow().on("close", function(e) {
	console.log("ja loool");
	saveDataSync();
	app.getCurrentWindow().destroy();
});