"use strict";

const app = require("electron").remote;
const dialog = app.dialog;
const fs = require("fs");
const p = require("path");
const childProcess = require("child_process");
const regedit = require("regedit");
const chokidar = require("chokidar");
const customTitlebar = require("custom-electron-titlebar");
const isDev = require("electron-is-dev");
const $ = require("jquery");

const isWin = process.platform === "win32";
const extension = ".flp";

const titleBar = new customTitlebar.Titlebar({
	drag: true,
});

let flShowSplash;
const flMidiFormPath = "HKCU\\SOFTWARE\\Image-Line\\FL Studio 20\\General\\MIDIForm";

window.onerror = (event, source, lineno, colno, error) => {
	dialog.showErrorBox("Some kind of error ocurred while running FlpJck", error.stack);
};

if (isWin && !isDev) {
	const vbsFolderFound = regedit.setExternalVBSLocation(p.join(
		p.dirname(app.app.getPath("exe")),
		"./resources/app.asar.unpacked/app/vbs"
	));
	// dialog.showMessageBox(app.getCurrentWindow(), {
	// 	message: vbsFolderFound
	// });
}

function regSetSplashScreen(v, callback) {
	console.log("Setting show splash screen value to " + v);
	if (!isWin) {
		return callback();
	}
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
			throw err;
		} else {
			callback();
		}
	});
}

$(document).ready(function() {
	//console.log("be ready");
	$("#execPath").click(function() {
		const dirname = p.dirname($(this).text());
		const filter = isWin
			? { name: "Windows Executable", extensions: ["exe"] }
			: { name: "Application", extensions: ["app"] }
		openDialog((path) => {
			$(this).text(path);
			saveDataSync();
		}, {
			properties: ["openFile"],
			filters: [filter],
			title: "Locate the Fruity Loops executable to use",
			defaultPath: dirname.length > 1
				? dirname
				: (isWin ? "C:/Program Files (x86)" : "/Applications")
		});
	});
	$("#outDir").click(function() {
		openDialog((path) => {
			$(this).text(path);
			saveDataSync();
		}, {
			properties: ["openDirectory"],
			title: "Select an output directory",
			defaultPath: $(this).text()
		});
	});
	$("#enqueue").click(function() {
		flps.forEach((flp) => {
			if (flp.jq.hasClass("selected") && !flp.jq.hasClass("blacklisted") && !flp.jq.hasClass("enqueued")) {
				flp.enqueue();
			}
		});
		multiSelectTable.clearSelection();
		$(this).prop("disabled", true);
	});
	$(".file-container").click(function(e) {
		if (e.target.tagName === "TABLE") {
			multiSelectTable.clearSelection();
			multiSelectTable.gatherSelected();
		}
	});
});

