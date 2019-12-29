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

	//isFlRunning(v => console.log(v));

	window.setTimeout(() => {
		//flps[0].enqueue();
		//flps.forEach((flp) => flp.enqueue());
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
			if (p.extname(file) === ".flp" && !flps.some((flp) => flp.file === file)) {
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
		const f = p.basename(this.file);
		return f.substr(0, f.length - 4);
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

function icon(name) {
	return $("<i/>").addClass("fas fa-" + name);
}

const States = {
	ENQUEUED: "Enqueued",
	CLOSE_FRUITY_LOOPS: "Closing FL Studio",
	COPY_SOURCE: "Copying flp",
	OPEN_FILE: "Opening file",
	RENDER: "Rendering",
	COPY_PRODUCT: "Copying mp3",
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
		this.flp = flp;
		this.jq = $("<div/>")
			.addClass("task")
			.append($("<h2/>").text(this.fileName))
			.append($("<div/>")
				.addClass("task-buttons")
				.append(
					$("<button/>", { title: "Move to top" })
						.append(icon("arrow-up"))
						.addClass("move")
						.click(function() {
							ref.moveToTop();
						})
				)
				.append($("<button/>", { title: "Remove from queue" })
					.append(icon("times"))
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
		console.log(this.fileName + " : " + this.state);
	}

	render() {
		RenderTask.isRendering = true;

		//this.pseudoRender();
		this.flRender();
	}

	closeFL(callback) {
		console.log("Checking if FL is running");
		isFlRunning((v) => {
			console.log("FL running? " + v);
			if (!v) {
				callback();
			} else {
				this.setState(States.CLOSE_FRUITY_LOOPS);
				childProcess.exec("taskkill /fi \"IMAGENAME eq " + p.basename(getExecPath()) + "\"", () => callback());
			}
		});
	}

	get safeDir() {
		return app.app.getPath("temp");
	}

	get safePath() {
		return p.join(this.safeDir, "temp.flp");
	}

	copySource(callback) {
		console.log("Copying flp to " + this.safePath);
		fs.copyFile(this.flp.file, this.safePath, callback);
	}

	copyProduct(callback) {
		console.log("Copying product to " + this.output);
		fs.copyFile(this.safePath, this.output, callback);
	}

	prepareRender(callback) {
		this.closeFL(() => {
			this.copySource(() => {
				callback();
			});
		});
	}

	flRender() {
		this.prepareRender(() => {
			console.log("Rendering " + this.fileName);
			this.setState(States.RENDER);
			const command = "cmd.exe /C \"" + getExecPath() + "\" /R /Emp3 " + this.safePath;
			console.log(command);
			const cp = childProcess.spawn("start", ["/min", "", command], {
				shell: true,
			});
			cp.on("close", (code, signal) => {
				//console.log("Exited with code " + code + ", signal " + signal);
				this.copyProduct(() => {
					console.log("copied");
				});
				this.onRenderDone();
			});
		});
	}

	pseudoRender() {
		console.log("PSEUDO rendering " + this.fileName);
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
		RenderTask.isRendering = false;
		this.jq.remove();
		this.flp.onRenderTaskDone(this.output);
		RenderTask.checkQueue();
	}

	get output() {
		return p.join(getOutputDirectory(), this.fileName + ".mp3");
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

function isFlRunning(callback) {
	const imageName = p.basename(getExecPath());
	childProcess.exec("tasklist /fi \"IMAGENAME eq " + imageName + "\"", (err, stdout, stderr) => {
		if (stdout.includes(imageName)) {
			return callback(true);
		}
		callback(false);
	});
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