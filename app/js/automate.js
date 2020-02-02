const $ = require("jquery");
const { desktopCapturer } = require("electron");
const customTitlebar = require("custom-electron-titlebar");

const titleBar = new customTitlebar.Titlebar({
	drag: true,
});

$(document).ready(() => {
	desktopCapturer.getSources({
		types: [
			"window"
		],
		//thumbnailSize: 0
	}).then(async sources => {
		const flSource = sources.find(s => s.name === "FL Studio 20");
		if (!flSource) {
			throw new Error("No FL window found");
		}

		$("<img/>").attr("src", flSource.thumbnail.toDataURL()).appendTo(".thumbnails");

		for (const source of sources) {
			console.log(source);
		}
	});
});