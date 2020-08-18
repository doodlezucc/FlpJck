"use strict";

const el = require("electron");
const app = el.remote;
const dialog = app.dialog;
const fs = require("fs");
const p = require("path");
const childProcess = require("child_process");
const regedit = require("regedit");
const chokidar = require("chokidar");
const customTitlebar = require("custom-electron-titlebar");
const isDev = require("electron-is-dev");
const $ = require("jquery");
const macPermissions = require('mac-screen-capture-permissions');

//console.log(macPermissions.resetPermissions());

const isWin = process.platform === "win32";
const extension = ".flp";




// How long FL Studio may load a project (in seconds).
//
// This can be useful when there are missing samples or demo version plugins inside a project.
// In that case, FL Studio displays a dialog to the user and refuses to render automatically.
// After the timer has run out, FlpJck sends a terminate signal to Fruity Loops.
const loadingTimeout = 120;

// How long FL Studio may render a single project (in seconds).
//
// This can be useful if, for some reason, FL Studio
// messes up the rendering process of one of your projects.
//
// The timer starts as soon as FL Studio is done loading the project.
// After the timer has run out, FlpJck sends a terminate signal to Fruity Loops.
const renderingTimeout = 60 * 45;




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
				: (isWin ? "C:/Program Files" : "/Applications")
		});
	});
	$("#outDir").click(function() {
		openDialog((path) => {
			setOutputDirectory(path);
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
	$("#showAll").click(function() {
		setVisibility(visibility == Visibility.ALL ? Visibility.UNRENDERED : Visibility.ALL);
		updateMenuBar();
		saveDataSync();
	});
	$("#format").click(function() {
		nextExtension();
	});
	RenderTask.setPaused(false);
});

let renderExtension = "mp3";

const extensions = [
	"mp3",
	"wav",
	"flac",
	"ogg"
];

function setExtension(s) {
	renderExtension = s;
	$("#format").text(s.toUpperCase());
}

function nextExtension() {
	setExtension(extensions[(extensions.indexOf(renderExtension) + 1) % extensions.length]);
	saveDataSync();
}

const Visibility = {
	ALL: 0,
	UNRENDERED: 1
};
let visibility = Visibility.UNRENDERED;
function setVisibility(v) {
	visibility = v;
	$("#showAll").text(v == Visibility.ALL ? "All projects" : "Unrendered projects");
	flps.forEach((flp) => flp.applyVisibility(v));
}

function displayUnrendered() {
	const count = flps.filter((flp) => !flp.isBlacklisted() && !flp.upToDate).length;
	$("#outOfDate").text(count == 0 ? "" : ", " + count + " out of date");
}

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
		this.selectedCount = 0;
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

	toggleRenderedState() {
		let doSetRendered = false;
		for (let flp of flps) {
			if (flp.jq.hasClass("selected") && !flp.upToDate) {
				doSetRendered = true;
				continue;
			}
		}
		this.forceRenderedState(doSetRendered);
	}

	flpAction(action) {
		flps.forEach((flp) => {
			if (flp.jq.hasClass("selected")) {
				action(flp);
			}
		});
		this.gatherSelected();
		displayUnrendered();
		saveDataSync();
	}

	setBlacklisted(v) {
		this.flpAction(flp => flp.setBlacklisted(v, true));
	}

	forceRenderedState(v) {
		this.flpAction(flp => flp.forceRenderedState(v, true));
	}

	/**
	 * @param {JQuery} row 
	 * @param {JQuery.ClickEvent} event 
	 */
	onclick(row, event) {
		if (event && event.shiftKey) {
			if (row.hasClass("enqueued")) return;
			if (!event.ctrlKey) {
				this.clearSelection();
			}
			this.selectRange(this.pivot, this.getIndex(row));
		} else if (event && event.ctrlKey) {
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
		if (!row.hasClass("enqueued") && !row.hasClass("hidden")) {
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

	selectAllUnrendered() {
		multiSelectTable.selectMatching((flp) => !flp.upToDate && !flp.isBlacklisted());
	}

	gatherSelected() {
		this.selectedCount = this.jq.children(".selected").not(".blacklisted").not(".enqueued").length;
		$("#enqueue").prop("disabled", this.selectedCount == 0);
		$("#selected").text(this.selectedCount + " selected");
		updateMenuBar();
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
				displayUnrendered();
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
		multiSelectTable.gatherSelected();
		displayUnrendered();
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
			displayUnrendered();
		});
	}

	get name() {
		return p.basename(this.path);
	}
}

/**
 * @param {Array.<Electron.MenuItemConstructorOptions>} items 
 * @param {JQuery} element
 */
function displayContextMenu(items, element) {
	element.addClass("context");
	const menu = new Menu();
	for (let i of items) {
		menu.append(new MenuItem(i));
	}
	menu.on("menu-will-close", () => {
		element.removeClass("context");
	});
	menu.popup();
}

class FLP {
	/**
	 * @param {string} file 
	 * @param {Directory} directory
	 */
	constructor(file, directory) {
		this.directory = directory;
		this.file = file;
		var jobs = 1;
		fs.stat(file, (err, stats) => {
			this.stats = stats;
			this.sortInit();
			if (--jobs == 0) this.updateRenderDisplay();
		});
		const outFile = this.outFile;
		if (outFile) {
			jobs++;
			fs.stat(outFile, (err, stats) => {
				this.outStats = stats;
				if (--jobs == 0) this.updateRenderDisplay();
			});
		}

		this.jq = $("<tr/>")
			.addClass("file hidden")
			.on("contextmenu", (e) => {
				multiSelectTable.onclick(this.jq);
				displayContextMenu([{
					label: "Enqueue",
					click: () => this.enqueue(),
					enabled: !this.jq.hasClass("enqueued")
				}, {
					label: "Enqueue at first position",
					click: () => this.enqueue(true),
					enabled: !this.jq.hasClass("enqueued")
				}, {
					type: "separator"
				}, {
					label: this.isBlacklisted() ? "Whitelist" : "Blacklist",
					click: () => this.setBlacklisted(!this.isBlacklisted(), false)
				}, {
					label: "Mark as " + (this.upToDate ? "un" : "") + "rendered",
					click: () => this.forceRenderedState(!this.upToDate, false)
				}, {
					label: "Edit in FL Studio",
					click: () => this.openInFL()
				}], this.jq);
			})
			.append($("<td/>").text(this.fileName))
			.append($("<td/>").text(this.directoryName))
			.append($("<td/>"))
			.append($("<td/>"));
		if (this.isBlacklisted()) {
			this.jq.addClass("blacklisted");
		}
		multiSelectTable.register(this.jq);

		this.watcher = chokidar.watch(file, {
			ignoreInitial: true
		});
		this.watcher.on("unlink", () => {
			this.remove();
			displayUnrendered();
		});
		this.watcher.on("change", (path, stats) => {
			const oldSize = this.stats.size;
			this.stats = stats;
			if (stats.size != oldSize) {
				flps = flps.filter((flp) => flp !== this);
				this.sortInit();

				this.updateRenderDisplay();
			}
		});
	}

	applyVisibility(v) {
		this.jq.toggleClass("hidden", v == Visibility.ALL ? false : this.upToDate);
	}

	setBlacklisted(v, skipSave) {
		if (v) {
			if (!this.jq.hasClass("blacklisted")) {
				this.jq.addClass("blacklisted");
				blacklist.push(this.file);
			}
		} else {
			this.jq.removeClass("blacklisted");
			blacklist = blacklist.filter((s) => s !== this.file);
		}

		if (!skipSave) {
			multiSelectTable.gatherSelected();
			displayUnrendered();
			saveDataSync();
		}
	}

	onOutDirChange() {
		const outFile = this.outFile;
		if (outFile) {
			fs.stat(outFile, (err, stats) => {
				this.outStats = stats;
				this.updateRenderDisplay();
			});
		} else {
			this.outStats = null;
			this.updateRenderDisplay();
		}
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

	get outFile() {
		const fileMaybe = filesInOutDir.find((file) => {
			const base = p.basename(file);
			return base.substr(0, base.length - 4) === this.fileName;
		});
		return fileMaybe ? p.join(getOutputDirectory(), fileMaybe) : null;
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

	enqueue(important) {
		this.jq.removeClass("selected");
		this.jq.addClass("enqueued");
		this.task = new RenderTask(this, important);
		RenderTask.checkQueue();
	}

	onRenderTaskDone(output, success) {
		this.task = null;
		this.jq.removeClass("enqueued");
		if (success) {
			renderings.set(this.file, new Rendering(output, new Date(), this.lastModified, this.stats.size));
			this.updateRenderDisplay();
			saveDataSync();
		}
	}

	get upToDate() {
		return this.lastRender ? this.lastModified < this.lastRender : false;
	}

	isBlacklisted() {
		return blacklist.some((s) => s === this.file);
	}

	updateRenderDisplay() {
		this.applyVisibility(visibility);
		this.jq.children().eq(2).text(this.lastModified.toLocaleString());
		this.jq.children().eq(3).text(this.lastRender ? this.lastRender.toLocaleString() : "Never");
		if (this.upToDate) {
			this.jq.addClass("up-to-date");
		} else {
			this.jq.removeClass("up-to-date");
		}
		displayUnrendered();
	}

	forceRenderedState(v, skipSave) {
		if (v && !this.upToDate) {
			renderings.set(this.file, new Rendering(null, new Date(), this.lastModified, this.stats.size));
			this.updateRenderDisplay();
		} else if (!v) {
			renderings.delete(this.file);
			this.updateRenderDisplay();
		}

		if (!skipSave) {
			saveDataSync();
		}
	}

	get lastRender() {
		if (this.rendering && this.outStats) {
			const d1 = this.rendering.date;
			const d2 = this.outStats.mtime;
			return (d1.getTime() > d2.getTime()) ? d1 : d2;
		} else if (this.rendering) {
			return this.rendering.date;
		} else if (this.outStats) {
			return this.outStats.mtime;
		}
		return null;
	}

	get rendering() {
		return renderings.get(this.file);
	}

	openInFL() {
		app.shell.openItem(this.file);
	}
}

function icon(name) {
	return $("<i/>").addClass("fas fa-" + name);
}

const States = {
	ENQUEUED: "Enqueued",
	PREPARE_FL: "Preparing FL Studio",
	CLOSE_FL: "Closing FL Studio",
	LOAD_PROJECT: "Loading project",
	RENDER: "Rendering",
	DONE: "Done",
};

class RenderTask {
	/**
	 * @type {RenderTask[]}
	 */
	static taskQueue = [];
	static rendering = false;
	static isPaused = false;

	/**
	 * @param {FLP} flp 
	 */
	constructor(flp, important = false) {
		const ref = this;
		this.flp = flp;
		this.jq = $("<div/>")
			.addClass("task")
			.on("contextmenu", () => {
				const qIndex = RenderTask.taskQueue.indexOf(this);

				/**
				 * @type {Array.<Electron.MenuItemConstructorOptions>}
				 */
				const items = [{
					label: "Move to top",
					click: () => this.moveToTop(),
					enabled: qIndex > 0
				}, {
					label: "Remove from queue",
					click: () => this.remove()
				}];
				if (RenderTask.isPaused) {
					items.push({
						type: "separator"
					}, {
						label: "Edit in FL Studio",
						click: () => this.flp.openInFL()
					});
				}
				displayContextMenu(items, this.jq);
			})
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
			.append($("<div/>").addClass("bg"))
			.append(
				$("<div/>")
					.addClass("progressbar")
					.append($("<div/>").addClass("progress"))
			);

		if (important) {
			RenderTask.taskQueue.unshift(this);
			$(".task-container").children().first().after(this.jq);
		} else {
			RenderTask.taskQueue.push(this);
			this.jq.appendTo($(".task-container"));
		}

		this.setState(States.ENQUEUED, 0);
		this.updateRemaining();
		RenderTask.checkQueue();
	}

	remove() {
		if (RenderTask.rendering == this) {
			this.dead();
		} else {
			RenderTask.taskQueue = RenderTask.taskQueue.filter((task) => task !== this);
			this.jq.remove();
			this.flp.jq.removeClass("enqueued");
			this.updateRemaining();
		}
	}

	updateRemaining() {
		const remaining = $(".task-container").children().not("#pausedblock").length;
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
		if (!RenderTask.isPaused) {
			this.progress = progress;
			this.jq.css("--progress", (100 * this.progress) + "%");
		}
	}

	get fileName() {
		return this.flp.fileName;
	}

	setState(state, progress) {
		if (!RenderTask.isPaused) {
			this.state = state;
			console.log(this.fileName + " : " + this.state);
			this.setProgress(progress);
		}
	}

	render() {
		RenderTask.rendering = this;

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
		return p.join(this.safeDir, "out." + renderExtension);
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
		this.setState(States.PREPARE_FL, 0.075);
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
			} else {
				callback();
			}
		}
	}

	prepareRender(callback) {
		this.setState(States.CLOSE_FL, 0.05);
		this.closeFL(() => {
			this.prepareFL(() => {
				this.copySource(() => {
					callback();
				});
			});
		});
	}

	createInterval() {
		let flID;
		let lastSources;
		let rendering = false;
		let start;
		let previousBars = 0;

		if (!isWin) {
			if (!macPermissions.hasScreenCapturePermission()) {
				app.getCurrentWindow().setAlwaysOnTop(false);
				return false;
			}
		}

		this.interval = setInterval(() => {
			el.desktopCapturer.getSources({
				types: ["window"],
				thumbnailSize: {
					width: 0,
					height: 0
				},
				fetchWindowIcons: false
			}).then((sources) => {
				if (!flID) {
					// Phase 1: Wait for FL Studio to pop up as a window
					if (lastSources) {
						if (sources.length > lastSources.length) {
							// a new window has opened
							const srcNew = sources.find((src) =>
								!lastSources.some((lastSrc) => src.id === lastSrc.id));
							//console.log("new window: " + srcNew.name);

							if (srcNew.name.startsWith("FL Studio")) {
								flID = srcNew.id;
								start = new Date();
								//console.log("found you, " + flID);
							}
						}
					}
					lastSources = sources;
				}
				else {
					// Phase 2: Observe FL Studio's window title
					const elapsed = (new Date().getTime() - start) / 1000;

					const flSrc = sources.find((src) => src.id === flID);
					if (flSrc) {
						const s = flSrc.name;
						if (s.includes("/") && s.lastIndexOf("/") > s.length - 5) {
							// Window title looks something like ......./....
							// so, probably rendering
							if (!rendering) {
								rendering = true;
								this.setState(States.RENDER, 0.15);
								start = new Date();
							}

							const progress = s.substr(s.lastIndexOf(" ") + 1);
							const current = parseInt(progress.substr(0, progress.indexOf("/")));
							const total = parseInt(progress.substr(progress.indexOf("/") + 1));

							if (current < previousBars) {
								console.log("FL seems to be caught in an endless loop!");
								this.dead();
							}
							previousBars = current;

							this.setProgress(0.15 + 0.75 * current / total);
						}
						else if (!rendering && isWin) {
							// FL is loading the project
							if (this.success && elapsed >= loadingTimeout - 10) {
								// FL might be stuck, are samples or plugins missing?
								this.displayTimeout(elapsed, loadingTimeout);
							}
						}
						if (rendering || !isWin) {
							if (this.success && elapsed >= renderingTimeout - 60 * 5) {
								// FL might be messing up right now. smh my head.
								this.displayTimeout(elapsed, renderingTimeout);
							}
						}
					}
				}
			});
		}, 400);
		return true;
	}

	displayTimeout(elapsed, timeout) {
		if (elapsed < timeout) {
			console.log("FL might be stuck, terminating in "
				+ (timeout - elapsed).toFixed(1) + " seconds.");
		} else {
			this.dead();
		}
	}

	dead() {
		console.log("I diagnose you with dead.");
		this.success = false;
		this.closeAndFinalise();
	}

	closeAndFinalise() {
		this.setState(States.CLOSE_FL, 0.9);
		this.closeFL(() => {
			if (!isWin) {
				this.finaliseProduct();
			}
		}, true);
	}

	flRender() {
		this.prepareRender(() => {
			this.setState(States.LOAD_PROJECT, 0.1);
			this.success = true;

			this.outputWatcher = chokidar.watch(this.safeProductPath, {
				awaitWriteFinish: true
			});
			const onFileWritten = () => {
				if (!RenderTask.isPaused) {
					this.closeAndFinalise();
				}
			}
			this.outputWatcher.on("change", onFileWritten);

			if (!this.createInterval()) {
				return;
			}

			const command = "cmd.exe /C \"" + getExecPath() + "\" /Rout /E" + renderExtension + " " + this.safePath;
			console.log(command);
			const cp = isWin ? childProcess.spawn("start", ["/min", "", command], {
				shell: true,
			}) : childProcess.spawn("open", ["\"" + getExecPath() + "\"",
				"--args", "-Rout", "-E" + renderExtension, this.safePath], {
				shell: true,
			});
			if (isWin) {
				cp.on("close", (code, signal) => {
					console.log("Exited with code " + code + ", signal " + signal);
					this.finaliseProduct();
				});
			}
		});
	}

	finaliseProduct() {
		this.outputWatcher.close();
		clearInterval(this.interval);
		if (!RenderTask.isPaused) {
			if (this.success) {
				this.copyProduct(() => {
					//console.log("copied");
				});
			}
			this.onRenderDone();
		} else {
			RenderTask.rendering = false;
		}
	}

	pseudoRender() {
		console.log("PSEUDO rendering " + this.fileName);
		let i = 0;
		const timeout = setInterval(() => {
			this.setProgress(i / 20);
			i++;
			if (i >= 20) {
				clearInterval(timeout);
				this.onRenderDone();
			}
		}, 500);
	}

	onRenderDone() {
		this.setState(States.DONE);
		RenderTask.rendering = false;
		this.jq.remove();
		this.flp.onRenderTaskDone(this.output, this.success);
		RenderTask.checkQueue();
		this.updateRemaining();
	}

	get output() {
		return p.join(getOutputDirectory(), this.fileName + "." + renderExtension);
	}

	static checkQueue() {
		if (!this.rendering) {
			if (this.taskQueue.length && !this.isPaused) {
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

	cancel() {
		RenderTask.taskQueue.unshift(this);
		this.setState(States.ENQUEUED, 0);
		RenderTask.isPaused = true;
		this.closeAndFinalise();
	}

	static setPaused(v) {
		$("#pause").children().toggleClass("fa-pause", !v);
		$("#pause").children().toggleClass("fa-play", v);
		$("#pause")[0].title = "Click to " + (v ? "resume" : "pause") + " rendering";
		if (!v) {
			// Play
			$("#pausedblock").remove();
			RenderTask.isPaused = false;
		} else {
			// Pause
			$("<div/>")
				.attr("id", "pausedblock")
				.addClass("task")
				.append($("<h2/>").text("PAUSED"))
				.append($("<div/>").addClass("bg"))
				.prependTo($(".task-container"));

			if (this.rendering) {
				this.rendering.cancel();
				RenderTask.rendering = false;
			} else {
				RenderTask.isPaused = true;
			}
		}
		this.checkQueue();
	}
}

function togglePaused() {
	RenderTask.setPaused(!RenderTask.isPaused);
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
			format: renderExtension,
			directories: directories.map((d) => {
				return {
					path: d.path,
					deep: d.deep
				};
			}),
			visibility: visibility,
			blacklist: blacklist,
			renderings: jRenderings
		}, null, 2));
	console.log("Saved!");
}

/**
 * @type {string[]}
 */
var filesInOutDir;

function setOutputDirectory(dir) {
	$("#outDir").text(dir);
	const filePaths = fs.readdirSync(dir);
	filesInOutDir = [];
	filePaths.forEach((path) => {
		filesInOutDir.push(p.basename(path));
	});
	flps.forEach((flp) => flp.onOutDirChange());
}

function loadData() {
	if (fs.existsSync(savefile)) {
		const userData = JSON.parse(fs.readFileSync(savefile, "utf8"));
		setVisibility(userData.visibility);
		$("#execPath").text(userData.execPath);
		setExtension(userData.format || "mp3");
		setOutputDirectory(userData.outDir);
		blacklist = userData.blacklist;

		for (const key in userData.renderings) {
			const r = userData.renderings[key];
			renderings.set(key, new Rendering(r.output, new Date(r.date), new Date(r.inputModified), r.inputSize));
		}
		userData.directories.forEach((dir) => new Directory(dir.path, dir.deep));
	}
	else {
		setVisibility(Visibility.ALL);
		setOutputDirectory(app.app.getPath("music"));

		$("#execPath").text("None selected!");
		if (isWin) {
			let dImageLine = "C:/Program Files (x86)/Image-Line/";
			if (!fs.existsSync(dImageLine)) {
				dImageLine = "C:/Program Files/Image-Line";
			}
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

function updateMenuBar() {
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
	let enableSelect = multiSelectTable.selectedCount > 0;
	let enableBlacklist = multiSelectTable.jq.children(".selected").not(".enqueued").length > 0;
	menu.append(new MenuItem({
		label: "Selection",
		submenu: [
			{
				label: "Select all unrendered",
				click: () => {
					multiSelectTable.selectAllUnrendered();
				},
				accelerator: "CmdOrCtrl+A"
			},
			{
				label: "Select all",
				enabled: visibility == Visibility.ALL,
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
				accelerator: "CmdOrCtrl+E",
				enabled: visibility == Visibility.ALL
			},
			{
				type: "separator"
			},
			{
				label: "Render/Enqueue selected",
				click: () => {
					$("#enqueue").click();
				},
				accelerator: "CmdOrCtrl+R",
				enabled: enableSelect
			},
			{
				label: "(Un-)Blacklist selected",
				click: () => {
					multiSelectTable.toggleBlacklist();
				},
				accelerator: "CmdOrCtrl+B",
				enabled: enableBlacklist
			},
			{
				label: "Mark as (un-)rendered",
				click: () => {
					multiSelectTable.toggleRenderedState();
				},
				accelerator: "CmdOrCtrl+M",
				enabled: enableSelect
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
				app.shell.openExternal("https://github.com/FellowHead/FlpJck/issues")
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
	titleBar.updateMenu(menu);
	app.getCurrentWindow().setMenu(menu);
}

function createKeyListener() {
	document.addEventListener("keydown", (ev) => {
		if (ev.ctrlKey && ev.key === "a") {
			multiSelectTable.selectAllUnrendered();
		} else if (ev.ctrlKey && ev.key === "I") {
			app.getCurrentWebContents().openDevTools();
		}
	});
}

updateMenuBar();
createKeyListener();