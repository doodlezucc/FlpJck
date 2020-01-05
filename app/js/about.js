"use strict";

window.onerror = (event, source, lineno, colno, error) => {
	//document.getElementsByTagName("p").item(0).innerHTML = error.stack;
};

const remote = window.require("electron").remote;
const customTitlebar = require("custom-electron-titlebar");
const pjson = require("../package.json");
const { Menu } = remote;

new customTitlebar.Titlebar({
	drag: true,
	maximizable: false,
	minimizable: false,
	titleHorizontalAlignment: "left",
	menu: new Menu()
});
remote.getCurrentWindow().setMenu(new Menu());

$(document).ready(() => {
	$("button").click(function() {
		remote.shell.openExternal($(this).attr("href"));
	});
	$("#version").text(pjson.version);
});