function addSrcDir(deep) {
	openDialog((path) => {
		new Directory(path, deep);
		saveDataSync();
	}, {
		properties: ["openDirectory"],
		title: "Select a " + (deep ? "root " : "") + "directory to take Fruity Loops projects from",
		defaultPath: app.app.getPath("documents")
	});
}

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

	toggleBlacklist() {
		const doBlacklist = this.jq.children(".selected").not(".blacklisted").length;
		this.setBlacklisted(doBlacklist);
	}

	setBlacklisted(v) {
		flps.forEach((flp) => {
			if (flp.jq.hasClass("selected")) {
				if (v) {
					if (!flp.jq.hasClass("blacklisted")) {
						flp.jq.addClass("blacklisted");
						blacklist.push(flp.file);
					}
				} else {
					flp.jq.removeClass("blacklisted");
					blacklist = blacklist.filter((s) => s !== flp.file);
				}
			}
		});
		this.gatherSelected();
		saveDataSync();
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
		const sel = this.jq.children(".selected").not(".blacklisted").not(".enqueued");
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
 * @type {string[]}
 */
let blacklist = [];

/**
 * get all files inside a directory (recursive)
 * @param {string} dir 
 * @param {boolean} recursive
 * @param {(file: string) => void} fileFound
 * @param {(err: NodeJS.ErrnoException | null, files: string[]) => void} done
 */
function walk(dir, recursive, fileFound, done) {
	let results = [];
	fs.readdir(dir, function(err, list) {
		if (err) return done(err);
		let pending = list.length;
		if (!pending) return done(null, results);
		list.forEach(function(file) {
			file = p.resolve(dir, file);
			fs.stat(file, function(err, stat) {
				if (stat && stat.isDirectory() && recursive) {
					walk(file, true, fileFound, function(err, res) {
						results = results.concat(res);
						if (!--pending) done(null, results);
					});
				} else {
					if (!stat.isDirectory()) {
						results.push(file);
						fileFound(file);
					}
					if (!--pending) done(null, results);
				}
			});
		});
	});
};

class Directory {
	/**
	 * @param {string} path 
	 * @param {boolean} deep 
	 */
	constructor(path, deep) {
		directories.push(this);
		const ref = this;
		this.path = path;
		this.deep = deep;
		this.jq = $("<span/>", { title: "Unlink \"" + path + "\"" + (deep ? " (and sub-directories)" : "") })
			.addClass("directory loading")
			.text(this.name)
			.click(function() {
				ref.remove();
			});
		if (deep) {
			this.jq.addClass("deep");
		}
		$(".directories").children().last().before(this.jq);
		this.files = [];
		this.refreshFiles();
		this.watcher = chokidar.watch(this.path, {
			ignoreInitial: true,
			depth: deep ? undefined : 0
		});
		this.watcher.on("add", (path) => {
			if (p.extname(path) === extension && !flps.some((flp) => flp.file === path)) {
				//console.log("flp add " + path);
				new FLP(path, this);
			}
		});
	}

	remove() {
		directories = directories.filter((d) => d !== this);
		this.jq.remove();
		this.watcher.close();
		flps.forEach((flp) => {
			if (flp.directory === this) {
				flp.remove();
			}
		});
		saveDataSync();
	}

	refreshFiles() {
		walk(this.path, this.deep, (file) => {
			if (p.extname(file) === extension && !flps.some((flp) => flp.file === file)) {
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

		this.jq = $("<tr/>").addClass("file")
			.append($("<td/>").text(this.fileName))
			.append($("<td/>").text(this.directoryName))
			.append($("<td/>").text(this.lastModified.toLocaleString()))
			.append($("<td/>"));
		// .append($("<div/>")
		// 	.addClass("buttons")
		// 	.append(
		// 		$("<button/>", { title: "Blacklist" })
		// 			.append(icon("times"))
		// 			.click(() => {
		// 				multiSelectTable.toggleBlacklist();
		// 			})
		// 	)
		// );
		if (this.isBlacklisted()) {
			this.jq.addClass("blacklisted");
		}
		this.updateRenderDisplay();
		this.sortInit();
		multiSelectTable.register(this.jq);

		this.watcher = chokidar.watch(file, {
			ignoreInitial: true
		});
		this.watcher.on("unlink", () => {
			this.remove();
		});
		this.watcher.on("change", (path, stats) => {
			const oldSize = this.stats.size;
			this.stats = stats;
			if (stats.size != oldSize) {
				flps = flps.filter((flp) => flp !== this);
				this.sortInit();

				this.jq.children().eq(2).text(this.lastModified.toLocaleString());
				this.updateRenderDisplay();
			}
		});
	}

	sortInit() {
		let index = -1;
		for (let i = 0; i < flps.length; i++) {
			if (this.lastModified > flps[i].lastModified) {
				index = i;
				break;
			}
		}
		if (index < 0) {
			flps.push(this);

			multiSelectTable.jq.append(this.jq);
		} else {
			if (index == 0) {
				flps.unshift(this);
			} else {
				flps.splice(index, 0, this);
			}

			multiSelectTable.jq.children().eq(index).before(this.jq);
		}
	}

	get directoryName() {
		return p.basename(p.dirname(this.file));
	}

	get fileName() {
		const f = p.basename(this.file);
		return f.substr(0, f.length - 4);
	}

	get lastModified() {
		return (this.rendering && this.rendering.inputSize == this.stats.size) ? this.rendering.inputModified : this.stats.mtime;
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
		renderings.set(this.file, new Rendering(output, new Date(), this.lastModified, this.stats.size));
		this.updateRenderDisplay();
		saveDataSync();
	}

	get upToDate() {
		return this.lastRender && this.lastModified < this.lastRender;
	}

	isBlacklisted() {
		return blacklist.some((s) => s === this.file);
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
				.addClass("buttons")
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
						ref.remove();
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
		this.updateRemaining();
		RenderTask.checkQueue();
	}

	remove() {
		RenderTask.taskQueue = RenderTask.taskQueue.filter((task) => task !== this);
		this.jq.remove();
		this.flp.jq.removeClass("enqueued");
		this.updateRemaining();
	}

	updateRemaining() {
		const remaining = $(".task-container").children().length;
		if (remaining > 0) {
			$("#remaining").text(remaining + " left");
		} else {
			$("#remaining").text("");
		}
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
		isFlRunning((v) => {
			console.log("FL running? " + v);
			if (!v) {
				callback();
			} else if (isWin) {
				childProcess.exec("taskkill /fi \"IMAGENAME eq " + p.basename(getExecPath()) + (!force ? "\"" : "\" /f"), () => callback());
			} else {
				childProcess.exec("killall OsxFL", () => callback());
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
		//console.log("Copying " + this.safeProductPath + " to " + this.output);
		fs.copyFile(this.safeProductPath, this.output, callback);
	}

	prepareFL(callback) {
		this.setState(States.PREPARE_FL, 0.15);
		if (flShowSplash != undefined) {
			callback();
		} else {
			app.getCurrentWindow().setAlwaysOnTop(true);
			if (isWin) {
				regedit.list(flMidiFormPath, function(err, result) {
					if (err) {
						console.log(err);
						throw err;
					} else {
						flShowSplash = result[flMidiFormPath].values["SplashBox"].value;
						if (flShowSplash === "0") {
							callback();
						} else {
							regSetSplashScreen(0, () => callback());
						}
					}
				});
			}
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
			const onFileWritten = () => {
				this.setState(States.CLOSE_FL, 0.9);
				this.closeFL(() => {
					if (!isWin) {
						outputWatcher.close();
						this.finaliseProduct();
					}
				}, true); // Force close FL after render
			}
			outputWatcher.on(isWin ? "unlink" : "change", onFileWritten);

			const command = "cmd.exe /C \"" + getExecPath() + "\" /Rout /Emp3 " + this.safePath;
			//console.log(command);
			const cp = isWin ? childProcess.spawn("start", ["/min", "", command], {
				shell: true,
			}) : childProcess.spawn("open", ["\"" + getExecPath() + "\"",
				"--args", "-Rout", "-Emp3", this.safePath], {
				shell: true,
			});
			if (isWin) {
				cp.on("close", (code, signal) => {
					outputWatcher.close();
					//console.log("Exited with code " + code + ", signal " + signal);
					this.finaliseProduct();
				});
			}
		});
	}

	finaliseProduct() {
		this.copyProduct(() => {
			//console.log("copied");
		});
		this.onRenderDone();
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
		this.updateRemaining();
	}

	get output() {
		return p.join(getOutputDirectory(), this.fileName + ".mp3");
	}

	static checkQueue() {
		if (!this.isRendering) {
			if (this.taskQueue.length) {
				const next = this.taskQueue.shift();
				next.render();
			} else {
				app.getCurrentWindow().setAlwaysOnTop(false);
				if (flShowSplash === "1") {
					regSetSplashScreen(1, () => {
						//console.log("Got your splash screen back");
					});
					flShowSplash = undefined;
				}
			}
		}
	}
}

function isFlRunning(callback) {
	const name = isWin ? p.basename(getExecPath()) : "/OsxFL";
	const cmd = isWin
		? "tasklist /fi \"IMAGENAME eq " + name + "\""
		: "ps -ax | grep OsxFL";
	childProcess.exec(cmd, (err, stdout, stderr) => {
		if (stdout.includes(name)) {
			return callback(true);
		}
		callback(false);
	});
}

class Rendering {
	/**
	 * @param {string} output 
	 * @param {Date} date 
	 * @param {Date} inputModified 
	 * @param {number} inputSize 
	 */
	constructor(output, date, inputModified, inputSize) {
		this.output = output;
		this.date = date;
		this.inputModified = inputModified;
		this.inputSize = inputSize;
	}
}

/**
 * 
 * @param {*} cb 
 * @param {Electron.OpenDialogOptions} options 
 */
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
			output: r.output,
			date: r.date.getTime(),
			inputModified: r.inputModified.getTime(),
			inputSize: r.inputSize
		};
	});
	fs.writeFileSync(savefile, JSON.stringify(
		{
			execPath: getExecPath(),
			outDir: getOutputDirectory(),
			directories: directories.map((d) => {
				return {
					path: d.path,
					deep: d.deep
				};
			}),
			blacklist: blacklist,
			renderings: jRenderings
		}, null, 2));
	console.log("Saved!");
}

function loadData() {
	if (fs.existsSync(savefile)) {
		const userData = JSON.parse(fs.readFileSync(savefile, "utf8"));
		$("#outDir").text(userData.outDir);
		$("#execPath").text(userData.execPath);
		blacklist = userData.blacklist;
		for (const key in userData.renderings) {
			const r = userData.renderings[key];
			renderings.set(key, new Rendering(r.output, new Date(r.date), new Date(r.inputModified), r.inputSize));
		}
		userData.directories.forEach((dir) => new Directory(dir.path, dir.deep));
	} else {
		$("#outDir").text(app.app.getPath("music"));

		$("#execPath").text("None selected!");
		if (isWin) {
			const dImageLine = "C:/Program Files (x86)/Image-Line/";
			if (fs.existsSync(p.join(dImageLine, "FL Studio 20"))) {
				$("#execPath").text(p.join(dImageLine, "FL Studio 20/FL64.exe"));
			} else if (fs.existsSync(p.join(dImageLine, "FL Studio 12"))) {
				$("#execPath").text(p.join(dImageLine, "FL Studio 12/FL64.exe"));
			}
		} else {
			const prefix = "/Applications";
			if (fs.existsSync(p.join(prefix, "FL Studio 20.app"))) {
				$("#execPath").text(p.join(prefix, "FL Studio 20.app"));
			} else if (fs.existsSync(p.join(prefix, "FL Studio 12.app"))) {
				$("#execPath").text(p.join(prefix, "FL Studio 12.app"));
			}
		}

		let firstDir = p.join(app.app.getPath("documents"), "/Image-Line/FL Studio/Projects");
		console.log(firstDir);
		if (fs.existsSync(firstDir)) {
			new Directory(firstDir, false);
		}
	}
}

loadData();

const { Menu, MenuItem, BrowserWindow } = app;

/**
 * 
 * @param {Electron.KeyboardEvent} event 
 */
function onClickAbout() {
	const bounds = app.getCurrentWindow().getBounds();
	const width = 320;
	const height = 200;
	const win = new BrowserWindow({
		webPreferences: {
			nodeIntegration: true
		},
		frame: !isWin,
		titleBarStyle: isWin ? "default" : "hidden",
		maximizable: false,
		minimizable: false,
		parent: app.getCurrentWindow(),
		width: width,
		height: height,
		resizable: true,
		x: Math.round(bounds.x + (bounds.width - width) / 2),
		y: Math.round(bounds.y + (bounds.height - height) / 2),
		show: false
	});
	win.loadFile("app/about.html");
	win.webContents.on("did-finish-load", () => {
		win.show();
	});
}

function createTitleBar() {
	const selectAllUnrendered = function() {
		multiSelectTable.selectMatching((flp) => !flp.upToDate && !flp.isBlacklisted());
	}

	const menu = new Menu();
	const aboutItem = {
		label: "About FlpJck",
		click: () => {
			onClickAbout();
		}
	};

	if (!isWin) {
		menu.append(new MenuItem({
			submenu: [
				aboutItem,
				{
					type: "separator"
				},
				{
					label: "Quit FlpJck",
					click: () => {
						app.getCurrentWindow().close();
					},
					accelerator: "CmdOrCtrl+Q"
				}
			]
		}));
	}
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
					multiSelectTable.selectMatching((flp) => !flp.isBlacklisted());
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
				type: "separator"
			},
			{
				label: "Render selected",
				click: () => {
					$("#enqueue").click();
				},
				accelerator: "CmdOrCtrl+R"
			},
			{
				label: "(Un-)Blacklist selected",
				click: () => {
					multiSelectTable.toggleBlacklist();
				},
				accelerator: "CmdOrCtrl+B"
			},
		]
	}));

	/**
	 * @type {Electron.MenuItemConstructorOptions[]
	 */
	const helpSubmenu = [
		{
			label: "Report issue",
			click: () => {
				app.shell.openExternal("https://github.com/FellowHead/FlpJck/issues/new")
			}
		}
	];
	if (isWin) {
		helpSubmenu.push({ type: "separator" }, aboutItem);
	}
	menu.append(new MenuItem({
		label: "Help",
		submenu: helpSubmenu
	}));
	document.addEventListener("keydown", (ev) => {
		if (ev.ctrlKey && ev.key === "a") {
			selectAllUnrendered();
		}
	});
	titleBar.updateMenu(menu);
	app.getCurrentWindow().setMenu(menu);
}

createTitleBar();