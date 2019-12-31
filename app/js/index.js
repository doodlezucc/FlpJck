"use strict";

const app = require("electron").remote;
const dialog = app.dialog;
const fs = require("fs");
const p = require("path");
const childProcess = require("child_process");
const regedit = require("regedit");
const chokidar = require("chokidar");
const customTitlebar = require("custom-electron-titlebar");

let flShowSplash;
const flMidiFormPath = "HKCU\\SOFTWARE\\Image-Line\\FL Studio 20\\General\\MIDIForm";

window.onerror = (event, source, lineno, colno, error) => {
	dialog.showErrorBox("Some kind of error ocurred while running FlpJck", error.stack);
};

function regSetSplashScreen(v, callback) {
	console.log("Setting show splash screen value to " + v);
	const valuesToPut = {
		[flMidiFormPath]: {
			"SplashBox": {
				value: v + "",
				type: "REG_SZ"
			}
		}
	}
	regedit.putValue(valuesToPut, (err) => {
		if (err) {
			console.log("ERROR PUTTING VALUE");
			console.log(err);
		} else {
			//console.log("crazy son of a bitch");
			callback();
		}
	});
}

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
		saveDataSync();
	});
	$("#outDir").click(function() {
		openDialog((path) => {
			$(this).text(path);
			saveDataSync();
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
			this.markSelected(row);
			this.pivot = this.getIndex(row);
		}
		this.gatherSelected();
	}

	/**
	 * @param {JQuery} row 
	 */
	markSelected(row) {
		if (!row.hasClass("enqueued")) {
			row.addClass("selected");
		}
	}

	/**
	 * @param {(flp: FLP) => boolean} test
	 * @param {boolean} doBreak 
	 */
	selectMatching(test, doBreak) {
		multiSelectTable.clearSelection();
		for (let i = 0; i < flps.length; i++) {
			const flp = flps[i];
			if (test(flp)) {
				multiSelectTable.markSelected(flp.jq);
			} else if (doBreak) {
				break;
			}
		}
		multiSelectTable.gatherSelected();
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
			this.markSelected(row);
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
		this.watcher = chokidar.watch(this.path, {
			ignoreInitial: true
		});
		this.watcher.on("add", (path, stats) => {
			if (!flps.some((flp) => flp.file === path)) {
				//console.log("flp add " + path);
				new FLP(path, this);
			}
		});
	}

	remove() {
		directories = directories.filter((d) => d !== this);
		this.jq.remove();
		flps.forEach((flp) => {
			if (flp.directory === this) {
				flp.remove();
			}
		});
		saveDataSync();
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
			.append($("<td/>"));
		this.updateRenderDisplay();
		if (index < 0) {
			multiSelectTable.jq.append(this.jq);
		} else {
			multiSelectTable.jq.children().eq(index).before(this.jq);
		}
		multiSelectTable.register(this.jq);

		this.watcher = chokidar.watch(file, {
			ignoreInitial: true
		});
		this.watcher.on("unlink", () => {
			this.remove();
		})
		this.watcher.on("change", (path, stats) => {
			const oldSize = this.stats.size;
			this.stats = stats;
			if (stats.size != oldSize) {
				this.jq.children().eq(2).text(this.lastModified.toLocaleString());
				this.updateRenderDisplay();
			}
		});
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
		this.updateRenderDisplay();
		saveDataSync();
	}

	get upToDate() {
		return this.lastRender && this.lastModified < this.lastRender;
	}

	updateRenderDisplay() {
		this.jq.children().eq(3).text(this.lastRender ? this.lastRender.toLocaleString() : "Never");
		if (this.upToDate) {
			this.jq.addClass("up-to-date");
		} else {
			this.jq.removeClass("up-to-date");
		}
	}

	get lastRender() {
		return this.rendering ? this.rendering.date : null;
	}

	get rendering() {
		return renderings.get(this.file);
	}
}

function icon(name) {
	return $("<i/>").addClass("fas fa-" + name);
}

const States = {
	ENQUEUED: "Enqueued",
	PREPARE_FL: "Preparing FL Studio",
	CLOSE_FL: "Closing FL Studio",
	RENDER: "Rendering",
	DONE: "Done",
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
						ref.removeFromQueue();
					})
				)
			)
			.append(
				$("<div/>")
					.addClass("progressbar")
					.append($("<div/>").addClass("progress"))
			).appendTo($(".task-container"));
		RenderTask.taskQueue.push(this);
		this.setState(States.ENQUEUED, 0);
		RenderTask.checkQueue();
	}

	removeFromQueue() {
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

	setState(state, progress) {
		this.state = state;
		console.log(this.fileName + " : " + this.state);
		this.setProgress(progress);
	}

	render() {
		RenderTask.isRendering = true;

		//this.pseudoRender();
		this.flRender();
	}

	closeFL(callback, force) {
		//console.log("Checking if FL is running");
		isFlRunning((v) => {
			//console.log("FL running? " + v);
			if (!v) {
				callback();
			} else {
				childProcess.exec("taskkill /fi \"IMAGENAME eq " + p.basename(getExecPath()) + (!force ? "\"" : "\" /f"), () => callback());
			}
		});
	}

	get safeDir() {
		return app.app.getPath("temp");
	}
	get safePath() {
		return p.join(this.safeDir, "FlpJck.flp");
	}
	get safeProductPath() {
		return p.join(this.safeDir, "out.mp3");
	}

	copySource(callback) {
		//console.log("Copying flp to " + this.safePath);
		fs.copyFile(this.flp.file, this.safePath, callback);
	}
	copyProduct(callback) {
		//console.log("Copying " + p.join(this.safeDir, this.fileName + ".mp3") + " to " + this.output);
		fs.copyFile(this.safeProductPath, this.output, callback);
	}

	prepareFL(callback) {
		this.setState(States.PREPARE_FL, 0.15);
		if (flShowSplash != undefined) {
			callback();
		} else {
			regedit.list(flMidiFormPath, function(err, result) {
				if (err) {
					return console.log(err);
				} else {
					//console.log(result);
					flShowSplash = result[flMidiFormPath].values["SplashBox"].value;
					//console.log(flShowSplash);
					//console.log(typeof flShowSplash);
					if (flShowSplash === "0") {
						callback();
					} else {
						regSetSplashScreen(0, () => callback());
					}
				}
			});
		}
	}

	prepareRender(callback) {
		this.setState(States.CLOSE_FL, 0.1);
		this.closeFL(() => {
			this.prepareFL(() => {
				this.copySource(() => {
					callback();
				});
			});
		});
	}

	flRender() {
		this.prepareRender(() => {
			this.setState(States.RENDER, 0.2);

			const outputWatcher = chokidar.watch(this.safeProductPath, {
				awaitWriteFinish: true
			});
			outputWatcher.on("unlink", () => {
				this.setState(States.CLOSE_FL, 0.9);
				this.closeFL(() => { }, true); // Force close FL after render
			});

			const command = "cmd.exe /C \"" + getExecPath() + "\" /Rout /Emp3 " + this.safePath;
			//console.log(command);
			const cp = childProcess.spawn("start", ["/min", "", command], {
				shell: true,
			});
			cp.on("close", (code, signal) => {
				outputWatcher.close();
				//console.log("Exited with code " + code + ", signal " + signal);
				this.copyProduct(() => {
					//console.log("copied");
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
		this.setState(States.DONE);
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
			} else if (flShowSplash === "1") {
				regSetSplashScreen(1, () => {
					//console.log("Got your splash screen back");
				});
				flShowSplash = undefined;
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

function onClickAbout() {
	console.log("todo about");
}

function createTitleBar() {
	const titleBar = new customTitlebar.Titlebar({
		drag: true,
	});

	const selectAllUnrendered = function() {
		multiSelectTable.selectMatching((flp) => !flp.lastRender);
	}

	const { Menu, MenuItem } = app;
	const menu = new Menu();
	menu.append(new MenuItem({
		label: "Selection",
		submenu: [
			{
				label: "Select all unrendered",
				click: () => {
					selectAllUnrendered();
				},
				accelerator: "CmdOrCtrl+A"
			},
			{
				label: "Select all",
				click: () => {
					multiSelectTable.selectMatching(() => true);
				},
				accelerator: "CmdOrCtrl+Shift+A"
			},
			{
				label: "Select latest changes",
				click: () => {
					multiSelectTable.selectMatching((flp) => !flp.upToDate, true);
				},
				accelerator: "CmdOrCtrl+E"
			},
			{
				label: "Render selected",
				click: () => {
					$("#enqueue").click();
				},
				accelerator: "CmdOrCtrl+R"
			},
		]
	}));
	menu.append(new MenuItem({
		label: "Help",
		submenu: [
			{
				label: "About",
				click: () => {
					onClickAbout();
				}
			}
		]
	}));
	document.addEventListener("keydown", (ev) => {
		if (ev.ctrlKey && ev.key === "a") {
			selectAllUnrendered();
		}
	})
	titleBar.updateMenu(menu);
	app.getCurrentWindow().setMenu(menu);
}

createTitleBar();