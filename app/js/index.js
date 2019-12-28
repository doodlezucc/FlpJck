"use strict";

const app = require("electron").remote;
const dialog = app.dialog;
const fs = require("fs");
const p = require("path");
const childProcess = require("child_process");

$(document).ready(function() {
	//console.log("be ready");
	$("#execPath").click(function() {
		openDialog((path) => {
			$("#execPath").text(path);
		}, {
			properties: ["openFile"],
			filters: [
				{ name: "pleb test", extensions: ["js"] },
				{ name: "Windows Executable", extensions: ["exe"] },
			]
		});
	});
	$("#addSrcDir").click(function() {
		openDialog((path) => {
			new Directory(path);
		}, { properties: ["openDirectory"] });
	});
	$("#outDir").click(function() {
		openDialog((path) => {
			$(this).text(path);
		}, { properties: ["openDirectory"] });
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

	window.setTimeout(() => {
		flps.forEach((flp) => flp.enqueue());
	}, 1000);
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
		this.gatherSelected();
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
		this.gatherSelected();
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
/**
 * 	@type {Map<string, Rendering>}
 */
let renderings = new Map();

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
		this.jq = $("<tr/>").addClass("file")
			.append($("<td/>").text(this.fileName))
			.append($("<td/>").text(this.directoryName))
			.append($("<td/>").text(this.lastModified.toLocaleString()))
			.append($("<td/>").text(this.lastRender ? this.lastRender.toLocaleString() : "Never"));
		if (index < 0) {
			multiSelectTable.jq.append(this.jq);
		} else {
			multiSelectTable.jq.children().eq(index).before(this.jq);
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

	onRenderTaskDone(output) {
		this.task = null;
		this.jq.removeClass("enqueued");
		renderings.set(this.file, new Rendering(output, new Date()));
		this.jq.children().eq(3).text(this.lastRender.toLocaleString());
		//console.log(renderings);
		saveDataSync();
	}

	get lastRender() {
		return this.lastRendering ? this.lastRendering.date : null;
	}

	get lastRendering() {
		return renderings.get(this.file);
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
		const ref = this;
		this.state = States.OPENING_FILE;
		this.flp = flp;
		this.jq = $("<div/>")
			.addClass("task")
			.append($("<h2/>").text(this.fileName))
			.append($("<div/>")
				.addClass("task-buttons")
				.append($("<button/>")
					.text("T")
					.addClass("move")
					.click(function() {
						ref.moveToTop();
					})
				)
				.append($("<button/>")
					.text("X")
					.addClass("remove")
					.click(function() {
						ref.unprepare();
					})
				)
			)
			.append(
				$("<div/>")
					.addClass("progressbar")
					.append($("<div/>").addClass("progress"))
			).appendTo($(".task-container"));
		RenderTask.taskQueue.push(this);
		this.setState(States.ENQUEUED);
		RenderTask.checkQueue();
	}

	unprepare() {
		RenderTask.taskQueue = RenderTask.taskQueue.filter((task) => task !== this);
		this.jq.remove();
		this.flp.jq.removeClass("enqueued");
	}

	moveToTop() {
		if (RenderTask.taskQueue.length > 1) {
			$(".task-container").children().first().after(this.jq);
			RenderTask.taskQueue = RenderTask.taskQueue.filter((task) => task !== this);
			RenderTask.taskQueue.unshift(this);
		}
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
	}

	render() {
		this.pseudoRender();
		//this.flRender();
	}

	flRender() {
		console.log("Rendering " + this.fileName);
		RenderTask.isRendering = true;
		this.setState(States.OPENING_FILE);
		const cp = childProcess.spawn("cmd.exe", ["/C", "\"" + getExecPath() + "\" /Rpaths /Emp3 /OC:\\tmp C:\\tmp\\test.flp"], {
			detached: true,
			shell: true
		});
		cp.on("close", (code, signal) => {
			//console.log("Exited with code " + code + ", signal " + signal);
			if (code == 0) {
				this.onRenderDone();
			}
		})
	}

	pseudoRender() {
		console.log("PSEUDO rendering " + this.fileName);
		RenderTask.isRendering = true;
		let i = 0;
		const timeout = setInterval(() => {
			this.setProgress(i / 100);
			i++;
			if (i >= 100) {
				clearInterval(timeout);
				this.onRenderDone();
			}
		}, 150);
	}

	onRenderDone() {
		console.log("done!");
		RenderTask.isRendering = false;
		this.jq.remove();
		this.flp.onRenderTaskDone(this.output);
		RenderTask.checkQueue();
	}

	get output() {
		return "C:/tmp/";
	}

	static checkQueue() {
		if (!this.isRendering) {
			if (this.taskQueue.length) {
				const next = this.taskQueue.shift();
				next.render();
			}
		}
	}
}

class Rendering {
	/**
	 * @param {string} output 
	 * @param {Date} date 
	 */
	constructor(output, date) {
		this.output = output;
		this.date = date;
	}
}

function openDialog(cb, options) {
	dialog.showOpenDialog(app.getCurrentWindow(), options)
		.then(result => {
			if (!result.canceled) {
				cb(result.filePaths[0]);
			}
		}).catch(err => {
			console.log(err);
		});
}

function getExecPath() {
	return $("#execPath").text();
}

function getOutputDirectory() {
	return $("#outDir").text();
}

//
// IO
//

const savefile = p.join(app.app.getPath("userData"), "user.json");

function saveDataSync() {
	const jRenderings = {};
	renderings.forEach((r, flp) => {
		jRenderings[flp] = {
			"output": r.output,
			"date": r.date.getTime()
		};
	});
	fs.writeFileSync(savefile, JSON.stringify(
		{
			execPath: getExecPath(),
			outDir: getOutputDirectory(),
			directories: directories.map((d) => d.path),
			renderings: jRenderings
		}, null, 2));
	console.log("Saved!");
}

function loadData() {
	if (fs.existsSync(savefile)) {
		const userData = JSON.parse(fs.readFileSync(savefile, "utf8"));
		$("#execPath").text(userData.execPath);
		$("#outDir").text(userData.outDir);
		for (const key in userData.renderings) {
			const r = userData.renderings[key];
			renderings.set(key, new Rendering(r.output, new Date(r.date)));
		}
		userData.directories.forEach((path) => new Directory(path));
	}
}

loadData();

app.getCurrentWindow().removeAllListeners();

app.getCurrentWindow().on("close", function(e) {
	saveDataSync();
	app.getCurrentWindow().destroy();
});