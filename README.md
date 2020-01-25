# FlpJck
### A FL Studio render sync tool!
FlpJck lets you view and render recently changed Fruity Loops projects (well, isn't that something?!)

This tool may not be the most elegant solution, but as long as Image-Line doesn't provide better command line parameters<sup>1</sup>, one can't go any further into FL Studio.



<sup>1 - The bottom of this official [manual page](https://www.image-line.com/support/flstudio_online_manual/html/fformats_save_export.htm) vaguely explains all there is.</sup>

![a screenshot](screenshot.png?raw=true)
*Screenshot of FlpJck in action, rendering enqueued files one by one*

### First time?
How to get started:
- Install FlpJck
- Select directories containing Fruity Loops project files (*.flp)
- Select an output directory (this is where rendered audio files are copied to)

### Tested on
- Windows 10 using FL Studio 20
- MacOS Catalina using FL Studio 20

### Cloud sync
To hook this tool up with cloud services (Dropbox, Google Drive, etc.), install their respective desktop version. Then, set the FlpJck output directory to one managed by your cloud sync software.


## Q&A
### FlpJck makes use of [regedit](https://www.npmjs.com/package/regedit). How and why?
You might have heard some scary things about regedit, the Windows registry editor. And that is for a reason: you could screw up your PC when cluelessly editing Windows' keys and values.

FlpJck doesn't get near dangerous stuff. It's only editing one pesky, little thing: the FL Studio splash screen. It would show up every time another song is rendered.

On Windows, the existence of the splash screen is registered as the "SplashBox" value under `HKCU\SOFTWARE\Image-Line\FL Studio 20\General\MIDIForm`.

On MacOS, there doesn't actually seem to be a splash screen at all (Catalina at least; correct me if I'm wrong).

If you don't already have the splash screen disabled, FlpJck turns it off while rendering your files.

### Why does this exist?
I often found to miss some songs (or new versions of them) when scrolling through my dropbox, so I decided to spend way too much time on a program taking care of remembering what to render.
