
 # FFIV Character Battle Sprite Editor


This tool (available [here](https://elforko.github.io/FFIV-Char-Battle-Sprite-Editor/)) lets you quickly and easily adjust the colors of character's battle sprites in FFIV.

What makes this different from a standard SNES sprite editor?  Let's say you want to change Dark Knight Cecil's armor color: just click on his "Armor" button and start playing with the color sliders.  All 5 of the palette colors that make up Cecil's armor will be adjusted simultaneously while maintaining their relative Brightness and Saturation.

If your mod is using customized graphics, you can easily create your own groupings of palette colors for editing.  And this editor includes a simple graphic editor, in case you want to modify character graphics.

Note that this is only for character battle sprites, it does NOT handle enemy sprites, or character overworld sprites.



 ##  To use

Click on a character link at the top, a color group on the left side, and then try adjusting the Red/Green/Blue sliders.  

If the color looks dull or washed-out, try increasing the Saturation, and then decreasing the Brightness a bit.

Wondering what a certain slider in the editor does?  Hover your mouse cursor over it to get a tooltip.

Many characters have white spots in their spritesheet (Kain's armor, Tellah's hair, etc).  If you want to color these spots, try using one of the Alternate presets for that character, or use the spritesheet editor to replace the white spots (see the Spritesheet Editor section below).

To play your ROM with the updated graphics, first hit the "Save..." button at the top right, then hit the "Load ROM" button in the popup and select an FFIV rom (must be a .smc or .sfc file, unzipped).  Hit the "Export ROM" button, and then fire up the exported ROM in your favorite emulator.



 ##  Spritesheet Editor

If you'd like to make changes to a character's spritesheet, click on the spritesheet to open up the Spritesheet Editor.

In the menu that appears, click on a color in the "Before" color row and drag it to a color in the "After" row, and then try clicking/dragging on the spritesheet.  If you click and drag, a yellow box will surround all pixels that are to be changed.

Note that sometimes changes made to one part of the sprite sheet will effect other parts: for example, try modifying the top of a character's head in the leftmost chunk of the spritesheet (e.i. the standing position).  You should notice that this change effects all five animations on the left side.  This is due to the way the graphic data is stored in the ROM (which was done for efficiency, since there's a lot of redundancy in the graphics and memory was precious back then).



 ##  Modifying Color Groups

If you've made changes to the spritesheet (perhaps repurposing colors in one area elsewhere), and want to modify the color groups, this is totally possible.

To remove a palette color from a group, just click on the group's tab on the left, then on the color's button above the Red/Green/Blue sliders, and then click the "Remove from Group" button.

When a color is ungrouped, it can be added to another group (by clicking on the "+" button next to the color buttons), or used to start a new color group, by clicking the "New Color Group" button at the bottom left.  (Both buttons are hidden if no colors are ungrouped)

Want to change the name of a color group, or the order that the groups or colors appear in?  See the "Metadata Functions" section below.  A word of warning... it will be a slight pain in the ass if you're unfamiliar with the browser console; you might be better off just removing/re-adding colors. I know it kind of sucks, but building these functions into the editor's UI is more work than I want to bother with, heh heh.



 ##  Modifying a Hacked ROM

If you'd like to modify a non-vanilla version of FFIV, that will work fine.  Just load the ROM by click the "Load ROM" button at the top left, and you'll get a pop-up asking if you'd like to use the ROM's graphics or not; choose the "Load ROM Graphics" option, and you should now see your ROM's graphics in the displayed spritesheets.

Palette colors will all be ungrouped at first, so you'll then be able to create the groups yourself.  Color group data (along with all other metadata and graphic data) can be saved for future use in a .JSON file (click the "Save..." button in the top right, then "Save .JSON").  Next time you open the editor, click the "Load .JSON" button at the top left.



 ##  Metadata Functions

I was too lazy to build certain features into the Editor's interface, so instead left these features available as a bundle of functions that can be called in the browser console (in an object called "mdf").

If you're unfamiliar with the console, [this page](https://developer.mozilla.org/en-US/docs/Learn/Common_questions/Tools_and_setup/What_are_browser_developer_tools#find_out_more_3) has instructions for how to open it in all major browsers.

Once you have the console open, you can type in the following commands:

### characterRename(name)  
Allows you to rename the currently selected character (this just effects their name in the link at the top, it has no effect on the ROM data)  
Example:  type this into the console to change the currently selected character's name to Billy
>mdf.characterRename("Billy");

### characterSwap(index)  
Allows you to swap all graphic data of two characters, along with their metadata.  
Example:  type this into the console to swap the currently selected character with Kain
>mdf.characterSwap(1);

### characterClone(index)  
Allows you to replace all graphic data of currently selected character with another character  
Example:  type this into the console to replace the currently selected character with Kain
>mdf.characterClone(1);

### colGroupRename(name)  
Allows you to rename the currently selected color group  
Example:  type this into the console to replace the currently selected color group with "Clothes"
>mdf.colGroupRename("Clothes");

### colGroupMoveUp(num)  
### colGroupMoveDown(num)  
Allows you to move the currently selected color group higher/lower in the order on the left side.Passing no number moves it by one  
Example:  type this into the console to move the currently selected color group down in the order
>mdf.colGroupMoveDown();

### colGroupDelete()  
Deletes the color group, setting all colors in the group to be ungrouped  
Example:  type this into the console to delete the currently selected color group
>mdf.colGroupDelete();  

### colorLeft(num)  
### colorRight(num)  
Allows you to move the currently selected color in a color group left or right  
Example:  type this into the console to move the currently selected color left (only works if a color button is down: does nothing when the "Group" or "+" buttons are down)
>mdf.colorLeft();

### setBlack(r, g, b)  
### setWhite(r, g, b)  
Allows you to set the RGB values for the black and white palette colors  
Example:  type this into the console to set the black palette color to be orange
>mdf.colorLeft(31, 15, 0);
  
  
The editor's data is also viewable in the console: just type "data" into the console to see the data object.
