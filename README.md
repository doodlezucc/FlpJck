# FlpJck
### A FL Studio render sync tool!
FlpJck keeps track of when [Fruity Loops](https://www.image-line.com/) projects were last rendered. Whenever you change a project or create a new one, it appears as a green list item. This means that your project has an outdated audio file equivalent (or none at all). By adding list items to the queue, they get rendered one after another.

![Screenshot](screenshot.png?raw=true)
*Screenshot of FlpJck in action, rendering files one by one*

### First time?
How to get started:
- [Download](https://github.com/FellowHead/FlpJck/releases) and install FlpJck
- Add directories containing Fruity Loops project files (*.flp)
- Select some files from the list and click `Render` on the right

### Tested on
- Windows 10 using FL Studio 20
- MacOS Catalina using FL Studio 20

### Cloud sync
To hook this tool up with cloud services (Dropbox, Google Drive, etc.), install their respective desktop version.
Then, set the FlpJck output directory to one managed by your cloud sync software.


## Q&A
### Why does this exist?
I often found to miss some songs (or new versions of them) when scrolling through my dropbox,
so I decided to spend way too much time on a program taking care of remembering what to render.

### How does it work?
Because FL Studio doesn't accept strings with spaces as command line arguments, the FlpJck procedure of rendering a file looks like this:
- If an instance of FL exists, close it
- Copy the FLP to a location which doesn't contain spaces (FlpJck's temporary app data directory)
- Execute FL Studio with a shell command using their very minimalistic CLI<sup>1</sup>
- Observe the window title until it stops indicating that FL is rendering
- Move the rendered audio file to the chosen output directory

<sup>1 - The bottom of this official [manual page](https://www.image-line.com/support/flstudio_online_manual/html/fformats_save_export.htm) vaguely explains all there is.</sup>

### FlpJck makes use of [regedit](https://www.npmjs.com/package/regedit). How and why?
You might have heard some scary things about regedit, the Windows registry editor.
And that is for a reason: you could screw up your PC when cluelessly editing Windows' keys and values.

FlpJck doesn't get near dangerous stuff. It's only editing one pesky, little thing: the FL Studio splash screen.
It would show up every time another song is rendered.

On Windows, splash screen visibility is registered as the "SplashBox" value under `HKCU\SOFTWARE\Image-Line\FL Studio 20\General\MIDIForm`.

On MacOS, there doesn't seem to be any splash screen at all (Catalina at least; correct me if I'm wrong).

**In short:** If you don't already have the FL splash screen disabled, FlpJck turns it off while rendering your files.