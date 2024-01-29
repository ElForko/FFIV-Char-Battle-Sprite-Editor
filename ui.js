"use strict"

let data;
let mdf = {};
let generateConfigObject;
let printPreset;

window.addEventListener("DOMContentLoaded", async function()
{
	let undoStack; // Stack of copies of 'data' for undo/redo
	let undoIndex;
	let maxStackSize = 50;
	let initData;          // A copy of "data" after initialization
	let vanillaCharData;   // Raw graphic data that a vanilla ROM should have

	// undoStack Functions
	//{{{

	function pushState()
	//{{{
	{
		let copy = JSON.parse(JSON.stringify(data));
		undoStack.splice(undoIndex+1);
		undoStack.push(copy);
		while(undoStack.length>maxStackSize) undoStack.shift();
		undoIndex = undoStack.length-1;
		dispatchEvent(new CustomEvent("stackUpdate"));
	}
	//}}}

	function undoState()
	//{{{
	{
		undoIndex--;
		if(undoIndex<0)
		{
			undoIndex = 0;
			return;
		}

		data = JSON.parse(JSON.stringify(undoStack[undoIndex]));
		data.currChar = undoStack[undoIndex+1].currChar;
		dispatchEvent(new CustomEvent("stackUpdate"));
	}
	//}}}

	function redoState()
	//{{{
	{
		if(undoIndex>=undoStack.length-1) return;
		undoIndex++;
		data = JSON.parse(JSON.stringify(undoStack[undoIndex]));
		dispatchEvent(new CustomEvent("stackUpdate"));
	}
	//}}}

	//}}}

	// Utility Functions
	//{{{

	function readBin(bin)
	//{{{
	{
		let charData = [];
		for(let i=0;i<16;i++) charData.push({});

		// Palettes
		//{{{
		{
			let i = 0xe7d00;
			let c = 0;
			while(i<0xe7eff)
			{
				let p = charData[c].palette = [];
				for(let j=0;j<0x20;j+=2)
				{
					let num = (bin[i+j+1]<<8)+bin[i+j];
					let b = (num&0x7c00)>>10;
					let g = (num&0x03e0)>>5;
					let r = (num&0x001f)>>0;
					p.push({"r":r,"g":g,"b":b});
				}
				i+=0x20;
				c++;
			}
		}
		//}}}

		// Graphic Tiles
		//{{{
		{
			for(let c=0;c<14;c++)
			{
				let ts = charData[c].tilesheet = [];
				for(let t=0;t<64;t++)
				{
					let a = 0xd0000+c*0x800+t*0x20;
					let tile = [];
					for(let y=0;y<8;y++)
					{
						let row = [];
						for(let x=0;x<8;x++)
						{
							let v = 0;
							v+= ((bin[a+2*y+0]&(1<<x))>>x)<<0;
							v+= ((bin[a+2*y+1]&(1<<x))>>x)<<1;
							v+= ((bin[a+2*y+16]&(1<<x))>>x)<<2;
							v+= ((bin[a+2*y+17]&(1<<x))>>x)<<3;
							row.push(v);
						}
						tile.push(row);
					}
					ts.push(tile);
				}
			}
		}
		//}}}

		return charData;

	}
	//}}}

	function writeBin(charData, bin)
	//{{{
	{

		// Palettes
		//{{{
		{
			for(let i=0;i<charData.length;i++)
			{
				let bp = charData[i].palette;
				for(let j=0;j<0x10;j++)
				{
					let num = 0;
					num|= (bp[j].b&0x1f)<<10;
					num|= (bp[j].g&0x1f)<<5;
					num|= (bp[j].r&0x1f)<<0;
					bin[0xe7d00+0x20*i+2*j+0] = num&0xff;
					bin[0xe7d00+0x20*i+2*j+1] = (num&0xff00)>>8;
				}
			}
		}
		//}}}

		// Graphic Tiles
		//{{{
		{
			for(let c=0;c<14;c++)
			{
				let ts = charData[c].tilesheet;
				for(let t=0;t<64;t++)
				{
					let a = 0xd0000+c*0x800+t*0x20;
					let tile = ts[t];

					for(let r=0;r<8;r++)
					{
						let rd = tile[r];
						let b;

						b=0;
						for(let c=0;c<8;c++) b+= ((rd[c]&1)>>0)<<c;
						bin[a+2*r+0] = b;

						b=0;
						for(let c=0;c<8;c++) b+= ((rd[c]&2)>>1)<<c;
						bin[a+2*r+1] = b;

						b=0;
						for(let c=0;c<8;c++) b+= ((rd[c]&4)>>2)<<c;
						bin[a+2*r+16] = b;

						b=0;
						for(let c=0;c<8;c++) b+= ((rd[c]&8)>>3)<<c;
						bin[a+2*r+17] = b;
					}
				}
			}
		}
		//}}}

		return bin;
	}
	//}}}

	function convertPaletteToCodes(charCode)
	//{{{
	{
		let p = [];
		let pd = data.characters[charCode].palette;
		p.push("#fff");
		for(let c=1;c<16;c++)
		{
			let s = "#";
			s+= Math.floor(pd[c].r*255/31).toString(16).padStart(2,"0");
			s+= Math.floor(pd[c].g*255/31).toString(16).padStart(2,"0");
			s+= Math.floor(pd[c].b*255/31).toString(16).padStart(2,"0");
			p.push(s);
		}
		return p;
	}
	//}}}

	function convertPaletteToCode(charCode, index)
	//{{{
	{
		let pd = data.characters[charCode].palette;
		let s = "#";
		s+= Math.floor(pd[index].r*255/31).toString(16).padStart(2,"0");
		s+= Math.floor(pd[index].g*255/31).toString(16).padStart(2,"0");
		s+= Math.floor(pd[index].b*255/31).toString(16).padStart(2,"0");
		return s;
	}
	//}}}

	function floatToFive(num)
	//{{{
	{
		// Converts a floating point number ranging 0.0-1.0 to 5-bit color (e.i. 0-31)
		let n = Math.floor(31*num+0.5);
		if(n>31) n = 31;
		if(n< 0) n =  0;
		return n;
	}
	//}}}

	function rgbToHue(r,g,b)
	//{{{
	{
		let min = Math.min(r,g,b);
		let max = Math.max(r,g,b);
		let ar,ag,ab;

		if(min==max) return 2.5;

		let hue;
		if(r==max)
		{
			if(b==min) hue = 0+(g-min)/(max-min)/2;
			else       hue = 3-(b-min)/(max-min)/2;
		}
		else if(g==max)
		{
			if(r==min) hue = 1+(b-min)/(max-min)/2;
			else       hue = 1-(r-min)/(max-min)/2;
		}
		else
		{
			if(g==min) hue = 2+(r-min)/(max-min)/2;
			else       hue = 2-(g-min)/(max-min)/2;
		}

		return hue;
	}
	//}}}

	function hueToRgb(hue)
	//{{{
	{
		     if(hue<0)    return [0,0,0];
		else if(hue<=0.5) return [         1, 2*(hue-0),         0];
		else if(hue<=1.0) return [ 2*(1-hue),         1,         0];
		else if(hue<=1.5) return [         0,         1, 2*(hue-1)];
		else if(hue<=2.0) return [         0, 2*(2-hue),         1];
		else if(hue<=2.5) return [ 2*(hue-2),         0,         1];
		else if(hue<=3.0) return [         1,         0, 2*(3-hue)];
		else              return [1,1,1];
	}
	//}}}

	function hueSum(hue1, hue2)
	//{{{
	{
		return (((hue1+hue2)%3)+3)%3;
	}
	//}}}

	function colorGroupAppend(charIndex, colorGroup, paletteIndex)
	//{{{
	{
		let pal = data.characters[charIndex].palette;

		// Initialize Group if necessary
		//{{{
		if(!("items" in colorGroup))
		{
			colorGroup.items = [];
			let col = pal[paletteIndex];
			let [ar,ag,ab] = hueToRgb(rgbToHue(col.r,col.g,col.b));
			colorGroup.red = floatToFive(ar);
			colorGroup.green = floatToFive(ag);
			colorGroup.blue = floatToFive(ab);

			colorGroup.bright = 0;
			colorGroup.sat = 0;
			colorGroup.huebr = [ar,ag,ab].reduce((s,v)=>s+v);
		}
		//}}}

		// Create Color Structure
		let c = {};
		colorGroup.items.push(c);

		// Index
		c.index = paletteIndex;

		// Values
		//{{{
		{
			let col = pal[paletteIndex];
			let r = col.r/31;
			let g = col.g/31;
			let b = col.b/31;

			let min = Math.min(r,g,b);

			// Calculate Hue Brightness
			let hue = rgbToHue(r,g,b);

			// Calculate Hue Delta
			if(colorGroup.items.length<2) c.huedel = 0;
			else
			{
				let ach = pal[colorGroup.items[0].index]; // anchor color hue
				let ar = ach.r;
				let ag = ach.g;
				let ab = ach.b;
				c.huedel = hueSum(hue,-rgbToHue(ar,ag,ab));
				if(c.huedel>1.5) c.huedel-= 3;
			}

			// Calculate Brightness
			let br = (r+b+g)/3;
			c.bright = br;

			// Calculate Saturation
			if(br==0) c.sat = 0;
			else      c.sat = 1-min/br;
		}
		//}}}

	}
	//}}}

	function ungroupedPaletteSlots(charIndex)
	//{{{
	{
		let cgl = data.characters[charIndex].colorGroups;

		let taken = {}; // I have a very particular set of skills...
		for(let cg of cgl)
		{
			let cgi = cg.items;
			for(let c of cgi) taken[c.index] = 1;
		}

		let free = [];
		for(let i=3;i<16;i++) if(!(i in taken)) free.push(i);

		return free;

	}
	//}}}

	generateConfigObject = function()
	//{{{
	{
		let configObject = {};
		configObject.characters = [];

		for(let ci in data.characters)
		{
			let charObject = {}
			configObject.characters[ci] = charObject;
			charObject.colorGroups = [];

			let charData = data.characters[ci];
			for(let cg of charData.colorGroups)
			{
				let o = {};
				o.label = cg.label;
				let pi = o.paletteIndices = [];
				for(let c of cg.items) pi.push(c.index);
				charObject.colorGroups.push(o);
			}
		}

		return configObject;
	}
	//}}}

	function processConfigObject(configObject)
	//{{{
	{
		if("characters" in configObject)
		{
			for(let charIndex in configObject.characters)
			{
				let confChar = configObject.characters[charIndex];
				let dataChar = data.characters[charIndex];

				if("colorGroups" in confChar)
				{
					let cgs = dataChar.colorGroups = [];
					for(let ccg of confChar.colorGroups)
					{
						let cg = {};
						cgs.push(cg);
						cg.label = ccg.label;
						for(let i of ccg.paletteIndices)
						{
							colorGroupAppend(charIndex, cg, i);
						}
					}
				}
			}
		}
	}
	//}}}

	function genTilesheetDelta()
	//{{{
	{
		let ci = data.currChar;
		let cts = data.characters[ci].tilesheet;
		let its = initData.characters[ci].tilesheet;

		let d = [[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[]];

		for(let t=0;t<64;t++) for(let x=0;x<8;x++) for(let y=0;y<8;y++)
		{
			let p = cts[t][x][y];
			if(p!=its[t][x][y]) d[p].push([t,x,y]);
		}

		return d;
	}
	//}}}

	function applyTilesheetDelta(delta)
	//{{{
	{
		let cts = data.characters[data.currChar].tilesheet;
		for(let c=0;c<16;c++) for(let i=0;i<delta[c].length;i++)
		{
			let [t,x,y] = delta[c][i];
			cts[t][x][y] = c;
		}
	}
	//}}}

	printPreset = function()
	//{{{
	{
		let pre = {};
		let character = data.characters[data.currChar];
		pre.name = "Test";
		pre.description = "x";
		pre.delta = genTilesheetDelta();
		pre.colorGroups = JSON.parse(JSON.stringify(character.colorGroups));
		pre.palette = character.palette;
		console.log("initData.characters["+data.currChar+"].presets.push("+JSON.stringify(pre)+");");
	}
	//}}}

	mdf.characterRename = function(name)
	//{{{
	{
		data.characters[data.currChar].name = name;
		initInterface();
	}
	//}}}

	//}}}

	// Interface Functions
	//{{{

	// Sprite Sheet Functions
	let drawSpriteSheet;
	let clearSpriteSheet;
	let attachSpriteSheetEditor;
	//{{{
	{
		let poses = [];

		// Define Poses
		//{{{
		{
			// Poses
			poses.push([[ 0, 1],
						[ 2, 3],
						[ 4, 5]]); // Stand      0
			poses.push([[ 0, 1],
						[ 2, 3],
						[12,13]]); // Walk       1
			poses.push([[ 0, 1],
						[20, 3],
						[21,13]]); // Attack 1   2
			poses.push([[ 0, 1],
						[22,23],
						[24,25]]); // Attack 2   3
			poses.push([[ 0,26],
						[ 2,27],
						[28,29]]); // Attack 3   4
			poses.push([[36,37],
						[38,39],
						[40,41]]); // Arm up     5
			poses.push([[57,58],
						[59,60],
						[61,62]]); // Cast 1     6
			poses.push([[57,58],
						[63,60],
						[61,62]]); // Cast 2     7
			poses.push([[ 6, 7],
						[ 8, 9],
						[10,11]]); // Defend     8
			poses.push([[30,31],
						[32,33],
						[34,35]]); // Hit        9
			poses.push([[14,15],
						[16,17],
						[18,19]]); // Weak      10
			poses.push([[99,99,99],
						[42,43,44],
						[45,46,47]]); // Dead   11
			poses.push([[48,49,50],
						[51,52,53],
						[99,55,56]]); // Dead   11

		}
		//}}}

		drawSpriteSheet = function(spriteCanv, charIndex, charHeight, ppp)
		//{{{
		{
			let charData = data.characters;
			let ctx = spriteCanv.getContext("2d");

			function drawTile(character, tile, x, y)
			//{{{
			{
				let pcodes = convertPaletteToCodes(character);
				let t = charData[character].tilesheet[tile];
				for(let c=0;c<8;c++)
				{
					for(let r=0;r<8;r++)
					{
						if(t[c][r]==0) continue;
						ctx.fillStyle = pcodes[t[c][r]];
						ctx.fillRect(ppp*(x*8+7-r),
									 ppp*(y*8+c),
									 ppp, ppp);
					}
				}
			}
			//}}}

			// Draw Tilesheet
			/*
			spriteCanv.height = 400;
			for(let tr=0;tr<8;tr++)
			{
				for(let tc=0;tc<8;tc++)
				{
					drawTile(data.currChar, tc+8*tr, tc, tr+4);
				}
			}
			//*/

			// Draw Sprite Sheet
			//{{{
			{
				let currChar = charIndex;
				let spot = 0;
				for(let p in poses)
				{
					for(let r in poses[p])
					{
						for(let c in poses[p][r])
						{
							if(poses[p][r][c]==99) continue;
							drawTile(currChar, poses[p][r][c], spot+Number(c), Number(r)+3*charHeight);
						}
					}
					spot+= poses[p][0].length;
				}
			}
			//}}}

		}
		//}}}

		clearSpriteSheet = function(spriteCanv, ppp)
		//{{{
		{
			let charData = data.characters;
			let ctx = spriteCanv.getContext("2d");

			// Checkerboard background
			{
				let ctx = spriteCanv.getContext("2d");
				ctx.fillStyle = "#e8e8e8";
				ctx.fillRect(0,0,spriteCanv.width, spriteCanv.height);
				ctx.fillStyle = "#f8f8f8";
				for(let x=0;x<spriteCanv.width;x+=ppp/2)
				{
					for(let y=0;y<spriteCanv.height;y+=ppp/2)
					{
						if(((x+y)/ppp*2)%2==1) ctx.fillRect(x,y,ppp/2,ppp/2);
					}
				}
			}

		}
		//}}}

		attachSpriteSheetEditor = function(spriteCanv, updateInterface, pixelTransform, ppp)
		//{{{
		{
			let visbox = document.createElement("div");
			visbox.style.border = "2px solid yellow";
			visbox.style.borderStyle = "dotted";
			visbox.style.position = "absolute";
			visbox.style.visibility = "hidden";
			visbox.style.pointerEvents = "none";
			visbox.style.zIndex = "1";

			let msx = -1;
			let msy = -1;

			spriteCanv.addEventListener("mousemove", function(e)
			{
				if(msx>-1 && data.mode==1)
				{
					visbox.style.visibility = "";
					let sx,ex,sy,ey;
					if(msx<e.offsetX){ sx = msx; ex = e.offsetX; }
					else             { ex = msx; sx = e.offsetX; }
					if(msy<e.offsetY){ sy = msy; ey = e.offsetY; }
					else             { ey = msy; sy = e.offsetY; }

					let spx = Math.floor(sx/ppp);
					let epx = Math.floor(ex/ppp);
					let spy = Math.floor(sy/ppp);
					let epy = Math.floor(ey/ppp);

					visbox.style.left   = spx*ppp+"px";
					visbox.style.width  = (epx-spx)*ppp+"px";
					visbox.style.top    = spy*ppp+"px";
					visbox.style.height = (epy-spy)*ppp+"px";
				}
				else visbox.style.visibility = "hidden";
			});
			spriteCanv.addEventListener("mouseleave", function(e)
			{
				visbox.style.visibility = "hidden";
			});

			spriteCanv.addEventListener("mousedown", function(e)
			{
				if(data.mode==1)
				{
					// Mouse Coordinates
					let mx = e.offsetX;
					let my = e.offsetY;

					msx = mx;
					msy = my;
				}
				else
				{
					data.mode = 1;
					updateInterface();
				}

			});
			spriteCanv.addEventListener("mouseup", function(e)
			{
				visbox.style.visibility = "hidden";
				if(data.mode!=1) return;

				// Mouse Coordinates
				let mx = e.offsetX;
				let my = e.offsetY;

				if(msx<0) return;

				let sx, ex, sy, ey;
				if(mx<msx) { sx =  Math.floor(mx/ppp); ex = Math.floor(msx/ppp); }
				else       { sx = Math.floor(msx/ppp); ex =  Math.floor(mx/ppp); }
				if(my<msy) { sy =  Math.floor(my/ppp); ey = Math.floor(msy/ppp); }
				else       { sy = Math.floor(msy/ppp); ey =  Math.floor(my/ppp); }
				if(sx<0)sx=0;
				if(sy<0)sy=0;

				let change = false;
				let switched = {};
				for(let x=sx;x<=ex;x++)
				for(let y=sy;y<=ey;y++)
				{
					let tx = Math.floor(x/8);
					let ty = Math.floor(y/8);

					let p, px, py;
					if(tx<22)
					{
						px = tx%2;
						py = ty;
						p = (tx-px)/2;
					}
					else
					{
						px = (tx-22)%3;
						py = ty;
						p = (tx-22-px)/3+11;
					}

					let tile = poses[p][py][px];
					if(tile==99) continue;
					let tilesheet = data.characters[data.currChar].tilesheet[tile];
					let ix = Math.floor(x%8);
					let iy = Math.floor(y%8);

					let tsval = tilesheet[iy][7-ix];
					if(pixelTransform[tsval]!=-1)
					{
						change = true;
						if(!([tile,ix,iy] in switched))
						{
							tilesheet[iy][7-ix] = pixelTransform[tsval];
							switched[[tile,ix,iy]] = 1;
						}
					}

				}
				if(change) pushState();

				msx = -1;
				msy = -1;

				updateInterface();

			});

			// Tooltip
			{
				let t = "Click here to try the (experimental and basic) Spritesheet Editor";
				spriteCanv.addEventListener("mousemove", function()
				{
					if(data.mode!=1 && spriteCanv.title!=t) spriteCanv.title = t;
					else if(data.mode==1 && spriteCanv.title==t) spriteCanv.title = "";
				});
			}

			return visbox;

		}
		//}}}

	}
	//}}}

	// Popup Functions
	let popupContent;
	let popupClose;
	//{{{
	{
		let popupouter;
		let popupinner;
		popupouter = document.createElement("div");
		popupouter.style.position = "fixed";
		popupouter.style.zIndex = "1";
		popupouter.style.top ="0";
		popupouter.style.bottom ="0";
		popupouter.style.left = "0";
		popupouter.style.right = "0";
		popupouter.style.backgroundColor = "#0008";
		popupouter.style.display = "flex";
		popupouter.style.alignItems = "center";
		popupouter.style.justifyContent = "center";
		popupouter.style.visibility = "hidden";
		popupouter.style.overflow = "scroll";
		popupouter.addEventListener("click", function()
		{
			popupClose();
		});

		popupinner = document.createElement("div");
		popupinner.style.position = "relative";
		popupinner.style.backgroundColor = "#eef";
		popupinner.style.borderRadius = "15px";
		popupinner.style.padding = "15px";
		popupinner.addEventListener("click", function(e)
		{
			e.stopPropagation();
		});

		popupouter.appendChild(popupinner);
		document.body.appendChild(popupouter);

		popupContent = function(element)
		{
			popupouter.style.visibility = "visible";
			popupinner.textContent = "";
			popupinner.style.top = 0;
			popupouter.scrollTop = 0;
			popupinner.appendChild(element);
			let t = popupinner.getBoundingClientRect().top;
			if(t<-15) popupinner.style.top = -(t-15)+"px";
		}

		popupClose = function()
		{
			popupouter.style.visibility = "hidden";
		};

	}
	//}}}

	//}}}

	function initialize(charData, usePresets=true)
	//{{{
	{
		if(charData!=null)
		{
			data = {};

			data.characters = charData;

			// Names
			//{{{
			{
				charData[ 0].name = "DK Cecil";
				charData[ 1].name = "Kain";
				charData[ 2].name = "Young Rydia";
				charData[ 3].name = "Tellah";
				charData[ 4].name = "Edward";
				charData[ 5].name = "Rosa";
				charData[ 6].name = "Yang";
				charData[ 7].name = "Palom";
				charData[ 8].name = "Porom";
				charData[ 9].name = "Cecil";
				charData[10].name = "Cid";
				charData[11].name = "Rydia";
				charData[12].name = "Edge";
				charData[13].name = "FuSoYa";
				charData[14].name = "Golbez";
				charData[15].name = "Anna";
			}
			//}}}

			// Load Config
			//{{{
			if(usePresets)
			{
				let initConfig = {"characters":[{"colorGroups":[{"label":"Armor","paletteIndices":[15,14,6,5,9]},{"label":"Feet","paletteIndices":[12,11,10]},{"label":"Arm/Leg Accent","paletteIndices":[13,7]},{"label":"Helmet Eye","paletteIndices":[8]},{"label":"Skin","paletteIndices":[3,4]}]},{"colorGroups":[{"label":"Armor","paletteIndices":[15,13,5,6,9]},{"label":"Wrist&Foot","paletteIndices":[11,10]},{"label":"Helm Ears","paletteIndices":[12,14]},{"label":"Helm Eyes","paletteIndices":[7]},{"label":"Eyes","paletteIndices":[8]},{"label":"Skin","paletteIndices":[3,4]}]},{"colorGroups":[{"label":"Hair","paletteIndices":[15,6,9]},{"label":"Dress","paletteIndices":[5,14]},{"label":"Fringe","paletteIndices":[12,11,10]},{"label":"Wrist/Ankle/Hairpin/Mouth","paletteIndices":[7,13]},{"label":"Eyes","paletteIndices":[8]},{"label":"Skin","paletteIndices":[3,4]}]},{"colorGroups":[{"label":"Robe","paletteIndices":[15,14]},{"label":"Cape","paletteIndices":[5,7]},{"label":"Hair","paletteIndices":[11,6,9]},{"label":"Fringe","paletteIndices":[13,12,10]},{"label":"Glasses","paletteIndices":[8]},{"label":"Skin","paletteIndices":[3,4]}]},{"colorGroups":[{"label":"Hair/Cloak/Boots/Mail","paletteIndices":[11,14,13,12,6,9]},{"label":"Scarf","paletteIndices":[5,10]},{"label":"Hat/Pants/Mouth","paletteIndices":[15,7]},{"label":"Eyes","paletteIndices":[8]},{"label":"Skin","paletteIndices":[3,4]}]},{"colorGroups":[{"label":"Cloak & Boots","paletteIndices":[14,12]},{"label":"Outfit & Headpiece ","paletteIndices":[5,13]},{"label":"Hair","paletteIndices":[6,15,10]},{"label":"Fringe/Mouth/Aim-Bow","paletteIndices":[9,7]},{"label":"Shoulders","paletteIndices":[11]},{"label":"Eyes","paletteIndices":[8]},{"label":"Skin","paletteIndices":[3,4]}]},{"colorGroups":[{"label":"Pants","paletteIndices":[6,7,12]},{"label":"Belt/Earrings","paletteIndices":[5,11,9]},{"label":"Shoes","paletteIndices":[15,13]},{"label":"Wrists","paletteIndices":[14,10]},{"label":"Eyes","paletteIndices":[8]},{"label":"Skin","paletteIndices":[3,4]}]},{"colorGroups":[{"label":"Robe","paletteIndices":[15,5]},{"label":"Cloak & Mouth","paletteIndices":[7,12]},{"label":"Hair","paletteIndices":[6,14,13]},{"label":"Shoes & Amulet","paletteIndices":[11,10,9]},{"label":"Eyes","paletteIndices":[8]},{"label":"Skin","paletteIndices":[3,4]}]},{"colorGroups":[{"label":"Robe & Mouth","paletteIndices":[5,7]},{"label":"Cloak","paletteIndices":[15,10]},{"label":"Hair","paletteIndices":[6,14,13]},{"label":"Shoes & Amulet","paletteIndices":[12,11,9]},{"label":"Eyes","paletteIndices":[8]},{"label":"Skin","paletteIndices":[3,4]}]},{"colorGroups":[{"label":"Armor & Cloak","paletteIndices":[11,5,13]},{"label":"Armor/Cloak Accent","paletteIndices":[10,7]},{"label":"Breastplate & Hair","paletteIndices":[14,15,6,12]},{"label":"Crown & Casting","paletteIndices":[9]},{"label":"Eyes","paletteIndices":[8]},{"label":"Skin","paletteIndices":[3,4]}]},{"colorGroups":[{"label":"Pants & Helmet","paletteIndices":[15,5,14]},{"label":"Boots/Gloves/Helm-Accent","paletteIndices":[6,7,9,10]},{"label":"Beard","paletteIndices":[13,12,11]},{"label":"Glasses","paletteIndices":[8]},{"label":"Skin","paletteIndices":[3,4]}]},{"colorGroups":[{"label":"Outfit & Hair","paletteIndices":[15,5,9,6,10]},{"label":"Accent & Summon-Glow","paletteIndices":[12,11]},{"label":"Hairpin & Mouth","paletteIndices":[13,7,14]},{"label":"Eyes","paletteIndices":[8]},{"label":"Skin","paletteIndices":[3,4]}]},{"colorGroups":[{"label":"Cape/Armor/Pants","paletteIndices":[14,13,11,5]},{"label":"Armor Fringe & Boots","paletteIndices":[15,10,9]},{"label":"Hair & Scarf","paletteIndices":[6,12]},{"label":"Belt Accent","paletteIndices":[7]},{"label":"Eyes","paletteIndices":[8]},{"label":"Skin","paletteIndices":[3,4]}]},{"colorGroups":[{"label":"Robe","paletteIndices":[15,14,5,9]},{"label":"Hair","paletteIndices":[10,12,6,11,13]},{"label":"Regen/Casting Glow","paletteIndices":[7]},{"label":"Eyes","paletteIndices":[8]},{"label":"Skin","paletteIndices":[3,4]}]},{"colorGroups":[]},{"colorGroups":[]}]};
				processConfigObject(initConfig);
			}
			else for(let c of data.characters) c.colorGroups = [];

			//}}}

			// Set InitData
			initData = JSON.parse(JSON.stringify(data));

			// Char Presets
			//{{{
			if(usePresets)
			{
				// Old Presets
				//{{{

				initData.characters[0].presets = [
				//{{{
				];
				//}}}

				initData.characters[1].presets = [
				//{{{
				];
				//}}}

				initData.characters[2].presets = [
				//{{{
					{"name":"Alternate","description":"Mouth was replaced with black, to avoid a potentially oddly colored mouth","delta":[[],[[32,2,0],[32,3,0],[33,2,7],[33,3,7],[38,2,0],[38,3,0],[63,4,0],[63,5,0]],[],[[32,1,0]],[],[],[],[],[],[],[],[],[],[],[],[]],"colorGroups":[{"label":"Hair","items":[{"index":6,"huedel":0,"bright":0.5053763440860215,"sat":0.6382978723404256},{"index":9,"huedel":0.13541666666666652,"bright":0.68,"sat":0.8461538461538461},{"index":15,"huedel":0,"bright":0.3010752688172043,"sat":0.3214285714285714}],"red":31,"green":0,"blue":4,"bright":0,"sat":0.28,"huebr":1.0625},{"label":"Dress","items":[{"index":14,"huedel":0,"bright":0.5053763440860215,"sat":0},{"index":5,"huedel":0.25806451612903203,"bright":0.3333333333333333,"sat":0}],"red":0,"green":16,"blue":0,"bright":0,"sat":0,"huebr":1.5161290322580645},{"label":"Fringe","items":[{"index":11,"huedel":0,"bright":0.6021505376344086,"sat":0},{"index":10,"huedel":0.09677419354838701,"bright":0.8494623655913979,"sat":0.6455696202531644},{"index":12,"huedel":-0.09370199692780323,"bright":0.3655913978494623,"sat":0}],"red":31,"green":25,"blue":0,"bright":0,"sat":0,"huebr":1.8064516129032258},{"label":"Wrist/Ankle/Hairpin/Mouth","items":[{"index":7,"huedel":0,"bright":0.6881720430107526,"sat":0.28125},{"index":13,"huedel":0.015238095238095273,"bright":0.4086021505376343,"sat":0}],"red":14,"green":0,"blue":31,"bright":-0.33,"sat":0,"huebr":1.8399999999999999},{"label":"Eyes","items":[{"index":8,"huedel":0,"bright":0.15053763440860216,"sat":0}],"red":0,"green":31,"blue":0,"bright":0,"sat":0,"huebr":1},{"label":"Skin","items":[{"index":3,"huedel":0,"bright":0.6881720430107526,"sat":0.5625},{"index":4,"huedel":-0.022556390977443552,"bright":0.5376344086021505,"sat":0.6}],"red":31,"green":15,"blue":0,"bright":0,"sat":0,"huebr":1.4736842105263157}],"palette":[{"r":0,"g":12,"b":0},{"r":0,"g":0,"b":0},{"r":31,"g":31,"b":31},{"r":31,"g":21,"b":12},{"r":24,"g":16,"b":10},{"r":0,"g":11,"b":5},{"r":30,"g":7,"b":10},{"r":14,"g":4,"b":25},{"r":0,"g":14,"b":0},{"r":31,"g":16,"b":13},{"r":31,"g":31,"b":17},{"r":31,"g":25,"b":0},{"r":21,"g":13,"b":0},{"r":8,"g":0,"b":17},{"r":0,"g":24,"b":0},{"r":21,"g":2,"b":5}]}
				];
				//}}}

				initData.characters[3].presets = [
				//{{{
				];
				//}}}

				initData.characters[4].presets = [
				//{{{
				];
				//}}}

				initData.characters[5].presets = [
				//{{{
				];
				//}}}

				initData.characters[6].presets = [
				//{{{
				];
				//}}}

				initData.characters[7].presets = [
				//{{{
				];
				//}}}

				initData.characters[8].presets = [
				//{{{
				];
				//}}}

				initData.characters[9].presets = [
				//{{{
				];
				//}}}

				initData.characters[10].presets = [
				//{{{
					{"name":"Alternate","description":"Just tweaked the colors a bit","delta":[[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[]],"colorGroups":[{"label":"Pants/Helmet","items":[{"index":5,"huedel":0,"bright":0.3333333333333333,"sat":0},{"index":14,"huedel":-0.08415147265077128,"bright":0.5053763440860215,"sat":0},{"index":15,"huedel":0.17391304347826075,"bright":0.17204301075268816,"sat":0}],"red":0,"green":11,"blue":31,"bright":-0.08,"sat":0,"huebr":1.3478260869565215},{"label":"Boots/Gloves/Hat-Accent","items":[{"index":6,"huedel":0,"bright":0.24731182795698925,"sat":0},{"index":7,"huedel":0.090311986863711,"bright":0.3978494623655913,"sat":0},{"index":9,"huedel":0.38786482334869454,"bright":0.6236559139784946,"sat":0},{"index":10,"huedel":0.32738095238095255,"bright":0.5268817204301075,"sat":0}],"red":12,"green":12,"blue":12,"bright":0,"sat":0,"huebr":1.0952380952380953},{"label":"Beard","items":[{"index":11,"huedel":0,"bright":0.38709677419354843,"sat":0},{"index":12,"huedel":-0.04576659038901587,"bright":0.3010752688172043,"sat":0},{"index":13,"huedel":-0.11594202898550732,"bright":0.21505376344086022,"sat":0}],"red":31,"green":18,"blue":0,"bright":0,"sat":0,"huebr":1.5652173913043477},{"label":"Glasses","items":[{"index":8,"huedel":0,"bright":0.6774193548387096,"sat":0.761904761904762}],"red":0,"green":0,"blue":31,"bright":0,"sat":0,"huebr":1},{"label":"Skin","items":[{"index":3,"huedel":0,"bright":0.4946236559139785,"sat":0},{"index":4,"huedel":-0.05397301349325323,"bright":0.3655913978494623,"sat":0}],"red":31,"green":18,"blue":0,"bright":0.23,"sat":0,"huebr":1.5862068965517242}],"palette":[{"r":0,"g":12,"b":0},{"r":0,"g":0,"b":0},{"r":31,"g":31,"b":31},{"r":30,"g":20,"b":7},{"r":25,"g":16,"b":7},{"r":0,"g":7,"b":21},{"r":9,"g":9,"b":9},{"r":14,"g":14,"b":14},{"r":16,"g":16,"b":31},{"r":22,"g":22,"b":22},{"r":19,"g":19,"b":19},{"r":23,"g":13,"b":0},{"r":19,"g":9,"b":0},{"r":15,"g":5,"b":0},{"r":0,"g":15,"b":28},{"r":0,"g":0,"b":15}]}
				];
				//}}}

				initData.characters[11].presets = [
				//{{{
				];
				//}}}

				initData.characters[12].presets = [
				//{{{
				];
				//}}}

				initData.characters[13].presets = [
				//{{{
				];
				//}}}

				// Ugh... have to adjust sat after making change
				for(let c of initData.characters.slice(0,14)) for(let p of c.presets)
				for(let cg of p.colorGroups) for(let c of cg.items) c.sat = 1-c.sat;

				//}}}


				// DK Cecil
				//{{{
				initData.characters[0].presets.push({"name":"Alternate","description":"Smoothed out brightness between Armor colors, remove eye color from boots and sword pommel in casting stances","delta":[[],[],[],[],[],[],[],[],[],[],[[59,3,3],[61,6,5],[62,6,4],[63,3,3]],[],[],[],[],[]],"colorGroups":[{"label":"Armor","items":[{"index":15,"huedel":0,"bright":0.22580645161290322,"sat":0.5},{"index":14,"huedel":0,"bright":0.3,"sat":0.5},{"index":6,"huedel":0,"bright":0.44086021505376344,"sat":0.5},{"index":5,"huedel":0,"bright":0.62,"sat":0.5},{"index":9,"huedel":0,"bright":0.75,"sat":0.5}],"red":15,"green":16,"blue":18,"bright":-0.58,"sat":1,"huebr":1},{"label":"Feet","items":[{"index":12,"huedel":0,"bright":0.3655913978494623,"sat":1},{"index":11,"huedel":0.06547619047619069,"bright":0.5268817204301075,"sat":1},{"index":10,"huedel":0.12596006144393224,"bright":0.6236559139784946,"sat":1}],"red":31,"green":12,"blue":0,"bright":-0.5,"sat":0,"huebr":1.619047619047619},{"label":"Arm/Leg Accent","items":[{"index":13,"huedel":0,"bright":0.22580645161290322,"sat":1},{"index":7,"huedel":0,"bright":0.3333333333333333,"sat":1}],"red":0,"green":0,"blue":24,"bright":0,"sat":0,"huebr":1},{"label":"Helmet Eye","items":[{"index":8,"huedel":0,"bright":0.6236559139784946,"sat":1}],"red":0,"green":24,"blue":21,"bright":0,"sat":0,"huebr":2},{"label":"Skin","items":[{"index":3,"huedel":0,"bright":0.6236559139784946,"sat":0.48275862068965514},{"index":4,"huedel":0.1333333333333333,"bright":0.43010752688172044,"sat":1}],"red":31,"green":10,"blue":0,"bright":0,"sat":0,"huebr":1.3333333333333333}],"palette":[{"r":0,"g":12,"b":0},{"r":0,"g":0,"b":0},{"r":31,"g":31,"b":31},{"r":31,"g":17,"b":10},{"r":25,"g":15,"b":0},{"r":12,"g":12,"b":13},{"r":8,"g":9,"b":10},{"r":0,"g":0,"b":24},{"r":0,"g":24,"b":21},{"r":14,"g":15,"b":16},{"r":18,"g":11,"b":0},{"r":16,"g":8,"b":0},{"r":12,"g":5,"b":0},{"r":0,"g":0,"b":16},{"r":6,"g":6,"b":7},{"r":4,"g":4,"b":5}]});
				//}}}

				// Kain
				//{{{
				initData.characters[1].presets.push({"name":"Alternate","description":"The white pixels in the armor are given their own palette color, as is the secondary color for the helmet eye.  Recyled palette colors came from merging the foot/write colors with the helmet ear colors","delta":[[],[],[],[],[],[],[],[[45,1,2],[46,1,6]],[],[],[[0,3,1],[0,6,4],[3,0,6],[3,2,2],[4,0,1],[5,4,6],[5,5,6],[6,4,1],[6,7,4],[9,1,6],[9,3,2],[10,4,1],[10,5,1],[12,0,1],[12,3,3],[12,4,4],[13,3,4],[13,4,3],[16,1,0],[16,2,0],[16,6,5],[17,1,7],[17,7,7],[19,4,4],[19,5,4],[21,0,1],[21,3,3],[21,4,4],[23,2,5],[24,0,1],[24,3,3],[24,4,4],[25,3,4],[25,4,3],[28,0,1],[28,3,3],[28,4,4],[29,3,4],[29,4,3],[31,2,6],[31,3,5],[31,6,1],[34,3,2],[36,2,1],[36,5,4],[37,7,6],[38,7,1],[39,1,2],[42,7,0],[43,6,7],[45,0,0],[50,7,1],[52,0,3],[52,1,3],[52,2,3],[52,3,3],[52,5,6],[52,7,3],[53,0,2],[53,1,3],[53,2,4],[53,3,5],[53,7,2],[55,0,4],[55,3,6],[57,3,1],[57,6,4],[60,0,6],[60,2,2],[61,4,1],[61,5,1]],[[0,4,2],[0,5,3],[6,5,2],[6,6,3],[17,5,4],[17,6,5],[31,4,4],[31,5,3],[36,3,2],[36,4,3],[45,0,2],[45,2,2],[46,0,4],[46,0,5],[46,1,5],[46,2,6],[55,1,2],[55,2,3],[57,4,2],[57,5,3]],[[3,6,1],[3,7,2],[4,5,0],[4,6,1],[5,6,7],[8,6,4],[8,7,5],[9,7,2],[10,5,3],[10,6,2],[10,6,4],[11,0,3],[12,3,5],[12,4,5],[13,5,4],[13,6,3],[13,6,5],[18,3,2],[18,4,2],[19,5,2],[19,6,1],[19,6,3],[20,1,4],[21,3,5],[21,4,5],[22,7,1],[22,7,2],[22,7,3],[24,3,5],[24,4,5],[25,5,4],[25,6,3],[25,6,5],[27,1,1],[27,2,1],[27,2,2],[28,3,5],[28,4,5],[29,5,4],[29,6,3],[29,6,5],[32,1,3],[32,2,2],[34,5,3],[39,5,1],[39,6,2],[40,5,0],[40,6,1],[41,5,7],[41,6,7],[46,4,0],[47,0,1],[47,0,3],[47,1,2],[47,5,6],[47,5,7],[47,6,7],[51,4,1],[51,4,3],[51,5,1],[51,5,2],[56,2,1],[56,3,3],[60,7,4],[61,5,3],[61,6,2],[61,6,4],[62,0,5]],[],[[3,5,1],[3,5,3],[3,6,2],[4,6,0],[8,7,4],[9,6,2],[9,6,4],[9,7,3],[10,6,3],[12,3,6],[13,6,4],[18,3,3],[18,4,3],[18,5,4],[19,6,2],[20,2,4],[21,3,6],[22,5,2],[22,5,3],[22,6,1],[22,6,3],[24,3,6],[25,6,4],[27,0,3],[27,1,2],[27,2,3],[28,3,6],[29,6,4],[34,4,3],[34,4,4],[39,4,1],[39,4,3],[39,5,2],[40,6,0],[47,0,2],[47,4,7],[51,4,2],[56,2,2],[60,6,4],[60,7,5],[61,6,3]],[]],"colorGroups":[{"label":"Armor","items":[{"index":15,"huedel":0,"bright":0.17204301075268816,"sat":1},{"index":13,"huedel":0,"bright":0.3010752688172043,"sat":1},{"index":5,"huedel":0,"bright":0.3870967741935483,"sat":1},{"index":6,"huedel":0,"bright":0.5161290322580645,"sat":1},{"index":9,"huedel":0,"bright":0.7204301075268816,"sat":0.6417910447761194},{"index":10,"huedel":0,"bright":0.8,"sat":0.54}],"red":31,"green":25,"blue":0,"bright":-0.19,"sat":1,"huebr":1.7999999999999998},{"label":"Helm Ears & Wrists/Boots","items":[{"index":12,"huedel":0,"bright":0.5268817204301075,"sat":1},{"index":14,"huedel":0.06048387096774199,"bright":0.6236559139784946,"sat":1}],"red":0,"green":31,"blue":8,"bright":-0.54,"sat":0,"huebr":1.75},{"label":"Helm Eyes","items":[{"index":7,"huedel":0,"bright":0.33,"sat":1},{"index":11,"huedel":-0.1,"bright":0.34,"sat":1}],"red":31,"green":0,"blue":0,"bright":-0.06,"sat":0,"huebr":1},{"label":"Eye Color","items":[{"index":8,"huedel":0,"bright":0.16129032258064516,"sat":1}],"red":0,"green":7,"blue":22,"bright":0,"sat":0,"huebr":1},{"label":"Skin","items":[{"index":3,"huedel":0,"bright":0.6774193548387096,"sat":0.38095238095238093},{"index":4,"huedel":0.11111111111111116,"bright":0.43010752688172044,"sat":0.7}],"red":31,"green":10,"blue":0,"bright":0,"sat":0,"huebr":1.3333333333333333}],"palette":[{"r":0,"g":12,"b":0},{"r":0,"g":0,"b":0},{"r":31,"g":31,"b":31},{"r":31,"g":19,"b":13},{"r":22,"g":14,"b":4},{"r":16,"g":13,"b":0},{"r":22,"g":17,"b":0},{"r":29,"g":0,"b":0},{"r":0,"g":3,"b":8},{"r":30,"g":24,"b":0},{"r":31,"g":27,"b":0},{"r":25,"g":0,"b":5},{"r":0,"g":18,"b":5},{"r":13,"g":10,"b":0},{"r":0,"g":19,"b":7},{"r":7,"g":6,"b":0}]});
				initData.characters[1].presets.push({"name":"Alternate 2","description":"","delta":[[],[],[],[],[],[],[],[[45,1,2],[46,1,6]],[],[],[[0,3,1],[0,6,4],[3,0,6],[3,2,2],[4,0,1],[5,4,6],[5,5,6],[6,4,1],[6,7,4],[9,1,6],[9,3,2],[10,4,1],[10,5,1],[12,0,1],[12,3,3],[12,4,4],[13,3,4],[13,4,3],[16,1,0],[16,2,0],[16,6,5],[17,1,7],[17,7,7],[19,4,4],[19,5,4],[21,0,1],[21,3,3],[21,4,4],[23,2,5],[24,0,1],[24,3,3],[24,4,4],[25,3,4],[25,4,3],[28,0,1],[28,3,3],[28,4,4],[29,3,4],[29,4,3],[31,2,6],[31,3,5],[31,6,1],[34,3,2],[36,2,1],[36,5,4],[37,7,6],[38,7,1],[39,1,2],[42,7,0],[43,6,7],[45,0,0],[50,7,1],[52,0,3],[52,1,3],[52,2,3],[52,3,3],[52,5,6],[52,7,3],[53,0,2],[53,1,3],[53,2,4],[53,3,5],[53,7,2],[55,0,4],[55,3,6],[57,3,1],[57,6,4],[60,0,6],[60,2,2],[61,4,1],[61,5,1]],[[0,4,2],[0,5,3],[6,5,2],[6,6,3],[17,5,4],[17,6,5],[31,4,4],[31,5,3],[36,3,2],[36,4,3],[45,0,2],[45,2,2],[46,0,4],[46,0,5],[46,1,5],[46,2,6],[55,1,2],[55,2,3],[57,4,2],[57,5,3]],[[3,6,1],[3,7,2],[4,5,0],[4,6,1],[5,6,7],[8,6,4],[8,7,5],[9,7,2],[10,5,3],[10,6,2],[10,6,4],[11,0,3],[12,3,5],[12,4,5],[13,5,4],[13,6,3],[13,6,5],[18,3,2],[18,4,2],[19,5,2],[19,6,1],[19,6,3],[20,1,4],[21,3,5],[21,4,5],[22,7,1],[22,7,2],[22,7,3],[24,3,5],[24,4,5],[25,5,4],[25,6,3],[25,6,5],[27,1,1],[27,2,1],[27,2,2],[28,3,5],[28,4,5],[29,5,4],[29,6,3],[29,6,5],[32,1,3],[32,2,2],[34,5,3],[39,5,1],[39,6,2],[40,5,0],[40,6,1],[41,5,7],[41,6,7],[46,4,0],[47,0,1],[47,0,3],[47,1,2],[47,5,6],[47,5,7],[47,6,7],[51,4,1],[51,4,3],[51,5,1],[51,5,2],[56,2,1],[56,3,3],[60,7,4],[61,5,3],[61,6,2],[61,6,4],[62,0,5]],[],[[3,5,1],[3,5,3],[3,6,2],[4,6,0],[8,7,4],[9,6,2],[9,6,4],[9,7,3],[10,6,3],[12,3,6],[13,6,4],[18,3,3],[18,4,3],[18,5,4],[19,6,2],[20,2,4],[21,3,6],[22,5,2],[22,5,3],[22,6,1],[22,6,3],[24,3,6],[25,6,4],[27,0,3],[27,1,2],[27,2,3],[28,3,6],[29,6,4],[34,4,3],[34,4,4],[39,4,1],[39,4,3],[39,5,2],[40,6,0],[47,0,2],[47,4,7],[51,4,2],[56,2,2],[60,6,4],[60,7,5],[61,6,3]],[]],"colorGroups":[{"label":"Armor","items":[{"index":15,"huedel":0,"bright":0.17204301075268816,"sat":1},{"index":13,"huedel":0,"bright":0.3010752688172043,"sat":1},{"index":5,"huedel":0,"bright":0.3870967741935483,"sat":1},{"index":6,"huedel":0,"bright":0.5161290322580645,"sat":1},{"index":9,"huedel":0,"bright":0.7204301075268816,"sat":0.6417910447761194},{"index":10,"huedel":0,"bright":0.8,"sat":0.54}],"red":16,"green":16,"blue":11,"bright":0,"sat":1,"huebr":1.7999999999999998},{"label":"Helm Ears & Wrists/Boots","items":[{"index":12,"huedel":-0.04,"bright":0.5268817204301075,"sat":1},{"index":14,"huedel":0.03,"bright":0.6236559139784946,"sat":1}],"red":29,"green":0,"blue":0,"bright":-0.37,"sat":1,"huebr":1.75},{"label":"Helm Eyes","items":[{"index":7,"huedel":0,"bright":0.5,"sat":1},{"index":11,"huedel":-0.09,"bright":0.43,"sat":1}],"red":0,"green":14,"blue":0,"bright":0,"sat":0,"huebr":1},{"label":"Eye Color","items":[{"index":8,"huedel":0,"bright":0.16129032258064516,"sat":1}],"red":22,"green":0,"blue":0,"bright":0,"sat":0,"huebr":1},{"label":"Skin","items":[{"index":3,"huedel":0,"bright":0.6774193548387096,"sat":0.38095238095238093},{"index":4,"huedel":0.11111111111111116,"bright":0.43010752688172044,"sat":0.7}],"red":31,"green":10,"blue":0,"bright":0,"sat":0,"huebr":1.3333333333333333}],"palette":[{"r":0,"g":12,"b":0},{"r":0,"g":0,"b":0},{"r":31,"g":31,"b":31},{"r":31,"g":19,"b":13},{"r":22,"g":14,"b":4},{"r":16,"g":16,"b":13},{"r":21,"g":21,"b":17},{"r":0,"g":21,"b":0},{"r":11,"g":0,"b":0},{"r":29,"g":29,"b":24},{"r":31,"g":31,"b":26},{"r":3,"g":15,"b":0},{"r":27,"g":0,"b":2},{"r":12,"g":12,"b":10},{"r":31,"g":1,"b":0},{"r":7,"g":7,"b":6}]});
				//}}}

				// Tellah
				//{{{
				initData.characters[3].presets.push({"name":"Dark Hair","description":"Replaced darkest hair palette color with black, recycled it into the hair's white spots.","delta":[[],[[2,3,0],[2,3,1],[2,4,2],[3,2,6],[3,4,7],[17,7,6],[18,0,0],[18,0,1],[18,1,2],[19,1,7],[20,3,0],[20,3,1],[20,4,2],[22,3,0],[22,3,1],[22,4,2],[27,2,6],[27,4,7],[33,3,5],[33,4,6],[33,4,7],[38,4,2],[39,2,6],[39,4,7],[53,6,7],[59,3,0],[59,3,1],[60,2,6]],[],[],[],[],[[47,5,2],[47,6,1],[47,6,2]],[],[],[],[],[[0,2,0],[0,2,1],[0,2,2],[0,3,3],[1,2,2],[1,2,6],[1,2,7],[1,3,3],[1,3,5],[1,4,4],[2,1,1],[2,2,2],[2,3,3],[2,5,1],[3,2,7],[3,3,6],[6,3,0],[6,3,1],[6,3,2],[6,4,3],[7,3,2],[7,3,6],[7,3,7],[7,4,3],[7,4,5],[7,5,4],[8,2,1],[8,3,2],[8,4,3],[14,7,0],[14,7,1],[14,7,6],[15,7,1],[15,7,7],[16,0,0],[16,0,1],[16,0,2],[16,0,3],[16,0,5],[16,1,3],[16,1,4],[16,6,1],[16,7,2],[17,0,2],[17,0,6],[17,0,7],[17,1,3],[17,1,5],[17,2,4],[17,7,7],[18,0,3],[18,2,1],[19,0,6],[20,1,1],[20,2,2],[20,3,3],[20,5,1],[22,1,1],[22,2,2],[22,3,3],[23,2,7],[26,2,2],[26,2,6],[26,2,7],[26,3,3],[26,3,5],[26,4,4],[27,2,7],[27,3,6],[30,3,0],[30,4,1],[30,4,2],[30,5,2],[30,6,6],[30,7,5],[31,1,3],[31,2,3],[31,3,4],[31,3,7],[31,4,1],[31,4,5],[31,5,2],[31,6,3],[32,1,5],[32,4,0],[33,3,7],[33,4,5],[33,6,7],[34,2,3],[36,2,0],[36,2,1],[36,2,2],[36,3,3],[37,2,2],[37,2,6],[37,2,7],[37,3,5],[38,1,1],[38,2,2],[38,3,3],[38,5,1],[39,2,7],[39,3,6],[42,4,2],[42,4,6],[42,5,1],[42,5,5],[45,0,1],[45,0,2],[45,0,3],[45,0,4],[45,1,3],[45,1,4],[45,1,5],[45,2,5],[45,3,5],[49,4,0],[49,4,1],[49,4,6],[49,5,0],[49,5,1],[49,5,2],[49,5,3],[49,5,5],[49,6,3],[49,6,4],[50,4,1],[50,4,7],[50,5,2],[50,5,6],[50,5,7],[50,6,3],[50,6,5],[50,7,4],[52,3,1],[52,7,1],[53,4,7],[53,5,6],[57,2,0],[57,2,1],[57,2,2],[57,3,3],[58,2,2],[58,2,6],[58,2,7],[58,3,3],[58,3,5],[58,4,4],[59,1,1],[59,2,2],[59,3,3],[60,2,7],[60,3,6],[63,1,1],[63,2,2],[63,3,3]],[],[],[],[]],"colorGroups":[{"label":"Robe","items":[{"index":14,"huedel":0,"bright":0.43010752688172044,"sat":1},{"index":15,"huedel":-0.04603580562659815,"bright":0.3010752688172043,"sat":1}],"red":23,"green":0,"blue":31,"bright":0,"sat":0,"huebr":1.7391304347826084},{"label":"Cape","items":[{"index":7,"huedel":0,"bright":0.7741935483870969,"sat":0.5833333333333334},{"index":5,"huedel":0.18518518518518512,"bright":0.4731182795698925,"sat":1}],"red":31,"green":0,"blue":31,"bright":0,"sat":0,"huebr":2},{"label":"Fringe","items":[{"index":13,"huedel":0,"bright":0.3655913978494623,"sat":1},{"index":12,"huedel":0.06547619047619069,"bright":0.5268817204301075,"sat":1},{"index":10,"huedel":0.12596006144393224,"bright":0.6236559139784946,"sat":1}],"red":31,"green":19,"blue":0,"bright":0,"sat":0,"huebr":1.619047619047619},{"label":"Glasses","items":[{"index":8,"huedel":0,"bright":0.5913978494623656,"sat":1}],"red":0,"green":24,"blue":31,"bright":0,"sat":0,"huebr":1.774193548387097},{"label":"Hair","items":[{"index":6,"huedel":0,"bright":0.6774193548387096,"sat":0.23809523809523803},{"index":9,"huedel":0,"bright":0.8279569892473119,"sat":0.10389610389610393},{"index":11,"huedel":0,"bright":1,"sat":0}],"red":10,"green":10,"blue":12,"bright":-0.5,"sat":0.5,"huebr":1},{"label":"Skin","items":[{"index":3,"huedel":0,"bright":0.7311827956989246,"sat":0.38235294117647056},{"index":4,"huedel":0,"bright":0.5376344086021505,"sat":0.52}],"red":31,"green":16,"blue":0,"bright":0,"sat":0,"huebr":1.5294117647058822}],"palette":[{"r":0,"g":12,"b":0},{"r":0,"g":0,"b":0},{"r":31,"g":31,"b":31},{"r":31,"g":23,"b":14},{"r":25,"g":17,"b":8},{"r":27,"g":0,"b":17},{"r":10,"g":10,"b":12},{"r":31,"g":10,"b":31},{"r":0,"g":24,"b":31},{"r":13,"g":13,"b":14},{"r":31,"g":27,"b":0},{"r":15,"g":15,"b":17},{"r":28,"g":21,"b":0},{"r":21,"g":13,"b":0},{"r":17,"g":0,"b":23},{"r":11,"g":0,"b":17}]});
				initData.characters[3].presets.push({"name":"Alternate","description":"","delta":[[],[[2,3,0],[2,3,1],[2,4,2],[3,2,6],[3,4,7],[17,7,6],[18,0,0],[18,0,1],[18,1,2],[19,1,7],[20,3,0],[20,3,1],[20,4,2],[22,3,0],[22,3,1],[22,4,2],[27,2,6],[27,4,7],[33,3,5],[33,4,6],[33,4,7],[38,4,2],[39,2,6],[39,4,7],[53,6,7],[59,3,0],[59,3,1],[60,2,6]],[],[],[],[],[[47,5,2],[47,6,1],[47,6,2]],[],[],[],[[63,5,2],[63,6,1],[63,6,3],[63,7,2]],[[0,2,0],[0,2,1],[0,2,2],[0,3,3],[1,2,2],[1,2,6],[1,2,7],[1,3,3],[1,3,5],[1,4,4],[2,1,1],[2,2,2],[2,3,3],[2,5,1],[3,2,7],[3,3,6],[6,3,0],[6,3,1],[6,3,2],[6,4,3],[7,3,2],[7,3,6],[7,3,7],[7,4,3],[7,4,5],[7,5,4],[8,2,1],[8,3,2],[8,4,3],[14,7,0],[14,7,1],[14,7,6],[15,7,1],[15,7,7],[16,0,0],[16,0,1],[16,0,2],[16,0,3],[16,0,5],[16,1,3],[16,1,4],[16,6,1],[16,7,2],[17,0,2],[17,0,6],[17,0,7],[17,1,3],[17,1,5],[17,2,4],[17,7,7],[18,0,3],[18,2,1],[19,0,6],[20,1,1],[20,2,2],[20,3,3],[20,5,1],[22,1,1],[22,2,2],[22,3,3],[23,2,7],[26,2,2],[26,2,6],[26,2,7],[26,3,3],[26,3,5],[26,4,4],[27,2,7],[27,3,6],[30,3,0],[30,4,1],[30,4,2],[30,5,2],[30,6,6],[30,7,5],[31,1,3],[31,2,3],[31,3,4],[31,3,7],[31,4,1],[31,4,5],[31,5,2],[31,6,3],[32,1,5],[32,4,0],[33,3,7],[33,4,5],[33,6,7],[34,2,3],[36,2,0],[36,2,1],[36,2,2],[36,3,3],[37,2,2],[37,2,6],[37,2,7],[37,3,5],[38,1,1],[38,2,2],[38,3,3],[38,5,1],[39,2,7],[39,3,6],[42,4,2],[42,4,6],[42,5,1],[42,5,5],[45,0,1],[45,0,2],[45,0,3],[45,0,4],[45,1,3],[45,1,4],[45,1,5],[45,2,5],[45,3,5],[49,4,0],[49,4,1],[49,4,6],[49,5,0],[49,5,1],[49,5,2],[49,5,3],[49,5,5],[49,6,3],[49,6,4],[50,4,1],[50,4,7],[50,5,2],[50,5,6],[50,5,7],[50,6,3],[50,6,5],[50,7,4],[52,3,1],[52,7,1],[53,4,7],[53,5,6],[57,2,0],[57,2,1],[57,2,2],[57,3,3],[58,2,2],[58,2,6],[58,2,7],[58,3,3],[58,3,5],[58,4,4],[59,1,1],[59,2,2],[59,3,3],[60,2,7],[60,3,6],[63,1,1],[63,2,2],[63,3,3]],[[63,5,1],[63,5,3],[63,6,0],[63,6,4],[63,7,1],[63,7,3]],[],[],[]],"colorGroups":[{"label":"Robe","items":[{"index":14,"huedel":0,"bright":0.43010752688172044,"sat":1},{"index":15,"huedel":-0.04603580562659815,"bright":0.06,"sat":1}],"red":0,"green":0,"blue":0,"bright":0.14,"sat":-0.36,"huebr":1.7391304347826084},{"label":"Cape","items":[{"index":7,"huedel":0,"bright":0.7741935483870969,"sat":0.5833333333333334},{"index":5,"huedel":0,"bright":0.62,"sat":1}],"red":24,"green":0,"blue":0,"bright":-0.5,"sat":1,"huebr":2},{"label":"Fringe","items":[{"index":13,"huedel":0,"bright":0.3655913978494623,"sat":1},{"index":12,"huedel":0.06547619047619069,"bright":0.5268817204301075,"sat":1},{"index":10,"huedel":0.12596006144393224,"bright":0.6236559139784946,"sat":1}],"red":31,"green":19,"blue":0,"bright":0,"sat":0,"huebr":1.619047619047619},{"label":"Glasses","items":[{"index":8,"huedel":0,"bright":0.5913978494623656,"sat":1}],"red":0,"green":18,"blue":31,"bright":0.69,"sat":0,"huebr":1.774193548387097},{"label":"Hair","items":[{"index":6,"huedel":0,"bright":0.6774193548387096,"sat":0.23809523809523803},{"index":9,"huedel":0,"bright":0.8279569892473119,"sat":0.10389610389610393},{"index":11,"huedel":0,"bright":1,"sat":0}],"red":31,"green":16,"blue":0,"bright":-0.56,"sat":0.5,"huebr":1},{"label":"Skin","items":[{"index":3,"huedel":0,"bright":0.7311827956989246,"sat":0.38235294117647056},{"index":4,"huedel":0,"bright":0.5376344086021505,"sat":0.52}],"red":31,"green":16,"blue":0,"bright":0,"sat":0,"huebr":1.5294117647058822}],"palette":[{"r":0,"g":12,"b":0},{"r":0,"g":0,"b":0},{"r":31,"g":31,"b":31},{"r":31,"g":23,"b":14},{"r":25,"g":17,"b":8},{"r":22,"g":0,"b":0},{"r":15,"g":9,"b":4},{"r":28,"g":0,"b":0},{"r":21,"g":28,"b":31},{"r":17,"g":11,"b":5},{"r":31,"g":27,"b":0},{"r":20,"g":14,"b":7},{"r":28,"g":21,"b":0},{"r":21,"g":13,"b":0},{"r":8,"g":8,"b":8},{"r":5,"g":5,"b":5}]});
				//}}}

				// Edward
				//{{{
				initData.characters[4].presets.push({"name":"Alternate","description":"Combined scarf and eyes into hat/pants, seperated hair from cloak/mail/boots","delta":[[],[],[],[],[],[[3,4,4],[3,5,3],[3,6,3],[3,7,3],[4,0,1],[4,1,2],[4,1,5],[4,2,5],[4,3,5],[4,4,5],[4,5,0],[4,5,5],[4,6,1],[4,6,5],[5,0,3],[5,1,2],[5,1,3],[5,2,2],[5,2,3],[5,3,3],[5,3,5],[5,4,3],[5,5,3],[9,3,4],[9,3,5],[9,4,3],[9,4,6],[9,5,2],[9,5,5],[9,6,2],[9,6,4],[9,7,1],[9,7,2],[9,7,3],[10,1,0],[10,1,4],[10,2,4],[10,3,5],[10,4,5],[11,0,1],[11,0,2],[11,0,3],[11,1,1],[11,1,2],[11,1,3],[11,2,1],[11,2,2],[11,3,2],[11,4,2],[11,5,6],[11,6,7],[12,0,1],[12,1,2],[12,3,3],[12,4,1],[12,4,4],[13,0,2],[13,1,1],[13,1,2],[13,2,1],[13,2,3],[13,3,0],[13,4,4],[13,5,3],[13,6,4],[18,1,3],[18,1,4],[18,2,4],[18,2,5],[18,3,5],[18,4,1],[18,4,6],[18,5,7],[19,3,2],[20,6,5],[20,7,5],[21,0,1],[21,0,4],[21,1,2],[21,3,3],[21,4,1],[21,4,4],[23,3,4],[23,4,3],[23,4,5],[23,4,6],[23,5,3],[23,5,4],[23,6,2],[23,6,3],[23,7,2],[23,7,3],[24,3,3],[24,4,1],[24,4,4],[25,0,2],[25,1,2],[25,2,1],[25,4,4],[25,5,3],[25,6,4],[27,0,3],[27,1,1],[27,1,3],[27,2,2],[27,4,1],[27,5,1],[27,6,1],[27,7,1],[28,0,1],[28,1,2],[28,3,3],[28,4,1],[28,4,4],[29,0,1],[29,2,3],[29,4,4],[29,5,3],[29,6,4],[32,5,6],[32,6,6],[33,2,3],[33,3,2],[33,3,4],[33,4,1],[33,4,3],[33,5,1],[33,5,2],[33,6,2],[33,6,4],[34,1,1],[34,1,3],[34,2,4],[35,1,5],[35,2,4],[35,3,3],[38,4,6],[38,5,6],[38,6,6],[38,7,1],[38,7,6],[39,4,1],[39,5,1],[40,0,2],[40,4,0],[40,5,0],[40,6,1],[41,0,5],[41,2,1],[41,2,5],[41,3,1],[44,7,3],[46,0,1],[46,1,0],[46,2,0],[46,5,0],[47,0,3],[47,0,7],[47,1,3],[47,1,6],[47,2,3],[47,2,5],[47,2,6],[47,2,7],[47,3,5],[47,3,6],[47,4,5],[53,7,1],[55,0,2],[55,0,5],[55,1,2],[55,1,3],[55,1,5],[55,2,2],[55,2,4],[55,2,6],[55,3,0],[55,3,2],[55,3,3],[55,3,6],[55,4,0],[55,4,1],[55,4,3],[55,4,4],[55,4,5],[55,4,6],[55,5,0],[55,5,1],[55,5,6],[55,6,0],[55,6,1],[56,0,1],[56,0,3],[56,1,2],[56,1,6],[56,2,6],[56,2,7],[56,3,7],[56,4,3],[56,4,7],[59,4,4],[60,5,2],[60,5,4],[60,6,3],[61,0,0],[61,1,1],[61,2,5],[61,3,5],[61,4,5],[61,6,0],[62,0,1],[62,1,1],[62,2,1],[62,3,1],[62,3,4],[62,5,7],[63,4,4]],[],[[2,3,4],[3,3,5],[4,4,0],[5,3,7],[9,6,7],[11,4,6],[12,2,3],[13,3,4],[18,3,2],[21,2,3],[23,3,7],[24,2,3],[25,3,4],[28,2,3],[29,3,4],[33,5,5],[34,0,3],[35,1,6],[39,4,4],[40,3,0],[41,2,7],[46,4,1],[47,3,3],[59,3,3],[62,3,6],[62,4,7],[63,3,3]],[[0,1,0],[1,1,6],[1,1,7],[1,2,6],[1,2,7],[2,4,0],[2,4,3],[2,5,1],[2,5,2],[3,3,7],[4,1,0],[4,2,0],[4,3,0],[6,2,0],[7,2,6],[7,2,7],[7,3,6],[7,3,7],[11,1,6],[11,2,6],[11,2,7],[12,2,0],[13,1,6],[13,1,7],[13,2,5],[13,2,6],[15,6,4],[15,6,5],[15,7,5],[15,7,6],[17,0,5],[17,0,6],[17,1,5],[19,1,4],[19,2,5],[19,2,6],[19,2,7],[20,0,5],[20,1,5],[20,1,6],[20,2,6],[20,4,0],[20,4,3],[20,5,1],[20,5,2],[21,2,0],[23,6,6],[23,6,7],[24,2,0],[25,1,6],[25,1,7],[25,2,5],[25,2,6],[26,1,6],[26,1,7],[26,2,6],[26,2,7],[27,3,4],[27,3,7],[27,4,4],[27,4,5],[28,2,0],[29,1,6],[29,1,7],[29,2,5],[29,2,6],[31,0,5],[31,0,6],[31,0,7],[31,1,5],[31,1,6],[35,0,7],[36,0,0],[36,7,6],[37,0,6],[37,0,7],[37,1,6],[37,1,7],[38,0,5],[38,3,0],[38,3,3],[38,4,1],[38,4,2],[39,3,5],[40,0,0],[40,1,0],[40,2,0],[45,3,4],[45,4,3],[45,4,4],[45,5,1],[45,5,2],[45,5,3],[45,6,2],[45,6,3],[47,4,2],[49,6,0],[49,6,1],[49,7,1],[49,7,2],[50,6,7],[56,1,4],[56,2,3],[56,2,4],[56,3,2],[58,1,4],[58,1,5],[58,2,4],[59,4,2],[59,5,0],[59,5,1],[60,4,6],[60,5,7],[62,1,7],[62,2,7],[62,3,7],[63,4,2],[63,5,0],[63,5,1]],[],[[1,1,2],[1,1,3],[1,2,4],[1,3,4],[4,0,2],[4,4,1],[5,3,6],[5,5,6],[5,6,6],[7,2,2],[7,2,3],[7,3,4],[7,4,4],[8,5,0],[9,4,4],[9,4,5],[9,5,3],[9,5,4],[9,5,7],[9,6,3],[9,6,6],[9,7,7],[11,3,4],[11,3,5],[11,4,7],[11,5,4],[11,6,4],[12,0,2],[12,2,4],[12,3,2],[12,6,3],[13,4,1],[13,4,5],[15,6,1],[15,6,2],[15,7,2],[15,7,3],[17,0,3],[18,3,1],[19,3,3],[21,0,2],[21,2,4],[21,3,2],[21,6,3],[22,5,1],[22,5,2],[22,6,1],[22,7,2],[22,7,3],[23,3,5],[23,4,4],[24,2,4],[24,3,2],[24,6,3],[25,4,1],[25,4,5],[26,1,2],[26,1,3],[26,2,4],[26,3,4],[27,1,2],[28,0,2],[28,2,4],[28,3,2],[28,6,3],[29,4,1],[29,4,5],[31,0,1],[31,0,2],[31,1,3],[31,2,3],[32,7,2],[33,3,3],[33,4,2],[33,5,4],[33,6,5],[34,2,1],[35,0,5],[35,1,3],[35,2,6],[37,0,2],[37,0,3],[37,1,4],[37,2,4],[38,7,2],[39,4,3],[39,5,4],[39,7,6],[40,3,1],[41,2,6],[41,4,6],[41,5,6],[44,7,5],[45,0,3],[45,1,3],[45,2,3],[45,3,2],[46,0,0],[46,1,2],[46,4,2],[46,5,1],[47,0,5],[47,1,7],[47,2,2],[49,4,2],[49,4,3],[49,5,1],[55,2,3],[55,2,5],[55,3,4],[55,3,5],[56,0,2],[56,4,2],[58,1,2],[58,2,3],[58,3,3],[60,5,3],[61,0,1],[61,4,0],[62,0,5],[62,1,4],[62,3,5],[62,5,5],[62,6,5]],[],[],[[1,1,1],[1,2,2],[1,2,3],[7,2,1],[7,3,2],[7,3,3],[15,7,1],[17,0,2],[17,1,3],[26,1,1],[26,2,2],[26,2,3],[31,0,0],[31,1,1],[31,1,2],[37,0,1],[37,1,2],[37,1,3],[45,1,2],[45,2,2],[45,3,1],[49,4,4],[49,5,2],[49,5,3],[58,1,1],[58,2,2]],[],[[2,5,0],[2,5,3],[2,6,1],[2,6,2],[3,4,7],[18,2,0],[19,1,3],[19,2,4],[19,3,5],[19,3,6],[19,3,7],[20,2,5],[20,3,4],[20,3,5],[20,5,0],[20,5,3],[20,6,1],[20,6,2],[22,7,0],[23,5,7],[23,6,5],[23,7,6],[23,7,7],[27,2,4],[27,3,3],[27,3,5],[27,4,3],[27,4,7],[27,5,4],[36,6,6],[36,7,5],[38,1,5],[38,2,4],[38,4,0],[38,4,3],[38,5,1],[38,5,2],[39,2,5],[39,2,7],[39,3,6],[39,4,6],[47,6,6],[47,6,7],[59,5,2],[59,6,0],[59,6,1],[60,3,5],[60,4,5],[60,5,6],[60,6,7],[63,5,2],[63,6,0],[63,6,1]]],"colorGroups":[{"label":"Cloak/Mail/Boots","items":[{"index":14,"huedel":0,"bright":0.21505376344086022,"sat":1},{"index":13,"huedel":0.1,"bright":0.3655913978494623,"sat":1},{"index":7,"huedel":0.23,"bright":0.5,"sat":1},{"index":5,"huedel":0.15,"bright":0.52,"sat":1},{"index":10,"huedel":0.2,"bright":0.62,"sat":1}],"red":31,"green":22,"blue":13,"bright":-0.22,"sat":0.36,"huebr":1.3333333333333333},{"label":"Hat/Pants/Scarf/Eyes","items":[{"index":15,"huedel":0,"bright":0.26881720430107525,"sat":1},{"index":8,"huedel":0,"bright":0.4,"sat":1}],"red":0,"green":8,"blue":31,"bright":-0.27,"sat":0,"huebr":1.5161290322580645},{"label":"Hair","items":[{"index":12,"huedel":0,"bright":0.5268817204301075,"sat":1},{"index":6,"huedel":0,"bright":0.6236559139784946,"sat":1},{"index":9,"huedel":0,"bright":0.8279569892473119,"sat":0.4155844155844156}],"red":31,"green":27,"blue":0,"bright":0,"sat":0,"huebr":1.870967741935484},{"label":"Cape Lining","items":[{"index":11,"huedel":0,"bright":0.33,"sat":1}],"red":24,"green":0,"blue":4,"bright":0,"sat":1,"huebr":1.291666666666667},{"label":"Skin","items":[{"index":3,"huedel":0,"bright":0.7096774193548386,"sat":0.36363636363636354},{"index":4,"huedel":0,"bright":0.5161290322580645,"sat":0.5}],"red":31,"green":13,"blue":0,"bright":0,"sat":0,"huebr":1.4117647058823528}],"palette":[{"r":0,"g":12,"b":0},{"r":0,"g":0,"b":0},{"r":31,"g":31,"b":31},{"r":31,"g":21,"b":14},{"r":25,"g":15,"b":8},{"r":28,"g":26,"b":16},{"r":31,"g":27,"b":0},{"r":26,"g":26,"b":15},{"r":0,"g":6,"b":22},{"r":31,"g":30,"b":15},{"r":31,"g":31,"b":19},{"r":20,"g":0,"b":3},{"r":26,"g":23,"b":0},{"r":20,"g":17,"b":11},{"r":13,"g":10,"b":7},{"r":0,"g":4,"b":15}]});
				//}}}

				// Rosa
				//{{{
				initData.characters[5].presets.push({"name":"Cloak","description":"Replaced all the white in her cloak and boots with palette color (repurposed the shoulderpad color, and combined shoulderpads with fringe)","delta":[[],[],[],[],[],[],[],[[2,3,6],[3,3,6],[9,4,5],[9,6,3],[22,3,0],[22,3,6],[32,3,4],[39,2,6],[46,1,3],[53,3,7],[59,3,6],[60,3,6],[63,3,6]],[],[[2,2,6],[2,3,5],[3,2,4],[3,2,6],[3,2,7],[3,3,5],[3,3,7],[8,3,5],[8,7,6],[9,3,3],[9,3,5],[9,3,6],[9,4,4],[9,4,6],[18,0,4],[18,1,2],[18,1,3],[19,0,1],[19,0,3],[19,1,2],[19,1,3],[19,1,4],[22,2,0],[22,2,6],[22,3,1],[22,3,5],[23,2,5],[23,2,7],[23,3,6],[23,3,7],[27,2,6],[27,2,7],[27,3,7],[32,2,6],[32,3,3],[32,3,5],[32,4,4],[33,2,1],[33,3,2],[39,1,4],[39,1,6],[39,1,7],[39,2,5],[39,2,7],[46,1,2],[46,1,5],[46,2,3],[46,2,4],[52,3,0],[53,3,5],[53,4,6],[53,4,7],[59,2,6],[59,3,5],[60,2,4],[60,2,6],[60,2,7],[60,3,5],[60,3,7],[63,2,6],[63,3,5]],[],[[3,5,5],[3,6,4],[3,7,4],[4,1,5],[4,2,5],[4,3,5],[4,4,1],[4,4,5],[4,5,1],[4,5,5],[4,6,2],[5,0,4],[5,1,3],[5,1,4],[5,2,3],[5,2,4],[5,3,3],[5,3,4],[5,4,2],[5,4,4],[5,5,2],[5,5,4],[9,7,2],[10,0,0],[10,4,2],[10,5,2],[10,6,3],[11,0,2],[11,1,2],[11,2,1],[11,2,2],[11,3,1],[11,3,2],[11,4,1],[11,4,2],[11,5,1],[11,5,2],[12,1,5],[12,2,5],[12,4,4],[12,5,5],[13,0,3],[13,4,5],[13,5,4],[13,6,5],[19,5,4],[19,5,5],[21,4,4],[21,5,5],[22,7,3],[23,5,5],[23,6,4],[23,7,4],[24,1,5],[24,2,5],[24,4,4],[24,5,5],[25,0,3],[25,4,5],[25,5,4],[25,6,5],[27,1,3],[27,6,4],[27,7,4],[32,6,4],[32,7,0],[32,7,5],[33,5,3],[34,0,5],[34,1,6],[34,5,4],[34,6,5],[38,2,6],[38,3,6],[38,4,6],[38,5,6],[38,6,6],[38,7,6],[39,6,4],[40,0,6],[40,1,6],[40,2,6],[40,4,1],[40,5,1],[40,6,1],[40,6,2],[41,1,3],[41,1,4],[41,2,3],[41,3,2],[45,5,2],[45,5,3],[45,5,4],[45,5,5],[52,5,4],[52,7,4],[53,5,5],[53,6,4],[53,6,5],[53,7,3],[53,7,4],[55,0,4],[55,1,4],[55,4,2],[55,5,2],[55,6,3],[56,0,3],[56,0,4],[56,1,2],[56,1,3],[56,2,2],[56,2,3],[56,3,2],[56,4,1],[56,4,2],[56,5,1],[56,5,2],[60,6,6],[61,1,5],[61,2,5],[61,3,5],[61,4,1],[61,4,5],[61,5,1],[61,5,5],[61,6,2],[62,0,4],[62,1,3],[62,1,4],[62,2,3],[62,2,4],[62,3,3],[62,3,4],[62,4,2],[62,4,4],[62,5,2],[62,5,4]],[],[[1,2,6],[7,3,5],[15,7,6],[17,0,4],[26,2,6],[31,1,7],[31,3,4],[37,1,6],[44,6,2],[47,0,0],[47,1,0],[50,3,6],[58,2,6]],[],[]],"colorGroups":[{"label":"Cloak & Boots","items":[{"index":14,"huedel":0,"bright":0.4,"sat":0.43},{"index":12,"huedel":0,"bright":0.62,"sat":0.12},{"index":11,"huedel":0,"bright":0.96,"sat":0}],"red":31,"green":0,"blue":31,"bright":-0.1,"sat":0.1,"huebr":2},{"label":"Outfit & Headpiece ","items":[{"index":5,"huedel":0,"bright":0.25806451612903225,"sat":0.5},{"index":13,"huedel":0,"bright":0.5591397849462366,"sat":0.1346153846153847}],"red":0,"green":31,"blue":16,"bright":-0.12,"sat":0.3,"huebr":1},{"label":"Fringe/Mouth/Aim-Bow","items":[{"index":7,"huedel":0,"bright":0.67,"sat":0.5},{"index":9,"huedel":0,"bright":0.5,"sat":0.625}],"red":31,"green":27,"blue":0,"bright":0,"sat":1,"huebr":1.1904761904761907},{"label":"Hair","items":[{"index":6,"huedel":0,"bright":0.3118279569892473,"sat":0.6896551724137931},{"index":10,"huedel":0,"bright":0.5698924731182795,"sat":0.37735849056603765},{"index":15,"huedel":0,"bright":0.4408602150537635,"sat":0.4878048780487806}],"red":31,"green":21,"blue":0,"bright":0,"sat":0,"huebr":1.6666666666666665},{"label":"Eyes","items":[{"index":8,"huedel":0,"bright":0.22580645161290322,"sat":1}],"red":0,"green":0,"blue":31,"bright":0,"sat":0,"huebr":1},{"label":"Skin","items":[{"index":3,"huedel":0,"bright":0.6881720430107526,"sat":0.4375},{"index":4,"huedel":-0.0035087719298245723,"bright":0.4946236559139785,"sat":0.4782608695652174}],"red":31,"green":15,"blue":0,"bright":0,"sat":0,"huebr":1.4736842105263157}],"palette":[{"r":0,"g":12,"b":0},{"r":0,"g":0,"b":0},{"r":31,"g":31,"b":31},{"r":31,"g":21,"b":12},{"r":23,"g":15,"b":8},{"r":2,"g":12,"b":7},{"r":15,"g":11,"b":3},{"r":31,"g":29,"b":0},{"r":0,"g":0,"b":21},{"r":25,"g":22,"b":0},{"r":23,"g":19,"b":11},{"r":28,"g":24,"b":28},{"r":19,"g":14,"b":19},{"r":9,"g":21,"b":15},{"r":14,"g":6,"b":14},{"r":19,"g":15,"b":7}]});
				initData.characters[5].presets.push({"name":"Armored","description":"Replaced skin with outfit color and outfit with fringe/shoulder color","delta":[[],[[32,4,0],[33,4,7]],[],[[32,3,0]],[],[[2,7,1],[2,7,3],[4,0,0],[4,1,1],[4,2,1],[5,1,7],[5,2,7],[9,6,5],[9,7,6],[10,2,1],[11,1,6],[11,2,6],[11,3,7],[12,1,0],[12,3,1],[13,1,6],[18,2,0],[18,2,3],[18,5,1],[18,5,4],[18,6,0],[18,6,2],[18,6,3],[19,2,7],[19,6,7],[20,3,6],[20,4,5],[20,7,1],[20,7,3],[21,3,1],[22,6,0],[22,7,1],[23,5,7],[24,1,0],[24,3,1],[25,1,6],[27,3,3],[27,4,4],[27,5,5],[28,0,2],[28,1,0],[29,0,5],[29,0,6],[29,2,7],[32,4,2],[32,5,1],[34,1,0],[34,2,0],[34,3,1],[35,1,4],[35,2,4],[35,3,5],[38,6,1],[38,6,3],[38,7,0],[40,0,1],[40,1,1],[40,2,1],[41,0,7],[41,1,7],[45,6,0],[45,6,1],[46,3,4],[46,3,7],[46,5,5],[46,6,4],[46,6,7],[52,5,0],[52,5,1],[52,5,2],[52,7,1],[53,7,7],[55,1,0],[55,2,1],[56,1,6],[56,2,6],[56,3,7],[61,1,1],[61,2,1],[62,1,7],[62,2,7]],[],[[2,3,6],[2,5,1],[2,6,2],[2,6,3],[3,3,6],[9,4,5],[9,6,3],[12,0,1],[19,2,6],[20,5,1],[20,6,1],[20,6,2],[20,6,3],[21,0,1],[22,3,0],[22,3,6],[32,3,4],[38,4,1],[38,5,2],[38,5,3],[39,2,6],[46,1,3],[53,3,7],[59,3,6],[60,3,6],[63,3,6]],[],[[2,2,6],[2,3,5],[2,4,1],[2,5,0],[2,5,2],[2,5,4],[2,6,1],[2,6,4],[3,2,4],[3,2,6],[3,2,7],[3,3,5],[3,3,7],[4,0,1],[4,0,2],[4,1,2],[8,3,5],[8,5,0],[8,6,1],[8,7,6],[9,3,3],[9,3,5],[9,3,6],[9,4,4],[9,4,6],[12,0,0],[12,0,2],[12,1,1],[12,1,2],[12,2,1],[13,0,6],[13,0,7],[18,0,4],[18,1,2],[18,1,3],[18,2,1],[18,3,0],[19,0,1],[19,0,3],[19,1,2],[19,1,3],[19,1,4],[19,2,5],[19,3,6],[19,3,7],[20,4,1],[20,5,0],[20,5,2],[20,5,4],[20,6,4],[21,0,0],[21,0,2],[21,1,1],[21,1,2],[21,2,1],[22,2,0],[22,2,6],[22,3,1],[22,3,5],[22,5,4],[23,2,5],[23,2,7],[23,3,6],[23,3,7],[23,7,7],[24,0,0],[24,1,1],[24,1,2],[24,2,1],[27,2,6],[27,2,7],[27,3,7],[27,5,7],[27,7,7],[28,0,4],[28,1,2],[28,2,1],[29,1,5],[29,2,6],[32,2,6],[32,3,3],[32,3,5],[32,4,4],[33,2,1],[33,3,2],[38,3,1],[38,4,0],[38,4,2],[38,4,4],[38,5,0],[38,5,1],[38,5,4],[38,6,0],[38,7,1],[38,7,2],[39,1,4],[39,1,6],[39,1,7],[39,2,5],[39,2,7],[39,6,7],[39,7,7],[40,0,2],[46,1,2],[46,1,5],[46,2,3],[46,2,4],[46,6,6],[52,3,0],[52,6,0],[52,6,1],[52,6,2],[52,7,2],[53,3,5],[53,4,6],[53,4,7],[53,6,7],[55,0,0],[55,0,1],[55,1,1],[56,0,6],[56,0,7],[59,2,6],[59,3,5],[60,2,4],[60,2,6],[60,2,7],[60,3,5],[60,3,7],[61,0,1],[61,0,2],[61,1,2],[63,2,6],[63,3,5]],[],[[3,5,5],[3,6,4],[3,7,4],[4,1,5],[4,2,5],[4,3,5],[4,4,1],[4,4,5],[4,5,1],[4,5,5],[4,6,2],[5,0,4],[5,1,3],[5,1,4],[5,2,3],[5,2,4],[5,3,3],[5,3,4],[5,4,2],[5,4,4],[5,5,2],[5,5,4],[9,7,2],[10,0,0],[10,4,2],[10,5,2],[10,6,3],[11,0,2],[11,1,2],[11,2,1],[11,2,2],[11,3,1],[11,3,2],[11,4,1],[11,4,2],[11,5,1],[11,5,2],[12,1,5],[12,2,5],[12,4,4],[12,5,5],[13,0,3],[13,4,5],[13,5,4],[13,6,5],[19,5,4],[19,5,5],[21,4,4],[21,5,5],[22,7,3],[23,5,5],[23,6,4],[23,7,4],[24,1,5],[24,2,5],[24,4,4],[24,5,5],[25,0,3],[25,4,5],[25,5,4],[25,6,5],[27,1,3],[27,6,4],[27,7,4],[28,2,2],[28,2,3],[28,3,3],[28,3,4],[28,4,4],[29,1,0],[29,2,1],[29,2,5],[29,3,4],[29,3,5],[29,4,3],[29,4,4],[29,5,3],[29,6,4],[32,6,4],[32,7,0],[32,7,5],[33,5,3],[34,0,5],[34,1,6],[34,5,4],[34,6,5],[38,2,6],[38,3,6],[38,4,6],[38,5,6],[38,6,6],[38,7,6],[39,6,4],[40,0,6],[40,1,6],[40,2,6],[40,4,1],[40,5,1],[40,6,1],[40,6,2],[41,1,3],[41,1,4],[41,2,3],[41,3,2],[45,5,2],[45,5,3],[45,5,4],[45,5,5],[52,5,4],[52,7,4],[53,5,5],[53,6,4],[53,6,5],[53,7,3],[53,7,4],[55,0,4],[55,1,4],[55,4,2],[55,5,2],[55,6,3],[56,0,3],[56,0,4],[56,1,2],[56,1,3],[56,2,2],[56,2,3],[56,3,2],[56,4,1],[56,4,2],[56,5,1],[56,5,2],[60,6,6],[61,1,5],[61,2,5],[61,3,5],[61,4,1],[61,4,5],[61,5,1],[61,5,5],[61,6,2],[62,0,4],[62,1,3],[62,1,4],[62,2,3],[62,2,4],[62,3,3],[62,3,4],[62,4,2],[62,4,4],[62,5,2],[62,5,4]],[[28,1,3],[28,2,4],[28,3,1],[28,3,2],[28,3,5],[28,3,6],[28,4,2],[28,4,3],[28,4,5],[28,5,3],[28,5,4],[29,2,4],[29,3,3],[29,3,6],[29,4,2],[29,4,5],[29,5,2],[29,5,4],[29,6,3],[29,6,5]],[[1,2,6],[2,5,3],[2,7,2],[4,1,0],[4,2,0],[7,3,5],[9,6,6],[9,6,7],[9,7,7],[10,2,0],[11,2,7],[12,2,0],[12,2,2],[12,2,3],[12,3,2],[13,1,7],[13,2,6],[13,2,7],[13,3,7],[15,7,6],[17,0,4],[18,4,0],[18,4,2],[18,4,3],[18,5,0],[18,5,3],[19,3,3],[19,4,7],[19,5,7],[20,2,6],[20,3,5],[20,5,3],[20,7,2],[21,2,0],[21,2,2],[21,2,3],[21,3,2],[22,5,0],[22,5,1],[22,6,1],[22,6,2],[24,2,0],[24,2,2],[24,2,3],[24,3,2],[25,1,7],[25,2,6],[25,2,7],[25,3,7],[26,2,6],[27,2,4],[27,3,4],[27,3,5],[27,4,5],[27,4,6],[28,0,0],[28,0,1],[28,1,1],[29,1,6],[29,1,7],[31,1,7],[31,3,4],[32,5,2],[32,5,3],[32,6,2],[33,4,3],[33,4,4],[33,5,4],[34,1,1],[34,1,2],[34,2,1],[34,2,2],[34,2,3],[34,3,2],[35,1,5],[35,1,6],[35,2,5],[35,2,6],[37,1,6],[38,4,3],[38,6,2],[39,4,5],[39,4,6],[39,5,6],[40,0,0],[40,1,0],[44,6,2],[45,4,0],[45,5,0],[46,3,6],[46,4,3],[46,4,4],[46,4,5],[46,4,7],[46,5,4],[46,5,7],[47,0,0],[47,1,0],[50,3,6],[52,4,1],[52,4,2],[52,4,3],[52,7,0],[55,2,0],[56,1,7],[56,2,7],[58,2,6],[59,5,5],[59,5,6],[59,6,6],[60,5,5],[60,6,4],[61,1,0],[61,2,0],[63,5,5],[63,5,6],[63,6,6]],[],[]],"colorGroups":[{"label":"Cloak & Boots","items":[{"index":14,"huedel":0,"bright":0.2,"sat":0.5},{"index":12,"huedel":0,"bright":0.28,"sat":0.5},{"index":11,"huedel":0,"bright":0.5,"sat":0.5}],"red":28,"green":28,"blue":31,"bright":-0.41,"sat":1,"huebr":2},{"label":"Outfit & Headpiece ","items":[{"index":5,"huedel":0,"bright":0.25806451612903225,"sat":0.5},{"index":13,"huedel":0,"bright":0.43,"sat":0.1346153846153847}],"red":0,"green":31,"blue":0,"bright":-0.59,"sat":0.65,"huebr":1},{"label":"Fringe/Mouth/Aim-Bow","items":[{"index":7,"huedel":0,"bright":0.67,"sat":0.5},{"index":9,"huedel":0,"bright":0.5,"sat":0.625}],"red":31,"green":31,"blue":0,"bright":-0.13,"sat":1,"huebr":1.1904761904761907},{"label":"Hair","items":[{"index":6,"huedel":0,"bright":0.3118279569892473,"sat":0.6896551724137931},{"index":10,"huedel":0,"bright":0.5698924731182795,"sat":0.37735849056603765},{"index":15,"huedel":0,"bright":0.4408602150537635,"sat":0.4878048780487806}],"red":31,"green":21,"blue":0,"bright":0,"sat":0,"huebr":1.6666666666666665},{"label":"Eyes","items":[{"index":8,"huedel":0,"bright":0.22580645161290322,"sat":1}],"red":0,"green":0,"blue":31,"bright":0,"sat":0,"huebr":1},{"label":"Skin","items":[{"index":3,"huedel":0,"bright":0.6881720430107526,"sat":0.4375},{"index":4,"huedel":-0.0035087719298245723,"bright":0.4946236559139785,"sat":0.4782608695652174}],"red":31,"green":15,"blue":0,"bright":0,"sat":0,"huebr":1.4736842105263157}],"palette":[{"r":0,"g":12,"b":0},{"r":0,"g":0,"b":0},{"r":31,"g":31,"b":31},{"r":31,"g":21,"b":12},{"r":23,"g":15,"b":8},{"r":1,"g":9,"b":1},{"r":15,"g":11,"b":3},{"r":27,"g":27,"b":0},{"r":0,"g":0,"b":21},{"r":20,"g":20,"b":0},{"r":23,"g":19,"b":11},{"r":25,"g":25,"b":27},{"r":14,"g":14,"b":15},{"r":2,"g":13,"b":2},{"r":10,"g":10,"b":11},{"r":19,"g":15,"b":7}]});
				//}}}

				// Yang
				//{{{
				initData.characters[6].presets.push({"name":"Alternate","description":"Merged wrist and shoes and made earrings their own color, removed white from wrists, removed white at mouth","delta":[[],[],[],[[20,1,3],[20,2,3],[22,1,3],[22,2,3],[38,1,1],[38,2,1],[52,1,5],[52,2,5],[59,1,0],[59,2,0],[63,1,0],[63,2,0]],[],[],[],[],[],[],[[3,5,3],[4,5,1],[4,6,0],[4,6,1],[4,6,2],[5,6,5],[5,6,6],[5,6,7],[8,1,6],[9,4,4],[10,5,4],[10,6,0],[10,6,1],[10,6,2],[10,6,3],[10,6,4],[10,6,5],[11,6,3],[11,6,4],[11,6,5],[12,3,5],[12,3,6],[12,4,5],[12,5,4],[12,6,3],[13,4,1],[13,5,2],[13,6,3],[13,6,4],[13,6,5],[18,5,4],[18,6,1],[18,6,2],[18,6,3],[18,6,4],[18,6,5],[19,2,3],[21,3,5],[21,3,6],[21,4,5],[21,5,4],[21,6,3],[22,5,2],[24,3,5],[24,3,6],[24,4,5],[24,5,4],[24,6,3],[25,4,1],[25,5,2],[25,6,3],[25,6,4],[25,6,5],[27,1,3],[28,3,5],[28,3,6],[28,4,5],[28,5,4],[28,6,3],[29,4,1],[29,5,2],[29,6,3],[29,6,4],[29,6,5],[30,4,3],[33,2,6],[34,5,0],[34,5,4],[34,6,1],[34,6,2],[34,6,3],[34,6,4],[34,6,5],[38,3,4],[40,5,2],[40,6,0],[40,6,1],[40,6,2],[40,6,3],[41,6,2],[41,6,3],[41,6,4],[41,6,6],[41,6,7],[45,2,6],[45,3,5],[45,3,6],[45,4,6],[45,5,6],[45,6,6],[46,4,5],[48,6,0],[51,5,5],[51,5,6],[51,6,4],[51,6,5],[51,7,4],[53,3,5],[59,5,4],[60,5,4],[61,5,5],[61,6,2],[61,6,3],[61,6,4],[61,6,5],[61,6,6],[62,5,2],[62,6,1],[62,6,2],[62,6,3],[62,6,4],[62,6,5],[63,5,4]],[],[],[[3,5,2],[3,5,4],[3,6,2],[3,6,3],[8,2,6],[8,3,5],[9,4,5],[9,5,3],[9,5,4],[9,5,5],[19,2,2],[19,3,3],[22,5,1],[22,5,3],[22,6,1],[22,6,2],[27,0,2],[27,0,3],[27,1,2],[27,1,4],[27,2,3],[30,3,3],[30,4,2],[30,4,4],[30,5,3],[30,5,4],[33,1,6],[33,2,5],[33,2,7],[33,3,5],[33,3,6],[38,4,4],[46,4,6],[46,5,4],[46,5,5],[48,6,1],[48,7,0],[49,6,7],[49,7,7],[53,4,4],[59,5,5],[59,6,4],[60,5,3],[60,6,3],[60,6,4],[63,5,5],[63,6,4]],[[3,1,5],[23,1,5],[39,1,3],[53,1,7],[60,1,3]],[[3,6,1],[3,7,2],[3,7,3],[8,2,5],[8,3,4],[9,5,6],[9,6,4],[9,6,5],[19,1,2],[19,1,3],[19,2,1],[19,2,4],[19,3,1],[19,3,2],[19,4,2],[22,6,0],[22,7,1],[22,7,2],[27,2,2],[30,5,2],[30,6,3],[33,3,7],[33,4,5],[33,4,6],[38,4,3],[38,4,5],[46,6,4],[46,6,5],[51,0,0],[52,0,7],[53,5,4],[59,6,5],[59,7,3],[59,7,4],[60,6,2],[60,7,3],[60,7,4],[60,7,5],[63,6,5],[63,7,3],[63,7,4]]],"colorGroups":[{"label":"Pants","items":[{"index":7,"huedel":0,"bright":0.45,"sat":1},{"index":6,"huedel":0,"bright":0.34,"sat":1},{"index":12,"huedel":0,"bright":0.56,"sat":1}],"red":6,"green":6,"blue":9,"bright":-0.33,"sat":0,"huebr":1},{"label":"Belt/Earrings","items":[{"index":5,"huedel":0,"bright":0.5268817204301075,"sat":1},{"index":9,"huedel":0.125,"bright":0.7096774193548386,"sat":0.8181818181818181},{"index":11,"huedel":0.06048387096774199,"bright":0.6236559139784946,"sat":1}],"red":24,"green":23,"blue":11,"bright":-0.27,"sat":0,"huebr":1.75},{"label":"Shoes","items":[{"index":15,"huedel":0,"bright":0.24,"sat":1},{"index":13,"huedel":0,"bright":0.28,"sat":1},{"index":10,"huedel":0,"bright":0.33,"sat":1}],"red":31,"green":0,"blue":0,"bright":-0.14,"sat":0,"huebr":1},{"label":"Wrist","items":[{"index":14,"huedel":0,"bright":0.95,"sat":1}],"red":31,"green":31,"blue":0,"bright":0,"sat":0,"huebr":2},{"label":"Eyes","items":[{"index":8,"huedel":0,"bright":0.16129032258064516,"sat":1}],"red":0,"green":31,"blue":0,"bright":0,"sat":0,"huebr":1},{"label":"Skin","items":[{"index":3,"huedel":0,"bright":0.5913978494623656,"sat":0.509090909090909},{"index":4,"huedel":0.10276679841897218,"bright":0.3655913978494623,"sat":1}],"red":31,"green":13,"blue":0,"bright":-0.25,"sat":0,"huebr":1.2727272727272727}],"palette":[{"r":0,"g":12,"b":0},{"r":0,"g":0,"b":0},{"r":31,"g":31,"b":31},{"r":22,"g":13,"b":7},{"r":16,"g":10,"b":0},{"r":20,"g":20,"b":13},{"r":4,"g":4,"b":6},{"r":5,"g":5,"b":8},{"r":0,"g":15,"b":0},{"r":24,"g":26,"b":17},{"r":26,"g":0,"b":0},{"r":24,"g":24,"b":15},{"r":7,"g":7,"b":10},{"r":22,"g":0,"b":0},{"r":31,"g":31,"b":0},{"r":19,"g":0,"b":0}]});
				//}}}

				// Palom
				//{{{
				initData.characters[7].presets.push({"name":"Test","description":"","delta":[[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[]],"colorGroups":[{"label":"Robe","items":[{"index":5,"huedel":0,"bright":0.2903225806451613,"sat":1},{"index":15,"huedel":0,"bright":0.16129032258064516,"sat":1}],"red":31,"green":0,"blue":20,"bright":0,"sat":0,"huebr":1},{"label":"Cloak/Mouth","items":[{"index":12,"huedel":0,"bright":0.66,"sat":1},{"index":7,"huedel":0,"bright":0.45,"sat":1}],"red":31,"green":31,"blue":0,"bright":0,"sat":0,"huebr":1.3225806451612903},{"label":"Shoes/Amulet/Hair","items":[{"index":10,"huedel":0,"bright":0.6236559139784946,"sat":1},{"index":11,"huedel":-0.06048387096774199,"bright":0.5268817204301075,"sat":1},{"index":9,"huedel":0.06451612903225801,"bright":0.8279569892473119,"sat":0.4155844155844156}],"red":31,"green":27,"blue":0,"bright":0,"sat":-1,"huebr":1.870967741935484},{"label":"Hair","items":[{"index":6,"huedel":0,"bright":0.23655913978494625,"sat":1},{"index":13,"huedel":0.09275362318840585,"bright":0.40860215053763443,"sat":1},{"index":14,"huedel":0.05614035087719316,"bright":0.3225806451612903,"sat":1}],"red":31,"green":14,"blue":0,"bright":-0.24,"sat":0,"huebr":1.4666666666666668},{"label":"Eyes","items":[{"index":8,"huedel":0,"bright":0.2903225806451613,"sat":1}],"red":0,"green":0,"blue":31,"bright":0,"sat":0,"huebr":1},{"label":"Skin","items":[{"index":3,"huedel":0,"bright":0.6236559139784946,"sat":0.43103448275862066},{"index":4,"huedel":-0.019736842105263275,"bright":0.4731182795698925,"sat":0.5227272727272727}],"red":31,"green":8,"blue":0,"bright":0,"sat":0,"huebr":1.25}],"palette":[{"r":0,"g":12,"b":0},{"r":0,"g":0,"b":0},{"r":31,"g":31,"b":31},{"r":31,"g":16,"b":11},{"r":26,"g":11,"b":7},{"r":16,"g":0,"b":11},{"r":12,"g":5,"b":0},{"r":21,"g":21,"b":0},{"r":0,"g":0,"b":27},{"r":26,"g":26,"b":26},{"r":19,"g":19,"b":19},{"r":16,"g":16,"b":16},{"r":31,"g":31,"b":0},{"r":18,"g":11,"b":0},{"r":15,"g":8,"b":0},{"r":9,"g":0,"b":6}]});
				//}}}

				// Porom
				//{{{
				initData.characters[8].presets.push({"name":"Test","description":"","delta":[[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[]],"colorGroups":[{"label":"Robe/Mouth","items":[{"index":5,"huedel":0,"bright":0.58,"sat":1},{"index":7,"huedel":0,"bright":0.66,"sat":1}],"red":31,"green":31,"blue":0,"bright":-0.08,"sat":0,"huebr":1},{"label":"Cloak","items":[{"index":10,"huedel":0,"bright":0.3333333333333333,"sat":1},{"index":15,"huedel":0,"bright":0.23655913978494625,"sat":1}],"red":31,"green":0,"blue":31,"bright":0,"sat":0,"huebr":1},{"label":"Boots/Amulet/Hair","items":[{"index":9,"huedel":0,"bright":0.6666666666666666,"sat":1},{"index":11,"huedel":-0.09677419354838701,"bright":0.6021505376344086,"sat":1},{"index":12,"huedel":-0.1200000000000001,"bright":0.4731182795698925,"sat":1}],"red":31,"green":31,"blue":0,"bright":0,"sat":-1,"huebr":2},{"label":"Eyes","items":[{"index":8,"huedel":0,"bright":0.41935483870967744,"sat":1}],"red":0,"green":8,"blue":31,"bright":0,"sat":0,"huebr":1.258064516129032},{"label":"Skin","items":[{"index":3,"huedel":0,"bright":0.6881720430107526,"sat":0.34375},{"index":4,"huedel":0.009191176470588314,"bright":0.5161290322580645,"sat":0.4375}],"red":31,"green":9,"blue":0,"bright":0,"sat":0,"huebr":1.2941176470588236},{"label":"Hair","items":[{"index":6,"huedel":0,"bright":0.22580645161290322,"sat":1},{"index":14,"huedel":0.014705882352941124,"bright":0.27956989247311825,"sat":1},{"index":13,"huedel":0.05952380952380931,"bright":0.3655913978494623,"sat":1}],"red":31,"green":16,"blue":0,"bright":-0.25,"sat":0,"huebr":1.5}],"palette":[{"r":0,"g":12,"b":0},{"r":0,"g":0,"b":0},{"r":31,"g":31,"b":31},{"r":31,"g":19,"b":14},{"r":25,"g":14,"b":9},{"r":25,"g":25,"b":0},{"r":10,"g":5,"b":0},{"r":28,"g":28,"b":0},{"r":0,"g":8,"b":31},{"r":21,"g":21,"b":21},{"r":16,"g":0,"b":16},{"r":19,"g":19,"b":19},{"r":15,"g":15,"b":15},{"r":16,"g":10,"b":0},{"r":13,"g":7,"b":0},{"r":11,"g":0,"b":11}]});
				//}}}

				// Cecil
				//{{{
				initData.characters[9].presets.push({"name":"Alternate","description":"Chestplate combined with cloak accent instead of hair","delta":[[],[[12,2,3],[12,3,2],[12,4,1],[13,1,3],[13,2,4],[13,3,5]],[],[],[],[[0,3,6],[0,4,5],[0,5,5],[6,3,6],[6,4,5],[6,5,5],[12,3,0],[12,3,1],[13,1,4],[13,1,5],[13,2,7],[13,3,6],[16,4,1],[30,3,6],[30,4,5],[30,5,5],[36,3,5],[36,4,5],[49,3,6],[49,4,5],[49,5,5],[57,3,6],[57,4,5],[57,5,5]],[],[[2,5,1],[2,5,2],[2,7,0],[4,0,2],[10,0,2],[12,2,4],[12,3,3],[12,3,4],[12,4,4],[13,3,4],[13,4,3],[13,4,5],[13,5,2],[20,5,1],[20,5,2],[20,7,0],[21,0,2],[28,0,2],[32,5,1],[32,5,2],[34,0,2],[38,4,1],[38,4,2],[38,6,0],[38,7,2]],[],[],[[2,4,0],[2,4,3],[2,7,1],[4,0,1],[4,1,2],[10,0,1],[10,1,2],[19,1,6],[20,4,0],[20,4,3],[20,7,1],[21,0,1],[21,1,2],[28,0,1],[28,1,2],[32,4,0],[32,4,3],[34,0,1],[34,1,2],[38,3,0],[38,3,3],[38,6,1],[38,7,1],[39,5,6],[39,6,7],[40,0,2],[52,4,3],[53,4,7],[55,1,1]],[[0,4,6],[2,3,5],[3,2,5],[3,3,7],[6,4,6],[8,5,5],[9,2,5],[9,3,7],[12,0,1],[12,2,2],[13,1,6],[13,1,7],[13,2,5],[13,2,6],[13,4,4],[13,5,3],[18,3,5],[19,3,3],[19,4,3],[19,6,2],[22,4,3],[22,6,2],[23,2,6],[23,5,7],[24,1,2],[27,1,3],[27,3,4],[27,3,7],[30,4,6],[32,3,5],[33,0,2],[33,3,7],[36,3,6],[38,2,5],[39,2,7],[45,4,2],[46,3,4],[46,4,7],[46,6,1],[49,4,6],[53,3,5],[53,6,5],[57,4,6],[59,6,2],[60,2,6],[60,5,7],[61,1,2],[63,6,2]],[],[],[[0,2,6],[0,3,5],[0,4,1],[0,4,4],[0,5,2],[1,3,7],[1,5,6],[6,2,6],[6,3,5],[6,4,1],[6,4,4],[6,5,2],[7,3,7],[7,5,6],[16,2,1],[16,3,0],[16,3,2],[16,3,5],[16,4,0],[16,4,2],[16,4,4],[17,3,5],[17,4,6],[26,3,7],[26,5,6],[30,2,6],[30,3,5],[30,4,1],[30,4,4],[30,5,2],[31,3,7],[31,5,6],[36,1,6],[36,2,5],[36,3,1],[36,3,4],[36,4,2],[37,2,7],[37,4,6],[49,2,6],[49,3,5],[49,4,1],[49,4,4],[49,5,2],[49,7,6],[50,3,7],[50,5,6],[57,2,6],[57,3,5],[57,4,1],[57,4,4],[57,5,2],[58,3,7],[58,5,6]],[]],"colorGroups":[{"label":"Armor & Cloak","items":[{"index":11,"huedel":0,"bright":0.8709677419354839,"sat":0.2962962962962963},{"index":5,"huedel":0,"bright":0.6559139784946236,"sat":0.2622950819672131},{"index":13,"huedel":0,"bright":0.3118279569892473,"sat":0.27586206896551724}],"red":31,"green":0,"blue":0,"bright":-0.68,"sat":1,"huebr":2},{"label":"Armor/Cloak Accent","items":[{"index":10,"huedel":0,"bright":0.32,"sat":1},{"index":7,"huedel":0,"bright":0.5053763440860215,"sat":0.4893617021276596}],"red":0,"green":22,"blue":31,"bright":-0.5,"sat":-0.32,"huebr":1},{"label":"Breastplate & Hair","items":[{"index":15,"huedel":0,"bright":0.5268817204301075,"sat":0.26530612244897955},{"index":6,"huedel":0,"bright":0.7204301075268816,"sat":0.19402985074626855},{"index":12,"huedel":0,"bright":0.8494623655913979,"sat":0.08860759493670889}],"red":31,"green":15,"blue":0,"bright":-0.5,"sat":0.5,"huebr":1},{"label":"Crown & Casting","items":[{"index":9,"huedel":0,"bright":0.6236559139784946,"sat":1},{"index":14,"huedel":0,"bright":1,"sat":0.6}],"red":31,"green":27,"blue":0,"bright":0,"sat":0,"huebr":1.870967741935484},{"label":"Eyes","items":[{"index":8,"huedel":0,"bright":0.22580645161290322,"sat":1}],"red":0,"green":31,"blue":0,"bright":0,"sat":0,"huebr":1},{"label":"Skin","items":[{"index":3,"huedel":0,"bright":0.6451612903225806,"sat":0.4},{"index":4,"huedel":-0.02631578947368407,"bright":0.4731182795698925,"sat":0.5227272727272727}],"red":31,"green":8,"blue":0,"bright":0,"sat":0,"huebr":1.263157894736842}],"palette":[{"r":0,"g":12,"b":0},{"r":0,"g":0,"b":0},{"r":31,"g":31,"b":31},{"r":31,"g":17,"b":12},{"r":26,"g":11,"b":7},{"r":20,"g":0,"b":0},{"r":18,"g":11,"b":4},{"r":5,"g":8,"b":10},{"r":0,"g":21,"b":0},{"r":31,"g":27,"b":0},{"r":2,"g":6,"b":8},{"r":26,"g":0,"b":0},{"r":20,"g":13,"b":6},{"r":9,"g":0,"b":0},{"r":31,"g":31,"b":12},{"r":13,"g":8,"b":3}]});
				//}}}

				// Rydia
				//{{{
				initData.characters[11].presets.push({"name":"Hair Uncoupled","description":"The hair and outfit use seperate color groups.","delta":[[],[],[],[],[],[[0,2,1],[0,3,2],[0,4,3],[0,5,4],[0,7,5],[1,1,6],[1,3,3],[2,0,6],[6,2,0],[6,3,1],[6,4,2],[6,5,3],[6,7,4],[7,1,5],[7,3,2],[8,0,5],[16,0,0],[16,0,1],[16,1,0],[16,1,2],[16,2,1],[16,2,3],[16,3,4],[17,0,7],[20,0,6],[22,0,6],[26,1,6],[26,3,3],[30,2,0],[30,3,0],[30,4,1],[30,4,2],[31,2,4],[31,2,5],[31,2,7],[31,3,6],[36,1,1],[36,2,2],[36,3,3],[37,0,6],[37,2,3],[42,7,4],[45,0,4],[45,1,4],[45,1,5],[45,2,4],[57,2,0],[57,3,1],[57,4,2],[57,5,3],[57,7,4],[58,1,5],[58,3,2],[59,0,5],[63,0,5]],[],[[2,6,0],[2,6,2],[2,7,1],[3,4,6],[3,5,7],[4,0,0],[5,0,7],[5,3,4],[5,4,5],[9,5,6],[9,7,7],[11,3,5],[11,4,6],[13,2,3],[13,3,2],[13,4,7],[18,4,2],[18,4,3],[18,6,3],[18,6,4],[18,6,5],[18,6,6],[19,3,6],[20,6,0],[20,6,2],[20,7,1],[23,4,5],[23,5,4],[23,6,4],[23,7,5],[25,3,2],[25,4,7],[27,5,7],[27,6,7],[29,2,3],[29,3,2],[29,4,7],[34,2,0],[34,4,2],[34,5,3],[35,2,7],[35,3,6],[35,3,7],[35,4,6],[38,5,0],[38,5,2],[38,6,1],[38,7,0],[39,3,6],[39,4,6],[39,4,7],[39,5,7],[39,7,7],[41,2,4],[41,3,5],[47,4,2],[47,4,3],[47,4,4],[47,4,5],[47,4,6],[47,4,7],[56,4,3],[56,5,3],[60,7,5],[62,0,4],[62,3,5],[62,4,3],[62,5,3]],[],[[1,5,3],[1,5,4],[7,5,2],[7,5,3],[26,5,3],[26,5,4],[50,5,2],[58,5,2],[58,5,3]],[],[],[],[[2,6,4],[2,7,4],[3,6,4],[3,7,4],[4,1,0],[5,0,5],[5,0,6],[5,3,3],[5,4,4],[8,7,0],[9,4,5],[9,7,5],[9,7,6],[11,0,7],[11,4,5],[12,0,0],[13,0,7],[13,1,3],[13,2,2],[13,3,6],[18,3,1],[21,0,0],[25,2,2],[25,3,6],[27,4,6],[27,6,6],[29,0,7],[29,1,3],[29,2,2],[29,3,6],[33,5,7],[39,4,5],[39,5,6],[39,7,5],[39,7,6],[40,0,0],[41,2,3],[41,3,4],[47,3,3],[56,3,3],[56,4,2],[56,5,2],[56,5,4],[56,6,4],[62,2,4],[62,3,3],[62,4,2],[62,4,5],[62,5,2],[62,5,4],[62,6,4]],[[2,7,3],[3,7,1],[4,0,2],[4,0,4],[4,1,2],[4,2,3],[4,3,3],[4,4,4],[4,5,4],[5,0,1],[5,1,1],[5,2,1],[5,3,1],[5,3,2],[5,3,5],[5,3,6],[5,4,1],[5,4,2],[5,4,6],[5,5,1],[5,5,6],[5,6,1],[5,6,7],[8,6,2],[8,7,3],[9,5,1],[9,6,1],[9,7,1],[10,0,3],[10,1,3],[10,2,3],[10,3,3],[10,4,3],[10,6,0],[11,0,1],[11,1,1],[11,2,1],[11,3,2],[11,3,6],[11,3,7],[11,4,2],[11,4,7],[11,5,3],[11,5,7],[11,6,3],[12,0,2],[12,0,4],[12,1,2],[12,3,1],[12,4,0],[12,4,2],[12,4,3],[12,5,1],[13,0,0],[13,2,0],[13,3,0],[13,3,3],[13,3,7],[13,4,2],[13,4,4],[13,5,3],[13,6,2],[13,6,4],[18,5,3],[18,5,4],[18,5,5],[19,3,3],[19,4,2],[20,7,4],[21,0,5],[21,3,1],[21,4,0],[21,4,2],[21,4,3],[21,5,1],[22,6,1],[22,7,0],[23,4,6],[23,5,5],[23,6,5],[24,1,0],[24,3,1],[24,4,0],[24,4,2],[24,4,3],[24,5,1],[25,1,3],[25,1,4],[25,1,5],[25,1,6],[25,1,7],[25,3,3],[25,3,7],[25,4,2],[25,4,4],[25,5,3],[25,6,2],[25,6,4],[27,1,1],[27,2,1],[27,3,1],[27,4,1],[27,4,3],[27,5,1],[27,5,2],[27,6,1],[27,6,2],[27,7,1],[28,1,2],[28,3,1],[28,4,0],[28,4,2],[28,4,3],[28,5,1],[29,0,1],[29,3,3],[29,3,7],[29,4,2],[29,4,4],[29,5,3],[29,6,2],[29,6,4],[32,4,4],[32,5,5],[32,7,6],[33,7,5],[33,7,6],[34,1,1],[34,1,2],[34,1,7],[34,3,1],[34,4,0],[34,4,3],[34,5,4],[35,0,7],[35,5,7],[36,6,4],[36,7,4],[36,7,5],[37,7,2],[38,0,5],[38,1,5],[38,2,5],[38,3,4],[38,3,6],[38,4,6],[38,5,5],[38,5,6],[38,6,6],[38,7,6],[39,0,2],[39,1,2],[39,2,2],[39,3,1],[39,3,3],[39,4,1],[39,5,1],[39,5,2],[39,6,1],[39,7,1],[41,2,5],[41,2,6],[41,3,6],[41,4,6],[41,5,6],[41,6,7],[47,2,5],[47,2,6],[56,0,3],[56,1,1],[56,1,2],[56,1,3],[60,5,7],[60,6,7],[60,7,7],[61,0,3],[61,1,3],[61,2,4],[61,3,4],[61,4,5],[61,5,5],[61,6,0],[62,0,7],[62,1,7],[62,2,7],[62,3,7]],[]],"colorGroups":[{"label":"Outfit","items":[{"index":10,"huedel":0,"bright":0.6559139784946236,"sat":0.2622950819672131},{"index":11,"huedel":-0.25,"bright":0.6666666666666666,"sat":0.5},{"index":12,"huedel":-0.26,"bright":0.4731182795698925,"sat":0.5},{"index":13,"huedel":0,"bright":0.14,"sat":1},{"index":14,"huedel":0,"bright":0.46,"sat":0.36},{"index":7,"huedel":0,"bright":0.26,"sat":0.6699999999999999}],"red":20,"green":12,"blue":31,"bright":0,"sat":1,"huebr":1},{"label":"Hair","items":[{"index":15,"huedel":0,"bright":0.13978494623655915,"sat":1},{"index":6,"huedel":0,"bright":0.4623655913978495,"sat":0.37209302325581395},{"index":9,"huedel":0,"bright":0.26881720430107525,"sat":0.64},{"index":5,"huedel":-0.41,"bright":1,"sat":1}],"red":0,"green":31,"blue":0,"bright":0,"sat":0,"huebr":1},{"label":"Eyes","items":[{"index":8,"huedel":0,"bright":0.3333333333333333,"sat":1}],"red":0,"green":0,"blue":31,"bright":0,"sat":0,"huebr":1},{"label":"Skin","items":[{"index":3,"huedel":0,"bright":0.6881720430107526,"sat":0.4375},{"index":4,"huedel":-0.022556390977443552,"bright":0.5376344086021505,"sat":0.4}],"red":31,"green":15,"blue":0,"bright":0,"sat":0,"huebr":1.4736842105263157}],"palette":[{"r":0,"g":12,"b":0},{"r":0,"g":0,"b":0},{"r":31,"g":31,"b":31},{"r":31,"g":21,"b":12},{"r":24,"g":16,"b":10},{"r":31,"g":31,"b":0},{"r":9,"g":25,"b":9},{"r":14,"g":9,"b":20},{"r":0,"g":0,"b":31},{"r":3,"g":19,"b":3},{"r":31,"g":24,"b":31},{"r":24,"g":27,"b":31},{"r":17,"g":19,"b":31},{"r":7,"g":5,"b":11},{"r":24,"g":17,"b":31},{"r":0,"g":13,"b":0}]});
				//}}}

				// Edge
				//{{{
				initData.characters[12].presets.push({"name":"Pants","description":"Set the color of the pants to be one shade darker, to replace the white pixels","delta":[[],[],[],[],[],[],[],[],[],[],[],[[4,1,0],[5,2,7],[5,3,7],[10,1,2],[10,2,2],[10,2,3],[11,1,5],[11,1,6],[11,2,4],[12,2,2],[13,1,7],[13,2,6],[18,2,2],[18,2,3],[18,3,2],[19,5,3],[21,2,2],[24,2,2],[25,2,7],[25,3,6],[28,2,2],[29,2,7],[29,3,6],[33,7,4],[35,0,4],[35,0,5],[35,1,7],[40,1,2],[40,2,2],[40,2,3],[41,1,5],[41,1,6],[41,2,4],[45,1,0],[45,1,1],[45,2,0],[45,2,1],[45,2,2],[55,1,0],[55,1,1],[55,2,1],[55,2,2],[56,4,7],[61,1,2],[61,2,2],[61,2,3],[62,1,5],[62,1,6],[62,2,4]],[],[[4,2,0],[4,2,1],[5,3,6],[10,1,0],[10,1,3],[10,2,1],[10,2,4],[10,3,2],[10,3,3],[11,0,5],[11,0,6],[11,0,7],[11,1,4],[11,1,7],[11,2,3],[11,2,5],[11,2,6],[11,3,3],[11,3,4],[12,1,0],[12,1,2],[12,2,0],[12,2,1],[12,2,3],[12,3,1],[12,3,2],[13,2,7],[13,3,5],[13,3,6],[18,1,3],[18,2,4],[18,3,1],[18,3,3],[19,4,2],[19,5,2],[19,6,3],[19,6,4],[21,1,0],[21,1,2],[21,2,0],[21,2,1],[21,2,3],[21,3,1],[21,3,2],[24,1,0],[24,1,2],[24,2,0],[24,2,1],[24,2,3],[24,3,1],[24,3,2],[25,1,7],[25,2,6],[25,3,5],[28,1,0],[28,1,2],[28,2,0],[28,2,1],[28,2,3],[28,3,1],[28,3,2],[29,1,7],[29,2,6],[29,3,5],[33,6,4],[33,7,3],[33,7,5],[34,1,0],[34,2,0],[34,3,1],[35,0,3],[35,0,6],[35,1,4],[35,1,5],[35,2,7],[40,1,0],[40,1,3],[40,2,1],[40,2,4],[40,3,2],[40,3,3],[41,0,5],[41,0,6],[41,0,7],[41,1,4],[41,1,7],[41,2,3],[41,2,5],[41,2,6],[41,3,3],[41,3,4],[45,3,1],[45,3,2],[45,4,2],[55,1,2],[55,2,0],[55,2,3],[55,3,1],[55,3,2],[55,3,3],[56,1,7],[56,3,6],[56,3,7],[56,4,6],[56,5,6],[56,5,7],[61,1,0],[61,1,3],[61,2,1],[61,2,4],[61,3,2],[61,3,3],[62,0,5],[62,0,6],[62,0,7],[62,1,4],[62,1,7],[62,2,3],[62,2,5],[62,2,6],[62,3,3],[62,3,4]],[[10,2,0],[10,3,1],[40,2,0],[40,3,1],[55,3,0],[55,4,0],[61,2,0],[61,3,1]],[]],"colorGroups":[{"label":"Cape/Armor/Pants","items":[{"index":14,"huedel":0,"bright":0.5483870967741935,"sat":0.4117647058823529},{"index":13,"huedel":0,"bright":0.5483870967741936,"sat":0.17647058823529427},{"index":11,"huedel":0,"bright":0.7634408602150536,"sat":0.15492957746478864},{"index":5,"huedel":-0.17391304347826075,"bright":0.3333333333333333,"sat":1}],"red":0,"green":0,"blue":31,"bright":0,"sat":0,"huebr":1},{"label":"Armor Fringe & Boots","items":[{"index":15,"huedel":0,"bright":0.2795698924731183,"sat":1},{"index":10,"huedel":-0.00952380952380949,"bright":0.3870967741935483,"sat":1},{"index":9,"huedel":0.0688172043010753,"bright":0.6236559139784946,"sat":1}],"red":31,"green":23,"blue":0,"bright":0,"sat":0,"huebr":1.7333333333333334},{"label":"Hair & Scarf","items":[{"index":6,"huedel":0,"bright":0.3870967741935483,"sat":-2.220446049250313e-16},{"index":12,"huedel":0,"bright":0.6774193548387096,"sat":0}],"red":31,"green":0,"blue":31,"bright":0,"sat":0,"huebr":2},{"label":"Belt Accent","items":[{"index":7,"huedel":0,"bright":0.3333333333333333,"sat":1}],"red":31,"green":0,"blue":0,"bright":0,"sat":0,"huebr":1},{"label":"Eye","items":[{"index":8,"huedel":0,"bright":0.25806451612903225,"sat":0}],"red":31,"green":0,"blue":31,"bright":0,"sat":0,"huebr":2},{"label":"Skin","items":[{"index":3,"huedel":0,"bright":0.6129032258064516,"sat":0.3157894736842105},{"index":4,"huedel":-0.03571428571428559,"bright":0.44086021505376344,"sat":0.4878048780487805}],"red":31,"green":16,"blue":0,"bright":0,"sat":0,"huebr":1.5}],"palette":[{"r":0,"g":12,"b":0},{"r":0,"g":0,"b":0},{"r":31,"g":31,"b":31},{"r":25,"g":19,"b":13},{"r":21,"g":13,"b":7},{"r":0,"g":8,"b":23},{"r":12,"g":12,"b":12},{"r":31,"g":0,"b":0},{"r":8,"g":8,"b":8},{"r":31,"g":27,"b":0},{"r":21,"g":15,"b":0},{"r":20,"g":20,"b":31},{"r":21,"g":21,"b":21},{"r":14,"g":14,"b":23},{"r":10,"g":10,"b":31},{"r":15,"g":11,"b":0}]});
				initData.characters[12].presets.push({"name":"Alternate","description":"Added palette color to fringe group and made scarf part of that, recycled the belt accent into the hair","delta":[[],[],[],[],[],[[2,5,1],[2,5,2],[20,4,3],[20,5,1],[20,5,2],[22,4,0],[22,6,1],[32,5,4],[32,6,3],[38,3,5],[39,5,7],[43,7,3],[46,0,3],[52,7,3],[55,0,5]],[],[[0,1,0],[0,1,1],[0,1,2],[0,2,3],[0,2,4],[0,2,5],[0,3,6],[1,2,7],[1,3,6],[6,2,0],[6,2,1],[6,2,2],[6,3,3],[6,3,4],[6,3,5],[6,4,6],[7,3,7],[7,4,6],[16,1,0],[16,1,1],[16,1,2],[16,1,3],[16,2,1],[16,2,4],[17,1,7],[17,2,5],[17,2,6],[26,2,7],[26,3,6],[30,4,1],[30,5,1],[30,5,2],[30,6,2],[30,6,3],[30,6,4],[30,7,5],[36,1,0],[36,1,1],[36,2,2],[36,2,3],[36,2,4],[36,3,5],[37,1,7],[37,2,6],[37,3,5],[47,1,1],[47,2,2],[47,3,3],[48,5,0],[48,5,1],[48,6,2],[49,4,4],[49,4,5],[49,4,6],[49,5,3],[49,5,7],[49,6,2],[57,2,0],[57,2,1],[57,2,2],[57,3,3],[57,3,4],[57,3,5],[57,4,6],[58,3,7],[58,4,6]],[],[[2,4,0],[2,4,4],[2,5,3],[2,6,2],[20,4,0],[20,5,3],[20,6,2],[22,5,0],[27,4,7],[32,4,5],[32,5,5],[32,6,4],[33,2,5],[33,6,6],[33,7,7],[46,0,2],[46,0,4],[46,1,3],[52,6,2],[55,0,4],[59,5,0],[59,6,1],[63,5,0],[63,6,1]],[[2,3,4],[2,4,3],[2,7,0],[3,3,7],[20,7,0],[27,3,7],[27,7,6],[27,7,7],[32,6,2],[32,7,0],[32,7,1],[33,1,5],[33,5,5],[45,1,2],[45,2,3],[45,3,3],[46,1,1],[46,1,2],[46,1,6],[46,2,6],[52,6,1],[52,7,0],[52,7,2],[53,7,7],[55,0,3],[59,6,0],[59,7,0],[59,7,1],[60,4,6],[60,5,7],[63,6,0],[63,7,0],[63,7,1]],[[4,1,0],[5,2,7],[5,3,7],[10,1,2],[10,2,2],[10,2,3],[11,1,5],[11,1,6],[11,2,4],[12,2,2],[13,1,7],[13,2,6],[18,2,2],[18,2,3],[18,3,2],[19,5,3],[21,2,2],[24,2,2],[25,2,7],[25,3,6],[28,2,2],[29,2,7],[29,3,6],[33,7,4],[35,0,4],[35,0,5],[35,1,7],[40,1,2],[40,2,2],[40,2,3],[41,1,5],[41,1,6],[41,2,4],[45,1,0],[45,1,1],[45,2,0],[45,2,1],[45,2,2],[55,1,0],[55,1,1],[55,2,1],[55,2,2],[56,4,7],[61,1,2],[61,2,2],[61,2,3],[62,1,5],[62,1,6],[62,2,4]],[],[[4,2,0],[4,2,1],[5,3,6],[10,1,0],[10,1,3],[10,2,1],[10,2,4],[10,3,2],[10,3,3],[11,0,5],[11,0,6],[11,0,7],[11,1,4],[11,1,7],[11,2,3],[11,2,5],[11,2,6],[11,3,3],[11,3,4],[12,1,0],[12,1,2],[12,2,0],[12,2,1],[12,2,3],[12,3,1],[12,3,2],[13,2,7],[13,3,5],[13,3,6],[18,1,3],[18,2,4],[18,3,1],[18,3,3],[18,4,0],[19,4,2],[19,4,4],[19,5,2],[19,6,3],[19,6,4],[21,1,0],[21,1,2],[21,2,0],[21,2,1],[21,2,3],[21,3,1],[21,3,2],[22,7,2],[24,1,0],[24,1,2],[24,2,0],[24,2,1],[24,2,3],[24,3,1],[24,3,2],[25,1,7],[25,2,6],[25,3,5],[27,1,1],[28,1,0],[28,1,2],[28,2,0],[28,2,1],[28,2,3],[28,3,1],[28,3,2],[29,1,7],[29,2,6],[29,3,5],[31,5,2],[33,6,4],[33,7,3],[33,7,5],[34,0,4],[34,1,0],[34,1,4],[34,2,0],[34,3,1],[35,0,3],[35,0,6],[35,1,4],[35,1,5],[35,2,7],[40,1,0],[40,1,3],[40,2,1],[40,2,4],[40,3,2],[40,3,3],[41,0,5],[41,0,6],[41,0,7],[41,1,4],[41,1,7],[41,2,3],[41,2,5],[41,2,6],[41,3,3],[41,3,4],[45,3,1],[45,3,2],[45,4,2],[46,5,5],[46,6,5],[55,1,2],[55,2,0],[55,2,3],[55,3,1],[55,3,2],[55,3,3],[56,1,7],[56,3,6],[56,3,7],[56,4,6],[56,5,6],[56,5,7],[61,1,0],[61,1,3],[61,2,1],[61,2,4],[61,3,2],[61,3,3],[62,0,5],[62,0,6],[62,0,7],[62,1,4],[62,1,7],[62,2,3],[62,2,5],[62,2,6],[62,3,3],[62,3,4]],[[10,2,0],[10,3,1],[40,2,0],[40,3,1],[55,3,0],[55,4,0],[61,2,0],[61,3,1]],[]],"colorGroups":[{"label":"Cape/Armor/Pants","items":[{"index":14,"huedel":0,"bright":0.13,"sat":1},{"index":13,"huedel":0,"bright":0.22,"sat":0.17647058823529427},{"index":11,"huedel":0,"bright":0.33,"sat":0.15492957746478864}],"red":31,"green":0,"blue":0,"bright":-0.12,"sat":1,"huebr":1},{"label":"Armor Fringe & Boots","items":[{"index":15,"huedel":0,"bright":0.2795698924731183,"sat":1},{"index":10,"huedel":-0.00952380952380949,"bright":0.3870967741935483,"sat":1},{"index":9,"huedel":0.0688172043010753,"bright":0.55,"sat":1},{"index":5,"huedel":0,"bright":0.78,"sat":1}],"red":31,"green":22,"blue":0,"bright":-0.06,"sat":-0.5,"huebr":1.7333333333333334},{"label":"Hair","items":[{"index":6,"huedel":0,"bright":0.3870967741935483,"sat":-2.220446049250313e-16},{"index":12,"huedel":0,"bright":0.6774193548387096,"sat":0},{"index":7,"huedel":0,"bright":0.9,"sat":0}],"red":0,"green":20,"blue":31,"bright":-0.6,"sat":0.13,"huebr":2},{"label":"Eye","items":[{"index":8,"huedel":0,"bright":0.25806451612903225,"sat":0}],"red":6,"green":21,"blue":0,"bright":0,"sat":1,"huebr":2},{"label":"Skin","items":[{"index":3,"huedel":0,"bright":0.6129032258064516,"sat":0.3157894736842105},{"index":4,"huedel":-0.03571428571428559,"bright":0.44086021505376344,"sat":0.4878048780487805}],"red":31,"green":16,"blue":0,"bright":0,"sat":0,"huebr":1.5}],"palette":[{"r":0,"g":12,"b":0},{"r":0,"g":0,"b":0},{"r":31,"g":31,"b":31},{"r":25,"g":19,"b":13},{"r":21,"g":13,"b":7},{"r":31,"g":26,"b":11},{"r":4,"g":5,"b":5},{"r":10,"g":11,"b":12},{"r":4,"g":13,"b":0},{"r":21,"g":19,"b":8},{"r":16,"g":13,"b":6},{"r":27,"g":0,"b":0},{"r":7,"g":9,"b":9},{"r":18,"g":0,"b":0},{"r":11,"g":0,"b":0},{"r":11,"g":9,"b":4}]});
				initData.characters[12].presets.push({"name":"Box Art","description":"Changed things to look more like the Japanese box art.  The cape and scarf are given their own color group, and the armor fringe and hair color have been given a combined color group.","delta":[[],[],[],[],[],[[2,3,4],[2,4,3],[3,3,7],[27,3,7],[32,6,2],[32,7,0],[32,7,1],[33,1,5],[33,5,5],[46,1,1],[46,1,2],[52,6,1],[52,7,0],[52,7,2],[53,7,7],[55,0,3],[59,6,0],[60,4,6],[60,5,7],[63,6,0]],[[0,7,2],[2,0,2],[8,0,2],[8,1,2],[17,7,7],[20,0,2],[22,0,2],[36,7,1],[38,0,1],[52,2,5],[52,3,5],[59,0,2],[59,1,2],[63,0,2],[63,1,2]],[[2,4,0],[2,4,4],[2,5,3],[2,6,2],[5,0,1],[5,1,2],[5,2,2],[5,3,2],[5,3,3],[5,4,2],[5,4,3],[5,5,2],[5,5,3],[5,6,1],[11,1,2],[13,0,0],[13,0,1],[13,1,1],[13,1,2],[13,2,1],[13,3,1],[13,5,0],[20,4,0],[20,5,3],[20,6,2],[22,5,0],[23,5,2],[23,6,2],[23,7,2],[25,0,2],[27,4,7],[27,6,2],[27,7,1],[29,0,1],[32,4,5],[32,5,5],[32,6,4],[33,2,5],[33,6,6],[33,7,7],[39,7,3],[41,0,2],[41,1,2],[41,3,1],[46,0,2],[46,0,4],[46,1,3],[46,2,1],[50,7,1],[52,6,2],[53,0,0],[53,0,1],[53,0,2],[53,1,2],[53,1,3],[53,2,4],[55,0,4],[59,5,0],[59,6,1],[60,3,6],[60,4,7],[62,0,3],[63,5,0],[63,6,1]],[[2,5,1],[2,5,2],[5,1,1],[5,2,1],[5,3,1],[5,4,1],[5,5,1],[11,0,1],[11,1,1],[11,2,1],[11,3,1],[13,1,0],[13,2,0],[13,3,0],[13,4,0],[20,4,3],[20,5,1],[20,5,2],[22,4,0],[23,1,3],[23,2,2],[23,3,2],[23,4,2],[23,5,1],[23,6,1],[23,7,1],[25,0,0],[25,0,1],[25,1,1],[27,5,1],[27,6,0],[27,6,1],[27,7,0],[32,5,4],[32,6,3],[39,6,2],[39,7,1],[39,7,2],[41,0,1],[41,1,1],[41,2,1],[43,7,3],[46,0,3],[50,6,1],[50,7,2],[52,7,3],[53,0,3],[53,1,4],[53,2,5],[55,0,5],[60,7,2],[62,0,2],[62,1,2],[62,2,1],[62,3,1]],[[0,1,0],[0,1,1],[0,1,2],[0,2,3],[0,2,4],[0,2,5],[0,3,6],[1,2,7],[1,3,6],[2,7,0],[3,2,2],[3,3,1],[3,3,5],[3,5,4],[3,7,3],[4,3,0],[4,5,0],[4,6,1],[5,0,3],[5,1,6],[5,2,4],[5,4,5],[5,4,6],[5,5,5],[5,5,6],[5,6,5],[5,6,7],[6,2,0],[6,2,1],[6,2,2],[6,3,3],[6,3,4],[6,3,5],[6,4,6],[7,3,7],[7,4,6],[9,3,2],[9,4,1],[9,7,6],[10,0,1],[10,3,4],[10,4,1],[10,4,2],[10,5,1],[10,5,2],[10,5,4],[10,6,1],[10,6,3],[10,6,5],[11,3,5],[11,4,2],[11,4,3],[11,5,2],[11,5,3],[11,5,5],[11,6,2],[11,6,4],[11,6,6],[12,3,3],[12,3,4],[12,4,2],[12,4,3],[12,4,5],[12,4,6],[12,5,3],[12,5,4],[12,6,4],[13,0,3],[13,1,5],[13,2,3],[13,4,2],[13,4,3],[13,4,5],[13,5,4],[13,6,4],[13,6,5],[16,1,0],[16,1,1],[16,1,2],[16,1,3],[16,2,1],[16,2,4],[17,1,7],[17,2,5],[17,2,6],[18,3,4],[18,4,2],[18,5,2],[18,5,4],[18,6,2],[18,6,3],[18,6,5],[19,0,1],[19,1,2],[19,2,4],[19,3,3],[19,3,7],[20,7,0],[20,7,1],[21,3,3],[21,3,4],[21,4,2],[21,4,3],[21,4,5],[21,4,6],[21,5,3],[21,5,4],[21,6,4],[22,6,1],[23,2,4],[23,3,3],[23,3,7],[24,0,1],[24,3,3],[24,3,4],[24,4,2],[24,4,3],[24,4,5],[24,4,6],[24,5,3],[24,5,4],[24,6,4],[25,1,5],[25,2,3],[25,4,2],[25,4,3],[25,4,5],[25,5,4],[25,6,4],[25,6,5],[26,2,7],[26,3,6],[27,2,1],[27,7,5],[27,7,6],[27,7,7],[28,3,3],[28,3,4],[28,4,2],[28,4,3],[28,4,5],[28,4,6],[28,5,3],[28,5,4],[28,6,4],[29,0,6],[29,1,5],[29,2,3],[29,4,2],[29,4,3],[29,4,5],[29,5,4],[29,6,4],[29,6,5],[30,4,1],[30,5,1],[30,5,2],[30,6,2],[30,6,3],[30,6,4],[30,7,5],[34,0,6],[34,3,0],[34,4,0],[34,4,2],[34,6,0],[34,6,2],[35,4,7],[35,5,7],[36,1,0],[36,1,1],[36,2,2],[36,2,3],[36,2,4],[36,3,5],[37,1,7],[37,2,6],[37,3,5],[38,3,5],[38,7,0],[39,2,3],[39,3,2],[39,3,6],[40,0,1],[40,3,4],[40,4,1],[40,4,2],[40,5,1],[40,5,2],[40,5,4],[40,6,1],[40,6,3],[40,6,5],[41,3,5],[41,4,2],[41,4,3],[41,5,2],[41,5,3],[41,5,5],[41,6,2],[41,6,4],[41,6,6],[45,3,4],[45,4,4],[45,4,5],[45,4,6],[46,0,6],[46,1,6],[46,2,6],[46,3,6],[46,6,0],[46,6,3],[47,1,1],[47,2,2],[47,3,3],[47,5,7],[48,5,0],[48,5,1],[48,6,2],[49,4,4],[49,4,5],[49,4,6],[49,5,3],[49,5,7],[49,6,2],[52,5,0],[52,7,7],[53,4,5],[55,0,0],[55,0,1],[55,3,4],[55,4,1],[55,4,2],[55,5,1],[55,5,2],[55,5,4],[55,6,1],[55,6,3],[55,6,5],[56,0,7],[56,3,4],[56,4,3],[56,4,5],[56,5,2],[56,5,3],[56,5,4],[56,6,1],[56,6,2],[56,6,3],[56,6,5],[56,6,6],[57,2,0],[57,2,1],[57,2,2],[57,3,3],[57,3,4],[57,3,5],[57,4,6],[58,3,7],[58,4,6],[59,7,0],[59,7,1],[60,5,2],[60,6,4],[60,7,5],[60,7,6],[60,7,7],[61,3,4],[61,4,1],[61,4,2],[61,5,1],[61,5,2],[61,5,4],[61,6,1],[61,6,3],[61,6,5],[62,3,5],[62,4,2],[62,4,3],[62,5,2],[62,5,3],[62,5,5],[62,6,2],[62,6,4],[62,6,6],[63,7,0],[63,7,1]],[[3,2,3],[3,3,4],[3,6,3],[4,0,1],[4,4,0],[5,2,5],[8,6,2],[8,7,2],[9,3,3],[10,4,4],[11,4,5],[12,0,1],[12,4,4],[13,2,4],[13,4,4],[18,4,4],[19,0,4],[19,1,3],[19,2,5],[21,0,1],[21,4,4],[22,5,2],[22,7,1],[23,2,5],[23,3,6],[24,4,4],[25,2,4],[25,4,4],[27,1,3],[27,2,2],[28,0,1],[28,4,4],[29,2,4],[29,4,4],[31,5,4],[32,6,6],[32,7,6],[34,5,1],[38,2,4],[38,3,6],[39,2,4],[39,3,5],[39,4,7],[39,6,7],[40,4,4],[41,4,5],[45,1,4],[46,3,0],[46,4,4],[46,5,3],[47,4,7],[52,6,7],[53,4,6],[53,5,7],[55,4,4],[56,6,4],[60,6,3],[61,0,1],[61,4,4],[62,4,5]],[[4,1,0],[5,2,7],[5,3,7],[10,1,2],[10,2,2],[10,2,3],[11,1,5],[11,1,6],[11,2,4],[12,2,2],[13,1,7],[13,2,6],[18,2,2],[18,2,3],[18,3,2],[19,5,3],[21,2,2],[24,2,2],[25,2,7],[25,3,6],[28,2,2],[29,2,7],[29,3,6],[33,7,4],[35,0,4],[35,0,5],[35,1,7],[40,1,2],[40,2,2],[40,2,3],[41,1,5],[41,1,6],[41,2,4],[45,1,0],[45,1,1],[45,2,0],[45,2,1],[45,2,2],[55,1,0],[55,1,1],[55,2,1],[55,2,2],[56,4,7],[61,1,2],[61,2,2],[61,2,3],[62,1,5],[62,1,6],[62,2,4]],[],[[4,2,0],[4,2,1],[5,3,6],[10,1,0],[10,1,3],[10,2,1],[10,2,4],[10,3,2],[10,3,3],[11,0,5],[11,0,6],[11,0,7],[11,1,4],[11,1,7],[11,2,3],[11,2,5],[11,2,6],[11,3,3],[11,3,4],[12,1,0],[12,1,2],[12,2,0],[12,2,1],[12,2,3],[12,3,1],[12,3,2],[13,2,7],[13,3,5],[13,3,6],[18,1,3],[18,2,4],[18,3,1],[18,3,3],[18,4,0],[19,4,2],[19,4,4],[19,5,2],[19,6,3],[19,6,4],[21,1,0],[21,1,2],[21,2,0],[21,2,1],[21,2,3],[21,3,1],[21,3,2],[22,7,2],[24,1,0],[24,1,2],[24,2,0],[24,2,1],[24,2,3],[24,3,1],[24,3,2],[25,1,7],[25,2,6],[25,3,5],[27,1,1],[28,1,0],[28,1,2],[28,2,0],[28,2,1],[28,2,3],[28,3,1],[28,3,2],[29,1,7],[29,2,6],[29,3,5],[31,5,2],[33,6,4],[33,7,3],[33,7,5],[34,0,4],[34,1,0],[34,1,4],[34,2,0],[34,3,1],[35,0,3],[35,0,6],[35,1,4],[35,1,5],[35,2,7],[40,1,0],[40,1,3],[40,2,1],[40,2,4],[40,3,2],[40,3,3],[41,0,5],[41,0,6],[41,0,7],[41,1,4],[41,1,7],[41,2,3],[41,2,5],[41,2,6],[41,3,3],[41,3,4],[45,3,1],[45,3,2],[45,4,2],[46,5,5],[46,6,5],[55,1,2],[55,2,0],[55,2,3],[55,3,1],[55,3,2],[55,3,3],[56,1,7],[56,3,6],[56,3,7],[56,4,6],[56,5,6],[56,5,7],[61,1,0],[61,1,3],[61,2,1],[61,2,4],[61,3,2],[61,3,3],[62,0,5],[62,0,6],[62,0,7],[62,1,4],[62,1,7],[62,2,3],[62,2,5],[62,2,6],[62,3,3],[62,3,4]],[[10,2,0],[10,3,1],[40,2,0],[40,3,1],[55,3,0],[55,4,0],[61,2,0],[61,3,1]],[[0,4,4],[1,1,6],[1,2,4],[1,2,5],[1,3,3],[1,3,4],[1,4,4],[1,4,5],[1,5,4],[1,5,5],[1,5,6],[1,6,6],[1,7,6],[6,5,4],[7,2,6],[7,3,4],[7,3,5],[7,4,3],[7,4,4],[7,5,4],[7,5,5],[7,6,4],[7,6,5],[7,6,6],[7,7,6],[9,0,6],[16,3,0],[16,3,2],[16,4,1],[16,4,3],[16,5,4],[17,1,4],[17,2,2],[17,2,3],[17,3,3],[17,3,6],[17,3,7],[17,4,2],[17,4,3],[17,4,4],[17,4,5],[17,5,4],[17,6,4],[26,1,6],[26,2,4],[26,2,5],[26,3,3],[26,3,4],[26,4,4],[26,4,5],[26,5,5],[26,5,6],[26,6,6],[26,7,6],[30,6,0],[30,7,1],[31,5,5],[31,5,7],[31,6,3],[31,6,6],[31,6,7],[31,7,6],[32,0,2],[32,0,3],[32,0,4],[32,1,2],[32,1,5],[32,2,5],[36,4,3],[37,1,5],[37,2,3],[37,2,4],[37,3,2],[37,3,3],[37,4,3],[37,4,4],[37,5,3],[37,5,4],[37,5,5],[37,6,5],[37,7,5],[45,1,2],[45,2,3],[45,3,3],[47,1,7],[47,2,6],[47,2,7],[47,3,5],[47,3,6],[47,4,4],[47,4,5],[47,5,4],[47,5,5],[48,7,0],[49,4,2],[49,5,0],[49,5,1],[49,6,0],[49,7,0],[49,7,1],[50,6,6],[50,6,7],[50,7,7],[52,0,0],[52,0,1],[52,0,2],[52,1,2],[52,2,2],[53,1,7],[57,5,4],[58,2,6],[58,3,4],[58,3,5],[58,4,3],[58,4,4],[58,5,4],[58,5,5],[58,6,4],[58,6,5],[58,6,6],[58,7,6],[60,0,6]]],"colorGroups":[{"label":"Armor & Pants","items":[{"index":14,"huedel":0,"bright":0.38,"sat":0.4117647058823529},{"index":13,"huedel":0,"bright":0.5483870967741936,"sat":0.17647058823529427},{"index":11,"huedel":0,"bright":0.7634408602150536,"sat":0.15492957746478864}],"red":0,"green":31,"blue":13,"bright":-0.69,"sat":1,"huebr":1},{"label":"Hair & Cape","items":[{"index":5,"huedel":0,"bright":0.39,"sat":0},{"index":7,"huedel":0,"bright":0.68,"sat":0},{"index":8,"huedel":0,"bright":0.97,"sat":0.01}],"red":11,"green":0,"blue":31,"bright":-0.15,"sat":0.24,"huebr":1},{"label":"Hair & Fringe","items":[{"index":15,"huedel":0,"bright":0.26,"sat":1},{"index":12,"huedel":0,"bright":0.46,"sat":0},{"index":9,"huedel":0,"bright":0.67,"sat":0},{"index":10,"huedel":0,"bright":1,"sat":1}],"red":31,"green":20,"blue":0,"bright":-0.57,"sat":1,"huebr":2},{"label":"Eye","items":[{"index":6,"huedel":0,"bright":0.33,"sat":1}],"red":31,"green":8,"blue":0,"bright":-0.32,"sat":0,"huebr":2},{"label":"Skin","items":[{"index":3,"huedel":0,"bright":0.6129032258064516,"sat":0.3157894736842105},{"index":4,"huedel":-0.03571428571428559,"bright":0.44086021505376344,"sat":0.4878048780487805}],"red":31,"green":16,"blue":0,"bright":0,"sat":0,"huebr":1.5}],"palette":[{"r":0,"g":12,"b":0},{"r":0,"g":0,"b":0},{"r":31,"g":31,"b":31},{"r":25,"g":19,"b":13},{"r":21,"g":13,"b":7},{"r":10,"g":8,"b":13},{"r":17,"g":4,"b":0},{"r":17,"g":14,"b":23},{"r":24,"g":19,"b":31},{"r":16,"g":11,"b":0},{"r":24,"g":16,"b":0},{"r":0,"g":16,"b":7},{"r":11,"g":7,"b":0},{"r":0,"g":11,"b":5},{"r":0,"g":8,"b":3},{"r":6,"g":4,"b":0}]});
				//}}}

				// FuSoYa
				//{{{
				initData.characters[13].presets.push({"name":"Alternate","description":"Killed Regen Glow, used Regen color to replace white in hair","delta":[[[48,3,2],[48,3,3],[48,3,4],[48,4,1],[48,4,2],[48,4,3],[48,4,4],[48,4,5],[48,5,1],[48,5,2],[48,5,3],[48,5,4],[48,5,5],[48,6,1],[48,6,2],[48,6,3],[48,6,4],[48,6,5],[48,7,2],[48,7,3],[48,7,4],[49,1,0],[49,2,1],[49,2,2],[49,3,3],[49,4,4],[49,5,5],[49,6,5],[49,7,5],[50,1,5],[50,1,6],[50,1,7],[50,2,4],[50,3,3],[50,4,2],[50,5,1],[50,6,1],[50,7,1],[51,3,0],[51,4,1],[51,5,1],[51,6,1],[51,7,0],[52,0,5],[52,1,5],[52,2,6],[52,2,7],[53,0,0],[53,1,0],[53,2,0],[53,3,0],[53,4,0],[55,0,7],[55,1,6],[55,2,7],[55,3,7],[55,5,7],[55,7,7]],[[49,2,0],[49,3,1],[49,3,2],[49,4,3],[49,5,4],[49,6,4],[49,7,4],[50,2,5],[50,2,6],[50,2,7],[50,3,4],[50,4,3],[50,5,2],[50,6,2],[50,7,2],[51,4,0],[51,5,0],[51,6,0],[52,0,4],[52,1,4],[52,2,5],[52,3,5],[52,3,6],[52,3,7],[52,4,5],[52,7,7],[53,0,1],[53,1,1],[53,2,1],[53,3,1],[53,4,1],[53,5,0],[53,6,0],[53,7,0],[55,0,6],[55,1,5],[55,2,6],[55,3,6],[55,4,7],[55,5,6],[55,6,7],[56,0,0],[56,1,0],[56,2,0]],[],[],[],[],[],[[0,5,1],[0,6,2],[1,3,6],[1,4,5],[1,6,5],[1,7,5],[2,2,3],[3,0,5],[3,1,6],[3,2,7],[4,0,3],[4,1,4],[6,6,0],[6,7,1],[7,4,5],[7,5,4],[7,7,4],[8,3,2],[9,0,4],[9,1,4],[9,2,5],[9,3,6],[10,1,2],[10,2,3],[12,0,3],[14,6,0],[14,7,1],[15,6,6],[15,6,7],[16,0,2],[16,3,3],[16,4,2],[17,2,3],[17,3,4],[17,4,5],[17,5,6],[18,0,4],[18,1,3],[19,0,3],[19,1,2],[19,4,7],[20,2,3],[21,0,3],[22,2,3],[23,0,5],[23,1,6],[23,2,7],[26,3,6],[26,4,5],[26,6,5],[26,7,5],[27,0,5],[27,1,6],[27,2,7],[28,0,3],[30,5,1],[30,6,0],[30,7,0],[31,5,3],[31,6,4],[32,1,0],[32,2,1],[32,3,2],[32,5,4],[32,6,5],[32,7,1],[33,2,3],[33,2,6],[33,3,4],[33,3,6],[33,4,7],[34,0,0],[34,0,1],[34,0,4],[34,0,7],[34,1,0],[34,1,5],[34,2,1],[34,3,2],[34,4,3],[36,4,1],[36,5,2],[37,2,6],[37,3,5],[37,5,5],[37,6,5],[37,7,5],[38,1,3],[39,0,6],[39,1,7],[42,5,0],[43,5,2],[43,5,3],[43,6,4],[43,6,7],[45,1,3],[45,2,0],[45,2,5],[45,4,3],[46,0,6],[46,1,4],[46,1,7],[46,2,3],[46,4,0],[46,4,6],[46,5,1],[46,5,7],[49,6,1],[49,7,2],[50,4,6],[50,5,5],[50,7,5],[52,3,3],[53,0,5],[53,1,5],[53,2,6],[53,3,7],[57,5,0],[57,6,1],[57,7,2],[58,5,7],[58,7,6],[59,3,3],[60,0,6],[60,1,6],[60,2,7],[61,0,4],[61,1,1],[61,1,3],[61,1,5],[61,2,1],[61,2,3],[61,3,1],[61,3,4],[61,4,1],[61,5,2],[63,3,3]],[[63,0,2],[63,1,2]],[],[],[],[],[],[],[]],"colorGroups":[{"label":"Robe","items":[{"index":15,"huedel":0,"bright":0.19354838709677422,"sat":1},{"index":14,"huedel":0,"bright":0.3440860215053763,"sat":0.8125},{"index":5,"huedel":0,"bright":0.5376344086021506,"sat":0.52},{"index":9,"huedel":0.021671826625387247,"bright":0.7096774193548386,"sat":0.36363636363636354}],"red":11,"green":11,"blue":12,"bright":-0.44,"sat":0,"huebr":1.3684210526315788},{"label":"Hair","items":[{"index":10,"huedel":0.09625668449197855,"bright":0.4408602150537635,"sat":0.5609756097560976},{"index":12,"huedel":0.09625668449197855,"bright":0.5698924731182796,"sat":0.4339622641509434},{"index":6,"huedel":0,"bright":0.6989247311827956,"sat":0.3538461538461538},{"index":11,"huedel":0,"bright":0.7956989247311826,"sat":0.2297297297297296},{"index":13,"huedel":0,"bright":0.956989247311828,"sat":0.0898876404494382},{"index":7,"huedel":0,"bright":1,"sat":0}],"red":31,"green":16,"blue":0,"bright":-0.62,"sat":0.57,"huebr":1.5454545454545454},{"label":"Eye","items":[{"index":8,"huedel":0,"bright":0.24731182795698925,"sat":1}],"red":0,"green":0,"blue":31,"bright":0,"sat":0,"huebr":1},{"label":"Skin","items":[{"index":3,"huedel":0,"bright":0.7204301075268816,"sat":0.4179104477611939},{"index":4,"huedel":0,"bright":0.5268817204301075,"sat":0.5714285714285714}],"red":31,"green":17,"blue":0,"bright":0,"sat":0,"huebr":1.5555555555555556}],"palette":[{"r":0,"g":12,"b":0},{"r":0,"g":0,"b":0},{"r":31,"g":31,"b":31},{"r":31,"g":23,"b":13},{"r":25,"g":17,"b":7},{"r":10,"g":10,"b":10},{"r":14,"g":8,"b":2},{"r":18,"g":12,"b":5},{"r":0,"g":0,"b":23},{"r":13,"g":13,"b":13},{"r":8,"g":6,"b":1},{"r":16,"g":10,"b":3},{"r":11,"g":8,"b":2},{"r":18,"g":11,"b":4},{"r":6,"g":6,"b":7},{"r":4,"g":4,"b":4}]});
				//}}}

			}
			else for(let c of initData.characters) c.presets = [];
			//}}}

		}

		data.currChar = 0;
		data.mode = 0; // Palette editor or graphics editor
		data.cgc = 0;  // color group change tracker (xor'd 0/1, used to detect change in undo/rdo)

		// Initialize undoStack
		undoStack = [];
		pushState();

		initInterface();

	}
	//}}}

	function initInterface()
	//{{{
	{
		// Reset Interface
		interfaceHolderDiv.textContent = "";
		let interfaceDiv = document.createElement("div");
		interfaceHolderDiv.appendChild(interfaceDiv);

		let presetHolder;

		let pixelTransform = [-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1];

		function updateInterface()
		//{{{
		{
			interfaceDiv.dispatchEvent(new CustomEvent("update"));
		}
		//}}}


		// Character Links
		//{{{
		{
			let charLinkList = document.createElement("div");
			interfaceDiv.appendChild(charLinkList);

			charLinkList.style.marginTop = "10px";
			charLinkList.style.display = "flex";
			charLinkList.style.justifyContent = "space-between";

			let links = [];
			interfaceDiv.addEventListener("update", function()
			{
				for(let link of links)
				{
					link.classList.remove("selected");
				}
				links[data.currChar].classList.add("selected");
			});

			for(let i=0;i<14;i++)
			{
				let n = i;
				let link = links[i] = document.createElement("span");
				link.textContent = data.characters[n].name;
				link.classList.add("charLink");
				link.addEventListener("click", function()
				{
					data.currChar = n;
					let e = new CustomEvent("characterChange",{detail:{charIndex:n}});
					interfaceDiv.dispatchEvent(e);
					updateInterface();
				});
				charLinkList.appendChild(link);
			}

		}
		//}}}

		// Sprite Canvas Init
		//{{{
		{
			let spriteCanvDiv = document.createElement("div");
			spriteCanvDiv.classList.add("spriteCanvas");
			spriteCanvDiv.style.marginTop = "10px";
			interfaceDiv.appendChild(spriteCanvDiv);

			let spriteCanv = document.createElement("canvas");
			spriteCanvDiv.appendChild(spriteCanv);
			spriteCanv.width = 896;
			spriteCanv.height = 96;
			spriteCanvDiv.style.marginLeft = "51px";
			spriteCanvDiv.style.border = "1px solid black";
			spriteCanvDiv.style.display = "inline-block";
			spriteCanv.style.display = "block"; // to kill whitespace underneath

			let ppp = 4;

			let overlay = attachSpriteSheetEditor(spriteCanv, updateInterface, pixelTransform, ppp);
			spriteCanvDiv.style.position = "relative";
			spriteCanvDiv.appendChild(overlay);

			interfaceDiv.addEventListener("update", function()
			{
				clearSpriteSheet(spriteCanv, ppp);
				drawSpriteSheet(spriteCanv, data.currChar, 0, ppp);
			});

		}
		//}}}

		// Undo/Redo Buttons & Preset Holder
		//{{{
		{
			let holderDiv = document.createElement("div");
			holderDiv.style.marginTop = "0.6em";
			interfaceDiv.appendChild(holderDiv);

			let undoBut = document.createElement("span");
			undoBut.classList.add("fauxButton");
			undoBut.classList.add("fauxButtonDisabled");
			undoBut.textContent = "Undo";
			undoBut.disabled = true;
			undoBut.style.marginLeft = "10px";
			undoBut.style.fontSize = "0.8em";
			holderDiv.appendChild(undoBut);

			undoBut.title = "Cntrl+Z";

			undoBut.addEventListener("click", zKeyFunc=function()
			{
				undoState();
				updateInterface();
			});

			let redoBut = document.createElement("span");
			redoBut.classList.add("fauxButton");
			redoBut.classList.add("fauxButtonDisabled");
			redoBut.textContent = "Redo";
			redoBut.disabled = true;
			redoBut.style.marginLeft = "10px";
			redoBut.style.fontSize = "0.8em";
			holderDiv.appendChild(redoBut);

			redoBut.title = "Cntrl+Y";

			redoBut.addEventListener("click", yKeyFunc=function()
			{
				redoState();
				updateInterface();
			});

			addEventListener("stackUpdate", function()
			{
				if(undoIndex>0)
				{ undoBut.classList.remove("fauxButtonDisabled"); undoBut.disabled = false; }
				else
				{    undoBut.classList.add("fauxButtonDisabled"); undoBut.disabled =  true; }

				if(undoIndex<undoStack.length-1)
				{ redoBut.classList.remove("fauxButtonDisabled"); redoBut.disabled = false; }
				else
				{    redoBut.classList.add("fauxButtonDisabled"); redoBut.disabled =  true; }
				
			});

			presetHolder = document.createElement("div");
			presetHolder.style.display = "inline-block";
			holderDiv.appendChild(presetHolder);
		}
		//}}}

		// Palette Modification Interface
		//{{{
		{
			let cgHolderDiv = document.createElement("div");
			cgHolderDiv.style.display = "flex";
			cgHolderDiv.style.border = "1px solid black";
			cgHolderDiv.style.marginTop = "0.6em";
			interfaceDiv.appendChild(cgHolderDiv);

			let colorGroupsDiv = document.createElement("div");
			colorGroupsDiv.style.width = "330px";
			cgHolderDiv.appendChild(colorGroupsDiv);

			let colorModHolderDiv = document.createElement("div");
			colorModHolderDiv.style.marginLeft = "40px";
			cgHolderDiv.appendChild(colorModHolderDiv);

			let colorModifierDiv = document.createElement("div");
			colorModHolderDiv.appendChild(colorModifierDiv);

			let currColBut;
			let prevColBut = -1;
			let currColGroup;
			let newColGroup = false;
			let prevColGroup = -1;
			let prevChar = -1;
			let prevCgc = 0;

			let enumColButGroup  = 1000;
			let enumColButNew = 1001;

			interfaceDiv.addEventListener("update", function()
			{
				// Set mode back to palette mode on char switch
				//{{{
				if(prevChar!=data.currChar) data.mode = 0;
				//}}}

				// Check if need to redo color group buttons after undo/redo
				//{{{
				{
					if(data.cgc!=prevCgc) prevChar = -1;
					prevCgc = data.cgc;
				}
				//}}}

				// Check if in Palette Mode
				//{{{
				if(data.mode==0) cgHolderDiv.style.display = "flex";
				else
				{
					cgHolderDiv.style.display = "none";
					return;
				}
				//}}}

				// Inject Color Group Buttons on left
				if(prevChar!=data.currChar || newColGroup)
				//{{{
				{
					let currChar = data.currChar;
					prevChar = currChar;
					if(!newColGroup) currColGroup = 0;
					prevColGroup = -1;
					newColGroup = false;
					
					colorGroupsDiv.textContent = "";

					let cgl = data.characters[currChar].colorGroups;


					function makeBut(i)
					//{{{
					{
						let d = document.createElement("div");
						d.style.border = "1px solid black";
						d.style.padding = "20px";
						d.style.fontFamily = "monospace";
						d.style.borderBottom = "0";
						d.style.borderLeft = "0";
						d.style.setProperty("--normCol", "#f4f4f4");
						d.style.setProperty("--hoverCol", "#e8fff8");
						if(i==0) d.style.borderTop = "0";
						colorGroupsDiv.appendChild(d);

						d.addEventListener("update", function()
						{
							if(i==currColGroup)
							{
								d.style.boxShadow = "";
								d.style.backgroundColor = "";
								d.style.borderRight = "0";
								d.classList.remove("hoverColor");
							}
							else
							{
								d.style.boxShadow = "inset -4px 0px 10px #999";
								d.style.borderRight = "1px solid black";
								d.classList.add("hoverColor");
								if(d.parentElement.lastElementChild==d) d.style.boxShadow+= ", 0px 1px black";
							}
						});

						return d;
					}
					//}}}

					// Preset Buttons
					//{{{
					{
						presetHolder.textContent = "";
						let c = initData.characters[data.currChar];

						function makeBut(name, description)
						{
							let but = document.createElement("span");
							but.classList.add("fauxButton");
							but.textContent = name;
							but.style.fontSize = "0.9em";
							but.style.marginLeft = "20px";
							presetHolder.appendChild(but);
							but.title = description;
							return but;
						}

						// Label
						{
							let lab = document.createElement("span");
							lab.textContent = c.name+" Presets: ";;
							lab.style.fontSize = "1.1em";
							lab.style.position = "relative";
							lab.style.top = "0.3em";
							lab.style.marginLeft = "150px";
							presetHolder.appendChild(lab);
						}

						// Reset button
						{
							let paletteBut = makeBut("Default", "");
							paletteBut.addEventListener("click", function()
							{
								let ic = JSON.parse(JSON.stringify(initData.characters[data.currChar]));
								data.characters[data.currChar] = ic;
								prevChar = -1;
								data.cgc^= 1;
								pushState();
								updateInterface();
							});
						}

						// Preset buttons
						for(let pre of c.presets)
						{
							let paletteBut = makeBut(pre.name, pre.description);
							paletteBut.addEventListener("click", function()
							{
								let ic = JSON.parse(JSON.stringify(initData.characters[data.currChar]));
								data.characters[data.currChar] = ic;
								let nc = data.characters[data.currChar];
								applyTilesheetDelta(pre.delta);
								nc.colorGroups = JSON.parse(JSON.stringify(pre.colorGroups));
								nc.palette = JSON.parse(JSON.stringify(pre.palette));
								prevChar = -1;
								data.cgc^= 1;
								pushState();
								updateInterface();
							});
						}


					}
					//}}}

					// Color Group Buttons
					//{{{
					for(let i=0;i<cgl.length;i++)
					{
						let d = makeBut(i);

						d.addEventListener("click", function()
						{
							if(i!=currColGroup)
							{
								currColGroup = i;
								updateInterface();
							}
						});

						let cg = cgl[i];
						let cgi = cg.items;
						let ld = document.createElement("span");
						ld.textContent = cg.label;
						ld.style.fontWeight = "bold";
						ld.style.marginLeft = "10px";
						d.appendChild(ld);
						d.appendChild(document.createElement("br"));
						let pld = document.createElement("div");
						pld.style.backgroundColor = "#fff";
						pld.style.border = "1px solid #888";
						pld.style.marginTop = "6px";
						pld.style.padding = "10px 12px";
						pld.style.borderRadius = "15px";
						pld.style.display = "inline-flex";
						pld.style.alignItems = "center";
						d.appendChild(pld);
						for(let c of cgi)
						{
							let canv = document.createElement("canvas");
							canv.width = 20;
							canv.height = 20;
							pld.appendChild(canv);

							canv.addEventListener("update", function()
							{
								let ctx = canv.getContext("2d");
								ctx.fillStyle = convertPaletteToCode(data.currChar, c.index);
								ctx.fillRect(0, 0, canv.width, canv.height);
							});

						}

					}
					//}}}

					// Add "Make Group" button
					//{{{
					{
						let avail = ungroupedPaletteSlots(currChar);
						if(avail.length>0)
						{
							let l = cgl.length;
							let d = makeBut(l);

							d.textContent = "New Color Group";

							d.addEventListener("click", function()
							{
								if(l!=currColGroup)
								{
									currColGroup = l;
									updateInterface();
								}
							});
						}
					}
					//}}}

				}
				//}}}

				// Inject Color Buttons along the top
				if(prevColGroup!=currColGroup)
				//{{{
				{
					prevColGroup = currColGroup;
					currColBut = enumColButGroup;
					prevColBut = -1;

					colorModHolderDiv.textContent = "";

					let currChar = data.currChar;
					let pcodes = convertPaletteToCodes(currChar);
					let cgs = data.characters[currChar].colorGroups;

					if(currColGroup<cgs.length)
					{
						let cg = cgs[currColGroup];
						let cgi = cg.items;

						// Color Buttons along the top
						//{{{
						{
							const butHeight = 20;
							let holderDiv = document.createElement("div");
							colorModHolderDiv.appendChild(holderDiv);

							function makeBut(colButNum)
							{
								let but = document.createElement("div");
								but.classList.add("pushButton");
								holderDiv.appendChild(but);
								but.addEventListener("update", function()
								{
									if(currColBut==colButNum) but.classList.add("pushButtonDown");
									else                   but.classList.remove("pushButtonDown");
								});
								return but;
							}

							// Group Button
							{
								let but = makeBut(enumColButGroup);
								let i = document.createElement("div");
								i.textContent = "Group";
								but.style.marginRight = "10px";
								but.appendChild(i);

								// Set to down, with the transition disabled
								setTimeout(()=>
								{
									but.style.transitionDuration = "0s";
									but.classList.add("pushButtonDown");
									but.offsetHeight; // trigger reflow changes(?)
									but.style.transitionDuration = "";
								});

								but.addEventListener("click", function()
								{
									currColBut = enumColButGroup;
									updateInterface();
								});
							}

							// Color Buttons
							for(let i in cgi)
							{
								let but = makeBut(i);
								let div = document.createElement("div");
								div.textContent = ".";
								div.style.width = "1.8em";
								div.style.userSelect = "none";
								div.style.borderRadius = "5px";
								but.appendChild(div);

								div.addEventListener("update", function()
								{
									let c = convertPaletteToCode(data.currChar, cgi[i].index);
									div.style.backgroundColor = c;
									div.style.color = c;
								});

								but.addEventListener("click", function()
								{
									currColBut = i;
									updateInterface();
								});
							}

							// Add Palette Slot
							{
								// determine if there are empty slots, if so add button
								let avail = ungroupedPaletteSlots(currChar);
								if(avail.length>0)
								{
									let but = makeBut(enumColButNew);
									let d = document.createElement("div");
									d.textContent = "+";
									but.appendChild(d);
									but.style.width = "1.5em";
									but.style.textAlign = "center";

									but.addEventListener("click", function()
									{
										currColBut = enumColButNew;
										updateInterface();
									});
								}

							}
						}
						//}}}

					}
					else
					{
						currColBut = enumColButNew;
					}

					// Append Color modifiaction interface under buttons
					colorModHolderDiv.appendChild(colorModifierDiv);

					// mdf Color Group Functions
					//{{{

					mdf.colGroupRename = function(name)
					{
						if(currColGroup<0 || currColGroup>=cgs.length) return;
						cgs[currColGroup].label = name;
						prevChar = -1;
						updateInterface();
					}

					mdf.colGroupMoveUp = function(num=1)
					{
						if(currColGroup<num || currColGroup>=cgs.length) return;
						cgs.splice(currColGroup-num, 0, cgs.splice(currColGroup,1)[0]);
						prevChar = -1;
						updateInterface();
					}

					mdf.colGroupMoveDown = function(num=1)
					{
						if(currColGroup<0 || currColGroup>=cgs.length-num) return;
						cgs.splice(currColGroup+num, 0, cgs.splice(currColGroup,1)[0]);
						prevChar = -1;
						updateInterface();
					}

					mdf.colGroupDelete = function()
					{
						if(currColGroup<0 || currColGroup>=cgs.length-1) return;
						cgs.splice(currColGroup,1);
						prevChar = -1;
						updateInterface();
					}

					//}}}

				}
				//}}}

				// Inject Group/Color Modification interface
				if(prevColBut!=currColBut)
				//{{{
				{
					prevColBut = currColBut;

					colorModifierDiv.textContent = "";

					let currChar = data.currChar;

					function recolor()
					//{{{
					{
						let cgs = data.characters[currChar].colorGroups;
						let cg = cgs[currColGroup];
						let cgi = cg.items;

						let dr = cg.red/31;
						let dg = cg.green/31;
						let db = cg.blue/31;
						let hba = cg.huebr;

						let hdhue = rgbToHue(dr,dg,db);
						let hdbr = (dr+dg+db)/3;
						let hdsa; if(hdbr==0) hdsa=0; else hdsa = Math.min(dr,dg,db)/hdbr;
						let hdhueq = hueToRgb(hdhue).reduce((s,v)=>(s+v))/hba;

						let dbr = cg.bright;
						let dsa = cg.sat;

						for(let c of cgi)
						{
							let hd = c.huedel;
							let br = c.bright;
							let sa = 1-c.sat;

							let nr,ng,nb;
							{
								let nh = hueSum(hdhue,hd);
								[nr,ng,nb] = hueToRgb(nh);
								let hb = [nr,ng,nb].reduce((s,v)=>s+v);
								nr = 3/hb/hba/hdhueq*nr*hdbr*(1-hdsa)+hdbr*hdsa;
								ng = 3/hb/hba/hdhueq*ng*hdbr*(1-hdsa)+hdbr*hdsa;
								nb = 3/hb/hba/hdhueq*nb*hdbr*(1-hdsa)+hdbr*hdsa;
							}

							let pb = 1;
							//if(dbr<0) br*= 1+dbr;
							//if(dbr>0) pb = 1-dbr;
							br*= 1+dbr

							if(dsa<0) sa = 1-(1-sa)*(1+dsa);
							if(dsa>0) sa*= 1-dsa;

							let r = 3*nr*br*(1-sa) + br*sa;
							r = 1-(1-r)*pb;
							let g = 3*ng*br*(1-sa) + br*sa;
							g = 1-(1-g)*pb;
							let b = 3*nb*br*(1-sa) + br*sa;
							b = 1-(1-b)*pb;

							let pc = data.characters[currChar].palette[c.index];
							pc.r = floatToFive(r);
							pc.g = floatToFive(g);
							pc.b = floatToFive(b);
						}

						updateInterface();
					}
					//}}}

					function addDragger(isCG, propName, label, start, end, step, color, ticks, tip)
					//{{{
					{
						let object = data.characters[currChar].colorGroups[currColGroup];
						if(!isCG)
						{
							object = object.items[currColBut];
						}

						let lab = document.createElement("div");
						lab.textContent = label;
						lab.title = tip;
						lab.style.display = "inline-block";
						//lab.style.fontFamily = "monospace";
						lab.style.width = "130px";
						colorModifierDiv.appendChild(lab);

						let drag = document.createElement("input");
						drag.type = "range";
						drag.min = start; drag.max = end;
						drag.step = step;
						drag.value = object[propName];
						drag.style.width = "350px";
						drag.style.position = "relative";
						drag.style.top = "5px";
						drag.style.accentColor = color;
						drag.title = tip;
						drag.setAttribute("list", ticks);
						colorModifierDiv.appendChild(drag);

						let num = document.createElement("input");
						num.type = "number";
						num.min = start; num.max = end;
						if(step<1)
						{
							let object = data.characters[currChar].colorGroups[currColGroup];
							if(!isCG)
							{
								object = object.items[currColBut];
							}
							num.step = 0.01;
							num.value = object[propName];
						}
						else
						{
							let object = data.characters[currChar].colorGroups[currColGroup];
							if(!isCG)
							{
								object = object.items[currColBut];
							}
							num.step = step;
							num.value = object[propName];
						}
						num.style.width = "50px";
						num.style.marginLeft = "20px";
						num.style.textAlign = "right";
						colorModifierDiv.appendChild(num);

						colorModifierDiv.appendChild(document.createElement("br"));

						let stopAdjust = false;
						function pause()
						{
							stopAdjust = true;
							setTimeout(()=>{stopAdjust=false;});
						}

						drag.addEventListener("input", function()
						{
							let object = data.characters[currChar].colorGroups[currColGroup];
							if(!isCG)
							{
								object = object.items[currColBut];
							}
							object[propName] = Number(drag.value);
							num.value = drag.value;
							pause();
							recolor();
						});
						drag.addEventListener("mouseup", function()
						{
							pushState();
						});

						num.addEventListener("change", function()
						{
							let object = data.characters[currChar].colorGroups[currColGroup];
							if(!isCG)
							{
								object = object.items[currColBut];
							}
							object[propName] = Number(num.value);
							drag.value = num.value;
							pushState();
							pause();
							recolor();
						});

						drag.addEventListener("update", function()
						{
							let object = data.characters[currChar].colorGroups[currColGroup];
							if(!isCG)
							{
								object = object.items[currColBut];
							}
							if(!stopAdjust) drag.value = object[propName];
						});

					}
					//}}}
					// Datalist for dragger ticks
					//{{{
					{
						let dl = document.createElement("datalist");
						dl.id = "colorDLID";
						for(let i=0;i<=31;i+=8)
						{
							let to = document.createElement("option");
							to.value = i;
							dl.appendChild(to);
							if(i==24) i=23;
						}
						colorModifierDiv.appendChild(dl);
					}
					{
						let dl = document.createElement("datalist");
						dl.id = "hbsDLID";
						for(let i=-1.5;i<=1.5;i+=0.5)
						{
							let to = document.createElement("option");
							to.value = i;
							dl.appendChild(to);
						}
						colorModifierDiv.appendChild(dl);
					}
					//}}}

					if(currColBut==enumColButGroup)
					//{{{
					{

						let cg = data.characters[currChar].colorGroups[currColGroup];

						if(cg.items.length>0)
						{
							let t;
							t = "The Group Red/Green/Blue values determine the color of every palette color in this group."
							colorModifierDiv.appendChild(document.createElement("br"));
							addDragger(true,   "red",   "Red",  0, 31, 1, "#f00", "colorDLID", t);
							addDragger(true, "green", "Green",  0, 31, 1, "#0f0", "colorDLID", t);
							addDragger(true,  "blue",  "Blue",  0, 31, 1, "#00f", "colorDLID", t);
							colorModifierDiv.appendChild(document.createElement("br"));
							t = "The Group Brightness Modifier affects the brightness of every color in the group.  Brightness determines how high/low the RGB values are set."
							addDragger(true, "bright", "Brightness", -1, 1, 0.01, "#555", "hbsDLID", t);
							t = "The Group Saturation Modifier determines how vivid or washed out colors in the Group appear.\n\nA positive value will make the colors more colorful.\nA negative value will make the colors more grey.\n\nIf you increase the Group's Saturation, you'll probably want to decrease the Group's Brightness."
							addDragger(true,    "sat", "Saturation", -1, 1, 0.01, "#555", "hbsDLID", t);
						}
						else
						{
							colorModifierDiv.textContent = "This color group is currently empty.  Click the BUTTON TODO to add palette colors.";
						}

					}
					//}}}
					else if(currColBut==enumColButNew)
					//{{{
					{
						let cgs = data.characters[currChar].colorGroups;

						colorModifierDiv.appendChild(document.createElement("br"));

						// Group Label button (if the first color of a color group is being added)
						let labelInput;
						if(currColGroup==cgs.length)
						{
							colorModifierDiv.appendChild(document.createTextNode("Enter a label for the group, then click on a palette color to create the group"));
							colorModifierDiv.appendChild(document.createElement("br"));
							colorModifierDiv.appendChild(document.createElement("br"));

							colorModifierDiv.appendChild(document.createTextNode("Label: "));
							labelInput = document.createElement("input");
							labelInput.value = "Group Name";
							colorModifierDiv.appendChild(labelInput);
						}
						else
						{
							colorModifierDiv.appendChild(document.createElement("br"));
							colorModifierDiv.appendChild(document.createTextNode("Select a free palette color to add it to this group"));
						}
						colorModifierDiv.appendChild(document.createElement("br"));
						colorModifierDiv.appendChild(document.createElement("br"));


						// Add buttons for every available color
						let avail = ungroupedPaletteSlots(currChar);
						for(let i of avail)
						{
							let but = document.createElement("div");
							but.style.display = "inline-block";
							colorModifierDiv.appendChild(but);

							let canv = document.createElement("canvas");
							canv.width = 40;
							canv.height = 30;
							canv.style.border = "1px solid black";
							canv.style.borderRadius = "4px";
							canv.style.marginRight = "5px";
							but.appendChild(canv);

							canv.addEventListener("update", function()
							{
								let ctx = canv.getContext("2d");
								ctx.fillStyle = convertPaletteToCode(data.currChar, i);
								ctx.fillRect(0, 0, canv.width, canv.height);
								
							});

							but.addEventListener("click", function()
							{
								let cgs = data.characters[currChar].colorGroups;
								if(currColGroup==cgs.length)
								{
									cgs.push({});
									cgs[currColGroup].label = labelInput.value;
								}

								colorGroupAppend(currChar, cgs[currColGroup], i);
								data.cgc^= 1;
								pushState();
								newColGroup = true;
								updateInterface();
							});
						}
					}
					//}}}
					else
					//{{{
					{
						let cg = data.characters[currChar].colorGroups[currColGroup];
						let c = cg.items[currColBut];

						// Red/Green/Blue display
						{
							colorModifierDiv.appendChild(document.createElement("br"));
							let d = document.createElement("div");
							//{{{
							{
								let id = document.createElement("div");
								id.style.display = "inline-block";
								id.style.width = "20%";
								let s = document.createElement("span");
								s.style.color = "#a00";
								s.textContent = "Red: ";
								let n = document.createElement("span");
								n.addEventListener("update", function()
								{
									let rgb = data.characters[data.currChar].palette[c.index];
									n.textContent = rgb.r;
								});
								id.appendChild(s);
								id.appendChild(n);
								d.appendChild(id);
							}
							{
								let id = document.createElement("div");
								id.style.display = "inline-block";
								id.style.width = "20%";
								let s = document.createElement("span");
								s.style.color = "#080";
								s.textContent = "Green: ";
								let n = document.createElement("span");
								n.addEventListener("update", function()
								{
									let rgb = data.characters[data.currChar].palette[c.index];
									n.textContent = rgb.g;
								});
								id.appendChild(s);
								id.appendChild(n);
								d.appendChild(id);
							}
							{
								let id = document.createElement("div");
								id.style.display = "inline-block";
								id.style.width = "20%";
								let s = document.createElement("span");
								s.style.color = "#008";
								s.textContent = "Blue: ";
								let n = document.createElement("span");
								n.addEventListener("update", function()
								{
									let rgb = data.characters[data.currChar].palette[c.index];
									n.textContent = rgb.b;
								});
								id.appendChild(s);
								id.appendChild(n);
								d.appendChild(id);
							}
							//}}}
							colorModifierDiv.appendChild(d);
							colorModifierDiv.appendChild(document.createElement("br"));
						}

						let t;
						t = "Hue Offset determines the difference between the Group color and this individual palette color.\n\nTry setting this to 1, then click the Group button and change the color, to get a sense of what this does."
						addDragger(false, "huedel", "Hue Offset", -1.5, 1.5, 0.01, "#555", "hbsDLID",t);
						t = "Brightness determines how high the Red/Green/Blue values are all set to (their individual values are determined by the Hue and Saturation)."
						addDragger(false, "bright", "Brightness", 0, 1, 0.01, "#555", "hbsDLID",t);
						t = "Saturation determines how vivid or grey the color is; 1 means the color is very vivid while 0 means it's completely grey.\n\nMore specifically: the saturation determines how the value of Brightness is divided amongst the Red/Blue/Green values.\n\nA Saturation of 1 means that the RGB values are set to the Group RGB values (multiplied by 3*brightness, before factoring in the Group Brightness modifier).\n\nA Saturation of 0 means that the RGB values are equal, that Hue is ignore and only brightness determines their value (unless the Group Saturation Modifier is >0)."
						addDragger(false,    "sat", "Saturation", 0, 1, 0.01, "#555", "hbsDLID",t);
						colorModifierDiv.appendChild(document.createElement("br"));

						let d = document.createElement("div");
						d.textContent = "Remove Color From Group";
						d.style.display = "inline-block";
						d.classList.add("fauxButton");
						colorModifierDiv.appendChild(d);

						d.addEventListener("click", function()
						{
							let cgs = data.characters[currChar].colorGroups;
							let cg = cgs[currColGroup];
							cg.items.splice(currColBut, 1);
							if(cg.items.length<1)
							{
								cgs.splice(currColGroup, 1);
								currColGroup = cgs.length;
							}
							else
							{
								currColBut = enumColButGroup;
							}
							data.cgc^= 1;
							pushState();
							newColGroup = true;
							updateInterface();
						});
					}
					//}}}

					// Color order functions
					//{{{

					mdf.colorLeft = function(num=1)
					{
						let cl = data.characters[currChar].colorGroups[currColGroup].items;
						if(currColBut<num || currColBut>=cl.length) return;
						cl.splice(currColBut-num, 0, cl.splice(currColBut,1)[0]);
						prevColGroup = -1;
						updateInterface();
					}

					mdf.colorRight = function(num=1)
					{
						let cl = data.characters[currChar].colorGroups[currColGroup].items;
						if(currColBut<0 || currColBut>=cl.length-num) return;
						cl.splice(currColBut+num, 0, cl.splice(currColBut,1)[0]);
						prevColGroup = -1;
						updateInterface();
					}

					mdf.setBlack = function(r,g,b)
					{
						r = Math.floor(r);
						g = Math.floor(g);
						b = Math.floor(b);
						if(r<0) return; if(r>31) return;
						if(g<0) return; if(g>31) return;
						if(b<0) return; if(b>31) return;
						let p = data.characters[currChar].palette[1];
						p.r = r;
						p.g = g;
						p.b = b;
						updateInterface();
					}

					mdf.setWhite = function(r,g,b)
					{
						r = Math.floor(r);
						g = Math.floor(g);
						b = Math.floor(b);
						if(r<0) return; if(r>31) return;
						if(g<0) return; if(g>31) return;
						if(b<0) return; if(b>31) return;
						let p = data.characters[currChar].palette[2];
						p.r = r;
						p.g = g;
						p.b = b;
						updateInterface();
					}

					//}}}

				}
				//}}}

				// Fire update to all ancestors
				//{{{
				{
					function updateChildren(ele)
					{
						for(let ce of ele.children)
						{
							ce.dispatchEvent(new CustomEvent("update"));
							updateChildren(ce);
						}
					}
					updateChildren(interfaceDiv);
				}
				//}}}

			});

		}
		//}}}

		// Graphics Modification Interface
		//{{{
		{
			let graphicsHolderDiv = document.createElement("div");
			graphicsHolderDiv.style.border = "1px solid black";
			graphicsHolderDiv.style.marginTop = "10px";
			graphicsHolderDiv.style.textAlign = "center";
			interfaceDiv.appendChild(graphicsHolderDiv);

			let transformCanv;

			let size = 20;  // Square size
			let space = 30; // Space between before/after

			let fromList = []; // List of pixel values that are being "held" (can be multiple if multiple get transformed to same value, and grabbed at that "to" spot)
			let dx = -1; // coordinates to draw lines to
			let dy = -1;

			let prevChar = -1;

			{
				graphicsHolderDiv.appendChild(document.createElement("br"));
				let h = document.createElement("h3");
				h.textContent = "Spritesheet Editor";
				h.style.width = "50%";
				h.style.margin = "0 auto";
				graphicsHolderDiv.appendChild(h);
				let d = document.createElement("div");
				d.style.width = "50%";
				d.style.margin = "0 auto";
				d.appendChild(document.createElement("br"));
				d.appendChild(document.createTextNode("Click and drag a color from the upper \"Before\" row to a different color on the lower \"After\" row."));
				d.appendChild(document.createElement("br"));
				d.appendChild(document.createElement("br"));
				d.appendChild(document.createTextNode("Then click/drag on the spritesheet above to swap out the palette colors."));
				graphicsHolderDiv.appendChild(d);
				graphicsHolderDiv.appendChild(document.createElement("br"));
			}

			// Filter Element
			//{{{
			{
				let d = document.createElement("div");
				d.style.width = "50%";
				d.style.margin = "0 auto";
				d.style.textAlign = "center";
				transformCanv = document.createElement("canvas");
				transformCanv.width = size*16+2;
				transformCanv.height = size*2+space+4;
				graphicsHolderDiv.appendChild(d);
				d.appendChild(transformCanv);

				transformCanv.addEventListener("mousedown", function(e)
				{
					let mx = e.offsetX;
					let my = e.offsetY;

					fromList = [];

					if(my>=1&&my<=1+size) if(mx>=1&&mx<=size*16+1)
					{
						let val = Math.floor((mx-1)/size);
						fromList = [val];
						pixelTransform[val] = -1;
					}

					if(my>=3+size+space&&my<=4+size+2*space) if(mx>=1&&mx<=size*16+1)
					{
						let val = Math.floor((mx-1)/size);
						for(let i=0;i<16;i++)
						{
							if(pixelTransform[i]==val)
							{
								fromList.push(i);
								pixelTransform[i] = -1;
							}
						}
					}

				});

				transformCanv.addEventListener("mouseup", function(e)
				{
					let mx = e.offsetX;
					let my = e.offsetY;

					if(my>=3+size+space&&my<=4+size+2*space) if(mx>=1&&mx<=size*16+1)
					{
						for(let i=0;i<fromList.length;i++)
						{
							pixelTransform[fromList[i]] = Math.floor((mx-1)/size);
						}
					}

					fromList = [];
					dx = dy = -1;
					updateInterface();
				});

				transformCanv.addEventListener("mousemove", function(e)
				{
					dx = e.offsetX;
					dy = e.offsetY;
					updateInterface();
				});
			}
			//}}}

			// Filter Labels
			//{{{
			{
				let w = 70;
				let od = document.createElement("div");
				od.style.width = "0";
				od.style.margin = "0 auto";
				od.style.textAlign = "center";
				od.style.position = "relative";
				graphicsHolderDiv.appendChild(od);
				{
					let d = document.createElement("div");
					d.style.position = "absolute";
					d.style.top = (-space-2*size-4)+"px";
					d.style.left = (-size*8-w)+"px";
					d.style.width = w+"px";
					d.style.zIndex = "1";
					d.style.fontWeight = "bold";
					d.style.textAlign = "left";
					d.textContent = "Before";
					od.appendChild(d);
				}
				{
					let d = document.createElement("div");
					d.style.position = "absolute";
					d.style.top = (-size-2)+"px";
					d.style.left = (-size*8-w)+"px";
					d.style.width = w+"px";
					d.style.zIndex = "1";
					d.style.fontWeight = "bold";
					d.style.textAlign = "left";
					d.textContent = "After";
					od.appendChild(d);
				}
			}
			//}}}

			// Close Button
			{
				let d = document.createElement("div");
				d.style.width = "50%";
				d.style.margin = "0 auto";
				d.style.textAlign = "center";
				graphicsHolderDiv.appendChild(document.createElement("br"));
				graphicsHolderDiv.appendChild(document.createElement("br"));
				graphicsHolderDiv.appendChild(document.createElement("br"));
				let but = document.createElement("span");
				but.classList.add("fauxButton");
				but.textContent = "Close and Return";
				//but.style.marginLeft = "50px";
				graphicsHolderDiv.appendChild(d);
				d.appendChild(but);
				graphicsHolderDiv.appendChild(document.createElement("br"));
				graphicsHolderDiv.appendChild(document.createElement("br"));

				but.addEventListener("click", function()
				{
					data.mode = 0;
					updateInterface();
				});
			}

			interfaceDiv.addEventListener("update", function()
			{
				// Reset graphics transform on charswitch
				//{{{
				if(prevChar!=data.currChar)
				{
					prevChar = data.currChar;
					for(let i in pixelTransform) pixelTransform[i] = -1;
				}
				//}}}

				// Check if in Graphics Mode
				//{{{
				if(data.mode==1) graphicsHolderDiv.style.display = "";
				else
				{
					graphicsHolderDiv.style.display = "none";
					return;
				}
				//}}}

				// Filters
				//{{{
				{
					let ctx  = transformCanv.getContext("2d");
					ctx.fillStyle = "#fff";
					ctx.fillRect(0,0, transformCanv.width,transformCanv.height);

					let pcodes = convertPaletteToCodes(data.currChar);


					// Before/After boxes
					ctx.fillStyle = "#000";
					ctx.fillRect(0,0,size*16+2, size+2);
					ctx.fillRect(0,size+2+space,size*16+2, size+2);

					for(let i=0;i<16;i++)
					{
						ctx.fillStyle = pcodes[i];
						ctx.fillRect(1+i*size,           1,size,size);
						ctx.fillRect(1+i*size,3+size+space,size,size);
					}

					let b = 4;
					for(let x=0;x<size/b;x++)
					for(let y=0;y<size/b;y++)
					if(x%2!=y%2)
					{
						ctx.fillStyle = "#ccc";
						ctx.fillRect(1+x*b,           1+y*b,b,b);
						ctx.fillRect(1+x*b,3+size+space+y*b,b,b);
					}


					// Lines
					ctx.strokeStyle = "#000";
					ctx.lineWidth = size/4;
					ctx.lineCap = "round";
					for(let i=0;i<16;i++)
					{
						if(pixelTransform[i]<0) continue;

						ctx.beginPath();
						ctx.moveTo(1+size/2+size*i, 1+size/2);
						ctx.lineTo(1+size/2+size*pixelTransform[i],2+size+space+1+size/2);
						ctx.stroke();
					}

					for(let i=0;i<fromList.length;i++)
					{
						ctx.beginPath();
						ctx.moveTo(1+size/2+size*fromList[i], 1+size/2);
						ctx.lineTo(dx,dy);
						ctx.stroke();
					}

				}
				//}}}

			});

		}
		//}}}

		updateInterface();

	}
	//}}}


	// DOM layout
	let outerDiv = document.createElement("div");
	document.body.appendChild(outerDiv);
	outerDiv.classList.add("main");
	let loadDiv = document.createElement("div");
	outerDiv.appendChild(loadDiv);
	let interfaceHolderDiv = document.createElement("div");
	outerDiv.appendChild(interfaceHolderDiv);

	// Inject Load & Save Bar
	//{{{
	{
		let bin;      // ROM Binary (stored as a Uint8Array)
		let filename; // Loaded ROM's filename
		let header;   // header data, if there's a header (stored to slap back on during export)

		// Load ROM Button
		function generateLoadRomButton(label, checkdiff=true, onLoadFunc=function(){})
		//{{{
		{
			let butHolder = document.createElement("span");

			let loadLabel = document.createElement("label");
			loadLabel.classList.add("fauxButton");
			loadLabel.htmlFor = label;
			loadLabel.textContent = "Load ROM";
			loadLabel.style.fontSize = "0.9em";
			butHolder.appendChild(loadLabel);
			butHolder.title = "Load the FF2/4 ROM you would like to modify";

			let loadBut = document.createElement("input");
			loadBut.type = "file";
			loadBut.accept = ".smc, .sfc";
			loadBut.style.opacity = "0";
			loadBut.style.fontSize = "0.01px";
			loadBut.style.position = "absolute";
			loadBut.id = label;
			butHolder.appendChild(loadBut);

			loadBut.addEventListener("change", function(e)
			//{{{
			{
				textDiv.textContent = "";

				// Get file
				let file = e.target.files[0];
				if (!file) return;

				// Get extension; error if not .smc, .sfc
				let ext = loadBut.value.split(".").pop().toLowerCase();
				if(ext!="smc" && ext!="sfc")
				{
					textDiv.textContent = "File must have a .smc or .sfc extension";
					return;
				}

				// Load file
				let reader = new FileReader();
				reader.onload = function(e)
				{
					let loadedBin = new Uint8Array(e.target.result);
					let loadedHeader;
					if(loadedBin.length%1024==512)
					{
						loadedHeader = loadedBin.subarray(0, 512);
						loadedBin = loadedBin.subarray(512, loadedBin.length);
					} else loadedHeader = 0;
					let loadedFilename = loadBut.value.split("\\").pop();

					let loadedCharData = readBin(loadedBin);

					let diff = false;
					// Check if graphics data is modified (diff=true if so)
					//{{{
					for(let ic in loadedCharData)
					{
						for(let ip in loadedCharData[ic].palette)
						{
							let cpal = vanillaCharData[ic].palette[ip];
							let lpal = loadedCharData[ic].palette[ip];
							if(cpal.r!=lpal.r) diff = true;
							if(cpal.g!=lpal.g) diff = true;
							if(cpal.b!=lpal.b) diff = true;
						}
						for(let it in loadedCharData[ic].tilesheet)
						{
							let cts = vanillaCharData[ic].tilesheet[it];
							let lts = loadedCharData[ic].tilesheet[it];
							for(let x=0;x<8;x++) for(let y=0;y<8;y++)
							{
								if(cts[x][y]!=lts[x][y]) diff = true;
							}
						}
					}
					//}}}

					if(diff&&checkdiff)
					{
						let p = document.createElement("div");

						let t = document.createElement("div");
						t.style.textAlign = "center";
						t.style.width = "600px";
						t.appendChild(document.createTextNode("The graphic data in this ROM is different from vanilla FFIV"));
						t.appendChild(document.createElement("br"));
						t.appendChild(document.createElement("br"));

						let ss = document.createElement("canvas");
						ss.width = 896/2;
						ss.height = 96/2;
						clearSpriteSheet(ss, 2);
						{
							let dc = data;
							data = {};
							data.characters = loadedCharData;
							drawSpriteSheet(ss, 0, 0, 2);
							data = dc;
						}
						t.appendChild(ss);
						t.appendChild(document.createElement("br"));
						t.appendChild(document.createElement("br"));
						t.appendChild(document.createTextNode("If the above image looks like random static instead of a character's spritesheet, that means this ROM can't be edited with this editor"));
						t.appendChild(document.createElement("br"));
						t.appendChild(document.createElement("br"));
						t.appendChild(document.createElement("br"));

						t.appendChild(document.createTextNode("Would you like to:"));
						t.appendChild(document.createElement("br"));
						t.appendChild(document.createElement("br"));
						p.appendChild(t);

						let bh = document.createElement("div");
						bh.style.display = "flex";
						p.appendChild(bh);

						// Use ROM Graphics
						//{{{
						{
							let d = document.createElement("div");
							d.style.width = "180px";
							d.style.textAlign = "center";
							let b = document.createElement("span");
							b.classList.add("fauxButton");
							b.textContent = "Load ROM Graphics";
							b.style.fontSize = "0.9em";
							d.appendChild(b);
							d.appendChild(document.createElement("br"));
							d.appendChild(document.createElement("br"));
							let t = document.createElement("div");
							t.style.fontSize = "0.8em";
							t.appendChild(document.createTextNode("This will overwrite the current editor settings and any changes you have made "));
							d.appendChild(t);
							d.appendChild(document.createElement("br"));
							bh.appendChild(d);
							b.addEventListener("click", function()
							{
								bin = loadedBin;
								filename = loadedFilename;
								header = loadedHeader;
								initialize(loadedCharData, false);
								popupClose();
								onLoadFunc();
							});
						}
						//}}}

						// Use Original Graphics
						//{{{
						{
							let d = document.createElement("div");
							d.style.width = "180px";
							d.style.margin = "0 20px";
							d.style.textAlign = "center";
							let b = document.createElement("span");
							b.classList.add("fauxButton");
							b.textContent = "Load ROM Graphics";
							b.style.fontSize = "0.9em";
							b.textContent = "Keep Editor Graphics";
							d.appendChild(b);
							d.appendChild(document.createElement("br"));
							d.appendChild(document.createElement("br"));
							let t = document.createElement("div");
							t.style.fontSize = "0.8em";
							t.appendChild(document.createTextNode("This ignores the ROM's graphics, and will use the editor's graphics in an exported ROM"));
							d.appendChild(t);
							d.appendChild(document.createElement("br"));
							bh.appendChild(d);
							b.addEventListener("click", function()
							{
								bin = loadedBin;
								filename = loadedFilename;
								header = loadedHeader;
								popupClose();
								onLoadFunc();
							});
						}
						//}}}

						// Cancel
						//{{{
						{
							let d = document.createElement("div");
							d.style.width = "180px";
							d.style.textAlign = "center";
							let b = document.createElement("span");
							b.classList.add("fauxButton");
							b.textContent = "Load ROM Graphics";
							b.style.fontSize = "0.9em";
							b.textContent = "Cancel";
							d.appendChild(b);
							d.appendChild(document.createElement("br"));
							d.appendChild(document.createElement("br"));
							let t = document.createElement("div");
							t.style.fontSize = "0.8em";
							t.appendChild(document.createTextNode("Don't load this ROM"));
							d.appendChild(t);
							d.appendChild(document.createElement("br"));
							bh.appendChild(d);
							b.addEventListener("click", function()
							{
								popupClose();
							});
						}
						//}}}

						popupContent(p);

					}
					else
					{
						bin = loadedBin;
						filename = loadedFilename;
						header = loadedHeader;
						onLoadFunc();
					}

				};
				reader.readAsArrayBuffer(file);

			});
			//}}}

			return butHolder;

		}
		//}}}
		loadDiv.appendChild(generateLoadRomButton("loadBut"));

		// Load .JSON Button
		//{{{
		{
			let loadLabel = document.createElement("label");
			loadLabel.classList.add("fauxButton");
			loadLabel.htmlFor = "jsonLoadBut";
			loadLabel.textContent = "Load .JSON";
			loadLabel.style.marginLeft = "1em";
			loadLabel.style.fontSize = "0.9em";
			loadDiv.appendChild(loadLabel);
			loadLabel.title = "Load meta-data from a previous session with this Spritesheet Editor";

			let loadBut = document.createElement("input");
			loadBut.type = "file";
			loadBut.accept = ".json";
			loadBut.style.opacity = "0";
			loadBut.style.fontSize = "0.01px";
			loadBut.id = "jsonLoadBut";
			loadDiv.appendChild(loadBut);
			loadBut.addEventListener("change", function(e)
			//{{{
			{
				textDiv.textContent = "";

				// Get file
				let file = e.target.files[0];
				if (!file) return;

				// Get extension; error if not .json
				let ext = loadBut.value.split(".").pop().toLowerCase();
				if(ext!="json")
				{
					textDiv.textContent = "File must have a .json extension";
					return;
				}

				// Load file
				let reader = new FileReader();
				reader.onload = function(e)
				{
					//let loadedBin = new Uint8Array(e.target.result);
					let s = new TextDecoder("utf-8").decode(new Uint8Array(e.target.result));
					data = JSON.parse(s);
					initInterface();
				};
				reader.readAsArrayBuffer(file);

			});
			//}}}

		}
		//}}}

		// Save Button
		//{{{
		{
			let saveBut = document.createElement("span");
			saveBut.classList.add("fauxButton");
			saveBut.style.float = "right";
			saveBut.textContent = "Save...";
			saveBut.style.fontSize = "0.9em";
			saveBut.title = "Export a ROM with the new graphic data, or save a file containing all the data in the editor for later use"
			loadDiv.appendChild(saveBut);
			saveBut.addEventListener("click", function openThis()
			{
				let d = document.createElement("div");

				let bh = document.createElement("div");
				bh.style.display = "flex";
				d.appendChild(bh);

				// Save ROM
				//{{{
				{
					let d = document.createElement("div");
					d.style.width = "180px";
					d.style.textAlign = "center";

					let lb = generateLoadRomButton("saveLoadBut", false, function()
					{
						openThis();
					});
					d.appendChild(lb);
					d.appendChild(document.createElement("br"));
					d.appendChild(document.createElement("br"));

					let saveAnc = document.createElement("a");
					saveAnc.classList.add("fauxButton");
					saveAnc.classList.add("unAnchor");
					saveAnc.style.display = "inline-block";
					saveAnc.style.fontSize = "0.9em";
					saveAnc.textContent = "Export ROM";
					d.appendChild(saveAnc);
					if(bin!==undefined)
					{
						bin = writeBin(data.characters, bin);
						let outBin;
						if(header)
						{
							outBin = new Uint8Array(bin.length+header.length);
							outBin.set(header);
							outBin.set(bin, header.length);
						}
						else outBin = bin;
						let blob = new Blob([outBin.buffer]);
						saveAnc.href = URL.createObjectURL(blob);
						saveAnc.download = filename.split(".")[0]+"_NewSprites."+filename.split(".")[1];
					}
					else
					{
						saveAnc.classList.add("fauxButtonDisabled");
						saveAnc.title = "adsf";
					}
					d.appendChild(document.createElement("br"));
					d.appendChild(document.createElement("br"));

					let t = document.createElement("div");
					t.style.fontSize = "0.8em";
					t.appendChild(document.createTextNode("This creates a copy of the loaded ROM with the modified character sprites"))
					t.appendChild(document.createElement("br"));
					t.appendChild(document.createTextNode("(This does NOT save metadata for this editor)"));
					if(bin===undefined)
					{
						t.appendChild(document.createElement("br"));
						t.appendChild(document.createElement("br"));
						let s = document.createElement("span");
						s.style.color = "#800";
						s.appendChild(document.createTextNode("No copy of the game ROM has been loaded yet; press the \"Load ROM\" button first and select your ROM, then press the \"Export ROM\" button to created the modified copy"));
						t.appendChild(s);
					}
					d.appendChild(t);
					bh.appendChild(d);

				}
				//}}}

				// Save JSON
				//{{{
				{
					let d = document.createElement("div");
					d.style.width = "180px";
					d.style.marginLeft = "20px";
					d.style.textAlign = "center";

					let a = [JSON.stringify(data)];
					//blob = new Blob(a, {type:"text"});
					let blob = new Blob(a);
					let saveAnc = document.createElement("a");
					saveAnc.classList.add("fauxButton");
					saveAnc.classList.add("unAnchor");
					saveAnc.textContent = "Save .JSON";
					saveAnc.download = "ff4SpriteEditorData.json";
					saveAnc.style.fontSize = "0.9em";
					saveAnc.href = URL.createObjectURL(blob);
					d.appendChild(saveAnc);

					d.appendChild(document.createElement("br"));
					d.appendChild(document.createElement("br"));
					let t = document.createElement("div");
					t.style.fontSize = "0.8em";
					t.appendChild(document.createTextNode("This is a save file for this editor, which stores all graphic and editor data (color groups and their settings, etc)"));
					d.appendChild(t);
					d.appendChild(document.createElement("br"));
					bh.appendChild(d);

				}
				//}}}

				popupContent(d);
			});
		}
		//}}}

		// Preview Button
		//{{{
		{
			let prevBut = document.createElement("span");
			prevBut.classList.add("fauxButton");
			prevBut.style.float = "right";
			prevBut.textContent = "Preview";
			prevBut.style.fontSize = "0.9em";
			prevBut.style.marginRight = "1em";
			prevBut.title = "A bird's eye view of every character's sprite sheet that will be saved to an exported ROM";

			loadDiv.appendChild(prevBut);

			prevBut.addEventListener("click", function()
			{
				let prevCanv = document.createElement("canvas");
				prevCanv.style.border = "1px solid black";
				prevCanv.width = 672;
				prevCanv.height = 72*14;
				popupContent(prevCanv);

				let ppp = 3;

				clearSpriteSheet(prevCanv, ppp);
				for(let i=0;i<14;i++) drawSpriteSheet(prevCanv,i,i, ppp);
			});

		}
		//}}}

		// Load/Save Warning display div
		let textDiv = document.createElement("div");
		//textDiv.style.marginTop = "1em";
		textDiv.style.height = "1em";
		loadDiv.appendChild(textDiv);

	}
	//}}}

	// Keyboard detection
	//{{{
	let zKeyFunc = function(){};
	let yKeyFunc = function(){};
	{
		document.addEventListener("keydown", function(e)
		{
			if(e.keyCode==89 && e.ctrlKey) yKeyFunc();
			if(e.keyCode==90 && e.ctrlKey) zKeyFunc();
		});
	}
	//}}}


	// Init
	//{{{
	{
		vanillaCharData = 
			//{{{
			JSON.parse(`
			[{"palette":[{"r":0,"g":12,"b":0},{"r":0,"g":0,"b":0},{"r":31,"g":31,"b":31},{"r":31,"g":17,"b":10},{"r":25,"g":15,"b":0},{"r":12,"g":12,"b":27},{"r":10,"g":10,"b":21},{"r":31,"g":0,"b":0},{"r":29,"g":29,"b":0},{"r":18,"g":18,"b":31},{"r":31,"g":27,"b":0},{"r":28,"g":21,"b":0},{"r":21,"g":13,"b":0},{"r":21,"g":0,"b":0},{"r":8,"g":8,"b":17},{"r":4,"g":4,"b":13}],"tilesheet":[[[0,0,0,0,0,0,0,0],[1,0,0,0,0,0,0,0],[5,1,1,0,0,0,0,0],[5,9,9,1,0,0,0,0],[5,9,2,9,1,0,0,0],[5,5,9,9,5,1,0,0],[8,8,5,5,5,1,0,0],[6,8,8,5,5,1,0,0]],[[0,1,0,0,0,0,0,0],[1,9,1,1,1,0,1,1],[0,1,9,9,5,15,6,6],[0,0,1,5,15,6,6,5],[0,1,9,6,6,15,6,5],[0,0,1,9,14,15,6,5],[0,0,1,5,15,6,6,6],[0,1,1,15,6,15,15,6]],[[6,6,6,6,5,1,1,0],[1,1,1,1,6,1,9,1],[4,4,4,1,1,5,1,0],[3,3,1,14,6,1,0,0],[1,1,1,6,1,1,1,0],[9,14,9,5,1,3,3,1],[5,15,5,1,14,3,3,1],[15,15,1,1,6,4,4,1]],[[1,9,1,1,14,6,14,15],[1,6,5,9,1,14,4,4],[0,1,6,5,1,1,1,4],[0,0,1,1,5,1,6,1],[0,1,5,6,1,15,5,6],[0,1,15,15,1,1,1,5],[1,5,9,5,1,3,3,1],[1,7,7,15,5,3,3,1]],[[15,6,9,1,1,1,1,0],[6,1,5,1,0,0,0,0],[5,1,1,0,0,0,0,0],[15,9,1,0,0,0,0,0],[5,15,1,0,0,0,0,0],[14,11,1,0,0,0,0,0],[11,10,11,1,0,0,0,0],[1,1,1,0,0,0,0,0]],[[0,1,6,15,6,4,4,1],[0,0,1,1,1,1,1,7],[0,0,1,14,6,1,6,7],[0,0,0,1,14,6,15,15],[0,0,0,0,1,6,5,9],[0,0,0,0,1,6,5,9],[0,0,0,0,1,12,5,14],[0,0,0,0,1,1,1,1]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[1,0,0,0,0,0,0,0],[5,1,1,0,0,0,0,0],[5,9,9,1,0,0,0,0],[5,9,2,9,1,0,0,0],[5,5,9,9,5,1,0,0],[8,8,5,5,5,1,0,0]],[[0,0,0,0,0,0,0,0],[0,1,0,0,0,0,0,0],[1,9,1,1,1,0,1,1],[0,1,9,9,5,15,6,6],[0,0,1,5,15,6,6,5],[0,1,9,6,6,15,6,5],[0,0,1,9,14,15,6,5],[0,1,1,5,15,6,6,6]],[[6,8,8,6,6,1,0,0],[1,1,1,6,6,1,0,0],[4,3,3,1,6,1,0,0],[4,3,3,6,1,0,0,0],[1,4,4,7,6,1,0,0],[1,14,6,5,7,1,0,0],[1,1,14,6,1,0,0,0],[1,1,1,1,0,0,0,0]],[[1,9,1,1,6,15,15,6],[1,6,5,9,1,6,14,15],[0,1,6,5,1,14,4,1],[0,0,1,1,5,1,1,1],[0,1,6,1,1,14,1,1],[0,0,1,5,5,1,3,3],[0,1,7,7,14,5,3,3],[0,1,6,6,14,6,4,4]],[[14,9,1,1,0,0,0,0],[1,5,1,6,1,0,0,0],[14,1,13,5,6,1,0,0],[15,14,15,15,15,9,1,0],[1,15,14,5,6,15,1,0],[1,14,14,5,14,11,1,0],[1,12,14,14,11,10,11,1],[0,1,1,1,1,1,1,0]],[[0,0,1,1,1,1,1,1],[0,0,1,13,14,6,14,1],[0,1,13,14,15,14,1,15],[1,14,15,15,9,1,0,1],[1,14,9,5,15,1,0,0],[1,14,9,14,11,1,0,0],[1,12,14,11,10,11,1,0],[0,1,1,1,1,1,0,0]],[[15,6,9,1,1,1,1,0],[14,1,5,1,1,0,0,0],[1,14,1,15,6,1,1,0],[1,15,6,5,6,10,11,1],[1,14,14,6,5,11,1,0],[0,1,12,11,6,1,0,0],[0,0,1,12,1,0,0,0],[0,0,0,1,0,0,0,0]],[[0,1,6,15,6,4,4,1],[0,0,1,1,1,1,1,15],[0,0,1,14,15,14,15,14],[0,1,14,14,9,15,9,1],[1,11,14,9,5,5,1,0],[1,14,9,5,11,1,0,0],[0,1,5,11,10,11,1,0],[0,0,1,1,1,1,0,0]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,1,0,0,0,0],[0,0,1,9,1,0,0,0],[1,1,6,9,1,0,0,0]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,1,1,0,0,0],[0,0,0,1,9,1,0,0],[0,0,0,1,6,9,1,1]],[[5,5,5,14,1,0,0,0],[9,9,5,5,6,1,0,0],[9,2,9,5,5,1,0,0],[5,9,2,9,5,6,1,0],[5,5,9,9,5,6,1,0],[6,5,5,5,6,6,1,0],[6,6,5,6,6,1,9,1],[6,6,6,6,8,1,6,1]],[[0,0,0,0,1,5,14,6],[0,0,0,0,1,15,6,5],[0,1,0,1,14,14,6,5],[1,9,1,1,15,14,6,5],[1,5,9,1,14,14,6,6],[0,1,5,1,15,14,14,6],[1,6,6,1,14,14,14,6],[1,6,1,1,1,14,8,8]],[[8,6,6,8,1,6,1,0],[6,6,6,1,1,1,6,1],[1,6,1,1,6,9,1,0],[14,1,14,1,6,9,7,1],[14,6,14,1,1,1,7,1],[1,6,1,4,3,3,1,1],[0,1,1,4,4,3,3,1],[0,0,0,1,1,1,1,0]],[[1,1,3,3,1,1,6,6],[1,3,4,1,1,14,1,1],[1,4,1,6,5,1,6,14],[0,1,6,15,15,15,1,1],[0,1,15,6,5,6,1,1],[0,1,11,6,5,6,12,1],[1,11,10,11,5,12,11,1],[0,1,1,1,1,1,1,0]],[[6,6,6,6,5,1,1,0],[1,1,1,1,6,1,9,1],[4,4,4,1,1,9,5,1],[3,3,1,14,1,5,6,1],[1,1,1,6,1,6,1,0],[9,14,9,5,1,1,0,0],[5,15,5,1,0,0,0,0],[15,15,1,0,0,0,0,0]],[[15,6,9,1,0,0,0,0],[14,1,5,1,1,0,0,0],[1,14,1,15,6,1,1,0],[1,15,6,5,6,10,11,1],[1,14,14,6,5,11,1,0],[0,1,12,11,6,1,0,0],[0,0,1,12,1,0,0,0],[0,0,0,1,0,0,0,0]],[[6,6,6,6,5,1,0,0],[1,1,1,1,6,1,0,0],[5,1,4,1,1,0,0,0],[6,1,1,1,0,0,0,0],[15,1,15,1,1,1,1,0],[6,15,5,5,1,3,3,1],[15,7,7,15,5,3,3,1],[15,6,6,15,6,4,4,1]],[[0,0,0,1,9,15,15,1],[0,0,0,1,5,9,9,5],[0,0,0,0,1,6,6,6],[0,0,0,1,6,14,15,15],[0,0,0,1,14,15,14,6],[0,0,0,0,1,15,6,5],[0,0,0,0,1,1,15,6],[0,0,0,1,5,6,1,1]],[[15,1,1,1,1,1,1,0],[14,1,5,1,1,0,0,0],[1,14,1,15,6,1,1,0],[1,15,6,5,6,10,11,1],[1,14,14,6,5,11,1,0],[0,1,12,11,6,1,0,0],[0,0,1,12,1,0,0,0],[0,0,0,1,0,0,0,0]],[[0,0,1,5,6,15,7,6],[0,0,0,1,1,7,6,5],[0,0,1,14,15,14,15,6],[0,1,14,14,9,15,9,1],[1,11,14,9,5,5,1,0],[1,14,9,5,11,1,0,0],[0,1,5,11,10,11,1,0],[0,0,1,1,1,1,0,0]],[[0,1,1,0,0,0,0,0],[1,9,1,1,1,1,1,1],[0,1,9,9,5,15,6,6],[0,0,1,5,15,6,6,5],[0,1,9,6,6,15,6,5],[0,1,1,1,14,15,6,5],[1,4,3,3,1,6,6,6],[1,4,3,3,1,15,15,6]],[[1,6,5,1,14,6,14,15],[1,15,15,5,1,14,4,4],[1,6,5,9,1,1,1,4],[0,1,6,15,6,15,6,1],[0,0,1,6,5,15,5,6],[0,0,0,1,6,15,6,5],[0,0,0,0,1,1,15,6],[0,0,0,1,5,6,15,1]],[[15,6,9,1,1,1,1,0],[6,1,5,1,1,0,0,0],[1,14,1,15,6,1,1,0],[1,15,6,5,6,10,11,1],[1,14,14,6,5,11,1,0],[0,1,12,11,6,1,0,0],[0,0,1,12,1,0,0,0],[0,0,0,1,0,0,0,0]],[[0,0,1,5,6,15,7,6],[0,0,0,1,1,7,6,5],[0,0,1,14,15,14,15,6],[0,1,14,14,9,15,9,1],[1,11,14,9,5,5,1,0],[1,14,9,5,11,1,0,0],[0,1,5,11,10,11,1,0],[0,0,1,1,1,1,0,0]],[[0,0,0,0,0,0,0,0],[1,0,0,0,0,0,0,0],[1,1,1,0,0,0,0,0],[1,9,9,1,0,0,0,0],[5,9,2,9,1,0,0,0],[5,9,9,9,1,0,0,0],[5,5,9,5,5,1,0,0],[6,5,5,5,5,1,0,0]],[[0,0,0,1,1,1,1,0],[0,0,1,9,1,3,3,1],[0,0,0,1,4,3,3,3],[0,0,0,1,4,4,3,3],[0,0,1,7,1,4,4,1],[0,1,7,14,14,1,1,6],[0,1,1,14,6,1,14,6],[0,1,14,1,1,1,14,8]],[[8,6,5,5,6,1,0,0],[8,6,5,6,1,0,0,0],[14,14,6,6,1,0,0,0],[1,14,6,1,0,0,0,0],[1,14,1,1,0,0,0,0],[14,4,3,3,1,0,0,0],[1,4,3,3,1,0,0,0],[1,1,4,4,1,0,0,0]],[[1,14,6,14,1,15,14,8],[1,6,5,6,1,14,1,14],[0,1,6,1,1,14,4,1],[1,1,1,15,14,1,4,4],[1,1,15,14,5,6,1,1],[0,1,1,1,6,14,15,6],[0,1,5,6,1,1,1,15],[1,5,6,1,5,6,1,1]],[[12,1,1,1,0,0,0,0],[12,1,7,5,1,0,0,0],[12,1,6,15,6,1,1,0],[1,15,14,5,6,10,11,1],[1,14,14,14,5,11,1,0],[0,1,12,11,14,1,0,0],[0,0,1,12,1,0,0,0],[0,0,0,1,0,0,0,0]],[[1,1,1,14,6,5,1,12],[0,0,1,14,14,6,1,12],[0,0,0,1,14,1,12,1],[0,0,0,0,1,1,12,12],[0,0,0,0,0,1,1,12],[0,0,0,0,0,0,0,1],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0]],[[0,0,0,0,0,0,0,0],[1,1,1,0,0,0,0,0],[1,9,9,1,0,0,0,0],[5,9,2,9,1,0,0,0],[6,5,9,9,5,1,0,0],[8,8,5,5,5,1,0,0],[6,8,8,5,6,1,0,0],[6,6,6,6,6,1,0,0]],[[1,9,1,1,0,1,1,1],[0,1,9,9,1,4,3,3],[0,0,1,5,1,4,3,3],[0,1,9,6,1,6,5,1],[0,0,1,1,6,1,1,1],[0,0,0,1,6,5,6,1],[0,0,0,1,14,6,1,6],[0,0,1,14,1,1,1,15]],[[1,1,1,1,6,1,0,0],[4,4,4,1,1,0,0,0],[3,3,1,6,1,0,0,0],[1,1,9,5,1,1,1,0],[14,15,14,1,1,3,3,1],[15,15,1,1,14,3,3,1],[1,14,9,1,6,4,4,1],[6,1,5,1,1,1,1,0]],[[0,0,1,14,6,5,1,4],[0,0,1,14,6,6,1,4],[0,0,0,1,14,1,14,1],[0,0,0,0,1,14,6,5],[0,0,0,0,0,1,15,6],[0,0,0,0,1,6,14,15],[0,0,0,1,6,14,1,13],[0,0,0,0,1,1,14,7]],[[6,1,1,0,0,0,0,0],[6,1,0,0,0,0,0,0],[15,9,1,0,0,0,0,0],[5,15,1,0,0,0,0,0],[5,6,1,0,0,0,0,0],[5,11,1,0,0,0,0,0],[11,10,11,1,0,0,0,0],[1,1,1,0,0,0,0,0]],[[0,0,1,1,1,1,14,7],[0,0,1,14,6,1,14,7],[0,0,0,1,14,6,15,15],[0,0,0,0,1,14,6,9],[0,0,0,0,1,14,6,9],[0,0,0,0,1,12,6,9],[0,0,0,0,0,1,1,9],[0,0,0,0,0,0,0,1]],[[0,0,0,0,0,0,0,0],[1,0,0,0,0,0,0,0],[5,1,0,0,0,0,0,0],[6,1,0,0,0,0,0,0],[1,1,0,0,0,1,0,0],[5,5,1,1,1,5,1,0],[5,5,5,5,14,9,1,0],[5,9,9,5,6,1,0,0]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,1],[0,0,0,0,0,0,1,9],[0,0,0,0,0,1,15,6],[0,0,0,0,1,14,6,6],[1,0,0,1,14,6,6,5],[5,1,0,1,14,6,6,5]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,1,1,1,1,1,1,1]],[[5,9,2,9,5,1,0,0],[5,5,9,9,5,1,0,0],[5,5,5,5,6,1,0,0],[6,5,5,6,1,1,1,0],[6,6,6,1,14,3,3,1],[6,6,1,15,4,3,3,1],[1,1,15,15,4,4,4,1],[1,1,1,1,1,1,1,0]],[[6,5,1,14,14,6,6,5],[1,6,15,14,14,6,6,5],[14,6,15,14,14,6,6,6],[1,1,1,14,1,14,6,6],[4,3,1,14,1,14,6,6],[5,3,3,1,14,14,1,1],[6,4,3,1,14,14,14,14],[1,1,1,1,1,1,1,1]],[[1,12,11,11,6,11,10,1],[0,1,12,14,6,5,11,1],[0,0,1,14,6,5,6,1],[0,0,1,15,6,5,15,15],[0,0,1,6,15,15,6,15],[0,0,0,1,15,13,13,15],[0,0,0,0,1,14,14,15],[0,0,0,0,0,1,1,1]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[6,6,6,6,6,0,0,0]],[[0,0,0,0,0,0,0,0],[1,0,0,0,0,0,0,0],[5,1,1,0,0,0,0,0],[5,9,9,1,0,0,0,0],[5,9,2,9,1,0,0,0],[5,5,9,9,5,1,0,0],[8,8,1,5,5,1,0,0],[6,1,11,6,6,6,6,6]],[[0,1,0,0,0,0,0,0],[1,9,1,1,1,0,1,1],[0,1,9,9,5,1,6,6],[0,0,1,5,15,6,6,5],[0,1,9,6,6,15,6,5],[0,0,1,9,14,15,6,5],[0,0,1,5,15,6,6,6],[0,1,1,1,1,1,15,6]],[[9,9,9,9,9,6,6,0],[2,2,2,2,2,9,6,6],[9,9,9,9,9,6,6,0],[6,6,6,6,6,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0]],[[1,15,10,9,9,9,9,9],[3,1,2,2,2,2,2,2],[3,1,10,9,9,9,9,9],[5,1,11,6,6,6,6,6],[15,6,15,5,6,1,0,0],[6,5,15,6,1,0,0,0],[1,1,1,1,0,0,0,0],[1,0,0,0,0,0,0,0]],[[1,5,1,4,3,3,1,1],[0,1,1,4,3,1,4,3],[1,6,1,4,4,1,4,3],[1,5,6,1,1,15,1,6],[0,1,5,6,1,6,1,15],[0,0,1,1,6,15,14,1],[0,0,0,1,1,1,1,1],[0,0,1,5,6,1,6,6]],[[1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1]],[[6,1,0,0,0,0,0,0],[5,6,1,0,0,0,0,0],[1,1,1,0,0,0,0,0],[9,5,6,1,0,0,0,0],[9,5,6,1,0,0,0,0],[9,5,11,1,0,0,0,0],[9,11,10,11,1,0,0,0],[1,1,1,1,0,0,0,0]],[[0,1,5,6,1,6,7,5],[0,0,1,1,6,1,6,7],[0,0,0,1,14,6,1,1],[0,0,0,1,1,14,6,5],[0,0,1,14,6,1,6,5],[0,1,12,6,6,1,6,5],[0,1,12,12,6,1,12,5],[0,0,1,1,1,1,1,1]],[[0,0,0,0,0,0,0,0],[1,1,0,0,0,0,0,0],[6,5,1,1,0,0,0,0],[5,5,9,9,1,0,0,0],[5,5,9,2,9,1,0,0],[6,5,5,9,9,5,1,0],[6,8,8,5,5,5,1,0],[1,6,8,8,5,6,1,0]],[[0,0,1,0,0,0,0,0],[0,1,9,1,1,1,0,1],[0,1,1,9,9,5,1,6],[1,1,1,1,1,1,6,6],[1,3,1,9,2,1,15,6],[1,3,1,5,9,2,1,6],[1,4,3,1,5,9,2,1],[1,4,4,1,1,5,9,2]],[[2,1,6,6,6,6,1,0],[9,2,1,1,1,6,1,0],[5,9,2,1,11,1,1,0],[1,5,9,8,1,1,5,1],[1,1,11,1,3,3,1,1],[15,11,1,4,3,3,1,0],[15,1,1,4,4,4,1,0],[1,1,1,1,1,1,0,0]],[[1,15,15,6,1,1,5,9],[1,14,6,5,15,1,1,5],[0,1,6,6,15,6,1,1],[0,0,1,15,6,14,1,14],[0,0,0,1,14,1,14,1],[0,0,0,0,1,6,5,6],[0,0,0,0,1,1,14,15],[0,0,0,1,6,14,1,1]],[[6,6,1,1,0,0,0,0],[1,6,1,5,1,0,0,0],[14,1,13,6,5,1,0,0],[15,14,15,15,15,9,1,0],[1,15,14,5,6,15,1,0],[1,14,14,5,6,11,1,0],[1,12,14,5,11,8,11,1],[0,1,1,1,1,1,1,0]],[[0,0,1,6,14,1,1,1],[0,0,1,1,1,6,14,1],[0,1,13,14,15,14,1,15],[1,14,15,15,9,1,0,1],[1,14,9,5,15,1,0,0],[1,14,9,5,11,1,0,0],[1,10,9,11,8,11,1,0],[0,1,1,1,1,1,0,0]],[[2,1,6,6,6,6,1,0],[9,2,1,1,1,6,1,0],[5,9,2,1,11,1,1,0],[1,5,9,8,1,1,5,1],[1,1,11,1,3,3,1,1],[15,11,1,4,3,3,1,0],[15,1,1,4,4,4,1,0],[1,1,1,1,1,1,0,0]]]},{"palette":[{"r":0,"g":12,"b":0},{"r":0,"g":0,"b":0},{"r":31,"g":31,"b":31},{"r":31,"g":19,"b":13},{"r":22,"g":14,"b":4},{"r":0,"g":16,"b":20},{"r":0,"g":22,"b":26},{"r":25,"g":0,"b":0},{"r":15,"g":0,"b":0},{"r":8,"g":28,"b":31},{"r":25,"g":16,"b":31},{"r":16,"g":11,"b":27},{"r":28,"g":21,"b":0},{"r":0,"g":12,"b":16},{"r":31,"g":27,"b":0},{"r":0,"g":6,"b":10}],"tilesheet":[[[0,0,0,0,0,0,0,0],[1,1,0,0,0,0,0,0],[9,9,1,1,0,0,0,0],[9,2,9,9,1,0,0,0],[6,7,14,9,1,0,0,0],[6,6,7,12,9,1,0,0],[1,1,6,6,2,9,1,0],[2,8,1,1,6,6,9,1]],[[0,0,1,1,1,1,1,0],[0,1,6,6,5,5,9,1],[0,1,1,14,14,12,5,9],[1,6,6,6,5,5,15,6],[0,1,14,14,12,12,5,13],[0,0,1,14,14,6,13,15],[0,1,6,6,5,15,5,13],[0,0,1,15,15,9,6,1]],[[2,8,4,1,1,1,6,1],[4,3,3,1,5,13,1,0],[1,3,3,1,13,1,0,0],[1,3,1,5,6,5,1,0],[1,1,5,1,15,1,1,0],[6,5,6,5,1,3,3,1],[5,1,5,1,4,3,3,1],[1,12,1,1,4,4,4,1]],[[0,1,1,13,5,6,2,1],[1,9,6,1,1,5,6,1],[0,1,2,5,1,1,5,6],[1,13,5,6,5,15,1,1],[1,15,15,15,1,15,15,5],[1,10,9,10,1,3,3,1],[1,11,10,1,4,3,3,1],[0,1,11,1,4,4,4,1]],[[5,2,1,0,1,1,1,0],[1,6,1,0,0,0,0,0],[1,1,0,0,0,0,0,0],[9,1,0,0,0,0,0,0],[15,1,0,0,0,0,0,0],[11,1,0,0,0,0,0,0],[10,11,1,0,0,0,0,0],[1,1,0,0,0,0,0,0]],[[1,5,1,15,1,1,1,1],[1,5,13,13,1,5,9,6],[1,5,13,1,1,5,9,6],[1,5,13,1,5,15,15,15],[1,5,1,1,5,6,2,9],[1,5,1,1,5,6,2,15],[0,1,0,1,5,6,15,11],[0,0,0,0,1,1,1,1]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[1,1,0,0,0,0,0,0],[9,9,1,1,0,0,0,0],[9,2,9,9,1,0,0,0],[6,7,14,9,1,0,0,0],[6,6,7,12,9,1,0,0],[1,1,6,6,2,9,1,0]],[[0,0,0,0,0,0,0,0],[0,0,1,1,1,1,1,0],[0,1,6,6,5,5,9,1],[0,1,1,14,12,6,5,9],[1,6,6,6,5,5,15,6],[0,1,14,14,12,12,5,13],[0,0,1,14,14,6,13,15],[0,1,6,6,5,15,5,13]],[[2,8,1,1,6,6,9,1],[2,8,4,1,1,1,6,1],[4,3,3,1,1,1,1,0],[1,3,3,1,4,3,3,1],[1,3,1,1,4,3,3,1],[1,1,5,1,1,4,4,1],[1,5,9,1,11,1,1,0],[1,1,5,1,10,11,1,0]],[[0,0,1,15,15,9,6,1],[0,1,1,13,5,6,2,1],[1,9,6,1,1,5,6,1],[0,1,2,5,1,1,5,6],[1,13,5,6,5,15,1,1],[0,1,15,15,1,15,15,5],[0,1,10,9,10,1,3,3],[0,1,11,10,1,4,3,3]],[[1,12,1,1,1,1,0,0],[6,1,0,0,0,0,0,0],[9,6,1,1,0,0,0,0],[15,15,15,9,1,0,0,0],[6,2,9,15,1,0,0,0],[6,2,15,11,1,0,0,0],[6,15,11,10,11,1,0,0],[1,1,1,1,1,0,0,0]],[[1,5,1,11,1,4,4,4],[1,5,13,1,1,1,1,1],[1,5,13,13,1,1,1,5],[1,5,13,1,15,15,1,1],[1,5,1,13,5,13,1,5],[1,5,1,13,5,13,1,5],[1,5,1,13,5,15,1,5],[0,1,0,1,1,1,1,1]],[[5,2,1,0,1,1,1,0],[1,6,1,1,1,0,0,0],[1,1,6,15,9,1,1,0],[5,5,15,2,6,11,10,1],[1,15,5,6,2,11,1,0],[0,1,13,5,6,1,0,0],[0,0,1,13,1,0,0,0],[0,0,0,1,0,0,0,0]],[[1,5,1,1,1,1,1,1],[1,5,1,15,5,6,9,6],[1,1,13,5,15,9,6,5],[1,13,5,6,2,15,5,1],[1,5,6,2,6,9,1,0],[0,1,9,6,11,1,0,0],[0,1,1,11,10,11,1,0],[0,0,0,1,1,1,0,0]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,1,0,0],[1,0,0,0,1,6,1,0],[1,0,0,1,9,1,0,0],[5,1,1,6,12,1,0,0]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,1,0,0,0,0,0,1],[1,6,1,0,0,0,1,6],[0,1,9,1,0,0,1,5],[0,1,12,6,1,1,5,6]],[[9,5,5,12,14,9,1,0],[2,9,5,14,6,1,0,0],[2,9,6,5,14,1,0,0],[9,6,6,5,6,0,0,0],[6,6,5,5,1,1,1,0],[6,13,13,5,1,5,9,1],[13,7,5,1,5,2,1,0],[6,5,1,13,13,5,6,1]],[[1,9,14,12,5,5,6,9],[0,1,6,12,5,6,9,2],[0,1,12,13,5,6,6,9],[0,1,6,13,5,6,6,9],[0,1,1,13,5,5,6,6],[1,6,1,13,7,13,5,6],[0,1,5,1,13,7,13,5],[0,0,1,1,1,13,5,2]],[[5,1,1,1,1,13,1,0],[5,1,1,5,6,1,0,0],[1,13,1,15,5,6,1,0],[15,1,11,10,15,5,1,0],[13,1,11,10,9,1,0,0],[1,4,4,4,10,1,0,0],[4,3,3,4,1,0,0,0],[1,1,1,1,0,0,0,0]],[[0,1,3,3,1,1,5,6],[1,4,3,1,1,1,13,6],[1,4,1,5,6,1,1,5],[0,1,9,13,13,13,1,1],[0,1,15,6,2,5,1,13],[0,1,11,15,2,5,1,13],[1,11,10,11,15,5,1,1],[0,1,1,1,1,1,1,1]],[[2,8,4,1,1,1,6,1],[4,3,3,1,11,1,1,0],[1,3,3,1,10,15,1,0],[1,3,1,15,15,5,1,0],[1,1,5,1,5,6,1,0],[9,5,9,1,5,1,0,0],[5,1,5,1,1,0,0,0],[1,1,1,0,0,0,0,0]],[[5,2,1,0,0,0,0,0],[1,6,1,1,1,0,0,0],[1,1,6,15,9,1,1,0],[5,5,15,2,6,11,10,1],[1,15,5,6,2,11,1,0],[0,1,13,5,6,1,0,0],[0,0,1,13,1,0,0,0],[0,0,0,1,0,0,0,0]],[[2,8,4,1,1,1,6,1],[4,3,3,1,0,0,1,0],[1,3,3,1,0,0,0,0],[1,3,1,0,0,0,0,0],[1,1,15,1,0,1,1,0],[6,15,10,10,1,3,3,1],[15,10,9,10,4,3,3,1],[1,11,11,11,4,4,4,1]],[[0,0,1,13,1,1,9,1],[0,0,0,1,9,6,1,1],[0,0,0,0,1,2,5,1],[0,0,0,1,13,5,15,15],[0,0,1,5,13,15,6,6],[0,0,1,5,1,13,5,9],[0,1,5,13,1,15,13,5],[0,1,5,13,1,13,15,15]],[[5,2,1,1,1,1,1,0],[1,6,1,1,1,0,0,0],[1,1,6,15,9,1,1,0],[5,5,15,2,6,11,10,1],[1,15,5,6,2,11,1,0],[0,1,13,5,6,1,0,0],[0,0,1,13,1,0,0,0],[0,0,0,1,0,0,0,0]],[[1,5,1,1,1,1,1,1],[1,5,1,15,5,6,9,6],[1,1,13,5,15,9,6,5],[1,13,5,6,2,15,5,1],[1,5,6,2,6,9,1,0],[0,1,9,6,11,1,0,0],[0,1,1,11,10,11,1,0],[0,0,0,1,1,1,0,0]],[[0,0,1,1,1,1,1,0],[0,1,6,6,5,5,9,1],[0,1,1,14,14,12,5,9],[1,6,6,6,5,5,15,6],[0,1,1,1,12,12,5,13],[1,4,3,3,1,6,13,15],[1,4,3,3,1,15,5,13],[1,4,4,1,15,9,6,1]],[[0,1,1,10,1,6,9,1],[1,11,10,9,1,5,6,1],[1,11,11,10,1,1,5,6],[0,1,15,15,5,15,1,1],[0,1,13,5,6,5,15,13],[0,0,1,13,5,13,1,5],[0,0,1,15,13,1,13,13],[0,1,5,1,1,13,1,1]],[[5,2,1,0,1,1,1,0],[1,6,1,1,1,0,0,0],[1,1,6,15,9,1,1,0],[5,5,15,2,6,11,10,1],[1,15,5,6,2,11,1,0],[0,1,13,5,6,1,0,0],[0,0,1,13,1,0,0,0],[0,0,0,1,0,0,0,0]],[[1,5,1,1,1,1,1,1],[1,5,1,15,5,6,9,6],[1,1,13,5,15,9,6,5],[1,13,5,6,2,15,5,1],[1,5,6,2,6,9,1,0],[0,1,9,6,11,1,0,0],[0,1,1,11,10,11,1,0],[0,0,0,1,1,1,0,0]],[[1,9,5,5,6,6,1,0],[9,5,12,14,14,1,1,0],[6,15,5,5,6,6,6,0],[13,5,12,12,14,14,1,0],[15,13,6,14,14,1,0,0],[13,5,15,5,6,6,1,0],[6,9,6,15,15,1,1,0],[5,6,5,5,1,3,3,1]],[[0,0,0,0,0,0,1,1],[0,0,0,0,1,1,6,6],[0,0,0,1,6,9,2,9],[0,0,1,6,9,2,9,6],[0,1,6,9,14,7,6,6],[0,1,9,14,7,6,6,15],[1,2,9,6,6,1,1,13],[1,9,6,1,1,1,1,1]],[[13,5,13,1,4,3,3,1],[5,13,1,11,1,4,4,1],[13,1,11,1,0,1,1,0],[1,5,1,0,0,0,0,0],[5,9,5,1,1,0,0,0],[12,5,1,5,6,1,0,0],[14,1,9,1,9,6,1,0],[15,1,5,6,1,5,1,0]],[[1,6,1,1,4,1,1,1],[0,1,1,4,4,4,4,1],[0,1,1,3,3,3,1,13],[1,5,9,1,3,3,4,1],[1,1,1,13,1,1,1,1],[1,4,3,1,15,5,9,5],[1,4,3,3,1,1,5,15],[1,4,4,3,1,9,1,1]],[[6,5,1,5,1,1,0,0],[9,15,6,1,0,0,0,0],[15,9,13,6,1,0,0,0],[13,15,2,9,6,1,0,0],[1,13,5,10,10,1,0,0],[0,1,13,11,9,1,0,0],[0,0,1,1,1,0,0,0],[0,0,0,0,0,0,0,0]],[[0,1,1,1,6,5,1,9],[0,0,0,0,1,1,13,5],[0,0,0,0,0,0,1,13],[0,0,0,0,0,0,0,1],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0]],[[1,1,0,0,1,1,1,0],[9,9,1,1,4,3,3,1],[9,2,9,9,1,3,3,1],[6,7,14,9,1,4,1,0],[6,6,7,14,9,1,0,0],[1,1,6,6,2,9,1,0],[2,8,1,1,6,6,9,1],[2,8,4,1,1,1,6,1]],[[0,1,6,6,5,5,9,1],[0,1,1,14,14,12,5,9],[1,6,6,6,5,5,15,6],[0,1,14,14,12,12,5,13],[0,0,1,14,14,6,13,15],[0,1,6,6,5,15,5,13],[0,0,1,15,15,9,6,1],[0,1,1,13,5,6,2,1]],[[4,3,3,1,13,1,1,0],[1,3,3,1,5,1,0,0],[1,3,1,13,1,0,0,0],[1,1,5,1,0,0,0,0],[9,5,9,1,0,0,0,0],[5,1,5,1,0,0,0,0],[1,1,1,0,0,0,0,0],[5,2,1,0,0,0,0,0]],[[1,9,6,1,1,5,6,1],[0,1,2,5,1,1,5,6],[1,13,5,6,5,15,1,1],[1,15,15,15,1,15,15,13],[1,10,9,10,1,3,3,1],[1,11,10,1,4,3,3,1],[0,1,11,1,4,4,4,1],[1,5,1,15,1,1,1,1]],[[1,6,1,0,0,0,0,0],[1,1,0,0,0,0,0,0],[9,1,0,0,0,0,0,0],[15,1,0,0,0,0,0,0],[1,0,0,0,0,0,0,0],[11,1,0,0,0,0,0,0],[10,11,1,0,0,0,0,0],[1,1,0,0,0,0,0,0]],[[1,5,13,13,1,5,9,6],[1,5,13,1,1,5,9,6],[1,5,13,1,5,15,15,15],[1,5,1,1,5,6,9,6],[1,5,1,1,5,6,9,15],[0,1,0,0,1,6,15,11],[0,0,0,0,0,1,1,11],[0,0,0,0,0,0,0,1]],[[0,0,0,0,0,0,0,0],[0,0,1,0,0,0,0,0],[0,1,6,1,0,0,0,0],[1,5,12,1,0,0,0,0],[6,1,14,1,0,0,0,0],[9,6,1,0,0,0,0,0],[9,6,1,0,0,0,0,0],[2,9,6,1,0,0,0,0]],[[1,0,0,0,0,0,0,0],[6,1,0,0,0,0,0,0],[12,6,1,1,1,1,1,0],[14,12,5,1,5,6,6,1],[5,14,12,5,6,6,6,6],[12,5,12,5,6,6,9,9],[14,12,5,5,6,6,9,2],[5,12,15,13,5,6,9,9]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,1],[0,0,0,0,0,0,0,1],[0,0,0,0,0,0,1,6],[0,0,0,0,0,0,0,1],[0,0,0,0,0,0,0,1],[0,0,0,0,0,0,1,6],[0,1,1,1,1,1,1,1]],[[2,6,7,1,0,0,0,0],[6,5,14,1,0,0,0,0],[5,13,7,1,0,0,0,0],[9,6,1,1,0,0,0,0],[6,6,1,3,1,0,1,0],[5,1,1,4,3,1,3,1],[13,1,3,1,3,1,3,1],[1,1,1,1,1,1,1,0]],[[1,5,15,13,7,7,5,9],[1,1,15,13,5,7,14,5],[9,5,1,15,13,5,7,13],[1,1,1,13,15,13,13,6],[11,15,3,3,1,1,1,13],[15,4,3,3,1,4,4,1],[15,4,4,4,1,1,1,1],[1,1,1,1,1,1,1,1]],[[1,11,10,11,15,6,1,1],[0,1,11,15,9,6,1,6],[0,1,15,5,9,6,1,1],[0,1,5,15,9,6,1,1],[0,1,15,1,1,1,1,10],[0,1,13,5,6,1,11,11],[0,0,1,13,5,5,1,11],[0,0,0,1,1,1,1,1]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,1,0,0,0,0],[0,0,1,6,1,0,0,0],[0,0,1,6,1,0,0,0],[0,0,1,6,1,0,0,0]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,1,1,0,0],[0,0,0,1,12,12,1,0],[0,1,0,1,12,14,12,1],[1,6,1,1,1,1,1,1],[1,2,6,1,1,12,12,1]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,1,1,1,0,1,1,0],[1,11,10,11,1,3,3,1],[1,11,11,1,4,3,3,1],[0,1,1,1,4,4,4,1],[0,0,0,0,1,1,1,0]],[[0,1,6,2,6,1,0,0],[1,1,6,2,6,1,0,0],[13,1,6,2,6,1,0,0],[1,5,6,2,6,5,1,1],[1,1,5,6,1,1,1,9],[6,5,1,1,6,1,2,6],[5,6,6,9,1,5,6,1],[6,6,9,2,9,1,1,0]],[[1,9,2,6,1,1,1,1],[0,1,9,2,6,1,5,6],[0,1,6,9,2,6,1,5],[0,1,5,6,9,2,6,1],[0,0,1,5,6,1,1,6],[0,1,1,1,1,6,1,1],[1,9,1,1,14,12,6,5],[1,6,2,1,5,14,12,5]],[[1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1]],[[6,6,7,9,2,9,1,0],[6,7,12,5,9,9,1,1],[5,5,7,14,6,6,1,1],[15,1,5,5,6,9,2,1],[1,2,1,1,5,6,9,1],[1,2,8,4,1,5,6,1],[6,1,4,4,4,1,5,1],[1,0,1,1,1,0,1,0]],[[0,1,6,1,14,5,12,5],[0,1,1,1,5,12,5,5],[1,11,10,1,1,5,15,15],[1,1,1,11,1,1,5,5],[1,4,4,1,0,1,6,5],[1,3,3,4,1,0,1,6],[1,3,3,4,1,0,0,1],[0,1,1,1,0,0,0,0]],[[0,0,0,0,0,0,0,0],[1,1,0,0,0,0,0,0],[9,9,1,1,0,0,0,0],[9,2,9,9,1,0,0,0],[6,7,14,9,1,0,0,0],[6,6,7,14,9,1,0,0],[1,1,6,6,2,9,1,0],[4,4,1,1,6,6,9,1]],[[0,0,1,1,1,1,1,0],[0,1,6,6,5,5,9,1],[0,1,1,14,14,12,5,9],[1,6,6,6,5,5,15,6],[0,1,14,14,12,12,5,13],[0,0,1,14,14,6,13,15],[0,1,6,6,5,15,5,13],[0,0,1,15,15,9,6,1]],[[1,1,4,1,1,1,6,1],[4,3,3,1,5,13,1,0],[1,3,3,1,13,1,0,0],[1,3,1,5,6,5,1,0],[1,1,1,1,1,1,0,0],[3,1,4,3,3,1,0,0],[4,1,1,4,4,1,0,0],[3,3,3,1,1,0,0,0]],[[0,1,1,13,5,6,2,1],[1,9,6,1,1,5,6,1],[0,1,2,5,1,1,5,6],[1,13,5,6,5,15,1,1],[1,15,15,15,1,15,15,13],[1,1,4,3,15,1,1,1],[1,1,4,15,10,9,15,3],[1,1,1,15,11,10,15,3]],[[4,1,1,1,0,0,0,0],[1,1,0,0,0,0,0,0],[9,6,1,1,0,0,0,0],[15,15,15,9,1,0,0,0],[6,2,9,15,1,0,0,0],[6,2,15,11,1,0,0,0],[6,15,11,10,11,1,0,0],[1,1,1,1,1,0,0,0]],[[0,1,1,1,1,11,15,4],[1,5,13,13,1,1,5,1],[1,5,13,1,1,1,1,5],[1,5,13,1,15,15,1,1],[1,5,1,13,5,13,1,5],[1,5,1,13,5,13,1,5],[1,5,1,13,5,15,1,5],[0,1,0,1,1,1,1,1]],[[1,1,4,1,1,1,6,1],[4,3,3,1,5,13,1,0],[1,3,3,1,13,1,0,0],[1,3,1,5,6,5,1,0],[1,1,1,1,1,1,0,0],[1,1,3,3,1,0,0,0],[3,3,1,3,3,1,0,0],[3,3,1,3,1,0,0,0]]]},{"palette":[{"r":0,"g":12,"b":0},{"r":0,"g":0,"b":0},{"r":31,"g":31,"b":31},{"r":31,"g":21,"b":12},{"r":24,"g":16,"b":10},{"r":0,"g":0,"b":31},{"r":10,"g":26,"b":11},{"r":31,"g":6,"b":27},{"r":0,"g":14,"b":0},{"r":22,"g":31,"b":25},{"r":31,"g":31,"b":17},{"r":31,"g":25,"b":0},{"r":21,"g":13,"b":0},{"r":21,"g":0,"b":17},{"r":0,"g":16,"b":31},{"r":3,"g":18,"b":7}],"tilesheet":[[[1,0,0,0,0,0,0,0],[6,1,1,0,0,0,0,0],[9,6,6,1,0,0,0,0],[9,9,6,1,1,0,0,0],[6,9,9,6,6,1,0,0],[15,6,9,9,9,6,1,0],[4,15,6,9,1,6,6,1],[4,4,15,6,6,1,6,1]],[[0,0,0,0,0,1,1,1],[0,0,0,1,1,6,6,6],[0,0,1,6,6,9,9,9],[0,1,6,6,6,6,9,9],[0,1,6,1,1,6,6,6],[1,15,1,13,7,1,15,15],[1,15,1,13,13,1,4,4],[1,15,15,1,1,4,4,4]],[[4,1,1,15,6,6,1,0],[4,8,2,1,6,6,1,0],[3,8,2,15,15,6,1,0],[3,3,3,1,15,1,0,0],[3,3,1,0,1,0,0,0],[1,1,14,1,0,0,0,0],[5,5,10,14,1,1,1,0],[11,10,14,1,1,3,3,1]],[[1,15,3,15,4,1,1,4],[1,15,3,15,1,2,8,4],[0,1,3,15,4,2,8,3],[0,0,1,1,1,4,3,3],[0,0,0,1,11,1,3,3],[0,0,1,11,10,11,1,1],[0,0,1,1,1,1,5,11],[0,1,7,7,1,3,3,1]],[[5,14,1,7,1,4,3,1],[14,14,1,1,1,1,1,0],[14,14,14,1,0,0,0,0],[11,10,11,1,0,0,0,0],[1,1,1,0,0,0,0,0],[1,0,0,0,0,0,0,0],[4,1,0,0,0,0,0,0],[1,0,0,0,0,0,0,0]],[[0,1,13,7,1,4,3,1],[0,0,1,1,1,1,1,5],[0,0,1,11,11,1,12,11],[0,1,11,10,1,4,1,1],[1,11,10,11,1,4,3,4],[0,1,11,1,1,4,12,13],[0,0,1,0,1,13,3,3],[0,0,0,0,0,1,1,1]],[[0,0,0,0,0,0,0,0],[1,0,0,0,0,0,0,0],[6,1,1,0,0,0,0,0],[9,6,6,1,0,0,0,0],[9,9,6,1,1,0,0,0],[6,9,9,6,6,1,0,0],[15,6,9,9,9,6,1,0],[4,15,6,1,1,6,6,1]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,1,1,1],[0,0,0,1,1,6,6,6],[0,0,1,6,6,9,9,9],[0,1,6,6,6,6,9,9],[0,1,6,1,1,6,6,6],[1,15,1,13,7,1,1,15],[1,15,1,1,1,3,3,1]],[[4,4,1,3,3,1,6,1],[4,1,1,4,3,1,1,0],[4,8,2,1,1,7,1,0],[3,8,2,1,13,7,1,0],[3,3,3,1,13,13,1,0],[3,3,1,4,3,3,1,0],[1,1,14,1,3,1,0,0],[5,5,10,14,1,0,0,0]],[[1,15,1,13,1,4,3,1],[1,15,1,13,7,1,1,4],[1,1,13,7,13,1,8,4],[0,1,13,13,1,2,8,3],[0,1,4,3,1,4,3,3],[0,1,4,3,3,1,3,3],[0,0,1,4,3,3,1,1],[0,0,0,1,4,1,5,11]],[[11,10,14,1,0,0,0,0],[5,14,1,0,0,0,0,0],[14,14,1,0,0,0,0,0],[14,14,14,1,0,0,0,0],[11,10,11,1,0,0,0,0],[1,1,1,0,0,0,0,0],[4,3,3,1,0,0,0,0],[1,1,1,0,0,0,0,0]],[[0,0,1,11,1,5,5,5],[0,1,11,10,11,1,5,14],[1,11,10,11,1,12,5,5],[1,12,11,1,4,1,12,11],[0,1,12,1,4,3,1,1],[0,0,1,4,12,13,1,13],[0,0,1,13,3,3,4,1],[0,0,0,1,1,1,1,1]],[[5,14,1,7,1,4,3,1],[14,14,14,1,1,1,1,0],[5,14,14,11,1,0,0,0],[11,10,11,1,1,1,0,0],[1,1,1,13,4,3,1,0],[1,1,4,13,3,1,0,0],[1,1,1,4,1,0,0,0],[1,1,1,1,0,0,0,0]],[[0,1,13,7,1,4,3,1],[0,0,1,1,1,1,1,5],[0,0,0,1,4,1,11,11],[0,0,1,4,3,3,1,1],[0,1,4,13,13,4,1,0],[0,0,1,4,3,1,1,1],[0,0,0,1,4,3,1,1],[0,0,0,0,1,1,1,1]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[1,1,0,0,0,0,0,0],[6,6,1,1,0,0,0,0]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,1,1],[0,0,0,0,1,1,6,6]],[[9,9,6,6,1,0,0,0],[9,9,9,6,1,1,0,0],[9,9,9,9,9,6,1,0],[6,9,9,6,6,9,1,0],[15,6,9,6,1,6,6,1],[1,8,6,6,6,1,6,1],[4,4,15,15,6,6,1,0],[4,4,8,2,1,6,1,0]],[[0,0,0,1,6,6,9,9],[0,0,1,6,6,9,6,9],[0,1,15,1,1,6,6,6],[0,1,1,13,7,1,15,15],[0,1,1,13,13,1,15,4],[0,1,15,1,1,15,4,4],[0,0,1,3,15,1,1,1],[0,0,1,3,15,2,8,8]],[[3,3,3,3,1,15,1,0],[3,3,3,1,0,1,0,0],[1,1,1,3,1,0,0,0],[1,13,7,13,1,0,0,0],[1,13,13,1,4,1,0,0],[3,1,3,3,1,3,1,0],[3,1,4,3,1,4,4,1],[1,1,1,1,1,1,1,0]],[[0,0,0,1,1,1,4,3],[0,0,0,1,3,3,1,3],[0,0,0,1,4,3,3,1],[0,0,0,1,1,13,7,13],[0,0,1,13,4,1,13,13],[0,1,3,12,3,3,1,3],[1,4,4,13,4,4,1,4],[0,1,1,1,1,1,1,1]],[[4,1,1,15,6,6,1,0],[4,8,2,1,6,6,1,0],[3,8,2,15,15,6,1,0],[3,3,3,1,15,1,1,0],[3,3,1,4,1,3,1,0],[1,1,14,1,3,1,0,0],[5,5,10,14,1,0,0,0],[11,10,14,1,0,0,0,0]],[[5,14,1,0,0,0,0,0],[14,14,14,1,0,0,0,0],[5,14,14,11,1,0,0,0],[11,10,11,1,1,1,0,0],[1,1,1,13,4,3,1,0],[1,1,4,13,3,1,0,0],[1,1,1,4,1,0,0,0],[1,1,1,1,0,0,0,0]],[[4,1,1,15,6,6,1,0],[4,8,2,1,6,6,1,0],[3,8,2,15,15,6,1,0],[3,3,3,1,15,1,0,0],[1,3,1,0,1,0,0,0],[3,1,1,1,0,1,1,0],[3,13,7,7,1,3,3,1],[4,13,13,13,1,4,3,1]],[[1,15,3,15,4,1,1,4],[1,15,3,15,1,2,8,4],[0,1,3,15,4,2,8,3],[0,0,1,1,1,4,1,1],[0,0,0,1,11,1,10,11],[0,0,1,11,1,11,11,3],[0,0,1,11,1,5,1,4],[0,1,11,10,1,1,5,1]],[[1,1,1,1,0,1,1,0],[14,14,14,1,0,0,0,0],[5,14,14,11,1,0,0,0],[11,10,11,1,1,1,0,0],[1,1,1,13,4,3,1,0],[1,1,4,13,3,1,0,0],[1,1,1,4,1,0,0,0],[1,1,1,1,0,0,0,0]],[[1,11,10,1,5,5,5,5],[1,12,11,1,1,5,5,5],[0,1,12,1,4,1,11,11],[0,0,1,4,3,3,1,1],[0,1,4,13,13,4,1,0],[0,0,1,4,3,1,1,1],[0,0,0,1,4,3,1,1],[0,0,0,0,1,1,1,1]],[[0,0,0,0,0,1,1,1],[0,0,0,1,1,6,6,6],[0,0,1,6,6,9,9,9],[0,1,6,6,6,6,9,9],[0,1,6,1,1,6,6,6],[1,1,1,13,7,1,15,15],[1,3,3,1,13,1,4,4],[1,4,3,1,1,4,4,4]],[[1,1,1,1,4,1,1,4],[1,13,7,1,1,2,8,4],[1,13,7,1,4,2,8,3],[1,13,13,3,1,4,3,3],[0,1,4,3,3,1,3,3],[0,0,1,4,3,4,1,1],[0,1,11,1,4,1,5,11],[0,1,11,10,1,5,5,5]],[[5,14,1,7,1,4,3,1],[14,14,14,1,1,1,1,0],[5,14,14,11,1,0,0,0],[11,10,11,1,1,1,0,0],[1,1,1,13,4,3,1,0],[1,1,4,13,3,1,0,0],[1,1,1,4,1,0,0,0],[1,1,1,1,0,0,0,0]],[[1,11,10,11,1,1,5,14],[1,12,11,12,1,12,5,5],[0,1,12,1,4,1,11,11],[0,0,1,4,3,3,1,1],[0,1,4,13,13,4,1,0],[0,0,1,4,3,1,1,1],[0,0,0,1,4,3,1,1],[0,0,0,0,1,1,1,1]],[[1,1,1,0,0,0,0,0],[6,6,6,1,1,1,0,0],[9,9,9,6,6,6,1,0],[6,9,9,6,1,1,0,0],[6,6,9,9,6,1,1,0],[15,6,6,6,6,6,6,1],[4,15,15,6,1,1,1,0],[4,4,1,1,6,6,6,1]],[[0,0,0,0,1,1,0,1],[0,0,1,1,6,6,1,6],[1,1,7,7,1,6,6,9],[0,1,13,7,1,6,6,6],[1,6,1,1,6,15,15,15],[1,6,6,6,15,4,4,4],[1,15,15,15,4,4,4,4],[1,15,3,15,4,1,1,4]],[[3,1,4,15,15,15,1,0],[13,3,3,15,15,1,0,0],[13,3,3,1,1,0,0,0],[13,3,1,1,0,0,0,0],[1,1,3,3,1,0,0,0],[12,1,4,3,1,0,0,0],[14,5,1,13,1,0,0,0],[14,14,5,1,0,0,0,0]],[[1,15,3,15,4,3,3,1],[0,1,3,15,4,3,3,3],[0,0,1,1,1,3,3,13],[0,1,3,4,1,1,3,13],[1,3,3,1,3,3,1,1],[1,4,13,13,4,3,1,12],[0,1,13,7,13,1,5,14],[0,0,1,1,1,1,12,11]],[[11,11,10,11,1,0,0,0],[1,1,1,1,0,0,0,0],[13,3,3,1,0,0,0,0],[3,3,1,0,0,0,0,0],[4,1,0,0,0,0,0,0],[1,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0]],[[0,0,0,1,4,4,1,1],[0,0,0,1,1,4,3,3],[0,0,1,13,3,1,4,3],[0,0,1,3,13,4,1,13],[0,0,1,3,4,1,0,1],[0,0,1,4,1,0,0,0],[0,0,0,1,0,0,0,0],[0,0,0,0,0,0,0,0]],[[6,1,1,0,0,0,0,0],[9,6,6,1,0,0,0,0],[9,9,6,1,1,0,0,0],[6,9,9,6,6,1,0,0],[15,6,9,9,9,6,1,0],[4,15,6,9,6,1,3,1],[4,4,15,6,1,3,3,1],[4,1,1,15,1,3,1,0]],[[0,0,0,1,1,6,6,6],[0,0,1,6,6,9,9,9],[0,1,6,6,6,6,9,9],[0,1,1,1,1,6,6,6],[1,3,3,1,7,1,15,15],[1,4,3,3,1,1,4,4],[0,1,4,3,1,4,4,4],[0,1,1,1,1,1,1,4]],[[4,8,2,1,6,1,13,1],[3,8,2,15,1,7,13,1],[13,3,3,1,4,13,1,0],[13,3,1,4,3,3,1,0],[1,1,14,1,3,1,0,0],[5,5,10,14,1,0,0,0],[11,10,14,1,0,0,0,0],[5,14,1,0,0,0,0,0]],[[0,1,13,7,1,2,8,4],[0,1,13,7,1,2,8,3],[0,1,13,13,1,4,3,3],[0,0,1,3,3,1,3,3],[0,0,1,4,3,3,1,1],[0,1,0,1,4,1,5,11],[1,11,1,1,1,5,5,5],[1,10,11,10,10,1,5,14]],[[14,14,1,0,0,0,0,0],[14,14,14,1,0,0,0,0],[11,10,11,1,0,0,0,0],[1,1,1,0,0,0,0,0],[1,0,0,0,0,0,0,0],[1,0,0,0,0,0,0,0],[4,1,0,0,0,0,0,0],[1,0,0,0,0,0,0,0]],[[1,11,10,11,1,12,5,5],[0,1,11,1,1,1,12,11],[0,0,1,0,1,4,1,1],[0,0,0,0,1,4,3,4],[0,0,0,0,1,4,3,4],[0,0,0,0,1,13,12,13],[0,0,0,0,0,1,4,3],[0,0,0,0,0,0,1,1]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,1,1,0,0,0,0,0],[1,6,6,1,0,0,0,0],[6,6,1,1,0,0,0,0],[6,15,6,6,1,1,0,0],[6,6,9,9,6,6,1,0],[6,9,6,9,9,6,6,1]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,1],[0,0,0,0,0,0,1,15],[1,0,0,0,0,1,15,6],[11,1,0,0,1,15,6,6],[10,11,1,1,15,6,6,6]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,1],[0,0,0,0,0,0,1,11],[0,0,0,0,0,1,10,10],[0,0,0,0,0,1,11,11]],[[6,6,9,9,6,1,6,1],[6,6,6,9,6,6,1,0],[15,15,6,6,6,6,1,0],[3,3,15,6,15,6,6,1],[1,1,1,1,1,15,6,1],[13,7,13,3,3,1,15,1],[13,13,13,4,3,1,0,0],[1,1,1,1,1,0,0,0]],[[11,10,11,1,15,6,6,6],[1,11,1,15,15,15,6,6],[14,1,1,15,15,15,15,15],[11,14,14,1,15,1,1,4],[11,14,14,14,1,4,3,1],[11,5,5,1,4,3,3,3],[5,5,5,5,1,1,4,4],[1,1,1,1,1,1,1,1]],[[0,0,0,0,0,0,1,1],[0,0,0,0,0,1,11,14],[0,0,0,0,0,0,1,10],[0,0,0,1,1,1,1,1],[0,0,1,4,4,4,4,1],[0,1,3,12,3,3,3,1],[1,4,4,13,4,4,1,12],[0,1,1,1,1,1,1,1]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[1,0,0,0,0,0,0,0],[1,0,0,0,0,0,0,0]],[[1,1,0,0,0,0,0,0],[10,10,1,1,0,0,0,0],[2,2,10,10,1,0,0,0],[2,2,2,10,1,1,0,0],[10,10,2,2,10,10,1,0],[11,11,10,2,2,2,10,1],[12,12,11,10,2,1,10,10],[12,12,12,11,10,10,1,10]],[[0,0,0,0,0,0,1,1],[0,0,0,0,1,1,10,10],[0,0,0,1,11,11,2,2],[0,0,1,11,11,11,10,2],[0,0,1,11,1,1,11,10],[0,1,12,1,12,2,1,11],[0,1,12,1,12,11,1,12],[0,1,12,12,1,1,12,12]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[1,1,0,0,0,0,0,0],[10,10,1,0,0,0,0,0],[10,10,1,0,0,0,0,0],[4,10,1,0,0,0,0,0],[1,1,0,0,0,0,0,0]],[[12,12,1,1,11,10,10,1],[12,12,8,2,1,11,10,1],[10,10,8,2,1,11,10,1],[10,12,10,1,1,11,1,0],[10,12,1,10,10,1,0,1],[1,1,1,10,10,1,1,1],[11,11,1,10,12,10,1,10],[12,12,12,1,1,1,0,1]],[[0,1,12,10,11,12,1,1],[0,1,12,10,11,1,2,8],[0,0,1,10,11,12,2,8],[0,0,0,1,1,1,12,10],[0,0,0,0,1,10,1,1],[1,0,0,1,4,10,10,12],[10,1,1,12,1,4,10,11],[11,10,10,11,12,1,1,12]],[[1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1]],[[1,1,1,0,0,0,0,0],[12,12,12,1,0,0,0,0],[10,12,12,12,1,0,0,0],[1,10,2,10,1,0,0,0],[1,1,1,1,1,0,0,0],[1,1,11,12,12,1,0,0],[1,1,12,11,10,10,1,0],[1,1,1,1,1,1,0,0]],[[12,11,11,1,1,12,12,1],[1,1,1,0,1,12,10,12],[0,0,0,1,12,1,1,10],[0,0,0,0,1,4,12,1],[0,0,0,0,1,4,10,11],[0,0,0,1,4,12,12,1],[0,0,0,1,13,11,10,11],[0,0,0,0,1,1,1,1]],[[0,0,0,0,0,0,0,0],[1,0,0,0,0,0,0,0],[6,1,1,0,0,0,0,0],[9,6,6,1,0,0,0,0],[9,9,6,1,1,0,0,0],[6,9,9,6,6,1,0,0],[15,6,9,9,9,6,1,0],[4,15,6,9,1,6,6,1]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,1,1,1],[0,0,0,1,1,6,6,6],[0,0,1,6,6,9,9,9],[0,1,6,6,6,6,9,9],[0,1,6,1,1,6,6,6],[1,15,1,13,7,1,15,15],[1,15,1,13,13,1,4,4]],[[4,4,15,6,6,1,6,1],[4,1,1,15,6,6,1,0],[4,4,4,1,15,6,1,0],[3,1,1,15,15,6,1,0],[3,3,3,1,15,1,0,0],[3,3,1,0,1,0,0,0],[1,1,1,0,0,0,0,0],[1,4,3,1,1,0,0,0]],[[1,15,15,1,1,1,4,4],[1,15,3,15,4,4,1,1],[1,15,3,15,1,4,4,4],[0,1,3,15,4,1,1,1],[0,0,1,1,1,4,3,3],[0,0,0,1,3,1,3,3],[0,0,1,4,3,3,1,1],[0,0,0,1,4,3,13,13]],[[3,3,1,3,3,1,0,0],[4,3,1,4,3,1,0,0],[1,1,1,1,1,0,0,0],[14,14,14,1,0,0,0,0],[11,10,11,1,0,0,0,0],[1,1,1,13,1,0,0,0],[1,4,13,3,3,1,0,0],[1,1,1,1,1,0,0,0]],[[0,0,0,0,1,13,7,1],[0,0,0,0,1,1,13,1],[0,0,0,1,12,12,1,1],[0,0,0,0,1,1,12,11],[0,0,0,1,4,3,1,1],[0,0,1,4,3,13,1,1],[0,0,1,4,13,3,3,1],[0,0,0,1,1,1,1,1]],[[4,4,15,6,6,1,6,1],[4,1,1,15,6,6,1,0],[4,4,4,1,15,6,1,0],[3,1,1,15,15,6,1,0],[13,3,3,1,15,1,0,0],[13,3,1,0,1,0,0,0],[1,1,1,1,0,0,0,0],[1,1,4,3,1,0,0,0]]]},{"palette":[{"r":0,"g":12,"b":0},{"r":0,"g":0,"b":0},{"r":31,"g":31,"b":31},{"r":31,"g":23,"b":14},{"r":25,"g":17,"b":8},{"r":27,"g":0,"b":17},{"r":16,"g":16,"b":31},{"r":31,"g":10,"b":31},{"r":0,"g":24,"b":31},{"r":23,"g":23,"b":31},{"r":31,"g":27,"b":0},{"r":8,"g":8,"b":27},{"r":28,"g":21,"b":0},{"r":21,"g":13,"b":0},{"r":17,"g":0,"b":23},{"r":11,"g":0,"b":17}],"tilesheet":[[[1,1,1,0,0,0,0,0],[9,9,9,1,0,0,1,0],[2,2,2,9,1,1,9,1],[9,9,9,2,9,9,6,1],[6,6,6,9,9,6,1,0],[3,3,3,6,9,1,9,1],[3,3,1,3,9,9,6,1],[1,1,8,1,9,6,1,0]],[[0,1,0,0,0,0,1,1],[1,9,1,0,0,1,9,9],[1,9,2,1,1,9,2,2],[1,6,9,2,9,2,9,9],[0,1,6,9,2,9,6,6],[1,9,1,6,9,6,3,3],[1,6,9,9,9,3,3,1],[1,1,6,9,9,4,1,8]],[[1,1,8,1,6,1,0,0],[9,2,1,9,1,10,1,0],[6,6,2,1,14,14,10,1],[11,11,6,2,1,10,1,0],[9,9,11,1,10,1,0,0],[9,2,6,1,1,1,1,0],[6,9,6,1,1,3,3,1],[1,9,1,5,1,4,3,1]],[[0,1,1,6,9,4,1,8],[0,1,12,1,6,9,4,1],[1,10,14,14,1,6,11,2],[0,1,10,10,14,1,2,6],[0,0,1,1,10,1,1,11],[0,1,7,7,1,1,1,6],[1,7,7,7,1,3,3,1],[1,7,7,7,1,4,3,1]],[[10,1,1,5,5,1,1,1],[14,15,1,1,5,5,5,1],[14,15,1,15,1,1,1,0],[14,14,15,1,15,12,1,0],[14,14,15,1,15,10,1,0],[10,14,12,1,13,10,1,0],[2,10,12,1,1,12,1,0],[1,1,1,0,0,1,0,0]],[[1,5,7,7,5,1,1,13],[1,1,5,5,1,15,15,14],[1,12,1,1,1,15,14,14],[1,12,15,1,15,15,14,14],[1,10,15,1,15,15,14,14],[1,10,13,1,12,15,10,14],[1,12,1,1,12,12,10,10],[0,1,0,1,1,1,1,1]],[[0,0,0,0,0,0,0,0],[1,1,1,0,0,0,0,0],[9,9,9,1,0,0,1,0],[2,2,2,9,1,1,9,1],[9,9,9,2,9,9,6,1],[6,6,6,9,9,6,1,0],[3,3,3,6,9,1,9,1],[3,3,1,3,9,9,6,1]],[[0,0,0,0,0,0,0,0],[0,1,0,0,0,0,1,1],[1,9,1,0,0,1,9,9],[1,9,2,1,1,9,2,2],[1,6,9,2,9,2,9,9],[0,1,6,9,2,9,6,6],[1,9,1,6,9,6,3,3],[1,6,9,9,9,3,3,1]],[[1,1,8,1,9,6,1,0],[1,1,8,1,6,1,0,0],[9,2,1,9,1,10,1,0],[1,6,2,1,14,14,10,1],[5,1,1,2,1,10,1,0],[7,7,7,1,10,1,0,0],[7,7,7,7,1,0,0,0],[7,7,7,7,7,1,0,0]],[[1,1,6,9,9,4,1,8],[0,1,1,6,9,4,1,8],[0,1,12,1,6,9,4,1],[1,10,14,14,1,6,1,1],[0,1,10,10,14,1,12,5],[0,0,1,1,1,12,5,7],[0,1,5,5,1,10,5,7],[1,1,1,7,5,1,10,5]],[[5,7,7,7,7,1,0,0],[5,7,7,7,7,7,1,0],[10,5,7,7,7,7,1,0],[10,5,7,7,7,7,7,1],[10,5,5,7,7,7,5,1],[12,5,5,5,5,5,13,1],[12,12,10,10,10,12,1,0],[1,1,1,1,1,1,0,0]],[[1,3,3,1,5,1,1,10],[1,4,3,1,5,1,15,10],[12,1,1,5,1,15,14,1],[10,15,15,1,15,15,14,1],[10,15,13,1,15,15,14,1],[10,13,1,15,15,12,14,1],[12,1,1,13,12,12,1,12],[1,0,0,1,1,1,1,1]],[[10,1,1,5,5,1,1,1],[14,15,1,1,5,5,5,1],[14,14,15,1,1,1,1,1],[14,14,15,1,15,15,12,1],[14,14,14,15,1,15,10,1],[14,10,14,12,1,13,10,1],[10,2,10,12,1,1,12,1],[1,1,1,1,0,0,1,0]],[[1,5,7,7,5,1,1,13],[12,1,5,5,1,15,15,14],[12,15,1,1,1,15,14,14],[10,15,15,1,15,15,14,14],[10,15,13,1,15,15,14,14],[10,13,1,15,15,12,14,10],[12,1,1,13,12,12,10,2],[1,0,0,1,1,1,1,1]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[1,1,1,0,0,0,0,0],[9,9,9,1,0,0,1,0],[2,2,9,9,1,1,2,1]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,1,0,0,0,0,1,1],[1,9,1,0,0,1,9,9],[1,2,9,1,1,9,9,2]],[[2,2,2,2,9,2,9,1],[9,9,9,2,2,9,6,1],[6,6,6,9,9,6,1,0],[3,3,3,6,9,1,9,1],[4,4,1,4,9,9,6,1],[1,1,8,1,9,6,1,1],[9,2,1,9,1,10,1,0],[6,6,2,1,14,14,10,1]],[[1,9,2,9,9,9,2,2],[1,6,9,2,9,2,9,9],[0,1,6,9,2,9,6,6],[1,9,1,6,9,6,4,3],[1,6,9,9,9,4,4,1],[1,1,6,9,9,4,1,8],[0,1,12,1,6,9,4,1],[1,10,14,14,1,6,11,2]],[[11,11,6,2,1,10,1,0],[9,9,11,1,10,1,0,0],[9,2,1,12,1,7,1,0],[1,9,1,12,5,7,1,0],[1,1,1,12,5,5,1,0],[3,1,15,1,12,5,5,1],[3,1,14,15,1,12,12,1],[1,1,1,1,1,1,1,0]],[[0,1,10,10,14,1,2,6],[0,0,1,1,12,1,1,11],[0,1,5,5,1,12,1,1],[1,5,7,5,12,1,7,5],[1,5,5,12,1,5,5,1],[1,5,5,12,1,5,1,3],[1,12,12,1,15,1,1,4],[0,1,1,1,1,1,1,1]],[[1,1,8,1,6,1,0,0],[9,2,1,9,1,7,1,0],[6,6,2,1,5,7,7,1],[11,11,6,2,1,5,7,1],[9,9,11,1,5,5,1,0],[9,2,6,1,5,1,0,0],[6,9,6,1,1,12,1,0],[1,9,1,15,15,10,1,0]],[[10,1,1,15,15,15,10,1],[14,15,1,13,13,15,10,1],[14,14,15,1,1,13,10,1],[14,14,15,1,0,1,12,1],[14,14,14,15,1,0,1,0],[14,10,14,12,1,0,0,0],[10,2,10,12,1,0,0,0],[1,1,1,1,0,0,0,0]],[[1,1,8,1,6,1,0,0],[9,2,1,9,1,0,0,0],[6,6,2,1,0,0,0,0],[11,11,6,2,1,0,0,0],[1,1,11,1,0,0,0,0],[7,7,1,1,0,1,1,0],[7,7,7,7,1,3,3,1],[5,7,7,7,1,4,3,1]],[[0,1,1,1,1,4,1,8],[1,12,12,10,10,1,4,1],[0,1,5,5,5,10,1,2],[0,0,1,1,5,5,12,1],[0,0,0,0,1,1,1,7],[0,0,0,1,5,1,5,7],[0,0,0,1,5,1,5,5],[0,0,1,5,5,12,1,5]],[[5,5,5,5,5,1,1,0],[1,5,5,5,1,0,0,0],[14,1,1,1,0,0,0,0],[14,14,15,1,0,0,0,0],[14,14,14,15,1,0,0,0],[14,10,14,12,1,0,0,0],[10,2,10,12,1,0,0,0],[1,1,1,1,0,0,0,0]],[[0,0,1,5,10,1,13,1],[0,1,5,5,10,1,15,14],[1,5,5,10,1,15,14,14],[1,5,5,10,1,15,14,14],[1,5,12,1,15,15,14,14],[1,12,1,15,15,12,14,10],[0,1,1,13,12,12,10,2],[0,0,0,1,1,1,1,1]],[[0,1,0,0,0,0,1,1],[1,9,1,0,0,1,9,9],[1,9,2,1,1,9,2,2],[1,6,9,2,9,2,9,9],[0,1,6,9,2,9,6,6],[1,1,1,6,9,6,3,3],[1,3,3,1,9,3,3,1],[1,4,3,1,9,4,1,8]],[[0,1,1,6,9,4,1,8],[1,7,7,1,6,9,4,1],[1,5,7,7,1,6,11,2],[1,5,7,7,7,1,2,6],[1,5,5,7,7,15,1,11],[1,5,5,5,5,15,1,6],[0,1,5,5,1,15,15,1],[0,0,1,1,1,15,14,15]],[[10,1,1,5,5,1,1,1],[14,15,1,1,5,5,5,1],[14,14,15,1,1,1,1,1],[14,14,15,1,15,15,12,1],[14,14,14,15,1,15,10,1],[14,10,14,12,1,13,10,1],[10,2,10,12,1,1,12,1],[1,1,1,1,0,0,1,0]],[[0,1,12,15,1,13,12,12],[0,1,10,15,1,15,15,14],[1,10,15,15,1,15,14,14],[1,10,13,1,15,15,14,14],[1,12,1,1,15,15,14,14],[0,1,1,15,15,12,14,10],[0,0,1,13,12,12,10,2],[0,0,0,1,1,1,1,1]],[[0,0,0,0,0,0,0,0],[1,0,0,0,0,0,0,0],[9,1,1,0,0,0,0,0],[2,9,9,1,0,0,0,0],[9,2,2,9,1,0,0,0],[6,9,2,9,1,1,1,0],[3,6,9,9,1,9,2,1],[3,3,6,9,9,2,1,0]],[[0,0,0,1,0,0,0,0],[0,0,1,2,1,1,1,1],[0,1,9,2,1,9,9,9],[0,1,6,9,2,1,9,2],[1,2,1,6,9,2,9,9],[1,9,2,1,6,9,6,6],[1,6,9,2,9,6,3,3],[0,1,6,9,6,3,4,1]],[[1,1,3,6,9,1,0,0],[1,8,1,6,9,2,1,0],[8,1,6,1,1,1,0,0],[1,6,1,3,3,1,1,0],[2,1,1,4,3,1,7,1],[1,15,1,1,1,7,5,1],[1,14,1,5,5,5,1,0],[1,12,14,1,1,1,0,0]],[[0,0,1,6,6,4,1,8],[0,1,1,6,4,1,8,1],[1,10,14,1,6,4,1,1],[0,1,10,14,1,11,9,2],[0,1,1,10,1,2,11,11],[1,3,3,1,1,1,9,9],[1,4,3,1,15,1,9,2],[5,1,1,5,13,15,1,9]],[[10,14,15,14,14,12,1,0],[14,14,14,15,10,1,0,0],[14,14,14,2,1,0,0,0],[14,14,15,10,1,0,0,0],[14,12,10,1,0,0,0,0],[13,1,1,0,0,0,0,0],[13,1,0,0,0,0,0,0],[1,0,0,0,0,0,0,0]],[[1,5,7,1,15,12,10,1],[0,1,1,1,15,15,14,14],[0,0,0,0,1,15,14,14],[0,0,0,0,1,15,15,14],[0,0,0,0,0,1,15,15],[0,0,0,0,0,0,1,15],[0,0,0,0,0,0,0,1],[0,0,0,0,0,0,0,0]],[[1,1,1,0,0,0,0,0],[9,9,9,1,0,0,1,0],[2,2,2,9,1,1,9,1],[9,9,9,2,9,9,6,1],[6,6,6,9,9,6,1,0],[3,3,3,6,9,1,9,1],[3,3,1,3,9,9,6,1],[1,1,8,1,9,6,1,0]],[[0,1,0,0,0,0,1,1],[1,9,1,0,0,1,9,9],[1,9,2,1,1,9,2,2],[1,6,1,3,1,2,9,9],[0,1,3,3,1,9,6,6],[1,1,3,4,1,6,3,3],[1,1,4,3,3,1,3,1],[1,5,1,1,1,4,1,8]],[[1,1,8,1,6,1,0,0],[9,2,1,9,1,10,1,0],[6,6,2,1,14,14,10,1],[1,1,6,2,1,10,1,0],[9,1,11,1,10,1,0,0],[9,2,6,1,1,0,0,0],[6,9,6,1,1,1,1,0],[1,9,1,5,1,3,3,1]],[[1,5,7,5,1,4,1,8],[1,5,7,5,1,9,4,1],[1,5,7,7,5,1,11,2],[1,5,7,7,5,1,2,6],[0,1,5,7,5,1,1,11],[0,0,1,5,1,14,1,6],[0,1,12,1,15,14,14,1],[1,12,15,15,1,15,14,14]],[[12,1,1,5,1,4,3,1],[14,15,1,1,5,1,1,0],[14,14,15,1,1,12,1,0],[14,14,15,1,15,15,12,1],[14,14,14,15,1,15,10,1],[14,10,14,12,1,13,10,1],[10,2,10,12,1,1,12,1],[1,1,1,1,0,0,1,0]],[[1,10,15,15,1,13,12,10],[10,15,15,15,1,15,15,14],[10,15,13,13,1,15,14,14],[12,13,1,1,15,15,14,14],[12,1,0,1,15,15,14,14],[1,0,1,15,15,12,14,10],[0,0,1,13,12,12,10,2],[0,0,0,1,1,1,1,1]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,1,1,0,1,1,1,0],[1,6,2,1,6,9,2,1],[6,2,1,6,9,2,1,0],[9,9,1,6,9,1,0,0],[9,9,6,9,9,1,0,0]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,1,0,1],[1,1,0,1,1,12,1,6],[7,7,1,5,5,10,1,6]],[[0,0,0,0,0,0,0,0],[0,0,0,1,0,0,0,0],[0,0,1,12,1,0,0,0],[0,1,12,5,1,0,0,0],[0,1,12,5,7,1,0,0],[0,1,12,5,7,7,1,1],[1,12,5,7,5,5,7,7],[1,12,5,7,7,7,7,7]],[[9,2,2,2,2,9,1,0],[6,9,9,2,2,2,9,1],[9,6,6,9,9,2,9,1],[6,1,1,6,9,2,9,1],[1,3,3,1,6,9,6,1],[1,4,3,1,6,6,6,1],[5,1,1,1,6,6,1,0],[1,1,1,1,1,1,0,0]],[[7,7,5,1,5,10,1,6],[5,5,5,1,1,12,1,6],[12,12,12,1,5,1,1,6],[1,1,1,5,7,5,1,6],[15,13,1,5,7,7,7,7],[14,12,14,1,5,7,7,7],[15,13,15,1,1,5,5,5],[1,1,1,1,1,1,1,1]],[[1,12,5,5,7,7,7,7],[0,1,12,5,5,7,7,5],[0,1,12,5,5,5,5,12],[1,12,12,12,12,12,12,1],[0,1,1,1,1,1,1,15],[1,1,11,1,12,14,14,14],[1,11,11,1,13,15,15,15],[0,1,1,1,1,1,1,1]],[[0,0,0,0,0,0,0,0],[0,2,2,2,2,2,2,0],[2,2,2,5,5,2,2,2],[2,2,2,5,5,2,2,2],[2,2,2,5,5,2,2,2],[2,2,2,2,2,2,2,2],[2,2,2,5,5,2,2,2],[0,2,2,2,2,2,2,0]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[1,1,1,0,0,0,0,0],[9,9,9,1,0,0,1,0],[2,2,9,9,1,1,2,1],[2,2,2,2,9,2,9,1],[9,9,9,2,2,9,6,1],[6,6,6,9,9,6,1,0]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,1,0,0,0,0,1,1],[1,9,1,0,0,1,9,9],[1,2,9,1,1,9,9,2],[1,9,2,9,9,9,2,2],[1,6,9,2,9,2,9,9],[0,1,6,9,2,9,6,6]],[[0,0,0,2,2,0,0,0],[0,2,2,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0]],[[3,3,3,6,9,1,9,1],[4,4,1,4,9,9,6,1],[1,1,8,1,9,6,1,1],[9,2,1,9,1,10,1,0],[1,1,3,1,14,14,10,1],[3,3,3,3,1,10,1,0],[1,1,4,3,1,5,1,0],[9,2,1,1,5,7,5,1]],[[1,9,1,6,9,6,4,3],[1,6,9,9,9,4,4,1],[1,1,6,9,9,4,1,8],[0,1,12,1,6,9,4,1],[1,10,14,14,1,6,11,2],[0,1,10,10,14,1,2,1],[0,0,1,1,12,1,1,11],[0,0,1,5,1,12,1,1]],[[1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1]],[[1,9,1,5,7,7,5,1],[5,1,1,1,5,5,1,0],[1,14,14,1,1,1,0,0],[14,14,14,15,1,12,1,0],[14,14,14,14,1,15,10,1],[10,14,10,14,1,13,10,1],[2,10,2,10,1,1,12,1],[1,1,1,1,1,1,1,0]],[[0,0,1,5,5,10,1,5],[0,1,5,5,10,1,5,5],[1,5,5,10,15,1,1,1],[1,5,10,15,1,15,15,14],[1,5,10,15,1,15,14,14],[1,5,10,1,15,15,12,14],[1,12,10,1,13,12,12,10],[0,1,1,1,1,1,1,1]],[[1,1,1,0,0,0,0,0],[9,9,9,1,0,0,1,0],[2,2,2,9,1,1,9,1],[9,9,9,2,9,9,6,1],[6,6,6,9,9,6,1,0],[3,3,3,6,9,1,9,1],[3,3,1,3,9,9,6,1],[1,1,8,1,9,6,1,0]],[[0,1,0,0,0,0,1,1],[1,9,1,0,0,1,9,9],[1,9,2,1,1,9,2,2],[1,6,9,2,9,2,9,9],[0,1,6,9,2,9,6,6],[1,9,1,6,9,6,3,3],[1,6,9,9,9,3,3,1],[1,1,6,9,9,4,1,8]],[[1,1,8,1,6,1,0,0],[9,2,1,9,1,10,1,0],[6,6,2,1,14,14,10,1],[11,11,6,2,1,10,1,0],[9,9,1,1,10,1,0,0],[1,1,13,1,1,3,1,0],[1,13,10,13,1,3,3,1],[1,1,13,1,1,1,3,1]],[[0,1,1,6,9,4,1,8],[0,1,12,1,6,9,4,1],[1,10,14,14,1,6,11,2],[0,1,10,10,14,1,2,6],[0,0,1,1,10,1,1,1],[0,0,1,5,1,1,1,3],[0,1,5,7,5,1,3,3],[0,1,5,7,7,1,3,1]],[[10,1,1,1,5,5,1,5],[14,15,1,15,1,5,5,1],[14,14,15,1,15,1,1,0],[14,14,15,1,15,15,12,1],[14,14,14,15,1,15,10,1],[14,10,14,12,1,13,10,1],[10,2,10,12,1,1,12,1],[1,1,1,1,0,0,1,0]],[[0,1,5,5,7,5,1,12],[0,0,1,5,5,1,1,14],[0,1,12,1,1,15,14,14],[1,12,15,1,15,15,14,14],[1,10,15,1,15,15,14,14],[1,10,1,15,15,12,14,10],[1,12,1,13,12,12,10,2],[0,1,0,1,1,1,1,1]],[[1,1,8,1,6,1,0,0],[9,2,1,9,1,10,1,0],[6,6,2,1,14,14,10,1],[1,1,6,2,1,10,1,0],[9,1,1,1,10,1,0,0],[1,5,7,5,1,3,1,0],[5,7,2,7,5,3,3,1],[1,5,7,5,1,1,3,1]]]},{"palette":[{"r":0,"g":12,"b":0},{"r":0,"g":0,"b":0},{"r":31,"g":31,"b":31},{"r":31,"g":21,"b":14},{"r":25,"g":15,"b":8},{"r":0,"g":22,"b":0},{"r":31,"g":27,"b":0},{"r":31,"g":0,"b":0},{"r":0,"g":16,"b":31},{"r":31,"g":31,"b":15},{"r":0,"g":31,"b":0},{"r":9,"g":3,"b":0},{"r":28,"g":21,"b":0},{"r":21,"g":13,"b":0},{"r":13,"g":7,"b":0},{"r":25,"g":0,"b":0}],"tilesheet":[[[1,0,0,0,0,0,0,0],[7,1,1,0,0,0,0,0],[15,1,2,1,1,0,0,0],[1,6,9,9,2,1,0,0],[6,4,6,6,9,2,1,0],[6,4,4,4,1,9,1,0],[4,1,1,1,1,6,1,0],[1,2,8,3,1,1,0,0]],[[0,1,1,1,0,1,1,1],[1,6,2,2,1,15,7,7],[0,1,6,6,2,1,7,7],[0,0,1,1,2,1,15,15],[0,0,1,12,1,1,1,1],[0,0,1,12,12,12,12,9],[0,0,1,12,6,9,2,6],[0,1,12,6,2,6,9,6]],[[4,2,8,3,1,0,0,0],[4,3,3,3,1,0,0,0],[4,3,3,3,1,0,0,0],[1,4,3,1,9,1,0,0],[10,1,1,10,1,1,1,0],[5,10,10,5,1,4,4,1],[1,5,5,1,4,3,3,1],[1,1,1,1,4,3,3,1]],[[1,12,6,6,9,12,6,1],[1,6,1,9,6,1,6,1],[0,1,6,6,12,1,12,1],[0,1,6,12,1,9,1,10],[0,1,12,1,12,1,1,5],[0,0,1,12,1,4,4,1],[0,1,13,12,1,3,3,4],[0,1,13,12,1,3,3,4]],[[1,12,6,1,1,1,1,0],[7,1,12,1,11,12,1,0],[7,15,1,11,11,12,1,0],[7,15,1,11,11,12,1,0],[9,6,1,11,11,12,1,0],[12,13,1,14,14,12,1,0],[13,12,13,1,1,12,1,0],[1,1,1,0,0,1,0,0]],[[0,1,13,12,11,1,1,1],[1,13,12,12,11,11,1,15],[1,13,12,12,11,1,1,15],[1,13,14,12,1,12,6,9],[1,13,14,12,11,1,14,13],[1,13,14,12,11,1,6,13],[0,1,14,13,1,1,6,1],[0,0,1,1,0,0,1,1]],[[0,0,0,0,0,0,0,0],[1,0,0,0,0,0,0,0],[7,1,1,0,0,0,0,0],[15,1,2,1,1,0,0,0],[1,6,9,9,2,1,0,0],[6,4,6,6,9,2,1,0],[6,4,4,4,1,9,1,0],[4,1,1,1,1,6,1,0]],[[0,0,0,0,0,0,0,0],[0,1,1,1,0,1,1,1],[1,6,2,2,1,15,7,7],[0,1,6,6,2,1,7,7],[0,0,1,1,2,1,15,15],[0,0,1,12,1,1,1,1],[0,0,1,12,12,12,12,9],[0,1,6,6,6,9,2,6]],[[1,2,8,3,1,1,0,0],[4,2,8,3,1,0,0,0],[4,3,3,3,1,1,1,0],[4,3,3,3,1,3,3,1],[1,4,1,1,4,3,3,1],[6,1,3,3,1,4,4,1],[1,4,3,3,1,1,1,0],[1,4,4,4,1,0,0,0]],[[1,6,1,6,9,12,6,6],[0,1,6,2,6,1,6,1],[1,6,6,12,1,1,12,1],[1,6,12,1,12,12,1,1],[1,12,1,12,6,6,12,1],[0,1,12,6,6,12,1,6],[0,1,12,6,12,1,6,2],[1,12,12,12,1,5,13,6]],[[1,1,1,1,13,1,0,0],[12,1,11,11,12,1,0,0],[1,11,11,11,12,1,0,0],[1,11,11,11,11,12,1,0],[1,11,14,14,14,12,1,0],[1,14,1,1,1,1,13,1],[13,1,0,0,0,0,1,0],[1,0,0,0,0,0,0,0]],[[1,12,12,12,1,1,1,1],[1,12,12,12,1,15,7,1],[1,12,12,1,1,15,7,7],[1,13,12,1,6,6,15,15],[1,13,12,1,14,13,9,6],[1,13,13,1,6,13,12,13],[0,1,13,1,6,1,13,12],[0,0,1,1,1,1,1,1]],[[1,12,6,1,1,1,1,0],[15,1,12,1,1,0,0,0],[7,15,1,9,6,1,1,0],[15,15,6,12,13,13,13,1],[1,12,14,13,12,13,1,0],[0,1,14,14,13,1,0,0],[0,0,1,6,1,0,0,0],[0,0,0,1,0,0,0,0]],[[1,13,12,11,11,1,1,1],[1,12,12,1,1,15,7,7],[1,12,1,12,15,7,7,15],[12,1,14,14,9,15,15,1],[1,6,14,13,12,6,1,0],[0,1,13,12,13,1,0,0],[0,0,1,13,12,13,1,0],[0,0,0,1,1,1,0,0]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[1,0,0,0,0,0,0,0],[6,1,1,0,0,0,0,0]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,1,1,0,1,1,0,0],[1,2,2,1,7,7,1,1],[1,6,2,2,1,7,7,1]],[[9,6,6,1,0,0,0,0],[9,9,9,6,1,0,0,0],[2,2,9,9,6,1,0,0],[9,2,2,9,6,1,0,0],[6,9,9,2,9,6,1,0],[4,6,6,9,1,9,1,0],[4,4,1,6,1,6,1,0],[1,1,4,1,6,1,0,0]],[[0,1,6,2,1,7,7,1],[0,0,1,6,1,7,15,1],[0,1,12,1,15,15,1,9],[1,12,12,12,1,1,4,6],[1,12,6,9,6,4,4,4],[12,6,2,6,1,4,4,4],[12,6,9,1,4,4,1,4],[12,6,6,1,1,1,1,3]],[[3,4,1,13,1,0,0,0],[1,1,13,12,12,1,0,0],[5,1,1,13,12,12,1,0],[1,6,9,1,13,12,1,0],[1,12,1,1,1,13,12,1],[1,1,4,3,1,13,13,12],[1,4,3,3,3,1,1,1],[0,1,1,1,1,0,0,0]],[[1,6,12,1,1,4,3,3],[1,12,1,5,10,1,1,1],[0,1,1,1,5,10,10,10],[0,1,12,6,1,5,5,5],[0,1,1,1,15,1,1,1],[1,3,3,1,15,15,1,15],[1,4,3,1,1,1,0,1],[0,1,1,0,0,0,0,0]],[[4,2,8,3,1,10,1,0],[4,3,3,3,1,10,10,1],[4,3,3,3,1,5,10,1],[1,4,3,1,5,5,1,0],[10,1,1,10,1,1,0,0],[5,10,10,5,1,13,1,0],[1,5,5,1,11,12,1,0],[1,1,1,11,11,12,1,0]],[[1,12,6,1,12,1,0,0],[15,1,12,1,1,0,0,0],[7,15,1,9,6,1,1,0],[15,15,6,12,13,13,13,1],[1,12,14,13,12,13,1,0],[0,1,14,14,13,1,0,0],[0,0,1,6,1,0,0,0],[0,0,0,1,0,0,0,0]],[[4,2,8,3,1,0,0,0],[4,3,3,3,1,0,0,0],[4,3,3,3,1,0,0,0],[1,4,3,1,0,0,0,0],[1,1,1,0,1,1,1,0],[1,6,6,1,4,3,3,1],[1,6,2,1,4,3,3,1],[5,1,6,6,1,4,4,1]],[[1,12,6,6,9,12,6,1],[1,6,1,9,6,1,6,1],[0,1,6,6,1,1,1,1],[0,1,6,1,12,6,1,9],[0,1,1,12,6,12,12,1],[0,1,13,12,12,1,1,5],[0,1,12,12,1,5,10,10],[1,1,12,12,11,1,5,5]],[[1,11,1,1,1,1,1,0],[15,1,11,1,1,0,0,0],[7,15,1,9,6,1,1,0],[15,15,6,12,13,13,13,1],[1,12,14,13,12,13,1,0],[0,1,14,14,13,1,0,0],[0,0,1,6,1,0,0,0],[0,0,0,1,0,0,0,0]],[[1,1,12,11,1,1,1,1],[1,13,12,11,1,15,7,7],[1,12,11,1,15,7,7,15],[0,1,1,14,9,15,15,1],[1,6,14,13,12,6,1,0],[0,1,13,12,13,1,0,0],[0,0,1,13,12,13,1,0],[0,0,0,1,1,1,0,0]],[[0,1,1,1,0,1,1,1],[1,6,2,2,1,15,7,7],[0,1,6,6,2,1,7,7],[0,0,1,1,2,1,15,15],[0,1,1,1,1,1,1,1],[1,3,3,4,1,12,12,9],[1,3,3,4,1,9,2,6],[1,4,4,1,2,6,9,6]],[[1,1,1,12,1,12,6,1],[1,12,2,12,1,1,6,1],[0,1,12,1,5,1,12,1],[1,13,1,5,10,5,1,10],[1,12,1,5,10,10,1,5],[1,12,11,1,5,1,14,1],[1,12,11,11,1,1,13,14],[1,12,11,11,11,1,1,1]],[[1,12,6,1,1,1,1,0],[15,1,12,1,1,0,0,0],[7,15,1,9,6,1,1,0],[15,15,6,12,13,13,13,1],[1,12,14,13,12,13,1,0],[0,1,14,14,13,1,0,0],[0,0,1,6,1,0,0,0],[0,0,0,1,0,0,0,0]],[[1,12,13,13,11,1,15,15],[1,13,1,1,1,15,7,7],[0,1,1,12,15,7,7,15],[0,1,14,14,9,15,15,1],[1,6,14,13,12,6,1,0],[0,1,13,12,13,1,0,0],[0,0,1,13,12,13,1,0],[0,0,0,1,1,1,0,0]],[[1,1,0,0,1,0,0,0],[1,6,1,1,6,1,0,0],[6,9,9,6,1,1,0,0],[9,2,2,9,2,9,1,0],[2,9,9,9,1,2,9,1],[6,4,6,9,9,1,1,0],[4,4,6,6,2,9,1,0],[4,1,4,6,9,2,9,1]],[[6,2,2,1,15,7,7,7],[1,6,6,2,1,7,7,15],[0,1,1,2,1,15,15,1],[0,0,1,1,1,1,1,6],[0,1,12,12,12,12,6,9],[1,12,1,12,6,6,9,6],[1,1,12,6,2,9,6,4],[1,12,6,9,9,6,4,1]],[[1,3,1,12,6,1,1,0],[3,3,1,1,1,12,1,0],[3,1,1,3,3,1,0,0],[1,1,1,4,3,1,0,0],[3,3,1,1,1,13,1,0],[3,3,1,11,11,11,12,1],[4,4,1,11,11,14,12,1],[1,1,6,1,14,1,13,1]],[[1,12,6,1,6,1,4,3],[0,1,1,1,12,4,3,3],[0,1,13,12,1,3,3,15],[1,13,12,6,12,1,3,3],[1,12,6,12,1,1,1,1],[1,12,12,1,6,9,1,4],[1,13,12,1,12,6,1,4],[1,13,13,1,1,1,15,1]],[[1,14,13,9,1,0,1,0],[1,12,13,12,13,1,0,0],[1,6,1,13,12,13,1,0],[0,1,0,1,1,1,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0]],[[0,1,13,1,14,6,15,7],[0,0,1,6,13,12,9,15],[0,0,0,1,12,13,6,1],[0,0,1,12,13,14,1,0],[0,0,1,13,14,1,0,0],[0,0,1,14,1,0,0,0],[0,0,0,1,0,0,0,0],[0,0,0,0,0,0,0,0]],[[7,1,1,0,0,1,3,1],[15,1,2,1,1,3,3,1],[1,6,9,9,2,1,3,1],[6,4,6,6,9,2,1,1],[6,4,4,4,1,9,1,1],[4,1,1,1,1,6,1,1],[1,2,8,3,1,1,5,1],[4,2,8,3,1,5,10,1]],[[1,6,2,2,1,15,7,7],[0,1,6,6,2,1,7,7],[0,0,1,1,2,1,15,15],[0,0,1,12,1,1,1,1],[0,1,1,12,12,12,12,9],[1,12,1,12,6,9,2,6],[0,1,12,6,9,6,9,6],[1,12,6,1,6,12,6,1]],[[4,3,3,3,1,10,1,0],[4,3,3,3,1,5,1,0],[1,4,3,1,5,1,0,0],[10,1,1,10,1,13,1,0],[5,10,10,5,1,11,12,1],[1,5,5,1,11,11,12,1],[14,1,1,11,11,11,12,1],[1,12,6,1,14,14,12,1]],[[1,12,1,6,12,1,6,1],[0,1,12,1,1,1,12,1],[0,1,1,13,1,5,1,5],[0,1,12,1,1,10,5,1],[1,12,1,6,2,1,5,1],[1,12,1,1,6,1,1,14],[1,1,4,3,1,11,1,13],[1,4,3,3,1,1,6,1]],[[7,1,12,1,1,1,13,1],[7,15,1,0,0,0,1,0],[7,15,1,0,0,0,0,0],[9,6,1,0,0,0,0,0],[12,13,1,0,0,0,0,0],[12,13,1,0,0,0,0,0],[13,12,13,1,0,0,0,0],[1,1,1,0,0,0,0,0]],[[1,3,3,1,1,12,1,15],[1,1,1,11,11,1,1,15],[1,12,11,14,1,12,6,9],[1,12,14,1,0,1,14,13],[1,13,1,0,0,1,6,13],[0,1,0,0,0,1,6,1],[0,0,0,0,0,0,1,1],[0,0,0,0,0,0,0,0]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[1,1,0,0,0,0,0,0],[2,6,1,1,0,0,0,0],[9,2,6,6,1,0,0,0],[2,9,9,1,6,1,0,0]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,1,0,0,1],[0,0,1,1,9,1,1,2],[1,6,9,1,1,9,2,1],[0,1,6,9,2,1,9,2],[1,1,1,6,9,2,6,9]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,1,1,1,0,1,0,0],[1,14,13,12,1,6,1,1]],[[9,6,1,2,1,6,1,0],[9,1,6,2,1,6,1,0],[6,1,6,2,1,12,1,0],[1,6,2,1,7,1,1,0],[1,1,1,7,7,1,1,0],[1,7,7,7,1,3,3,1],[12,1,7,7,1,4,3,1],[1,1,1,1,0,1,1,0]],[[6,12,1,12,6,9,2,2],[12,1,6,1,12,6,9,9],[12,13,1,6,9,2,6,9],[13,1,1,1,6,9,2,6],[1,9,6,1,1,12,9,6],[12,6,1,4,3,1,12,12],[1,1,4,3,3,3,1,12],[1,1,1,1,1,1,1,1]],[[0,1,13,12,13,6,1,12],[0,1,13,12,13,1,12,6],[0,1,6,12,1,12,12,12],[0,1,15,9,1,12,12,13],[0,1,7,1,13,12,13,1],[0,0,1,1,13,13,1,1],[0,0,0,1,13,1,5,5],[0,0,0,0,1,1,1,1]],[[0,0,0,0,0,0,0,0],[6,0,0,0,0,0,0,0],[9,0,0,9,6,0,0,0],[0,0,9,2,9,0,0,0],[0,0,2,9,0,0,0,0],[0,9,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,9,6,0,0,0]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,9],[0,0,0,0,0,0,0,2],[0,0,1,1,1,0,0,9],[0,1,2,2,6,1,0,0],[1,2,6,6,1,0,0,0],[7,7,1,1,1,0,0,0],[1,7,7,1,0,0,0,0]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,1,1],[0,0,0,0,0,1,15,7],[0,0,0,1,1,6,1,1]],[[0,0,9,2,9,0,0,0],[1,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[1,0,0,0,0,0,0,0]],[[12,1,1,6,1,0,0,1],[6,12,12,6,6,1,1,6],[9,6,6,2,9,6,9,1],[6,6,9,9,2,1,1,0],[12,6,6,12,9,2,1,0],[6,1,2,6,1,6,9,1],[9,6,1,2,6,1,6,1],[9,6,1,6,9,1,1,6]],[[0,0,1,6,6,9,12,12],[0,1,12,6,9,2,9,6],[0,1,12,12,6,9,2,2],[1,12,1,1,12,6,9,9],[1,1,3,3,1,12,6,6],[1,1,3,3,4,1,6,9],[0,1,4,4,4,1,6,6],[1,12,1,1,1,6,12,6]],[[1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1]],[[6,1,12,1,6,12,1,1],[12,1,12,12,1,12,1,0],[1,13,12,6,12,6,12,1],[12,13,12,12,6,6,12,1],[12,12,13,12,12,12,12,1],[12,12,13,13,1,1,12,1],[12,12,13,1,1,1,1,0],[1,1,1,1,1,0,0,0]],[[1,12,6,12,1,12,1,12],[0,1,12,1,7,1,12,1],[0,0,1,7,7,1,12,12],[0,1,7,1,1,13,13,12],[0,1,6,12,1,13,13,12],[0,1,14,13,1,13,13,13],[1,14,14,13,1,13,1,1],[0,1,1,1,1,1,1,1]],[[1,0,0,0,0,0,0,0],[9,1,0,0,0,0,0,0],[2,2,1,1,0,0,0,0],[9,9,2,2,1,0,0,0],[6,6,9,9,2,1,0,0],[4,4,6,6,9,1,0,0],[4,4,4,1,6,1,0,0],[4,3,3,1,1,0,0,0]],[[0,1,1,1,1,1,1,1],[1,6,2,1,7,7,1,6],[0,1,6,2,7,15,1,9],[0,0,1,2,15,1,9,6],[0,0,0,1,1,12,6,4],[0,0,1,12,12,6,9,4],[0,1,6,6,9,9,4,4],[1,6,1,9,6,1,3,3]],[[4,1,1,1,0,0,0,0],[2,3,3,1,0,0,0,0],[1,3,3,1,0,0,0,0],[15,3,1,9,1,0,0,0],[1,1,10,1,12,1,1,0],[10,10,5,1,1,3,3,1],[5,5,1,1,4,3,3,1],[1,1,11,1,4,4,4,1]],[[0,1,1,6,1,4,1,1],[1,3,3,1,1,4,3,3],[1,3,3,4,1,1,3,15],[1,4,4,4,1,5,1,15],[0,1,1,1,1,5,10,1],[0,1,12,6,12,1,5,10],[1,14,1,12,1,13,1,5],[1,13,11,1,1,1,1,1]],[[12,6,1,11,1,14,1,0],[1,12,1,11,11,13,1,0],[15,1,11,11,11,12,1,0],[15,1,11,11,11,12,1,0],[6,1,14,14,14,12,1,0],[13,1,1,1,1,13,1,0],[12,13,1,0,0,1,0,0],[1,1,1,0,0,0,0,0]],[[1,12,11,1,13,6,1,1],[1,12,1,13,6,1,15,7],[1,12,14,1,1,1,15,7],[1,12,1,1,12,6,9,7],[0,1,0,0,1,14,13,9],[0,0,0,0,1,6,13,12],[0,0,0,0,1,6,1,13],[0,0,0,0,0,1,1,1]],[[4,1,1,1,0,0,0,0],[2,3,3,1,0,0,0,0],[1,3,3,1,0,0,0,0],[15,3,1,9,1,0,0,0],[1,1,10,1,12,1,1,0],[10,10,5,1,1,3,3,1],[5,5,1,1,4,3,3,1],[1,1,11,1,4,4,4,1]]]},{"palette":[{"r":0,"g":12,"b":0},{"r":0,"g":0,"b":0},{"r":31,"g":31,"b":31},{"r":31,"g":21,"b":12},{"r":23,"g":15,"b":8},{"r":4,"g":16,"b":4},{"r":15,"g":11,"b":3},{"r":30,"g":9,"b":13},{"r":0,"g":0,"b":21},{"r":26,"g":5,"b":9},{"r":23,"g":19,"b":11},{"r":27,"g":25,"b":0},{"r":20,"g":17,"b":21},{"r":15,"g":22,"b":15},{"r":15,"g":7,"b":15},{"r":19,"g":15,"b":7}],"tilesheet":[[[1,1,1,1,1,0,0,0],[6,15,15,15,15,1,1,0],[15,10,15,6,15,15,10,1],[10,15,6,5,6,6,15,1],[15,6,3,5,2,1,6,1],[6,3,3,3,5,1,1,0],[3,3,1,1,1,1,0,0],[4,1,2,8,3,1,0,0]],[[0,0,0,0,1,1,0,1],[0,0,0,1,5,2,1,6],[0,0,1,6,6,5,11,6],[0,0,1,15,15,6,5,6],[0,0,1,15,10,15,6,15],[0,1,15,10,15,6,6,15],[0,1,10,15,6,3,3,6],[0,1,10,15,6,3,4,6]],[[4,4,2,8,3,1,0,0],[4,2,3,3,3,1,1,0],[1,4,3,3,3,1,11,1],[1,1,4,3,1,11,2,1],[7,5,1,1,1,1,1,0],[5,13,5,3,5,1,1,0],[1,5,13,13,5,3,3,1],[1,4,3,4,1,4,3,1]],[[0,1,15,6,6,1,3,6],[1,15,15,6,1,1,1,1],[1,15,6,1,11,1,11,11],[1,6,1,0,1,11,2,11],[0,1,0,0,0,1,1,1],[0,0,0,0,1,2,1,1],[0,0,0,1,2,1,3,3],[0,0,0,1,2,1,4,3]],[[4,5,5,1,12,1,1,0],[3,4,5,1,12,2,1,0],[3,4,1,12,12,2,1,0],[7,9,1,12,12,2,1,0],[12,2,1,12,12,2,1,0],[12,2,1,14,14,2,1,0],[1,12,2,1,1,14,1,0],[1,1,1,0,0,1,0,0]],[[0,0,0,1,2,14,1,1],[0,0,1,2,2,14,1,4],[0,0,1,2,2,14,1,4],[0,0,1,2,2,1,12,9],[0,1,2,12,2,14,1,12],[0,1,2,12,2,14,1,12],[0,1,14,14,14,1,1,12],[0,0,1,1,1,1,1,1]],[[0,0,0,0,0,0,0,0],[1,1,1,1,0,0,0,0],[15,15,15,15,1,1,0,0],[10,15,6,15,15,10,1,0],[15,6,5,6,6,15,1,0],[6,3,5,2,1,6,1,0],[3,3,3,5,1,1,0,0],[3,1,1,1,1,0,0,0]],[[0,0,0,0,0,0,0,0],[0,0,0,1,1,0,1,1],[0,0,1,5,2,1,6,6],[0,1,6,6,5,11,6,15],[1,6,15,15,6,5,6,10],[1,6,15,10,15,6,15,15],[1,6,10,15,6,6,6,6],[1,6,15,6,3,3,6,3]],[[1,2,8,3,1,0,0,0],[4,2,8,3,1,0,0,0],[2,3,3,3,1,1,0,0],[4,3,3,3,1,11,1,0],[1,4,3,1,1,1,0,0],[5,1,1,1,3,3,1,0],[1,5,1,1,4,3,1,1],[12,1,3,3,1,1,11,1]],[[1,6,15,6,3,4,6,4],[0,1,6,6,1,3,6,4],[0,1,6,1,1,1,1,4],[0,0,1,11,1,11,11,1],[0,0,0,1,11,2,11,1],[0,0,0,1,1,1,1,1],[0,0,1,2,1,4,3,3],[0,1,2,14,14,1,4,3]],[[2,1,4,3,1,1,1,0],[1,1,1,1,0,0,0,0],[3,4,1,0,0,0,0,0],[9,7,9,1,0,0,0,0],[12,12,2,1,0,0,0,0],[12,12,2,1,0,0,0,0],[12,1,12,2,1,0,0,0],[1,1,1,1,0,0,0,0]],[[0,1,2,14,14,14,1,12],[0,1,2,14,14,1,4,1],[1,2,2,14,14,1,4,3],[1,2,2,14,14,1,1,4],[1,2,2,14,1,12,12,1],[1,2,2,1,12,12,12,1],[1,14,14,1,12,1,12,1],[0,1,1,1,1,1,1,1]],[[5,13,5,1,12,1,1,0],[4,5,5,1,1,2,1,0],[3,5,3,3,1,2,1,0],[1,4,3,7,12,1,1,0],[0,1,9,12,2,12,12,1],[1,1,1,12,12,2,1,0],[1,1,1,1,12,1,0,0],[1,1,1,1,1,0,0,0]],[[0,0,1,2,14,1,5,5],[0,0,1,12,1,1,4,3],[0,0,1,12,9,9,3,3],[0,1,12,1,12,12,9,3],[1,14,1,12,12,2,12,1],[0,1,1,12,2,12,1,1],[0,0,0,1,12,2,12,1],[0,0,0,0,1,1,1,1]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[1,1,0,0,0,0,0,0]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,1,1,1,0,0],[0,0,1,6,10,6,1,0],[0,1,6,15,6,2,11,1]],[[6,15,1,1,0,0,0,0],[15,10,15,6,1,0,0,0],[6,15,10,15,1,0,0,0],[2,6,15,10,6,1,0,0],[5,3,6,15,15,6,1,0],[3,3,3,6,15,6,1,0],[4,1,1,1,6,1,0,0],[3,8,2,1,1,0,0,0]],[[0,1,15,6,11,6,6,6],[1,6,6,1,6,10,15,6],[1,6,1,6,10,15,6,5],[1,6,1,6,15,15,6,5],[1,6,1,6,15,6,3,3],[0,1,1,3,6,3,3,1],[0,0,1,3,1,1,1,4],[0,1,0,1,4,2,8,3]],[[3,3,1,1,11,1,0,0],[1,1,11,11,1,0,0,0],[4,5,1,4,1,0,0,0],[5,1,1,1,3,1,0,0],[3,1,3,3,1,1,0,0],[3,4,1,3,4,1,0,0],[4,1,4,4,1,0,0,0],[1,1,1,1,0,0,0,0]],[[1,11,1,11,0,4,3,3],[0,1,11,11,11,1,1,1],[0,0,1,1,1,5,13,4],[0,0,1,3,1,1,5,5],[0,1,3,1,1,12,9,3],[1,3,3,1,2,2,7,3],[1,3,1,12,12,12,9,4],[0,1,1,1,1,1,1,1]],[[4,4,2,8,3,1,0,0],[4,2,3,3,3,1,1,0],[1,4,3,3,3,1,3,1],[1,1,4,3,1,3,4,1],[7,5,1,1,1,4,1,0],[5,13,5,3,5,1,0,0],[1,13,13,13,5,1,0,0],[1,4,3,4,1,0,0,0]],[[5,13,5,1,0,0,0,0],[4,5,5,1,0,0,0,0],[3,5,3,3,1,0,0,0],[1,4,3,7,12,1,1,0],[0,1,9,12,2,12,12,1],[1,1,1,12,12,2,1,0],[1,1,1,1,12,1,0,0],[1,1,1,1,1,0,0,0]],[[4,4,2,8,3,1,0,0],[1,2,3,3,3,1,1,0],[11,1,3,3,3,1,11,1],[2,11,1,3,1,11,2,1],[1,1,1,1,1,1,1,0],[3,3,1,1,5,1,1,0],[4,3,3,12,1,3,3,1],[1,4,12,2,1,4,3,1]],[[0,1,15,6,6,1,3,6],[1,15,15,6,1,1,1,1],[1,15,6,1,1,11,1,11],[1,6,1,0,1,1,11,11],[0,1,0,0,0,1,1,1],[0,0,0,0,1,2,1,4],[0,0,0,1,2,14,14,1],[0,0,0,1,2,14,1,5]],[[5,1,1,1,12,1,1,0],[4,5,5,1,1,2,1,0],[3,5,3,3,1,2,1,0],[1,4,3,7,12,1,1,0],[0,1,9,12,2,12,12,1],[1,1,1,12,12,2,1,0],[1,1,1,1,12,1,0,0],[1,1,1,1,1,0,0,0]],[[0,0,1,2,14,14,1,1],[0,0,1,12,1,1,4,3],[0,0,1,12,9,9,3,3],[0,1,12,1,12,12,9,3],[1,14,1,12,12,2,12,1],[0,1,1,12,2,12,1,1],[0,0,0,1,12,2,12,1],[0,0,0,0,1,1,1,1]],[[0,0,0,0,1,1,0,1],[0,0,0,1,5,2,1,6],[0,0,1,6,6,5,11,6],[0,0,1,15,15,6,5,6],[0,0,1,15,10,15,6,15],[0,1,15,10,15,6,6,15],[1,3,3,1,6,3,3,6],[1,3,3,1,6,3,4,6]],[[0,1,1,12,1,1,3,6],[1,1,12,2,1,1,1,1],[1,1,12,12,3,1,11,11],[1,6,1,4,3,3,1,11],[0,1,0,1,4,3,3,1],[0,0,0,0,1,4,1,5],[0,0,0,1,2,14,14,1],[0,0,0,1,2,14,1,5]],[[10,10,15,1,5,1,1,0],[15,10,15,13,1,0,0,0],[1,15,12,9,13,1,1,0],[14,13,13,12,9,13,13,1],[1,14,13,13,12,13,1,0],[0,1,14,13,13,1,0,0],[0,0,1,14,1,0,0,0],[0,0,0,1,0,0,0,0]],[[7,1,1,1,1,15,15,1],[7,1,1,1,14,15,10,10],[1,5,1,14,13,12,15,15],[0,1,14,13,12,9,13,1],[1,14,13,12,9,13,1,0],[0,1,13,12,13,1,0,0],[0,0,1,13,12,13,1,0],[0,0,0,1,1,1,0,0]],[[0,0,1,1,0,0,0,0],[1,1,6,15,1,1,0,0],[6,6,1,6,15,10,1,0],[15,15,15,1,1,1,15,1],[10,10,10,15,6,1,1,0],[15,15,15,10,15,1,0,0],[6,6,15,15,10,6,1,0],[2,5,6,15,15,6,1,0]],[[0,0,0,0,1,1,1,1],[0,0,0,1,10,6,2,11],[0,0,1,15,6,2,6,6],[0,0,1,6,11,6,15,15],[0,0,0,1,6,15,10,15],[0,0,0,1,15,10,15,6],[0,0,1,6,15,15,6,5],[0,0,1,6,6,6,3,5]],[[5,3,3,6,15,6,1,0],[3,3,6,6,6,1,1,0],[4,1,1,1,1,1,11,1],[9,3,1,11,2,11,1,0],[9,1,4,1,11,1,0,0],[1,4,3,3,1,0,0,0],[12,12,3,1,2,1,0,0],[2,12,1,14,14,2,1,0]],[[0,0,1,3,6,3,3,3],[0,1,1,3,6,1,3,3],[1,11,1,1,6,4,1,1],[0,1,11,1,1,4,3,3],[0,0,1,3,3,1,4,9],[0,1,12,2,3,1,1,1],[0,1,1,12,1,3,3,1],[1,3,3,1,1,4,3,1]],[[1,1,1,14,14,2,1,0],[4,3,3,1,14,14,2,1],[4,3,3,3,1,14,12,1],[1,4,3,9,1,14,12,1],[12,1,9,12,12,1,14,1],[1,0,1,12,2,12,1,0],[0,0,0,1,12,2,1,0],[0,0,0,0,1,1,0,0]],[[1,3,1,1,1,1,1,1],[0,1,0,1,4,3,3,1],[0,0,0,1,4,3,3,1],[0,0,1,12,1,4,1,14],[0,0,1,12,12,1,14,12],[0,1,12,1,1,12,12,1],[0,0,1,0,0,1,1,0],[0,0,0,0,0,0,0,0]],[[6,15,15,15,15,1,1,0],[15,10,15,6,15,15,10,1],[10,15,6,5,6,6,15,1],[15,6,3,5,2,1,1,3],[6,3,3,3,5,1,3,3],[3,3,1,1,1,3,4,3],[4,1,2,8,3,1,3,1],[4,4,2,8,3,1,1,12]],[[0,0,0,1,5,2,1,6],[0,0,1,6,6,5,11,6],[0,0,1,15,15,6,5,6],[0,0,1,15,10,15,6,15],[0,1,15,10,15,6,6,15],[0,1,10,15,6,3,3,6],[0,1,10,15,6,3,4,6],[0,1,15,6,6,1,3,6]],[[4,2,3,3,3,1,12,1],[1,4,3,3,3,1,1,1],[1,1,4,3,1,12,2,1],[7,5,1,1,1,12,2,1],[5,13,5,3,5,1,2,1],[5,5,13,13,5,1,2,1],[5,4,3,4,1,12,2,1],[4,5,5,1,12,12,2,1]],[[1,15,15,6,1,1,1,1],[1,15,6,1,11,1,11,11],[1,6,1,0,1,11,2,11],[0,1,0,0,0,1,1,1],[0,0,0,0,1,3,3,1],[0,1,1,1,12,12,3,1],[1,3,3,1,2,12,1,5],[0,1,3,3,1,1,1,5]],[[3,4,5,1,12,12,2,1],[3,4,1,1,14,12,2,1],[7,4,1,0,1,14,2,1],[12,9,1,0,0,1,14,1],[12,2,1,0,0,0,1,0],[1,2,1,0,0,0,0,0],[1,2,2,1,0,0,0,0],[0,1,1,0,0,0,0,0]],[[0,0,1,1,12,14,1,4],[0,0,1,2,2,14,1,4],[0,0,1,2,14,1,12,9],[0,1,2,14,1,0,1,12],[1,14,14,1,0,0,1,12],[0,1,1,0,0,0,1,12],[0,0,0,0,0,0,0,1],[0,0,0,0,0,0,0,0]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[1,0,0,0,0,0,0,0],[1,0,0,0,0,0,0,0],[1,0,0,0,0,0,0,0]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,1,1,1,1,0],[0,0,1,6,15,15,10,1],[0,1,6,1,1,1,15,15],[1,6,11,6,6,6,1,1],[1,2,6,15,15,6,3,3]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[1,1,1,1,1,0,0,0],[3,9,12,12,12,1,0,0],[3,7,2,2,2,2,1,0],[4,4,9,12,12,12,12,1],[1,1,1,1,1,1,1,0]],[[6,1,1,1,0,1,0,0],[3,1,11,2,1,11,1,0],[3,3,1,11,11,1,1,1],[3,3,1,1,4,1,3,4],[3,3,1,3,3,3,1,3],[3,1,3,14,3,4,1,3],[1,3,3,14,4,1,5,4],[1,1,1,1,1,1,1,1]],[[11,6,15,10,10,15,6,6],[11,6,15,10,15,6,1,3],[1,6,15,15,6,3,3,1],[1,6,15,6,3,3,3,1],[1,6,6,5,5,3,3,3],[1,6,6,6,2,5,3,1],[0,1,6,5,5,4,4,1],[0,0,1,1,1,1,1,1]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0]],[[0,0,0,0,0,0,0,0],[1,1,1,1,1,0,0,0],[6,15,15,15,15,1,1,0],[15,10,15,6,15,15,10,1],[10,15,6,5,6,6,15,1],[15,6,3,5,2,1,6,1],[6,3,3,3,5,1,1,0],[3,3,3,3,3,1,0,0]],[[0,0,0,0,0,0,0,0],[0,0,0,0,1,1,0,1],[0,0,0,1,5,2,1,6],[0,0,1,6,6,5,11,6],[0,0,1,15,15,6,5,6],[0,0,1,15,10,15,6,15],[0,1,15,10,15,6,6,15],[0,1,10,15,6,3,3,6]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[1,0,0,0,1,1,0,0],[1,1,1,1,12,12,1,0],[3,6,6,6,6,2,12,1],[3,1,1,1,12,12,1,0],[1,0,0,0,1,1,0,0],[1,0,0,0,0,0,0,0]],[[4,1,1,3,3,1,1,0],[4,4,3,1,3,1,7,1],[1,2,3,3,3,1,1,7],[11,1,1,1,1,1,1,9],[1,3,3,3,12,12,1,3],[4,4,4,12,2,12,1,4],[5,5,5,1,1,1,1,9],[3,4,5,1,2,1,1,7]],[[0,1,10,15,6,3,4,6],[0,1,15,6,6,1,3,6],[1,15,15,6,1,1,1,1],[1,15,6,1,1,11,1,2],[1,6,1,0,0,1,11,11],[0,1,0,0,1,2,1,1],[0,0,0,1,2,2,1,5],[0,0,1,2,2,1,1,4]],[[1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1]],[[5,5,1,1,2,1,7,1],[4,5,1,1,2,7,1,0],[3,4,1,1,7,1,0,0],[9,7,9,1,1,0,0,0],[12,12,2,1,0,0,0,0],[12,12,2,1,0,0,0,0],[12,1,12,2,1,0,0,0],[1,1,1,1,0,0,0,0]],[[0,0,1,2,2,1,5,5],[0,1,2,2,14,1,4,3],[0,1,2,2,14,1,4,3],[0,1,2,14,14,1,1,4],[1,2,2,14,1,12,12,1],[1,2,2,1,12,12,12,1],[1,14,14,1,12,1,12,1],[0,1,1,1,1,1,1,1]],[[1,1,1,1,1,0,0,0],[6,15,15,15,15,1,1,0],[15,10,15,6,15,15,10,1],[10,15,6,5,6,6,15,1],[15,6,3,5,2,1,6,1],[6,3,3,3,5,1,1,0],[3,3,3,3,3,1,0,0],[4,1,3,3,3,1,0,0]],[[0,0,0,0,1,1,0,1],[0,0,0,1,5,2,1,6],[0,0,1,6,6,5,11,6],[0,0,1,15,15,6,5,6],[0,0,1,15,10,15,6,15],[0,1,15,10,15,6,6,15],[0,1,10,15,6,3,3,6],[0,1,10,15,6,3,4,6]],[[4,4,1,1,3,1,0,0],[4,2,3,3,3,1,1,0],[1,4,3,3,3,1,11,1],[1,1,4,3,1,11,2,1],[7,1,1,1,1,1,1,0],[1,3,1,3,1,3,3,1],[3,4,1,4,3,1,3,1],[4,1,1,1,4,1,1,1]],[[0,1,15,6,6,1,3,6],[1,15,15,6,1,1,1,1],[1,15,6,1,11,1,11,11],[1,6,1,0,1,11,2,11],[0,1,0,0,0,1,1,1],[0,0,0,0,1,3,1,1],[0,0,0,1,3,12,2,1],[0,0,0,1,1,12,12,1]],[[1,5,5,1,1,1,1,0],[3,4,5,1,12,2,1,0],[3,4,1,12,12,2,1,0],[7,9,1,12,12,2,1,0],[12,2,1,12,12,2,1,0],[12,2,1,14,14,2,1,0],[1,12,2,1,1,14,1,0],[1,1,1,0,0,1,0,0]],[[0,0,0,1,2,1,1,1],[0,0,1,2,2,14,1,4],[0,0,1,2,2,14,1,4],[0,0,1,2,2,1,12,9],[0,1,2,12,2,14,1,12],[0,1,2,12,2,14,1,12],[0,1,14,14,14,1,1,12],[0,0,1,1,1,1,1,1]],[[4,4,1,1,3,1,0,0],[4,2,3,3,3,1,1,0],[1,4,3,9,3,1,11,1],[1,1,4,9,1,11,2,1],[7,1,1,1,1,1,1,0],[1,3,1,3,1,3,3,1],[3,4,1,4,3,1,3,1],[4,1,1,1,4,1,1,1]]]},{"palette":[{"r":0,"g":12,"b":0},{"r":0,"g":0,"b":0},{"r":31,"g":31,"b":31},{"r":31,"g":15,"b":9},{"r":23,"g":11,"b":0},{"r":28,"g":21,"b":0},{"r":21,"g":0,"b":0},{"r":31,"g":0,"b":0},{"r":15,"g":0,"b":0},{"r":31,"g":31,"b":4},{"r":22,"g":22,"b":22},{"r":31,"g":27,"b":0},{"r":31,"g":12,"b":0},{"r":12,"g":12,"b":31},{"r":13,"g":13,"b":13},{"r":0,"g":0,"b":23}],"tilesheet":[[[1,1,1,0,0,0,0,0],[4,4,4,1,0,0,0,0],[3,3,3,4,1,0,0,0],[3,3,3,3,4,1,0,0],[1,1,3,3,4,1,0,0],[4,1,1,1,1,0,0,0],[4,2,8,4,1,0,0,0],[4,2,8,3,1,0,0,0]],[[0,0,0,0,0,0,1,1],[0,0,1,1,1,1,4,4],[0,1,0,1,1,4,4,4],[0,1,0,1,4,4,4,3],[0,1,0,1,4,4,4,4],[0,1,0,1,4,1,1,4],[0,1,0,1,1,3,3,1],[0,1,0,0,1,3,4,3]],[[4,3,3,1,1,0,0,0],[3,1,1,3,1,0,0,0],[1,3,3,3,1,0,0,0],[4,1,1,1,3,1,0,0],[3,3,4,3,4,1,1,0],[1,3,1,3,1,3,3,1],[1,1,1,1,4,3,3,1],[11,1,11,1,4,4,4,1]],[[1,1,0,0,0,1,3,4],[1,0,0,1,1,9,1,4],[0,0,1,3,4,1,4,1],[0,1,3,3,4,3,4,4],[1,3,4,4,1,4,1,1],[1,4,10,2,10,1,3,3],[1,14,10,10,1,4,3,3],[0,1,14,14,1,4,4,4]],[[7,12,7,1,1,1,1,0],[12,7,1,0,0,0,0,0],[12,7,1,0,0,0,0,0],[7,7,1,0,0,0,0,0],[1,1,0,0,0,0,0,0],[4,15,1,0,0,0,0,0],[15,13,15,1,0,0,0,0],[1,1,1,0,0,0,0,0]],[[0,0,1,1,1,1,1,1],[0,0,1,5,1,6,6,7],[0,1,5,11,1,6,6,7],[1,5,11,5,1,1,6,6],[0,1,1,1,0,1,1,1],[0,0,0,0,1,4,3,3],[0,0,0,0,1,15,15,15],[0,0,0,0,0,1,1,1]],[[1,1,0,0,0,0,0,0],[4,4,1,0,0,0,0,0],[3,3,4,1,0,0,0,0],[3,3,3,4,1,0,0,0],[1,3,3,4,1,0,0,0],[1,1,1,1,0,0,0,0],[2,8,4,1,1,1,0,0],[2,8,1,3,3,4,1,0]],[[0,0,0,0,0,1,1,1],[0,0,1,1,1,4,4,4],[0,1,0,1,4,4,4,3],[1,0,1,4,4,4,3,3],[1,0,1,4,4,4,4,1],[1,0,1,4,1,1,4,4],[1,0,0,1,3,3,1,4],[1,1,0,1,3,4,3,4]],[[4,4,1,3,3,4,1,0],[1,1,1,4,4,1,2,1],[1,4,4,1,1,14,10,1],[1,1,1,1,14,10,1,0],[3,3,4,3,1,1,0,0],[4,3,1,3,1,0,0,0],[1,1,1,1,0,0,0,0],[11,1,11,1,0,0,0,0]],[[1,1,1,1,1,1,1,1],[0,1,3,3,1,4,3,3],[1,4,4,3,1,4,3,3],[1,4,3,4,1,1,4,4],[1,4,3,1,2,10,1,1],[0,1,4,10,10,10,14,1],[0,0,1,4,14,14,1,1],[0,0,0,1,1,1,5,5]],[[7,7,12,7,1,0,0,0],[6,7,12,12,7,1,0,0],[6,6,7,7,7,1,0,0],[1,6,6,6,1,0,0,0],[1,1,1,1,1,0,0,0],[4,3,3,3,15,1,0,0],[15,15,15,15,13,15,1,0],[1,1,1,1,1,1,0,0]],[[0,0,0,0,1,11,11,6],[0,0,0,1,11,5,1,6],[0,0,1,11,5,11,1,1],[0,0,0,1,1,1,6,1],[0,0,0,1,1,1,1,1],[0,0,1,4,3,4,1,1],[0,0,1,15,15,15,1,1],[0,0,0,1,1,1,1,1]],[[7,7,7,1,1,1,1,0],[7,12,12,7,1,0,0,0],[1,7,12,12,1,1,1,0],[6,6,7,7,1,13,13,1],[1,6,6,1,4,13,1,0],[0,1,1,4,13,1,0,0],[0,0,1,15,1,0,0,0],[0,0,0,1,0,0,0,0]],[[0,0,1,1,1,1,1,1],[0,0,0,5,11,5,1,7],[0,0,1,1,5,1,12,7],[0,1,1,6,1,12,7,1],[1,15,4,1,7,7,1,0],[0,1,15,4,1,1,0,0],[0,0,1,15,13,13,1,0],[0,0,0,1,1,1,0,0]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[1,1,0,0,0,0,0,0],[4,4,1,0,0,0,0,0]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,1,1,0,0,0,0,0],[1,0,1,1,0,1,1,1],[1,0,0,1,1,4,4,4]],[[3,3,4,1,0,0,0,0],[3,3,3,4,1,0,0,0],[3,3,3,4,1,0,0,0],[4,4,4,4,1,0,0,0],[4,1,1,1,0,0,0,0],[4,8,2,1,1,1,1,0],[1,3,3,1,4,3,3,1],[3,1,1,1,4,3,3,1]],[[1,0,0,1,4,4,3,3],[1,0,1,4,4,3,3,3],[1,1,1,4,4,4,4,3],[0,1,1,4,1,1,4,4],[0,0,1,4,4,1,1,1],[0,0,1,1,4,2,8,8],[0,1,4,1,4,4,4,3],[1,4,3,4,1,4,1,1]],[[3,3,1,7,1,4,4,1],[1,1,7,12,7,1,1,0],[1,6,7,7,7,1,0,0],[1,6,6,6,1,0,0,0],[1,1,1,1,1,0,0,0],[1,4,3,4,15,1,0,0],[1,15,15,15,13,15,1,0],[0,1,1,1,1,1,0,0]],[[1,4,4,3,1,1,3,3],[1,4,14,14,1,4,1,1],[1,14,10,2,14,1,4,4],[1,14,14,10,1,1,1,1],[0,1,14,1,3,3,1,6],[0,0,1,4,3,3,1,1],[0,0,1,4,4,4,1,0],[0,0,0,1,1,1,0,0]],[[4,3,3,1,1,1,0,0],[3,1,1,2,1,3,1,0],[1,3,3,2,1,4,3,1],[4,1,1,1,3,1,4,1],[3,3,4,3,3,1,1,0],[1,3,1,3,1,0,0,0],[1,1,1,1,0,0,0,0],[11,1,11,1,0,0,0,0]],[[7,7,7,1,0,0,0,0],[7,12,12,7,1,0,0,0],[1,7,12,12,7,1,1,0],[6,6,7,7,1,15,15,1],[1,6,6,1,4,13,1,0],[0,1,1,4,13,1,0,0],[0,0,1,15,1,0,0,0],[0,0,0,1,0,0,0,0]],[[4,3,3,1,1,0,0,0],[3,1,1,2,1,0,0,0],[1,3,3,2,1,0,0,0],[3,1,1,1,1,0,0,0],[3,4,1,4,1,1,1,0],[1,10,2,10,1,3,3,1],[14,10,10,1,4,3,3,1],[1,14,14,1,4,4,4,1]],[[1,1,0,0,0,1,3,4],[1,0,0,0,1,9,1,1],[0,0,0,0,1,1,1,3],[0,0,0,1,4,1,4,3],[0,0,0,1,4,1,4,4],[0,0,0,0,1,4,1,4],[0,0,0,0,0,1,1,1],[0,0,0,0,1,1,6,5]],[[7,1,1,1,1,1,1,0],[7,12,12,7,1,0,0,0],[1,7,12,12,1,1,1,0],[6,6,7,7,1,15,15,1],[1,6,6,1,4,13,1,0],[0,1,1,4,13,1,0,0],[0,0,1,15,1,0,0,0],[0,0,0,1,0,0,0,0]],[[0,0,0,1,5,11,5,1],[0,0,1,5,11,5,1,7],[0,0,1,1,5,1,12,7],[0,1,1,6,1,12,7,1],[1,15,4,1,7,7,1,0],[0,1,15,4,1,1,0,0],[0,0,1,15,13,15,1,0],[0,0,0,1,1,1,0,0]],[[0,0,0,0,0,0,1,1],[0,0,1,1,1,1,4,4],[0,1,0,1,1,4,4,4],[0,1,1,1,4,4,4,3],[1,3,3,1,4,4,4,4],[1,3,3,4,1,1,1,4],[1,4,4,4,1,3,3,1],[0,1,1,1,1,3,4,3]],[[0,1,10,10,1,1,3,4],[0,1,10,2,10,1,1,4],[0,1,14,10,1,3,4,1],[0,0,1,1,4,3,3,4],[0,0,0,1,4,4,4,4],[0,0,0,0,1,1,4,4],[0,0,0,0,0,1,1,1],[0,0,0,0,1,1,6,5]],[[7,7,7,1,1,1,1,0],[7,12,12,7,1,0,0,0],[1,7,12,12,1,1,1,0],[6,6,7,7,1,15,15,1],[1,6,6,1,4,13,1,0],[0,1,1,4,13,1,0,0],[0,0,1,15,1,0,0,0],[0,0,0,1,0,0,0,0]],[[0,0,0,1,5,11,5,1],[0,0,1,5,11,5,1,7],[0,0,1,1,5,1,12,7],[0,1,1,6,1,12,7,1],[1,15,4,1,7,7,1,0],[0,1,15,4,1,1,0,0],[0,0,1,15,13,13,1,0],[0,0,0,1,1,1,0,0]],[[1,1,1,0,0,0,0,0],[3,3,4,1,1,1,0,0],[3,3,4,1,0,1,1,0],[4,4,1,10,1,0,0,0],[1,1,10,2,10,1,0,0],[4,1,14,10,10,1,0,0],[1,1,1,14,1,0,0,0],[3,3,1,1,0,0,0,0]],[[0,0,0,0,1,1,1,1],[0,0,1,1,4,4,4,1],[0,0,1,4,4,3,4,1],[0,1,4,4,3,3,1,1],[0,1,4,4,4,4,4,1],[0,1,4,1,1,4,4,4],[0,0,1,1,3,1,4,1],[0,1,4,4,1,1,1,4]],[[3,3,1,0,0,0,0,0],[4,4,1,0,0,0,0,0],[1,1,0,0,0,0,0,0],[1,1,0,0,0,0,0,0],[1,11,1,1,1,0,0,0],[9,1,7,7,7,1,0,0],[1,1,1,7,12,7,1,0],[11,11,9,1,7,7,1,0]],[[1,4,4,3,4,4,1,4],[1,4,3,1,4,1,10,1],[1,4,3,4,1,10,2,10],[0,1,4,3,1,10,10,14],[0,0,1,4,4,14,14,1],[0,0,0,1,1,1,1,11],[0,0,0,1,5,6,11,1],[0,0,0,0,1,1,5,9]],[[9,11,1,1,7,1,0,0],[1,1,7,7,1,0,0,0],[6,7,12,7,1,0,0,0],[6,6,7,1,0,0,0,0],[1,1,1,4,1,0,0,0],[15,4,4,3,15,1,0,0],[1,15,15,15,13,15,1,0],[0,1,1,1,1,1,0,0]],[[0,0,0,0,1,6,6,1],[0,0,0,0,0,1,6,6],[0,0,0,0,0,0,1,6],[0,0,0,0,0,0,0,1],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,1],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0]],[[1,0,0,0,0,0,0,0],[4,1,0,0,0,0,0,0],[3,4,1,0,0,0,0,0],[3,3,4,1,0,0,0,0],[3,3,4,1,0,0,0,0],[1,1,1,0,0,0,0,0],[8,4,1,0,0,0,0,0],[8,3,1,0,0,0,0,1]],[[0,0,0,0,1,1,1,1],[0,1,1,1,4,4,4,4],[1,0,1,4,4,4,3,3],[1,1,4,4,4,3,3,3],[1,1,4,4,4,4,1,1],[1,1,4,1,1,4,4,1],[1,0,1,3,3,1,4,2],[1,0,1,3,4,3,4,2]],[[3,1,1,0,0,0,1,3],[1,2,1,0,0,0,1,3],[3,2,4,1,1,1,3,3],[1,1,3,10,2,1,3,1],[4,3,4,14,10,14,1,3],[1,3,1,1,1,1,0,1],[1,1,0,0,0,0,0,0],[11,1,0,0,0,0,0,0]],[[1,1,0,1,3,4,4,3],[0,1,1,11,1,4,4,1],[0,1,4,1,1,1,1,4],[1,4,3,4,1,1,4,1],[1,3,4,1,3,3,1,3],[1,4,1,4,3,3,1,3],[1,4,1,4,4,4,1,1],[0,1,1,1,1,1,11,12]],[[7,7,1,0,0,0,0,0],[12,12,7,1,0,0,0,0],[1,12,7,1,0,0,0,0],[7,7,1,0,0,0,0,0],[1,1,1,0,0,0,0,0],[3,4,15,1,0,0,0,0],[15,15,13,15,1,0,0,0],[1,1,1,1,0,0,0,0]],[[0,0,0,0,5,1,6,7],[0,0,0,1,1,9,1,1],[0,0,1,6,1,11,9,9],[0,0,1,6,6,1,11,1],[0,0,1,1,1,1,1,1],[0,1,4,3,4,1,4,3],[0,1,15,15,15,1,15,15],[0,0,1,1,1,1,1,1]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[1,1,1,0,0,0,0,0],[1,3,3,1,0,0,0,0]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,1,1,0,0,0],[0,0,1,4,4,1,1,1],[0,1,4,3,1,1,3,3]],[[0,0,0,0,0,0,0,0],[1,1,1,0,0,0,1,0],[1,12,12,1,0,1,15,1],[1,1,7,12,1,15,13,1],[3,3,1,7,1,4,15,1],[3,3,1,6,1,3,15,1],[4,4,1,6,1,4,15,1],[1,1,1,1,0,1,1,0]],[[3,1,3,1,1,1,0,0],[3,3,4,1,3,3,1,1],[4,4,1,4,3,4,1,9],[4,4,1,1,4,1,1,6],[3,1,4,3,1,2,10,1],[1,4,3,3,10,10,1,4],[1,1,4,4,14,14,1,4],[0,0,1,1,1,1,1,1]],[[1,4,3,3,1,4,1,3],[1,4,3,3,1,4,1,4],[1,4,4,3,1,4,4,4],[1,4,4,4,4,4,1,3],[1,4,4,4,4,1,3,4],[0,1,4,4,4,1,3,3],[0,1,1,4,4,4,1,1],[0,0,1,1,1,1,1,1]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[1,1,0,0,0,0,0,0],[2,10,1,1,1,0,0,0],[10,1,4,3,3,1,0,0]],[[1,1,1,1,1,0,0,0],[4,4,4,4,4,1,0,0],[4,4,3,3,3,4,1,0],[4,3,3,3,3,3,4,1],[4,4,3,3,3,3,4,1],[1,4,1,1,3,3,4,1],[3,1,4,1,1,1,1,10],[4,3,4,2,8,3,1,10]],[[0,1,1,1,1,1,0,0],[1,1,0,0,0,1,1,1],[1,0,0,0,0,0,1,4],[0,1,0,0,0,1,4,4],[0,0,0,0,0,1,4,4],[0,0,0,0,0,1,4,1],[0,0,0,0,0,0,1,3],[0,0,0,0,0,0,1,3]],[[14,1,4,3,3,1,0,0],[1,1,1,4,4,1,0,0],[1,1,1,1,1,0,0,0],[7,7,1,1,0,0,0,0],[12,12,7,7,1,1,1,0],[7,12,12,12,1,15,15,1],[1,7,7,1,15,13,1,0],[0,1,1,1,15,1,0,0]],[[3,4,4,2,8,1,1,14],[1,4,4,1,1,2,1,1],[4,1,1,4,3,2,1,1],[4,3,4,1,1,1,3,1],[1,4,3,4,1,3,1,7],[4,1,1,1,1,1,6,7],[4,1,7,7,1,0,1,1],[1,12,7,1,0,0,0,0]],[[0,0,0,0,0,1,1,1],[0,0,0,0,1,3,1,9],[0,0,0,1,4,1,4,1],[0,0,0,1,1,2,1,1],[0,0,0,1,10,1,3,3],[0,0,0,1,14,1,3,3],[0,0,0,0,1,1,4,4],[0,0,0,0,0,0,1,1]],[[1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1]],[[6,7,1,0,0,0,0,0],[1,1,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0]],[[0,0,0,0,0,0,0,1],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0]],[[1,1,0,0,0,0,0,0],[4,4,1,0,0,0,0,0],[3,3,4,1,0,0,0,0],[3,3,3,4,1,0,0,0],[3,3,3,4,1,0,0,0],[3,1,1,1,0,0,0,0],[3,4,4,1,0,0,0,0],[4,1,1,1,0,0,0,0]],[[0,0,1,0,0,1,1,1],[0,1,0,1,1,4,4,4],[0,1,0,1,4,4,3,3],[0,1,1,4,4,3,3,3],[0,1,1,4,1,1,1,3],[0,1,1,1,4,4,1,1],[0,0,1,4,4,1,4,4],[0,0,1,4,4,4,1,1]],[[1,3,3,1,0,0,0,0],[2,1,3,1,0,0,0,0],[2,3,1,4,1,0,0,0],[1,1,4,3,4,1,0,0],[1,3,1,4,1,1,0,0],[1,4,3,1,2,10,1,0],[1,4,4,1,10,14,1,0],[5,1,1,14,14,1,0,0]],[[0,0,0,1,4,4,3,3],[0,0,1,9,1,4,1,1],[0,1,3,1,4,1,4,4],[1,4,4,3,4,4,1,1],[1,4,3,1,1,4,1,3],[1,4,1,10,2,1,3,4],[0,1,14,10,10,1,4,4],[0,0,1,14,14,14,1,1]],[[6,6,6,1,1,0,0,0],[6,7,7,12,7,1,0,0],[1,6,7,7,12,7,1,0],[0,1,6,7,7,7,1,0],[0,1,1,1,1,1,0,0],[0,1,4,3,4,15,1,0],[0,1,15,15,15,13,15,1],[0,0,1,1,1,1,1,0]],[[0,0,1,1,1,1,6,6],[0,1,6,7,7,7,7,1],[0,1,6,7,7,12,7,1],[0,0,1,6,7,7,1,0],[0,0,1,1,1,1,0,0],[0,1,15,4,3,4,1,0],[1,15,13,15,15,15,1,0],[0,1,1,1,1,1,0,0]],[[1,3,3,1,0,0,0,0],[2,1,3,1,0,0,0,0],[2,3,1,4,1,0,0,0],[1,1,4,3,4,1,0,0],[1,3,1,4,1,1,0,0],[1,4,3,1,2,10,1,0],[1,4,4,1,10,14,1,0],[5,1,1,14,14,1,0,0]]]},{"palette":[{"r":0,"g":12,"b":0},{"r":0,"g":0,"b":0},{"r":31,"g":31,"b":31},{"r":31,"g":16,"b":11},{"r":26,"g":11,"b":7},{"r":0,"g":27,"b":0},{"r":15,"g":7,"b":0},{"r":29,"g":0,"b":0},{"r":0,"g":0,"b":27},{"r":31,"g":31,"b":15},{"r":31,"g":27,"b":0},{"r":28,"g":21,"b":0},{"r":31,"g":10,"b":0},{"r":23,"g":15,"b":0},{"r":19,"g":11,"b":0},{"r":0,"g":15,"b":0}],"tilesheet":[[[0,0,0,0,0,0,0,0],[1,1,1,0,0,0,0,0],[6,6,6,1,1,0,0,0],[14,14,14,6,6,1,0,0],[13,13,14,13,14,6,1,0],[14,13,13,14,14,14,6,1],[6,14,14,14,6,14,6,1],[4,6,6,6,4,6,6,1]],[[0,0,0,0,0,0,0,0],[0,0,0,1,1,0,0,1],[0,0,1,6,9,1,1,6],[0,0,1,11,1,6,6,14],[0,1,6,1,6,6,14,14],[1,14,1,6,6,14,14,13],[1,14,1,6,6,6,14,14],[1,6,1,6,6,6,6,6]],[[4,4,4,4,4,6,6,1],[1,1,4,1,1,1,6,1],[8,4,4,8,2,1,1,0],[8,3,3,8,2,1,0,0],[3,3,3,3,3,1,0,0],[3,3,3,3,1,11,10,1],[1,1,1,1,14,1,1,0],[10,1,1,10,1,3,3,1]],[[0,1,1,6,6,6,6,6],[1,14,1,6,3,6,4,1],[1,6,1,1,3,6,1,2],[0,1,0,0,1,6,4,2],[0,0,0,0,0,1,1,4],[0,0,0,0,1,11,10,1],[0,0,0,1,3,1,1,14],[0,0,1,4,1,3,3,1]],[[1,10,2,1,1,4,3,1],[1,11,10,1,1,1,1,0],[5,1,1,5,1,12,1,0],[5,5,5,15,1,12,1,0],[15,15,15,1,1,12,1,0],[10,1,1,7,7,12,1,0],[13,14,1,1,1,12,1,0],[1,1,0,0,0,1,0,0]],[[0,0,1,4,1,4,3,1],[0,0,0,1,1,1,1,5],[0,0,1,12,1,15,5,5],[0,1,12,12,1,15,15,5],[0,1,12,12,1,1,15,15],[1,12,7,12,1,1,6,9],[1,12,7,12,1,1,10,14],[0,1,1,1,0,0,1,1]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[1,1,0,0,0,0,0,0],[6,6,1,1,0,0,0,0],[14,14,6,6,1,0,0,0],[13,14,13,14,6,1,0,0],[13,13,14,14,14,6,1,0],[14,14,14,6,14,6,1,0]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,1,1,0,0,1,1],[0,1,6,9,1,1,6,6],[0,1,11,1,6,6,14,14],[1,6,1,6,6,14,14,13],[14,1,6,6,14,14,13,14],[14,1,6,6,6,14,14,6]],[[6,6,6,4,1,1,1,0],[4,4,4,1,3,3,1,0],[4,4,4,1,4,3,1,0],[1,4,1,2,1,1,9,1],[3,3,8,2,1,11,10,1],[3,3,3,3,1,1,1,0],[3,3,3,1,1,4,1,0],[1,1,1,3,3,1,0,0]],[[6,1,6,6,6,6,6,4],[1,1,6,6,6,6,6,4],[14,1,6,3,6,4,1,1],[6,1,1,3,6,1,2,8],[1,0,0,1,6,4,2,8],[0,0,0,0,1,1,4,3],[0,0,0,1,11,10,1,3],[0,0,1,7,1,1,3,1]],[[1,9,1,4,3,1,0,0],[1,11,10,1,1,0,0,0],[1,1,1,5,1,0,0,0],[5,5,5,15,1,0,0,0],[15,15,15,1,14,1,0,0],[1,1,6,6,9,10,1,0],[0,0,1,10,14,13,14,1],[0,0,0,1,1,1,1,0]],[[0,0,1,12,1,4,3,3],[0,0,1,12,1,1,4,4],[0,1,7,12,1,15,1,1],[0,1,12,1,1,15,15,5],[1,7,12,1,1,1,15,15],[1,12,1,1,10,9,6,6],[1,7,1,14,13,14,10,1],[0,1,0,1,1,1,1,0]],[[1,10,2,1,1,4,3,1],[1,11,10,1,1,1,1,0],[5,1,1,5,1,0,0,0],[5,5,5,15,1,1,0,0],[15,15,15,1,11,13,1,0],[1,1,1,10,13,1,0,0],[0,1,6,9,1,0,0,0],[0,0,1,1,0,0,0,0]],[[0,0,1,4,1,4,3,1],[0,1,12,1,1,1,1,5],[1,12,1,1,1,15,5,5],[1,12,1,6,1,15,15,5],[12,1,6,9,10,1,15,15],[1,1,1,13,13,1,1,1],[0,0,0,1,11,13,1,0],[0,0,0,0,1,1,1,0]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[1,1,1,0,0,0,0,0]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,1,1,0,0,1]],[[6,6,6,1,1,0,0,0],[14,14,14,6,6,1,0,0],[13,13,14,13,14,6,1,0],[14,13,13,14,14,14,6,1],[6,14,14,14,6,14,6,1],[4,6,14,6,4,6,6,1],[4,1,6,6,4,6,6,1],[1,4,4,1,1,1,1,0]],[[0,0,1,6,10,1,1,6],[0,0,1,11,1,6,6,6],[0,1,6,1,6,6,14,14],[1,14,1,6,6,14,14,13],[1,14,1,6,6,14,14,14],[1,6,1,6,6,6,14,6],[0,1,1,6,4,6,6,6],[1,14,1,1,4,6,1,1]],[[8,4,4,8,2,1,0,0],[3,3,3,3,1,10,1,0],[1,1,1,1,4,1,1,0],[11,1,4,3,1,14,14,1],[1,1,1,1,14,13,14,1],[1,3,3,1,6,6,6,1],[1,4,3,1,14,13,1,0],[1,1,1,0,1,1,0,0]],[[1,6,1,1,1,1,2,8],[0,1,0,1,11,10,1,2],[0,1,1,1,1,1,1,2],[1,14,14,1,4,3,1,15],[1,14,13,14,1,4,1,1],[1,6,6,6,1,1,3,3],[0,1,13,14,1,1,4,3],[0,0,1,1,1,0,1,1]],[[4,4,4,4,4,6,6,1],[1,1,4,1,1,1,6,1],[8,4,4,8,2,1,1,0],[8,3,3,8,2,1,4,1],[3,3,3,3,3,1,3,1],[3,3,3,3,1,4,3,1],[1,1,1,1,4,3,1,0],[10,1,1,10,1,1,0,0]],[[1,10,2,1,1,0,0,0],[1,11,10,1,1,0,0,0],[5,1,1,5,1,0,0,0],[5,5,5,15,1,1,0,0],[15,15,15,1,11,13,1,0],[1,1,1,10,13,1,0,0],[0,1,6,9,1,0,0,0],[0,0,1,1,0,0,0,0]],[[4,4,4,4,4,6,6,1],[1,1,4,1,1,1,6,1],[8,4,4,8,2,1,1,0],[8,3,3,8,2,1,0,0],[3,3,3,3,3,1,0,0],[3,3,3,3,1,1,1,0],[1,1,1,1,1,3,3,1],[3,1,10,9,1,3,3,1]],[[0,1,1,6,6,6,6,6],[1,14,1,6,3,6,4,1],[1,6,1,1,3,6,1,2],[0,1,0,0,1,6,4,2],[0,0,0,0,0,1,1,4],[0,0,0,0,1,11,10,1],[0,0,0,1,7,1,1,3],[0,0,1,12,1,1,4,3]],[[4,1,11,10,11,1,1,0],[1,11,1,1,1,0,0,0],[5,1,1,5,1,0,0,0],[5,5,5,15,1,1,0,0],[15,15,15,1,11,13,1,0],[1,1,1,10,13,1,0,0],[0,1,6,9,1,0,0,0],[0,0,1,1,0,0,0,0]],[[0,0,1,12,1,15,1,4],[0,1,12,1,1,15,15,1],[1,12,1,1,1,15,5,5],[1,12,1,6,1,15,15,5],[12,1,6,9,10,1,15,15],[1,1,1,13,13,1,1,1],[0,0,0,1,11,13,1,0],[0,0,0,0,1,1,1,0]],[[0,0,0,0,0,0,0,0],[0,0,0,1,1,0,0,1],[0,0,1,6,9,1,1,6],[0,0,1,11,1,6,6,14],[0,1,6,1,6,6,14,14],[1,1,1,6,6,14,14,13],[1,3,3,1,6,6,14,14],[1,4,3,1,6,6,6,6]],[[0,1,1,6,6,6,6,6],[1,10,9,1,3,6,4,1],[1,11,10,1,3,6,1,2],[1,11,1,3,1,6,4,2],[0,1,4,3,3,1,1,4],[0,0,1,4,3,3,1,1],[0,0,0,1,4,3,1,14],[0,0,1,7,1,1,1,1]],[[1,10,2,1,1,4,3,1],[1,11,10,1,1,1,1,0],[5,1,1,5,1,0,0,0],[5,5,5,15,1,1,0,0],[15,15,15,1,11,13,1,0],[1,1,1,10,13,1,0,0],[0,1,6,9,1,0,0,0],[0,0,1,1,0,0,0,0]],[[0,1,12,1,1,1,15,5],[1,12,1,1,1,15,5,5],[1,12,1,1,1,15,5,5],[1,12,1,6,1,15,15,5],[0,1,6,9,10,1,15,15],[0,0,1,13,13,1,1,1],[0,0,0,1,11,13,1,0],[0,0,0,0,1,1,1,0]],[[1,0,0,1,0,1,1,0],[6,1,1,14,1,6,14,1],[14,13,6,1,6,14,1,0],[13,14,14,6,1,1,0,0],[14,14,6,14,6,1,0,0],[6,6,4,6,6,1,0,0],[6,6,4,6,6,1,0,0],[4,4,4,6,6,1,0,0]],[[0,0,1,0,0,1,1,1],[0,1,9,1,1,6,6,6],[1,10,1,6,6,14,13,13],[0,1,6,6,14,13,14,13],[1,6,6,6,6,14,6,14],[1,6,6,6,6,6,4,6],[1,6,6,6,6,6,4,6],[1,6,6,6,6,1,4,4]],[[4,4,1,1,1,1,0,0],[3,1,3,1,3,3,1,0],[3,7,3,1,4,3,1,0],[3,7,3,1,1,1,9,1],[3,3,1,1,11,10,1,0],[1,1,5,1,1,1,0,0],[10,2,1,5,1,0,0,0],[11,10,1,5,1,1,1,0]],[[0,1,3,6,4,4,1,4],[0,1,3,6,4,3,3,1],[0,1,1,6,4,3,3,3],[1,3,3,1,1,3,3,3],[1,4,3,1,1,1,3,3],[0,1,1,9,1,4,1,1],[0,1,11,10,1,1,15,1],[0,0,1,1,1,15,5,1]],[[1,1,5,15,1,14,14,1],[5,5,15,1,14,13,14,1],[15,15,1,14,1,14,1,0],[1,1,1,13,14,1,0,0],[0,0,0,1,1,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0]],[[0,0,1,14,14,1,15,5],[0,0,1,14,13,14,1,15],[0,0,1,6,1,6,1,15],[0,0,0,1,13,14,1,1],[0,0,0,0,1,1,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0]],[[1,1,1,0,0,0,0,0],[6,6,6,1,1,0,0,0],[14,14,14,6,6,1,0,0],[13,13,14,13,14,6,1,0],[14,13,13,14,14,14,6,1],[6,14,14,14,6,14,6,1],[4,6,14,6,4,6,6,1],[4,6,6,6,4,6,1,1]],[[0,0,0,0,1,0,0,1],[0,0,0,1,9,1,1,6],[0,0,1,10,1,6,6,14],[0,1,6,1,6,6,14,14],[1,14,1,6,6,14,14,13],[1,14,1,6,6,14,14,14],[1,6,1,6,6,6,14,6],[0,1,1,6,6,6,6,6]],[[1,4,4,4,1,1,3,3],[3,1,4,1,3,1,4,3],[3,3,2,3,3,1,1,1],[3,1,1,3,3,1,11,1],[3,7,7,3,1,4,1,0],[1,1,1,1,4,1,0,0],[10,1,1,10,1,0,0,0],[1,10,9,1,1,0,0,0]],[[0,1,1,1,3,6,4,1],[1,3,3,1,3,6,4,3],[1,4,3,1,1,6,4,3],[0,1,1,5,1,1,1,4],[0,1,15,5,1,15,1,1],[1,0,1,1,15,5,1,11],[12,1,1,12,1,1,15,1],[12,12,12,7,1,15,5,5]],[[1,11,10,1,1,0,0,0],[5,1,1,5,1,0,0,0],[15,15,15,1,0,0,0,0],[1,1,1,1,0,0,0,0],[14,13,14,1,0,0,0,0],[1,14,1,0,0,0,0,0],[0,1,0,0,0,0,0,0],[0,0,0,0,0,0,0,0]],[[12,12,7,1,1,15,5,5],[7,7,1,1,6,1,15,5],[1,1,0,1,10,6,1,15],[0,0,0,1,14,9,10,1],[0,0,0,1,14,13,14,1],[0,0,0,0,1,14,1,0],[0,0,0,0,0,1,0,0],[0,0,0,0,0,0,0,0]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[1,0,0,0,0,0,0,0],[9,1,1,0,0,0,1,0]],[[2,2,2,0,0,0,0,0],[11,2,11,0,0,0,0,0],[0,2,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[1,1,1,0,0,0,0,0],[3,3,3,1,0,1,0,0],[3,3,3,3,1,11,1,1],[3,7,7,3,1,1,1,10]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,1,1,1,1,0],[0,0,1,6,6,6,6,1],[0,1,13,14,6,6,1,3],[0,1,14,6,4,4,4,1],[1,14,13,14,6,4,4,3]],[[10,1,5,1,0,1,14,1],[1,5,5,5,1,10,13,1],[5,5,5,5,1,9,14,1],[5,5,5,15,1,14,10,1],[15,15,15,1,1,6,6,1],[1,1,1,1,1,1,1,1],[7,7,7,7,7,7,7,1],[1,1,1,1,1,1,1,0]],[[3,7,7,3,1,1,1,11],[3,7,7,3,1,11,1,1],[3,3,7,3,1,1,15,5],[3,3,3,1,4,3,1,15],[6,1,1,11,9,4,1,15],[1,3,3,1,11,1,7,1],[1,4,3,1,1,7,7,7],[0,1,1,1,1,1,1,1]],[[1,13,14,6,6,4,4,1],[1,13,14,6,4,4,1,3],[1,14,13,14,6,6,1,3],[0,1,14,6,6,6,6,4],[0,1,6,6,6,6,6,6],[1,10,1,6,6,6,6,3],[0,1,11,1,6,6,6,6],[0,0,1,0,1,1,1,1]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,2,2,0,0,0],[0,0,9,2,2,2,0,0],[0,0,0,9,2,9,0,0],[0,0,10,0,9,0,0,0],[0,10,0,0,0,0,0,0],[0,0,0,0,0,0,0,0]],[[0,0,0,0,0,0,0,0],[1,1,0,0,0,0,0,0],[6,6,1,1,0,0,0,0],[14,13,14,6,1,0,0,0],[13,13,13,14,6,1,0,0],[14,13,14,6,6,6,1,0],[6,14,6,4,6,6,1,0],[4,4,4,1,1,6,1,0]],[[14,1,0,0,0,0,0,0],[1,14,1,1,1,0,1,1],[0,1,6,9,1,1,6,6],[0,1,10,1,6,6,14,13],[0,0,1,6,6,14,13,14],[0,1,6,6,6,6,14,6],[0,1,6,6,6,6,6,4],[0,1,6,6,6,1,1,4]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,9,2,0,0],[0,10,10,9,2,2,2,0],[0,0,0,0,9,2,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0]],[[1,4,1,1,6,6,1,0],[4,4,8,2,1,1,0,0],[3,3,8,2,1,0,0,0],[3,1,3,3,1,0,0,0],[1,3,3,3,1,0,0,0],[3,3,3,1,1,1,0,0],[1,1,1,1,3,3,1,0],[1,1,11,1,4,3,1,0]],[[0,1,6,6,6,6,1,1],[0,0,1,3,6,1,2,8],[0,0,1,3,6,3,2,8],[0,0,1,1,1,3,3,3],[0,0,1,11,10,1,3,3],[0,0,1,1,1,11,1,3],[0,1,3,3,1,1,10,1],[0,1,4,3,1,15,15,11]],[[1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1]],[[10,9,1,15,1,1,0,0],[11,10,1,15,1,7,1,0],[1,1,5,15,1,12,1,0],[5,5,15,1,1,1,12,1],[15,15,1,13,14,1,7,1],[1,1,6,14,9,10,1,0],[0,0,1,10,14,13,14,1],[0,0,0,1,1,1,1,0]],[[1,7,1,1,15,15,15,1],[1,12,1,1,15,15,5,1],[12,1,1,1,15,15,5,5],[12,1,1,1,1,15,15,5],[12,1,1,14,6,1,15,15],[7,1,10,9,14,6,1,1],[1,14,13,14,10,1,0,0],[0,1,1,1,1,0,0,0]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[1,1,0,0,0,0,0,0],[6,6,1,1,0,0,0,0],[14,14,6,6,1,0,0,0],[13,14,13,14,6,1,0,0],[13,13,14,14,14,6,1,0],[14,14,14,6,14,6,1,0]],[[1,0,0,0,0,0,0,0],[6,1,0,0,0,0,0,0],[1,6,1,1,0,0,1,1],[0,1,6,9,1,1,6,6],[0,1,10,1,6,6,14,14],[0,1,1,6,6,14,14,13],[0,1,6,6,6,14,13,14],[0,1,6,6,6,6,14,6]],[[6,14,6,4,6,6,1,0],[6,6,6,4,6,6,1,0],[4,4,4,1,1,1,0,0],[1,4,1,3,1,0,0,0],[3,7,3,3,1,0,0,0],[3,7,1,1,0,0,0,0],[1,1,3,3,1,0,0,0],[1,3,3,1,3,1,0,0]],[[0,1,6,6,6,6,6,4],[0,1,6,6,6,6,6,4],[0,0,1,3,6,4,1,1],[0,0,1,3,6,3,3,3],[0,0,0,1,6,4,3,3],[0,0,0,1,1,1,4,3],[0,0,1,11,10,1,1,1],[0,1,7,1,1,3,1,10]],[[1,3,1,3,3,1,0,0],[11,1,1,1,1,0,0,0],[1,1,1,5,1,0,0,0],[5,5,5,15,1,0,0,0],[15,15,15,1,14,1,0,0],[1,1,6,6,9,10,1,0],[0,0,1,10,14,13,14,1],[0,0,0,1,1,1,1,0]],[[0,1,12,1,4,3,1,9],[0,1,12,12,1,4,4,1],[0,1,12,12,1,1,1,1],[0,1,12,1,1,15,15,5],[1,7,12,1,1,1,15,15],[1,12,1,1,10,9,6,6],[1,7,1,14,13,14,10,1],[0,1,0,1,1,1,1,0]],[[6,14,6,4,6,6,1,0],[6,6,6,4,6,6,1,0],[4,4,4,1,1,1,0,0],[1,4,1,3,1,0,0,0],[3,3,3,3,1,0,0,0],[3,3,1,1,3,1,0,0],[1,1,3,1,3,1,0,0],[1,3,1,3,3,1,0,0]]]},{"palette":[{"r":0,"g":12,"b":0},{"r":0,"g":0,"b":0},{"r":31,"g":31,"b":31},{"r":31,"g":19,"b":14},{"r":25,"g":14,"b":9},{"r":25,"g":0,"b":0},{"r":14,"g":7,"b":0},{"r":31,"g":6,"b":0},{"r":0,"g":8,"b":31},{"r":31,"g":31,"b":0},{"r":0,"g":31,"b":0},{"r":31,"g":25,"b":0},{"r":25,"g":19,"b":0},{"r":21,"g":13,"b":0},{"r":17,"g":9,"b":0},{"r":0,"g":22,"b":0}],"tilesheet":[[[1,1,1,0,0,0,0,0],[6,6,6,1,1,0,0,0],[14,14,14,14,6,1,0,0],[13,13,14,13,14,6,1,0],[14,13,13,13,14,14,6,1],[6,6,14,6,14,6,6,1],[4,4,6,4,6,6,6,1],[4,6,6,4,4,6,6,1]],[[0,0,0,1,1,0,0,1],[0,0,1,14,9,1,1,6],[0,0,1,11,1,6,6,6],[0,1,6,1,6,6,6,14],[1,13,1,6,6,6,14,13],[1,13,1,6,6,6,6,14],[1,6,1,6,6,6,6,6],[0,1,1,6,6,6,6,4]],[[1,1,4,1,1,1,6,1],[8,4,4,8,2,1,1,0],[8,3,3,8,2,1,0,0],[3,3,3,3,3,1,1,0],[3,3,3,3,1,9,1,0],[1,1,1,1,9,2,9,1],[9,2,2,9,1,1,1,0],[1,9,9,1,1,3,3,1]],[[1,13,1,6,6,6,4,1],[1,6,1,1,3,6,1,2],[0,1,0,1,3,6,4,2],[0,0,0,0,1,1,1,4],[0,0,0,1,9,9,1,1],[0,0,1,9,2,9,9,1],[0,0,0,1,9,1,1,1],[0,0,1,10,1,3,3,1]],[[7,1,1,7,1,4,3,1],[1,11,9,1,1,1,1,0],[1,12,11,1,1,15,1,0],[7,1,1,7,1,10,1,0],[5,5,5,1,1,10,1,0],[11,1,1,15,15,10,1,0],[13,14,1,1,1,10,1,0],[1,1,0,0,0,1,0,0]],[[0,0,1,10,1,4,3,1],[0,1,10,10,1,1,1,7],[0,1,10,10,1,5,7,7],[1,15,10,10,1,5,5,7],[1,15,15,10,1,1,5,5],[1,15,1,15,1,1,14,9],[1,15,1,15,1,1,11,14],[0,1,1,1,1,1,1,1]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[1,0,0,1,1,0,0,0],[6,1,1,9,13,1,0,0],[6,6,6,1,11,1,0,0],[14,6,6,6,1,6,1,0],[13,14,6,6,6,1,13,1],[14,6,6,6,6,1,13,1]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,1,1,1],[0,0,0,1,1,6,6,6],[0,0,1,6,14,14,14,14],[0,1,6,14,13,14,13,13],[1,6,14,14,13,13,13,14],[1,6,6,14,6,14,6,6]],[[1,1,6,6,6,1,6,1],[3,3,1,6,6,1,1,0],[4,3,1,6,6,1,13,1],[1,1,7,1,1,1,6,1],[1,5,7,7,1,0,1,0],[1,5,7,7,1,0,0,0],[1,5,7,5,1,0,0,0],[7,1,5,1,15,1,0,0]],[[1,6,6,6,3,6,3,3],[1,1,1,3,3,6,6,1],[1,3,3,1,1,4,1,1],[1,4,3,1,8,4,4,8],[0,1,1,2,8,3,3,8],[1,7,5,1,3,3,3,3],[1,5,7,5,1,1,1,1],[0,1,5,1,1,9,9,1]],[[7,7,1,1,1,10,1,0],[7,7,5,1,1,10,1,0],[7,7,5,1,1,10,10,1],[7,5,5,1,1,10,10,1],[5,5,1,1,1,10,15,1],[1,1,13,14,1,15,15,1],[14,13,11,14,1,15,1,0],[1,1,1,1,1,1,0,0]],[[0,0,1,1,5,1,1,7],[0,0,0,1,1,11,9,1],[0,0,0,1,1,12,11,1],[0,0,0,1,5,1,1,7],[0,0,1,6,1,5,5,5],[0,1,6,9,12,1,1,1],[0,1,11,14,13,14,1,1],[0,0,1,1,1,1,1,1]],[[7,1,1,7,1,4,3,1],[1,11,9,1,1,1,1,0],[1,12,11,1,1,1,0,0],[7,1,1,7,1,14,1,0],[5,5,5,1,14,1,0,0],[1,6,6,11,1,0,0,0],[0,1,6,1,0,0,0,0],[0,0,1,0,0,0,0,0]],[[0,0,1,10,1,4,3,1],[1,1,10,15,1,1,1,7],[10,10,15,1,1,5,7,7],[1,15,1,6,14,1,5,7],[0,1,6,14,9,11,1,5],[0,0,1,11,14,1,1,1],[0,0,0,1,13,14,1,0],[0,0,0,0,1,1,0,0]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[1,1,1,0,0,0,0,0]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,1,1,0,0,1]],[[6,6,6,1,1,0,0,0],[14,14,14,14,6,1,0,0],[13,13,14,13,14,6,1,0],[14,13,13,13,14,14,6,1],[6,6,14,6,14,6,6,1],[4,4,6,4,6,6,6,1],[4,1,6,4,4,6,6,1],[1,4,4,1,1,1,1,0]],[[0,0,1,13,9,1,1,6],[0,0,1,11,1,6,6,6],[0,1,6,1,6,6,6,14],[1,13,1,6,6,6,14,13],[1,13,1,6,6,6,6,14],[1,6,1,6,6,6,6,6],[0,1,1,6,4,6,6,4],[1,13,1,1,4,6,1,1]],[[8,4,4,8,2,1,0,0],[4,3,3,2,1,0,0,0],[1,1,1,2,7,1,0,0],[11,5,1,5,7,7,1,0],[5,1,1,5,1,1,1,0],[1,3,3,1,14,11,1,0],[1,4,3,1,12,6,6,1],[1,1,1,1,1,1,1,0]],[[1,6,1,0,1,6,2,8],[0,1,0,1,5,7,1,2],[0,0,1,5,7,7,7,2],[0,0,0,1,5,7,7,1],[0,0,0,1,1,5,1,1],[0,1,11,14,1,1,3,3],[1,6,6,12,6,1,4,3],[0,1,1,1,1,1,1,1]],[[1,1,4,1,1,1,6,1],[8,4,4,8,2,1,1,0],[8,3,3,8,2,1,0,0],[3,3,3,3,3,1,0,0],[3,3,3,3,1,7,1,0],[1,1,1,1,5,7,1,0],[9,2,2,9,1,5,1,0],[1,9,9,1,5,1,0,0]],[[7,1,1,7,1,0,0,0],[1,11,9,1,1,0,0,0],[1,12,11,1,1,1,0,0],[7,1,1,7,1,14,1,0],[5,5,5,1,14,1,0,0],[1,6,6,11,1,0,0,0],[0,1,6,1,0,0,0,0],[0,0,1,0,0,0,0,0]],[[1,1,4,1,1,1,6,1],[8,4,4,8,2,1,1,0],[8,3,3,8,2,1,0,0],[3,3,3,3,3,1,0,0],[1,3,3,3,1,0,0,0],[9,1,1,1,0,1,1,0],[1,5,5,5,1,3,3,1],[7,7,7,7,1,4,3,1]],[[1,13,1,6,6,6,4,1],[1,6,1,1,3,6,1,2],[0,1,0,1,3,6,4,2],[0,0,0,0,1,1,1,1],[0,0,0,0,0,1,9,9],[0,0,0,0,1,9,9,9],[0,0,0,1,15,1,1,9],[0,0,1,10,1,1,5,1]],[[5,7,7,5,5,1,1,0],[1,5,5,5,1,0,0,0],[1,1,1,1,1,1,0,0],[7,1,1,7,1,14,1,0],[5,5,5,1,14,1,0,0],[1,6,6,11,1,0,0,0],[0,1,6,1,0,0,0,0],[0,0,1,0,0,0,0,0]],[[0,0,1,10,1,5,1,5],[0,1,10,15,1,5,5,1],[1,10,15,1,1,5,5,7],[1,15,1,6,14,1,5,7],[0,1,6,14,9,11,1,5],[0,0,1,11,14,1,1,1],[0,0,0,1,13,14,1,0],[0,0,0,0,1,1,0,0]],[[0,0,0,1,1,0,0,1],[0,0,1,14,9,1,1,6],[0,0,1,11,1,6,6,6],[0,1,6,1,6,6,6,14],[1,13,1,6,6,6,14,13],[1,13,1,6,6,6,6,14],[1,1,1,6,6,6,6,6],[1,3,3,1,6,6,6,4]],[[1,4,3,1,6,6,4,1],[1,1,1,1,3,6,1,2],[1,5,7,1,3,6,4,2],[1,5,7,5,1,1,1,4],[1,5,7,7,1,9,9,1],[0,1,5,7,5,1,2,9],[0,0,1,5,7,5,1,1],[0,1,15,1,5,1,5,7]],[[7,1,1,7,1,4,3,1],[1,11,9,1,1,1,1,0],[1,12,11,1,1,1,0,0],[7,1,1,7,1,14,1,0],[5,5,5,1,14,1,0,0],[1,6,6,11,1,0,0,0],[0,1,6,1,0,0,0,0],[0,0,1,0,0,0,0,0]],[[1,10,1,1,1,5,7,7],[1,10,1,1,1,5,7,7],[10,1,1,1,1,5,7,7],[10,1,1,6,14,1,5,7],[15,1,6,14,9,11,1,5],[1,0,1,11,14,1,1,1],[0,0,0,1,13,14,1,0],[0,0,0,0,1,1,0,0]],[[1,1,1,0,0,0,0,0],[6,13,13,1,0,1,1,0],[12,1,1,13,1,13,14,1],[6,6,1,1,13,14,1,0],[6,6,6,1,1,1,0,0],[14,6,6,6,1,0,1,0],[6,6,6,6,1,1,10,1],[6,6,6,6,1,10,10,1]],[[0,0,0,0,0,0,1,1],[0,0,0,0,1,1,11,9],[0,0,1,1,6,6,6,6],[0,1,6,14,14,14,14,6],[0,1,14,13,14,13,13,14],[1,6,14,13,13,13,14,13],[1,6,14,6,14,6,6,14],[1,6,6,4,6,4,4,6]],[[6,6,3,1,10,10,1,0],[3,6,3,1,10,15,1,0],[3,6,1,1,15,15,1,0],[1,1,3,3,1,10,10,1],[9,1,4,3,1,10,15,1],[1,7,1,1,15,15,1,0],[1,7,7,1,15,1,0,0],[9,1,7,1,1,0,0,0]],[[0,1,4,4,6,6,4,4],[0,1,1,4,4,4,1,1],[0,1,4,1,4,1,3,3],[0,1,3,3,5,3,3,3],[0,0,1,3,5,5,3,1],[0,1,1,1,1,1,1,2],[1,3,3,1,1,9,9,1],[1,4,3,1,5,1,1,11]],[[11,1,7,1,0,0,0,0],[1,7,1,9,1,0,0,0],[5,1,11,13,14,1,0,0],[1,1,1,6,14,1,0,0],[9,1,0,1,1,0,0,0],[13,14,1,0,0,0,0,0],[6,14,1,0,0,0,0,0],[1,1,0,0,0,0,0,0]],[[0,1,1,1,5,7,1,12],[0,0,0,1,5,7,7,1],[0,0,0,0,1,5,5,5],[0,0,0,0,0,1,1,1],[0,0,0,0,0,0,1,6],[0,0,0,0,0,0,1,11],[0,0,0,0,0,0,0,1],[0,0,0,0,0,0,0,0]],[[14,14,14,1,1,0,0,0],[13,13,14,13,14,1,0,0],[14,13,13,13,14,14,1,0],[6,6,14,6,14,6,6,1],[3,3,6,3,6,6,6,1],[3,6,6,3,3,6,6,1],[1,1,4,1,1,1,1,1],[8,3,3,8,2,1,3,3]],[[0,0,1,13,9,1,1,6],[0,0,1,11,1,6,6,14],[0,1,6,1,6,6,14,13],[1,13,1,6,6,6,6,14],[1,13,1,6,6,6,6,6],[1,6,1,6,6,6,6,3],[0,1,1,6,6,6,4,1],[1,3,3,1,3,6,1,2]],[[8,3,3,8,2,1,4,3],[3,3,5,3,3,1,1,1],[3,3,5,3,1,5,7,1],[1,1,1,1,1,7,5,1],[9,2,2,9,1,5,1,0],[1,9,9,1,5,1,0,0],[5,1,1,5,1,0,0,0],[1,11,9,1,1,0,0,0]],[[1,4,3,1,3,6,4,2],[0,1,1,5,1,1,1,4],[0,1,5,7,5,1,9,1],[0,0,1,5,7,5,1,9],[1,0,0,1,5,7,5,1],[10,1,1,10,1,5,1,5],[10,10,10,15,1,1,5,7],[15,15,15,1,1,5,5,7]],[[1,12,11,1,1,0,0,0],[5,1,1,5,1,0,0,0],[5,5,5,1,0,0,0,0],[1,1,1,1,0,0,0,0],[6,13,14,1,0,0,0,0],[1,14,1,0,0,0,0,0],[0,1,0,0,0,0,0,0],[0,0,0,0,0,0,0,0]],[[1,1,1,0,1,5,5,5],[0,0,0,0,1,5,5,5],[0,0,0,1,6,1,5,5],[0,0,0,1,11,6,1,1],[0,0,0,1,14,13,14,1],[0,0,0,0,1,14,1,0],[0,0,0,0,0,1,0,0],[0,0,0,0,0,0,0,0]],[[6,1,0,0,0,0,0,0],[1,6,1,0,0,0,0,0],[1,9,13,1,0,0,0,0],[1,1,11,1,0,0,0,0],[6,6,1,1,0,0,0,0],[6,6,6,6,1,0,0,0],[14,14,6,6,6,1,0,0],[13,14,14,6,6,6,1,0]],[[0,0,0,0,0,0,0,1],[0,0,0,0,0,0,1,6],[0,0,0,0,0,0,1,6],[0,0,0,0,0,0,1,1],[2,0,0,0,1,1,6,6],[0,0,0,1,6,6,6,6],[0,0,1,6,6,6,6,14],[1,1,6,6,6,6,6,14]],[[0,0,0,2,2,0,0,0],[0,0,2,0,0,2,2,0],[0,0,2,0,2,0,0,2],[0,0,0,0,2,0,0,2],[0,0,0,0,0,0,2,0],[0,0,0,0,0,0,0,0],[0,0,0,0,1,1,1,0],[0,0,0,1,10,10,10,1]],[[14,13,13,14,6,6,1,0],[6,14,13,13,14,6,6,1],[6,6,14,13,14,6,6,1],[6,4,6,14,6,6,6,1],[4,4,6,6,6,1,1,0],[1,4,6,6,1,3,3,1],[3,6,6,1,1,4,3,1],[1,1,1,0,0,1,1,0]],[[10,1,3,3,6,4,4,6],[15,1,3,6,4,4,4,4],[1,15,1,3,1,4,4,4],[7,1,1,3,3,1,4,6],[5,1,1,3,3,1,4,4],[1,3,3,1,3,3,3,1],[1,4,3,1,1,3,3,3],[1,1,1,1,1,1,1,1]],[[0,0,1,15,15,10,10,10],[0,0,1,10,10,10,10,15],[0,1,10,10,15,15,15,1],[0,1,15,15,1,1,1,5],[0,1,15,1,14,1,5,7],[0,0,1,14,12,1,5,5],[0,1,6,6,13,6,1,5],[0,0,1,1,1,1,1,1]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,2,2,0],[0,0,0,0,0,11,2,0],[0,0,0,0,12,0,0,0],[0,2,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,2,0,0,0,0],[2,0,0,0,0,0,0,0]],[[0,0,0,0,0,0,2,2],[0,0,0,0,0,0,11,2],[0,0,0,0,0,0,12,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[1,1,0,0,0,2,0,0],[6,6,1,1,0,0,0,0],[14,13,14,6,1,0,0,0]],[[13,1,0,0,0,0,0,0],[6,13,1,0,0,0,0,0],[1,6,1,0,0,0,0,0],[0,1,14,1,0,0,0,0],[0,0,1,14,1,0,0,0],[0,0,0,1,14,1,1,1],[0,0,0,0,1,1,6,6],[0,0,0,1,6,14,13,13]],[[0,0,0,0,0,0,2,2],[0,0,0,0,0,12,11,2],[0,0,2,0,0,0,0,0],[0,0,0,0,0,0,0,0],[2,0,0,0,0,0,0,0],[0,0,0,12,11,2,0,0],[0,0,0,0,2,2,0,0],[0,0,0,0,0,0,0,0]],[[13,13,14,14,6,1,0,0],[14,6,14,6,6,6,1,0],[6,4,6,6,6,6,1,0],[6,4,4,6,6,6,1,0],[4,4,1,1,6,1,0,0],[4,1,3,3,1,0,0,0],[2,1,4,3,1,0,0,0],[5,5,1,1,5,1,0,0]],[[0,0,1,6,14,13,14,13],[0,1,6,6,6,14,14,6],[0,1,6,6,6,6,6,4],[0,1,6,6,6,6,4,6],[0,1,1,3,6,1,1,4],[0,0,1,1,1,3,3,1],[0,0,1,5,1,4,3,1],[0,1,5,7,5,1,1,5]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0]],[[5,5,3,1,7,5,1,0],[1,1,1,5,7,7,1,0],[2,9,1,1,5,1,1,0],[9,1,5,5,1,1,12,1],[1,5,7,5,1,9,13,1],[9,1,5,1,14,11,14,1],[11,1,1,1,6,6,12,1],[1,0,0,0,1,1,1,0]],[[0,1,5,7,5,1,3,5],[0,1,5,5,5,1,1,1],[0,1,1,5,1,1,9,2],[1,12,1,1,5,5,1,9],[1,13,9,1,5,7,5,1],[1,14,11,14,1,5,1,11],[1,12,6,6,1,1,1,12],[0,1,1,1,0,0,0,1]],[[0,0,0,0,0,0,0,0],[1,1,1,0,0,0,0,0],[6,6,6,1,1,0,0,0],[14,14,14,14,6,1,0,0],[13,13,14,13,14,6,1,0],[14,13,13,13,14,14,6,1],[6,6,14,6,14,6,6,1],[4,4,6,4,6,6,6,1]],[[1,13,1,0,0,0,0,0],[0,1,13,1,1,0,0,1],[0,0,1,13,9,1,1,6],[0,0,1,11,1,6,6,6],[0,0,0,1,6,6,6,14],[0,0,1,6,6,6,14,13],[0,0,1,6,6,6,6,14],[0,0,1,6,6,6,6,6]],[[4,6,6,4,4,6,6,1],[1,4,4,4,1,1,1,0],[4,1,3,1,3,1,0,0],[3,3,5,3,3,1,0,0],[3,3,5,1,1,1,0,0],[1,1,1,3,3,1,0,0],[7,1,3,3,1,3,1,0],[7,1,3,1,3,3,1,0]],[[0,0,1,6,6,6,6,4],[0,0,1,6,3,6,4,1],[0,0,0,1,3,6,4,4],[0,0,0,0,1,1,1,4],[0,0,0,1,1,2,9,1],[0,0,1,2,2,9,1,1],[0,0,0,1,1,1,5,7],[0,0,1,15,1,5,7,7]],[[5,5,1,1,1,1,0,0],[1,1,12,7,1,0,0,0],[7,12,11,7,1,0,0,0],[5,5,5,1,0,0,0,0],[1,1,1,14,1,0,0,0],[1,6,14,9,11,1,0,0],[14,1,12,14,13,14,1,0],[1,1,1,1,1,1,0,0]],[[0,0,1,10,1,1,5,5],[0,0,1,10,1,5,1,1],[0,1,10,1,1,5,5,5],[0,1,10,1,1,1,5,5],[1,15,10,1,1,6,1,1],[1,10,1,1,6,14,9,11],[1,15,1,1,6,12,14,13],[0,1,0,0,1,1,1,1]],[[4,6,6,4,4,6,6,1],[1,4,4,4,1,1,1,0],[4,1,3,1,3,1,0,0],[3,3,3,3,3,1,0,0],[3,3,3,3,1,1,0,0],[1,1,1,1,1,3,1,0],[7,1,1,3,1,3,1,0],[7,1,3,1,3,3,1,0]]]},{"palette":[{"r":0,"g":12,"b":0},{"r":0,"g":0,"b":0},{"r":31,"g":31,"b":31},{"r":31,"g":17,"b":12},{"r":26,"g":11,"b":7},{"r":23,"g":23,"b":15},{"r":18,"g":18,"b":31},{"r":31,"g":8,"b":8},{"r":0,"g":21,"b":0},{"r":31,"g":27,"b":0},{"r":23,"g":0,"b":0},{"r":31,"g":31,"b":19},{"r":24,"g":24,"b":31},{"r":11,"g":11,"b":7},{"r":0,"g":0,"b":29},{"r":12,"g":12,"b":25}],"tilesheet":[[[1,1,0,1,0,0,0,0],[6,6,1,6,1,0,1,0],[12,12,6,12,6,1,11,1],[1,1,12,6,1,11,10,1],[9,11,1,1,11,10,7,1],[1,1,11,9,9,10,1,0],[4,1,1,1,1,9,1,0],[1,2,8,4,1,1,0,0]],[[0,0,0,0,0,0,0,1],[0,0,0,0,1,1,1,6],[0,1,1,1,6,12,6,1],[1,15,6,6,12,6,1,11],[0,1,15,6,12,6,1,9],[0,0,1,15,6,1,11,1],[0,1,15,6,6,6,1,15],[0,0,1,15,15,6,15,4]],[[4,2,8,3,1,1,1,0],[4,3,3,3,1,5,11,1],[4,3,3,3,1,11,1,0],[1,4,3,1,5,2,1,0],[14,1,1,14,1,1,1,0],[11,15,15,5,1,3,3,1],[13,5,5,1,4,3,3,1],[15,14,1,1,4,4,4,1]],[[0,1,5,1,1,1,15,4],[0,0,1,11,11,5,1,4],[0,1,5,1,5,2,11,1],[1,5,11,1,13,5,13,14],[1,11,10,10,1,1,1,11],[1,1,5,1,4,4,1,13],[1,5,11,1,3,3,4,1],[0,1,13,1,3,3,4,1]],[[11,14,6,1,1,13,1,0],[1,11,14,1,10,5,1,0],[13,1,11,1,10,11,1,0],[5,1,1,10,10,11,1,0],[5,1,10,10,10,11,1,0],[10,1,10,10,10,5,1,0],[11,5,1,1,1,5,1,0],[1,1,0,0,0,1,1,0]],[[0,0,1,5,1,1,1,1],[0,1,5,11,10,1,13,5],[0,1,11,11,10,1,13,1],[1,11,11,11,10,1,1,11],[1,5,13,11,1,13,5,11],[1,5,13,5,1,13,5,7],[1,5,13,5,1,13,10,7],[0,1,1,1,0,1,1,1]],[[1,1,0,1,0,0,0,0],[6,6,1,6,1,0,1,0],[12,12,6,12,6,1,11,1],[1,1,12,6,1,11,10,1],[9,11,1,1,11,10,7,1],[1,1,11,9,9,10,1,0],[4,1,1,1,1,9,1,0],[1,2,8,4,1,1,0,0]],[[0,0,0,0,0,0,0,1],[0,0,0,0,1,1,1,6],[0,1,1,1,6,12,6,1],[1,15,6,6,12,6,1,11],[0,1,15,6,12,6,1,9],[0,0,1,15,6,1,11,1],[0,1,15,6,6,6,1,15],[0,0,1,15,15,6,15,4]],[[4,2,8,3,1,1,1,0],[4,1,1,1,1,5,11,1],[1,4,3,3,1,11,1,0],[1,4,3,3,1,1,0,0],[1,1,4,4,1,5,1,0],[3,1,1,1,11,2,1,0],[3,1,13,5,5,1,0,0],[4,1,1,1,1,0,0,0]],[[0,1,5,1,1,1,15,4],[0,0,1,11,11,5,1,4],[0,0,0,1,5,2,11,1],[0,0,0,1,13,5,13,2],[0,0,1,5,1,1,1,1],[0,1,11,1,5,11,1,3],[1,11,1,5,11,1,4,3],[1,11,10,1,5,1,4,4]],[[11,14,6,1,1,0,0,0],[1,11,14,1,5,1,0,0],[10,1,11,1,1,1,0,0],[10,10,1,1,11,5,1,0],[10,1,13,5,11,5,1,0],[10,1,13,5,7,10,1,0],[1,1,13,10,7,11,5,1],[0,0,1,1,1,1,1,0]],[[5,11,10,10,1,1,1,1],[11,10,10,1,13,5,11,5],[11,10,1,13,13,13,5,1],[11,10,1,5,11,5,1,10],[11,1,13,5,11,5,1,10],[5,1,13,5,7,10,1,10],[5,1,13,10,5,11,5,1],[1,1,1,1,1,1,1,0]],[[5,2,1,0,1,1,1,0],[1,5,1,1,1,0,0,0],[1,1,3,15,9,1,1,0],[4,4,15,9,6,11,10,1],[1,15,5,5,9,11,1,0],[0,1,13,5,5,1,0,0],[0,0,1,13,1,0,0,0],[0,0,0,1,0,0,0,0]],[[1,5,1,1,1,1,1,1],[1,5,1,15,4,4,3,3],[1,1,13,5,15,3,3,4],[1,13,5,5,9,15,4,1],[1,5,5,9,6,9,1,0],[0,1,9,6,11,1,0,0],[0,1,1,11,10,11,1,0],[0,0,0,1,1,1,0,0]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[1,1,0,0,0,0,0,0],[15,6,1,0,0,1,0,0],[1,15,6,1,1,6,1,0],[6,12,12,6,1,6,6,1]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,1,1,1,0],[0,0,0,1,15,6,6,1],[0,0,0,1,1,15,12,6],[0,1,1,15,6,12,12,12]],[[12,6,12,12,6,12,6,1],[6,1,6,12,12,6,15,1],[1,11,1,6,6,15,1,0],[5,2,5,1,1,11,15,1],[5,10,5,9,11,15,1,0],[1,9,1,1,15,1,5,1],[4,4,8,2,1,5,11,1],[3,3,3,4,1,1,5,1]],[[1,15,15,15,6,6,6,12],[0,1,1,1,15,6,6,12],[0,1,15,9,1,1,6,6],[1,15,15,1,9,11,1,1],[0,1,15,15,1,9,11,9],[0,0,1,1,4,1,1,1],[0,0,1,1,1,2,8,8],[0,1,3,3,1,1,4,3]],[[3,3,3,1,5,11,1,0],[1,1,1,5,13,10,5,1],[1,5,13,1,5,11,10,1],[13,1,1,1,11,2,11,1],[1,5,13,1,1,1,5,1],[1,13,1,4,4,4,1,1],[0,1,1,3,3,3,4,1],[0,0,0,1,1,1,1,0]],[[1,3,3,1,1,1,1,3],[1,4,1,5,11,1,14,1],[0,1,13,13,13,5,1,1],[0,1,5,2,11,13,1,13],[0,1,5,2,11,5,1,13],[0,1,10,7,10,5,1,1],[1,11,2,11,7,10,1,0],[0,1,1,1,1,1,0,0]],[[4,2,8,3,1,5,1,0],[4,3,3,3,1,11,5,1],[4,3,3,3,1,11,5,1],[1,4,3,1,13,5,1,0],[14,1,1,14,1,1,0,0],[11,15,15,5,1,0,0,0],[13,5,5,1,0,0,0,0],[15,14,1,1,0,0,0,0]],[[11,14,6,1,0,0,0,0],[1,11,14,1,1,0,0,0],[5,1,11,1,5,1,1,0],[13,1,1,11,7,10,5,1],[1,13,5,11,10,11,1,0],[0,1,13,5,10,1,0,0],[0,0,1,13,1,0,0,0],[0,0,0,1,0,0,0,0]],[[4,2,8,3,1,0,0,0],[4,3,3,3,1,0,0,0],[1,3,3,3,1,0,0,0],[1,4,3,1,0,0,0,0],[1,1,1,14,1,1,1,0],[10,5,11,1,4,3,3,1],[10,11,2,1,4,3,3,1],[13,5,5,5,1,4,4,1]],[[0,0,1,5,11,1,1,4],[0,0,0,1,5,11,5,1],[0,0,0,1,5,11,2,11],[0,0,0,1,13,5,5,1],[0,0,1,5,1,1,1,11],[0,0,1,11,1,5,11,2],[0,0,1,11,1,1,5,11],[0,1,11,1,13,5,1,1]],[[1,1,1,1,1,1,1,0],[1,11,14,1,1,0,0,0],[5,1,11,1,5,1,1,0],[13,1,1,11,7,10,5,1],[1,13,5,11,10,11,1,0],[0,1,13,5,10,1,0,0],[0,0,1,13,1,0,0,0],[0,0,0,1,0,0,0,0]],[[1,11,1,13,5,1,13,1],[11,1,1,1,1,5,11,5],[1,0,1,13,1,1,5,1],[0,1,13,5,11,5,1,1],[1,13,5,11,5,5,1,0],[0,1,11,7,10,1,0,0],[0,0,1,10,11,5,1,0],[0,0,0,1,1,1,0,0]],[[0,0,0,0,0,0,0,1],[0,0,0,0,1,1,1,6],[0,1,1,1,6,12,6,1],[1,15,6,6,12,6,1,11],[0,1,1,1,12,6,1,9],[1,3,3,4,1,1,11,1],[1,3,3,4,1,6,1,15],[1,4,4,1,15,6,15,4]],[[0,1,1,11,1,15,15,4],[1,5,11,2,1,15,15,4],[1,5,11,10,11,1,1,1],[1,5,10,11,2,11,1,14],[0,1,1,5,11,5,1,11],[0,1,5,1,5,1,1,13],[1,11,10,10,1,1,13,1],[1,11,10,1,13,5,1,10]],[[11,14,6,1,1,1,1,0],[1,11,14,1,1,0,0,0],[5,1,11,1,5,1,1,0],[13,1,1,11,7,10,5,1],[1,13,5,11,10,11,1,0],[0,1,13,5,10,1,0,0],[0,0,1,13,1,0,0,0],[0,0,0,1,0,0,0,0]],[[11,10,1,13,5,1,13,1],[11,10,10,1,1,5,11,5],[11,10,1,13,1,1,5,1],[5,1,13,5,11,5,1,1],[1,13,5,11,5,5,1,0],[1,1,11,7,10,1,0,0],[0,0,1,10,11,5,1,0],[0,0,0,1,1,1,0,0]],[[1,1,0,1,0,0,0,0],[6,6,1,6,1,0,1,0],[12,12,6,12,6,1,11,1],[1,1,12,6,1,11,10,1],[9,11,1,1,11,10,7,1],[1,1,11,9,9,10,1,0],[4,1,1,4,1,9,1,0],[4,4,1,1,1,1,0,0]],[[0,0,1,1,1,1,1,1],[0,1,6,6,12,12,12,6],[0,0,1,1,6,12,6,1],[0,1,3,4,1,6,1,11],[1,4,3,3,4,1,1,9],[1,4,3,3,4,1,11,1],[0,1,4,4,1,15,1,15],[1,5,1,1,15,15,15,4]],[[4,1,1,3,1,1,1,0],[4,3,3,3,1,5,11,1],[4,3,3,3,1,11,1,1],[1,4,3,1,5,2,1,0],[14,1,1,14,1,1,1,0],[11,15,15,5,1,3,3,1],[13,5,5,1,4,3,3,1],[1,10,1,1,4,4,4,1]],[[1,5,2,5,1,15,15,4],[0,1,5,13,1,15,15,4],[0,1,10,10,5,1,1,1],[0,1,13,5,11,5,1,14],[0,0,1,13,5,11,1,11],[0,0,1,1,13,13,1,13],[0,0,1,5,1,1,1,1],[0,0,1,5,1,5,5,11]],[[1,14,6,1,1,1,1,0],[13,1,14,1,1,0,0,0],[13,1,1,5,5,1,1,0],[1,5,11,11,7,10,5,1],[1,13,5,11,10,11,1,0],[0,1,13,5,10,1,0,0],[0,0,1,13,1,0,0,0],[0,0,0,1,0,0,0,0]],[[0,0,0,1,13,5,11,1],[0,0,0,1,13,5,1,13],[0,0,0,1,13,1,13,5],[0,0,0,0,1,13,1,1],[0,0,0,0,1,13,5,13],[0,0,0,0,1,13,13,1],[0,0,0,0,0,1,1,0],[0,0,0,0,0,0,0,0]],[[6,6,1,6,1,0,1,0],[12,12,6,12,6,1,11,1],[1,1,12,6,1,11,10,1],[9,11,1,1,11,10,7,1],[1,1,11,9,9,10,1,0],[4,1,1,1,1,9,1,0],[1,2,8,4,1,1,0,0],[4,2,8,3,1,1,1,0]],[[0,0,0,0,1,1,1,6],[0,1,1,1,6,12,6,1],[1,15,6,6,12,6,1,11],[0,1,15,6,12,6,1,9],[0,1,1,1,6,1,11,1],[1,3,3,4,1,6,1,15],[1,3,3,4,1,6,15,4],[1,4,4,1,1,1,15,4]],[[4,3,3,3,1,5,11,1],[4,3,3,3,1,11,1,0],[1,4,3,1,5,2,1,0],[14,1,1,14,1,1,0,0],[11,15,15,5,1,3,1,0],[13,5,5,1,3,3,1,0],[15,14,1,1,4,4,1,0],[11,14,6,1,1,1,0,0]],[[1,1,1,5,1,13,1,4],[1,5,11,5,1,11,5,1],[1,13,5,10,5,1,1,14],[1,13,1,5,11,5,1,11],[0,1,5,1,5,13,1,13],[0,1,11,10,1,1,14,1],[0,1,11,10,1,5,11,14],[1,11,10,1,5,11,1,1]],[[1,11,14,1,10,5,1,0],[13,1,11,1,10,11,1,0],[5,1,1,10,10,11,1,0],[5,1,1,1,10,10,11,1],[5,1,0,0,1,1,5,1],[10,1,0,0,0,0,1,0],[11,5,1,0,0,0,0,0],[1,1,0,0,0,0,0,0]],[[1,11,10,10,1,1,13,5],[1,11,10,10,10,1,13,1],[1,11,10,10,10,1,1,11],[1,5,10,10,1,13,5,11],[1,5,1,1,1,13,5,11],[0,1,0,0,1,13,10,7],[0,0,0,0,0,1,1,7],[0,0,0,0,0,0,0,1]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,1,1,0,0,0,0,0],[1,6,12,1,0,0,0,0],[6,1,6,12,1,0,1,0],[12,6,12,12,6,1,6,1],[12,12,12,12,6,1,6,1],[6,12,12,12,12,6,15,1]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,1,1,1],[0,0,1,0,1,6,6,6],[0,1,6,1,1,1,6,12],[1,0,1,6,6,6,12,12],[11,1,1,1,15,6,6,12],[1,15,15,6,6,6,12,6]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,1,0,0,0,0],[0,0,1,11,1,0,0,0],[0,1,13,5,11,1,1,0],[1,11,11,13,5,11,11,1],[1,11,11,11,13,13,5,11],[1,5,5,11,11,11,13,5]],[[1,6,12,6,6,15,1,0],[9,1,6,15,6,1,0,0],[1,9,1,15,15,6,1,0],[1,1,1,1,1,15,1,0],[10,11,2,11,1,1,0,0],[10,5,11,1,3,3,1,0],[13,5,5,1,3,3,3,1],[1,1,1,1,1,1,1,0]],[[11,1,1,1,15,15,6,6],[5,1,5,11,1,1,15,1],[5,5,1,5,11,1,15,15],[1,1,1,5,2,11,1,1],[5,1,13,1,5,1,11,2],[1,5,1,5,1,5,11,11],[5,14,1,13,5,1,5,1],[1,1,1,1,1,1,1,1]],[[1,1,5,5,5,11,11,11],[1,13,1,1,1,5,5,5],[0,1,13,5,11,1,1,1],[0,1,13,5,11,1,1,1],[0,1,13,1,1,11,5,1],[0,0,1,13,5,5,11,5],[0,0,0,1,13,5,5,1],[0,0,0,0,1,1,1,1]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[1,1,0,0,0,0,0,0],[3,3,1,0,0,0,0,0],[3,3,1,0,0,0,0,0],[4,4,1,0,0,0,0,0]],[[1,1,0,1,0,0,0,0],[6,6,1,6,1,0,1,0],[12,12,6,12,6,1,11,1],[1,1,12,6,1,11,10,1],[9,11,1,1,11,10,7,1],[1,1,11,9,9,10,1,4],[4,1,1,1,1,9,1,4],[1,2,8,4,1,1,5,1]],[[0,0,0,0,0,0,0,1],[0,0,0,0,1,1,1,6],[0,1,1,1,6,12,6,1],[1,15,6,6,12,6,1,11],[0,1,15,6,12,6,1,9],[0,0,1,15,6,1,11,1],[0,1,15,6,6,6,1,15],[0,0,1,15,15,6,15,4]],[[1,1,0,0,0,0,0,0],[10,1,0,0,0,0,0,0],[1,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0]],[[4,2,8,3,1,5,13,1],[4,3,3,3,1,13,1,10],[4,3,3,3,1,1,10,10],[1,4,3,1,10,10,10,1],[1,1,1,14,1,7,7,1],[4,4,1,5,1,10,7,1],[3,3,4,1,10,10,1,0],[3,3,4,1,10,1,0,0]],[[0,0,1,1,15,15,15,4],[0,1,5,1,1,1,15,4],[0,0,1,11,11,5,1,1],[0,0,0,1,5,2,11,1],[0,0,1,13,1,1,1,14],[0,1,5,11,10,11,11,1],[0,1,13,10,5,2,5,1],[0,0,1,1,13,5,13,1]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0]],[[1,1,1,5,1,0,0,0],[11,14,1,11,5,1,0,0],[1,11,1,5,5,1,0,0],[0,1,13,13,1,0,0,0],[0,0,1,1,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0]],[[0,0,1,13,5,1,1,1],[0,0,0,1,1,5,11,1],[0,0,1,13,1,1,5,1],[0,1,13,5,11,5,1,0],[1,13,5,11,5,5,1,0],[0,1,11,7,10,1,0,0],[0,0,1,10,11,5,1,0],[0,0,0,1,1,1,0,0]],[[1,1,0,1,0,0,0,0],[6,6,1,6,1,0,1,0],[12,12,6,12,6,1,11,1],[1,1,12,6,1,11,10,1],[9,11,1,1,11,10,7,1],[1,1,11,9,9,10,1,0],[4,1,1,1,1,9,1,0],[1,2,8,4,1,1,0,0]],[[0,0,0,0,0,0,0,1],[0,0,0,0,1,1,1,6],[0,1,1,1,6,12,6,1],[1,15,6,6,12,6,1,11],[0,1,15,6,12,6,1,9],[0,0,1,15,6,1,11,1],[0,1,15,6,6,6,1,15],[0,0,1,1,1,15,15,4]],[[4,2,8,3,1,0,0,0],[4,3,3,3,1,1,0,0],[1,3,3,3,1,3,1,0],[1,4,3,1,4,3,1,0],[1,1,1,4,3,3,1,0],[10,5,11,1,4,1,3,1],[10,11,2,5,1,4,3,1],[13,5,5,1,4,3,1,0]],[[0,0,1,5,11,1,1,4],[0,0,0,1,5,11,5,1],[0,0,0,1,5,11,2,11],[0,0,0,1,13,5,5,1],[0,0,1,5,1,1,1,11],[0,0,1,5,1,5,11,2],[0,0,1,11,1,1,5,11],[0,1,11,11,1,13,1,1]],[[1,1,1,1,1,1,0,0],[1,5,14,1,5,1,0,0],[10,1,11,1,1,1,0,0],[10,10,1,1,11,5,1,0],[10,1,13,5,11,5,1,0],[10,1,13,5,7,10,1,0],[1,1,13,10,7,11,5,1],[0,0,1,1,1,1,1,0]],[[0,1,11,11,1,1,1,1],[0,1,11,11,1,13,5,13],[1,5,11,11,1,1,13,1],[1,5,13,11,1,5,1,10],[1,5,13,5,1,5,1,10],[1,5,13,5,1,10,1,10],[0,1,13,5,1,11,5,1],[0,0,1,1,1,1,1,0]],[[4,2,8,3,1,0,0,0],[4,3,3,3,1,13,0,0],[1,3,1,3,13,2,13,0],[1,4,10,13,9,2,13,0],[1,1,1,9,2,2,13,0],[10,5,11,13,9,13,2,13],[10,11,2,5,13,9,2,13],[13,5,5,13,9,2,13,0]]]},{"palette":[{"r":0,"g":12,"b":0},{"r":0,"g":0,"b":0},{"r":31,"g":31,"b":31},{"r":29,"g":17,"b":0},{"r":23,"g":11,"b":0},{"r":0,"g":8,"b":23},{"r":21,"g":2,"b":0},{"r":29,"g":8,"b":0},{"r":16,"g":16,"b":31},{"r":31,"g":27,"b":0},{"r":28,"g":21,"b":0},{"r":23,"g":13,"b":0},{"r":19,"g":9,"b":0},{"r":15,"g":5,"b":0},{"r":0,"g":16,"b":31},{"r":0,"g":0,"b":16}],"tilesheet":[[[0,0,0,0,0,0,0,0],[1,1,0,0,0,0,0,0],[10,6,1,0,0,0,0,0],[6,9,6,1,0,0,0,0],[6,10,6,5,1,0,0,0],[5,6,5,5,1,1,1,0],[8,15,15,8,8,1,7,1],[2,8,8,2,8,1,7,1]],[[0,0,0,0,0,0,0,0],[0,0,0,0,1,1,1,1],[0,0,0,1,15,5,5,6],[0,0,1,15,5,14,14,5],[0,1,15,15,5,5,14,5],[0,1,15,15,15,5,5,5],[1,6,6,7,15,15,1,8],[1,6,6,7,15,1,8,8]],[[2,1,1,2,8,1,7,1],[1,4,3,1,1,1,1,0],[12,1,1,12,12,1,0,0],[11,12,12,12,13,12,1,0],[12,11,11,12,12,1,1,0],[13,12,11,12,1,7,7,1],[13,12,12,1,6,7,7,1],[13,1,13,1,6,6,6,1]],[[1,6,6,6,7,1,8,8],[0,1,1,1,1,1,13,13],[0,1,3,3,1,13,13,12],[1,4,3,3,3,1,13,12],[1,4,4,1,3,1,1,13],[1,4,1,10,1,7,7,1],[1,1,9,1,6,7,7,1],[0,1,10,1,6,6,6,1]],[[1,13,1,0,1,1,1,0],[5,1,1,0,0,0,0,0],[5,5,1,0,0,0,0,0],[10,7,1,0,0,0,0,0],[6,1,0,0,0,0,0,0],[7,1,0,0,0,0,0,0],[10,7,1,0,0,0,0,0],[1,1,0,0,0,0,0,0]],[[0,0,1,15,15,15,15,15],[0,0,0,1,15,5,5,5],[0,0,0,0,1,15,5,5],[0,0,0,1,6,7,7,7],[0,0,0,1,6,6,6,6],[0,0,0,1,6,6,7,10],[0,0,0,1,6,7,7,7],[0,0,0,0,1,1,1,1]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[1,1,0,0,0,0,0,0],[10,6,1,0,0,0,0,0],[6,10,6,1,0,0,0,0],[6,10,6,5,1,0,0,0],[5,6,5,5,1,0,1,0],[8,15,15,8,8,1,7,1]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,1,1,1,1],[0,0,0,1,15,5,5,6],[0,0,1,15,5,14,14,5],[0,1,15,15,5,5,14,5],[0,1,15,15,15,5,5,5],[1,6,6,7,15,15,1,8]],[[2,8,8,2,8,1,7,1],[1,1,1,2,8,1,7,1],[7,1,3,1,1,1,1,0],[7,1,1,6,7,7,1,0],[6,12,1,6,7,7,1,0],[1,11,1,1,6,6,1,0],[13,12,1,10,1,1,0,0],[13,12,12,1,9,10,1,0]],[[1,6,6,7,15,1,8,8],[1,6,6,6,7,1,1,1],[0,1,1,1,1,1,6,7],[0,0,1,4,4,1,6,7],[0,1,4,3,1,9,1,6],[0,1,4,1,3,1,10,1],[0,0,1,4,3,3,1,1],[0,1,15,1,4,4,15,1]],[[13,1,13,1,1,1,0,0],[1,13,1,5,1,0,0,0],[1,1,5,5,5,1,0,0],[1,6,7,7,10,7,1,0],[1,6,6,6,6,1,0,0],[1,6,6,10,7,1,0,0],[1,6,7,7,10,7,1,0],[0,1,1,1,1,1,0,0]],[[0,1,15,5,5,5,5,1],[0,0,1,15,5,5,5,1],[0,1,15,5,5,5,1,1],[1,6,7,7,7,10,7,1],[1,6,6,6,6,6,1,1],[1,6,6,7,10,7,1,1],[1,6,7,7,7,10,7,1],[0,1,1,1,1,1,1,0]],[[1,13,1,1,1,1,1,0],[5,1,5,5,1,0,0,0],[15,5,5,10,6,1,1,0],[1,15,7,6,7,7,7,1],[1,7,6,7,10,7,1,0],[1,6,6,7,7,1,0,0],[0,1,6,6,1,0,0,0],[0,0,1,1,0,0,0,0]],[[0,0,1,1,15,15,15,5],[0,0,1,15,15,5,5,5],[0,1,7,15,5,5,5,1],[1,6,6,7,10,5,1,1],[1,6,7,6,6,7,1,0],[1,6,7,10,7,1,0,0],[0,1,6,7,10,7,1,0],[0,0,1,1,1,1,0,0]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[1,1,1,0,0,0,0,0],[10,6,5,1,0,0,0,0],[9,7,14,5,1,0,0,0]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,1,1,1],[0,0,0,0,1,15,5,6],[0,0,0,1,15,5,14,7]],[[9,7,14,14,5,1,0,0],[10,6,5,14,5,1,1,0],[10,6,5,5,5,1,7,1],[6,5,5,5,5,1,7,1],[15,8,8,1,5,6,7,1],[8,2,8,8,1,3,1,0],[3,1,1,1,1,1,3,1],[1,12,12,1,7,7,1,1]],[[0,0,1,15,15,5,5,6],[0,1,1,15,15,5,5,6],[1,7,1,15,15,15,5,6],[1,7,1,15,15,15,15,5],[1,7,6,15,1,8,8,15],[0,1,1,1,8,8,2,8],[1,1,3,1,1,1,1,4],[1,4,3,3,1,12,12,1]],[[11,12,12,1,1,7,7,1],[12,11,1,15,5,1,7,1],[12,1,15,5,5,5,1,0],[13,1,6,7,7,10,7,1],[1,1,6,6,6,6,1,0],[0,1,6,6,7,10,1,0],[0,1,6,7,7,10,7,1],[0,0,1,1,1,1,1,0]],[[1,4,4,1,12,13,12,11],[1,4,3,3,1,12,12,12],[1,4,1,1,1,13,12,13],[0,1,10,9,10,1,13,12],[1,10,1,1,1,1,1,13],[0,1,6,7,7,1,0,1],[1,6,7,7,1,0,0,0],[0,1,1,1,0,0,0,0]],[[2,1,1,2,8,1,7,1],[1,4,3,1,1,3,1,0],[12,1,1,12,12,1,1,0],[11,12,12,12,13,12,1,0],[12,11,11,12,12,1,0,0],[13,12,12,12,13,1,0,0],[13,12,12,12,13,1,0,0],[13,1,12,13,1,0,0,0]],[[1,13,1,1,0,0,0,0],[5,1,5,5,1,0,0,0],[15,5,5,10,6,1,1,0],[1,15,7,6,7,7,7,1],[1,7,6,7,10,7,1,0],[1,6,6,7,7,1,0,0],[0,1,6,6,1,0,0,0],[0,0,1,1,0,0,0,0]],[[2,1,1,2,8,1,7,1],[1,4,3,1,1,3,1,0],[1,1,1,12,12,1,1,0],[3,1,12,12,13,12,1,0],[3,3,1,12,12,1,1,0],[4,3,1,9,1,7,7,1],[4,1,9,1,6,7,7,1],[1,1,10,1,6,6,6,1]],[[1,6,6,6,7,1,8,8],[0,1,1,1,1,1,1,1],[0,0,1,5,5,1,4,3],[0,0,1,5,1,4,3,3],[0,0,1,5,1,4,3,3],[0,0,0,1,15,1,4,3],[0,0,0,1,15,15,1,4],[0,0,0,1,7,6,7,1]],[[1,1,1,1,1,1,1,0],[5,1,5,5,1,0,0,0],[15,5,5,10,6,1,1,0],[1,15,7,6,7,7,7,1],[1,7,6,7,10,7,1,0],[1,6,6,7,7,1,0,0],[0,1,6,6,1,0,0,0],[0,0,1,1,0,0,0,0]],[[0,0,1,1,15,15,15,5],[0,0,1,15,15,5,5,5],[0,1,7,15,5,5,5,1],[1,6,6,7,10,5,1,1],[1,6,7,6,6,7,1,0],[1,6,7,10,7,1,0,0],[0,1,6,7,10,7,1,0],[0,0,1,1,1,1,0,0]],[[0,0,0,0,0,0,0,0],[0,0,0,0,1,1,1,1],[0,0,0,1,15,5,5,6],[0,0,1,15,5,14,14,5],[0,1,15,15,5,5,14,5],[0,1,15,15,15,5,5,5],[1,6,7,1,15,15,1,8],[1,6,7,7,15,1,8,8]],[[1,6,6,7,1,1,8,8],[0,1,1,1,9,1,13,13],[1,10,10,9,1,13,13,12],[0,1,1,1,3,1,13,12],[0,1,4,3,4,3,1,13],[0,1,4,4,3,3,15,1],[0,0,1,4,4,15,15,1],[0,0,0,1,7,6,7,1]],[[1,13,12,13,1,1,1,0],[5,1,13,1,1,0,0,0],[15,5,1,10,6,1,1,0],[1,15,7,6,7,7,7,1],[1,7,6,7,10,7,1,0],[0,6,6,7,7,1,0,0],[0,1,6,6,1,0,0,0],[0,0,1,1,0,0,0,0]],[[0,0,1,1,15,15,15,5],[0,0,1,15,15,5,5,5],[0,1,7,15,5,5,5,1],[1,6,6,7,10,5,1,1],[1,6,7,6,6,7,1,0],[1,6,7,10,7,1,0,0],[0,1,6,7,10,7,1,0],[0,0,1,1,1,1,0,0]],[[1,1,0,0,0,0,0,0],[5,5,1,1,0,0,0,0],[5,14,14,5,1,0,0,0],[15,5,5,14,5,1,0,0],[1,15,5,5,5,1,0,0],[8,1,15,6,7,1,0,0],[8,1,15,6,7,7,1,0],[13,1,6,6,7,7,1,0]],[[0,0,0,0,0,1,1,1],[0,1,1,0,1,6,9,6],[1,7,7,1,6,10,6,15],[1,6,7,15,6,10,6,15],[1,6,6,2,8,6,8,2],[0,1,1,8,2,8,2,8],[1,13,1,8,1,1,8,8],[0,1,13,1,4,3,1,13]],[[12,13,1,1,6,6,1,0],[1,3,3,1,1,1,0,0],[1,4,3,3,1,0,0,0],[3,3,4,4,1,0,0,0],[1,4,4,1,1,0,0,0],[10,1,15,5,1,1,1,0],[10,1,5,5,1,7,7,1],[15,5,5,1,6,10,7,1]],[[1,13,13,12,1,12,12,12],[0,1,1,13,2,12,11,12],[0,1,13,12,2,11,12,13],[0,1,13,13,1,1,13,1],[0,1,13,1,6,7,1,9],[0,0,1,1,6,7,7,1],[0,0,0,1,6,6,6,1],[0,0,0,0,1,15,15,15]],[[5,1,1,7,6,7,10,1],[1,15,15,7,6,6,7,1],[1,1,1,6,1,1,6,1],[1,0,0,1,0,0,1,0],[1,0,0,0,0,0,0,0],[1,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0]],[[0,0,0,1,15,15,5,5],[0,0,0,1,15,5,5,5],[0,0,1,6,7,7,10,7],[0,0,0,1,6,6,6,6],[0,0,0,1,6,7,10,7],[0,0,1,6,7,10,7,7],[0,0,0,1,1,1,1,1],[0,0,0,0,0,0,0,0]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[1,1,0,0,0,0,0,0],[10,6,1,0,0,0,0,0],[6,9,6,1,0,0,0,0],[6,10,6,5,1,0,0,0],[5,6,5,5,1,1,1,0],[8,15,15,8,8,1,7,1]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,1,1,1,1],[0,0,0,1,15,5,5,6],[0,0,1,15,5,14,14,5],[0,1,15,15,5,5,14,5],[0,1,15,15,15,5,5,5],[1,6,6,7,15,15,1,8]],[[8,8,8,8,2,1,7,1],[2,1,1,2,8,1,7,1],[1,4,3,1,1,1,1,0],[12,1,1,12,12,1,0,0],[1,2,2,1,2,12,1,0],[1,2,2,1,2,1,0,0],[13,12,11,12,1,6,1,0],[13,12,12,1,7,7,1,0]],[[1,6,6,7,15,1,2,2],[1,6,6,6,7,1,8,8],[0,1,1,1,1,1,13,13],[0,1,3,3,1,13,13,12],[1,4,3,3,3,1,13,2],[1,4,1,4,1,1,13,2],[1,1,10,1,7,7,1,1],[1,9,1,6,7,7,1,1]],[[15,1,13,1,6,7,1,0],[15,15,1,5,1,1,0,0],[1,15,5,5,5,1,0,0],[1,6,7,7,10,7,1,0],[1,6,6,6,6,1,0,0],[1,6,7,10,7,1,0,0],[1,6,7,7,10,7,1,0],[0,1,1,1,1,1,0,0]],[[0,10,1,6,6,6,1,5],[0,1,15,1,1,1,5,1],[0,1,15,5,5,5,1,0],[1,6,7,10,7,7,1,0],[0,1,6,6,6,6,1,0],[0,1,6,7,10,7,1,0],[1,6,7,10,7,7,1,0],[0,1,1,1,1,1,0,0]],[[0,0,0,0,0,0,0,0],[1,0,1,0,0,1,0,0],[1,1,7,1,1,7,1,0],[1,5,10,6,7,10,1,0],[5,5,7,6,10,7,1,0],[1,5,7,6,7,7,1,0],[15,15,6,6,6,6,1,0],[15,1,1,1,1,1,0,0]],[[1,0,1,0,0,1,1,1],[13,1,13,1,1,6,7,7],[1,13,12,13,1,6,7,7],[1,2,2,12,13,1,6,6],[3,1,1,11,12,12,1,1],[4,2,2,12,11,11,12,13],[1,2,2,12,12,12,13,1],[1,1,1,12,12,13,1,15]],[[0,0,0,0,0,0,0,0],[0,0,0,1,1,1,1,1],[0,0,1,5,5,2,8,8],[0,1,5,14,5,8,2,8],[1,5,6,6,5,15,8,1],[1,6,9,10,6,15,8,1],[1,10,6,6,5,8,2,8],[1,6,14,14,5,2,8,8]],[[1,0,0,0,0,0,0,0],[5,1,1,1,1,1,0,0],[5,5,7,6,7,7,1,0],[5,5,7,6,10,7,1,0],[5,5,10,6,7,10,1,0],[15,15,7,6,6,7,1,0],[1,1,6,1,1,6,1,0],[0,0,1,0,0,1,0,0]],[[1,2,2,13,13,1,15,5],[13,13,13,13,1,6,5,5],[1,13,13,1,15,7,5,5],[4,1,13,1,15,6,15,5],[3,4,1,4,1,1,1,15],[3,3,4,1,0,0,0,1],[4,4,1,0,0,0,0,0],[1,1,0,0,0,0,0,0]],[[1,5,14,5,5,15,8,8],[1,15,5,5,15,15,1,1],[0,1,15,1,1,1,1,6],[0,0,1,6,6,1,1,1],[0,1,6,7,7,1,10,1],[0,1,6,7,7,1,9,1],[0,0,1,1,1,10,1,4],[0,0,0,0,0,1,0,1]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,1,1,0,0,0,0],[0,1,2,2,1,0,0,0]],[[0,0,0,0,0,0,0,0],[1,1,0,0,0,0,0,0],[10,6,1,0,0,0,0,0],[6,9,6,1,0,0,0,0],[6,10,6,5,1,0,0,0],[5,6,5,5,1,1,1,0],[8,15,15,8,8,1,7,1],[8,8,8,8,2,1,7,1]],[[0,0,0,0,0,0,0,0],[0,0,0,0,1,1,1,1],[0,0,0,1,15,5,5,6],[0,0,1,15,5,14,14,5],[0,1,15,15,5,5,14,5],[0,1,15,15,15,5,5,5],[1,6,6,7,15,15,1,8],[1,6,6,7,15,1,8,2]],[[1,2,14,14,2,1,0,0],[1,2,5,14,2,1,0,0],[0,1,2,2,1,0,0,0],[0,1,1,1,0,0,0,0],[1,6,7,7,1,0,0,0],[1,6,7,7,1,0,0,0],[10,1,6,6,1,0,0,0],[1,0,1,1,0,0,0,0]],[[2,1,1,2,8,1,7,1],[1,4,3,1,1,1,1,0],[12,1,1,12,12,1,0,0],[2,2,2,1,13,12,1,1],[1,1,1,1,12,1,1,10],[1,1,1,12,1,3,1,9],[13,12,12,1,4,3,4,1],[13,12,13,13,1,1,1,0]],[[1,6,6,6,7,1,8,8],[0,1,1,1,1,1,13,13],[0,1,3,3,1,13,13,12],[1,4,3,3,3,1,13,1],[1,4,4,1,3,1,1,1],[1,4,1,9,1,7,7,1],[1,1,9,1,6,7,7,1],[0,1,10,1,6,6,6,1]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0]],[[13,1,13,1,0,0,0,0],[1,13,1,5,1,0,0,0],[1,1,15,5,5,1,0,0],[1,6,7,7,10,7,1,0],[1,6,6,6,6,1,0,0],[0,1,6,7,10,7,1,0],[0,1,6,7,7,10,7,1],[0,0,1,1,1,1,1,0]],[[0,0,0,1,15,15,1,1],[0,0,1,15,5,5,5,15],[0,1,15,5,5,5,15,1],[1,6,7,10,7,7,7,1],[0,1,6,6,6,6,6,1],[0,1,6,7,10,7,7,1],[1,6,7,10,7,7,7,1],[0,1,1,1,1,1,1,0]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[1,1,0,0,0,0,0,0],[10,6,1,0,0,0,0,0],[6,9,6,1,0,0,0,0],[6,10,6,5,1,0,0,0],[5,6,5,5,1,1,0,0],[8,15,15,1,2,2,1,0]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,1,1,1,1],[0,0,0,1,15,5,5,6],[0,0,1,15,5,14,14,5],[0,1,15,15,1,1,1,5],[0,1,15,1,7,7,7,1],[1,6,1,7,7,6,1,8]],[[2,8,1,2,14,14,2,1],[2,1,1,2,5,14,2,1],[1,4,3,1,2,2,1,0],[12,1,1,12,1,1,1,0],[11,12,12,1,6,7,7,1],[12,11,11,1,6,7,7,1],[13,12,11,1,1,6,6,1],[13,12,12,1,10,1,1,1]],[[1,9,1,1,6,1,8,8],[0,1,10,10,1,1,8,8],[1,3,1,1,1,1,13,13],[1,4,3,4,1,13,13,12],[1,4,3,3,3,1,13,12],[0,1,4,4,1,15,1,13],[0,0,1,1,15,5,15,1],[0,1,15,15,6,7,6,1]],[[13,1,13,1,1,10,10,1],[1,13,1,5,1,1,1,0],[1,1,5,5,5,1,0,0],[1,6,7,7,10,7,1,0],[1,6,6,6,6,1,0,0],[1,6,6,10,7,1,0,0],[1,6,7,7,10,7,1,0],[0,1,1,1,1,1,0,0]],[[0,1,15,5,5,5,5,1],[0,0,1,15,5,5,5,1],[0,1,15,5,5,5,1,1],[1,6,7,7,7,10,7,1],[1,6,6,6,6,6,1,1],[1,6,6,7,10,7,1,1],[1,6,7,7,7,10,7,1],[0,1,1,1,1,1,1,0]],[[2,8,1,2,14,14,2,1],[2,1,1,2,5,14,2,1],[1,4,3,1,2,2,1,0],[12,1,1,12,1,1,1,0],[11,12,12,1,6,7,7,1],[12,11,11,1,6,7,7,1],[13,12,11,1,1,6,6,1],[13,12,12,1,10,1,1,1]]]},{"palette":[{"r":0,"g":12,"b":0},{"r":0,"g":0,"b":0},{"r":31,"g":31,"b":31},{"r":31,"g":21,"b":12},{"r":24,"g":16,"b":10},{"r":0,"g":17,"b":0},{"r":9,"g":25,"b":9},{"r":31,"g":6,"b":27},{"r":0,"g":0,"b":31},{"r":3,"g":19,"b":3},{"r":15,"g":31,"b":15},{"r":31,"g":31,"b":0},{"r":25,"g":19,"b":0},{"r":25,"g":0,"b":21},{"r":31,"g":21,"b":31},{"r":0,"g":13,"b":0}],"tilesheet":[[[1,1,0,0,0,0,0,0],[6,6,1,1,0,0,0,0],[6,11,6,6,1,0,0,0],[9,6,11,2,6,1,0,0],[4,9,6,11,6,1,0,0],[4,4,9,6,11,1,0,0],[1,1,1,9,6,6,1,0],[2,8,4,9,6,11,1,0]],[[0,0,0,0,1,1,1,1],[0,0,0,1,9,6,11,6],[0,0,1,9,6,1,1,6],[0,1,9,11,1,7,14,1],[0,1,9,6,1,13,7,1],[0,1,9,5,5,1,1,4],[0,1,15,3,3,9,4,4],[0,1,15,3,4,9,4,1]],[[2,8,3,9,6,6,11,1],[3,3,3,9,9,6,1,6],[3,3,3,9,15,9,6,1],[4,3,1,9,9,1,9,1],[1,1,15,1,9,1,1,0],[3,4,1,1,1,1,1,0],[9,3,9,1,15,3,3,1],[11,9,1,6,15,4,3,1]],[[0,1,15,15,3,9,4,4],[0,0,1,15,15,9,4,2],[0,0,0,1,1,1,15,4],[0,0,0,1,4,3,1,1],[0,0,1,4,3,3,9,4],[0,1,10,1,1,1,1,9],[1,10,11,10,15,3,3,1],[1,6,11,10,15,4,3,1]],[[9,1,6,11,6,1,1,0],[15,1,6,11,10,1,0,0],[1,0,1,6,10,1,0,0],[1,0,1,6,10,1,0,0],[1,0,0,1,6,1,0,0],[1,0,0,1,6,1,0,0],[10,1,0,0,1,0,0,0],[1,0,0,0,0,0,0,0]],[[1,6,11,10,1,15,15,9],[1,6,11,10,1,4,3,4],[1,6,11,10,1,4,3,3],[1,6,6,15,5,6,6,3],[1,6,6,1,15,5,6,10],[1,6,1,0,1,12,6,10],[1,6,1,0,1,11,1,6],[0,1,0,0,0,1,0,1]],[[1,0,0,0,0,0,0,0],[6,1,1,0,0,0,0,0],[11,6,6,1,0,0,0,0],[6,11,2,6,1,0,0,0],[9,6,11,6,1,0,0,0],[4,9,6,11,1,0,0,0],[1,1,9,6,6,1,0,0],[8,4,9,6,11,1,0,0]],[[0,0,0,1,1,1,1,1],[0,0,1,9,6,11,6,6],[0,1,9,6,1,1,6,6],[1,9,11,1,7,14,1,9],[1,9,6,1,13,7,1,4],[1,9,5,5,1,1,4,4],[1,15,3,3,9,4,4,1],[1,15,3,4,9,4,1,2]],[[8,3,9,6,6,11,1,1],[3,3,9,9,6,1,6,6],[3,3,9,15,9,6,1,1],[1,1,15,1,1,1,6,1],[3,3,1,10,10,1,1,0],[4,3,1,11,11,10,1,0],[1,1,6,10,11,10,1,0],[15,1,1,6,11,10,1,0]],[[1,15,15,3,9,4,4,2],[0,1,15,15,9,4,2,3],[0,0,1,1,1,15,4,3],[0,0,1,3,4,1,1,3],[0,1,4,1,1,15,1,1],[1,6,1,3,3,1,5,1],[1,6,1,4,3,1,12,11],[1,6,11,1,1,15,15,5]],[[1,1,1,6,11,10,1,0],[1,1,1,6,10,1,0,0],[3,1,1,6,10,1,0,0],[3,1,1,6,1,0,0,0],[10,1,1,6,1,0,0,0],[10,1,1,1,0,0,0,0],[6,10,1,0,0,0,0,0],[1,1,0,0,0,0,0,0]],[[1,6,11,10,1,4,3,15],[1,6,11,10,1,4,3,3],[1,6,11,10,1,1,4,3],[0,1,6,10,1,5,6,6],[0,1,6,10,1,15,5,6],[0,0,1,6,1,1,12,6],[0,0,1,6,1,1,11,1],[0,0,0,1,0,0,1,0]],[[15,1,6,11,6,1,1,0],[1,1,6,11,10,1,0,0],[4,1,11,10,1,0,0,0],[10,6,1,1,0,0,0,0],[6,10,6,6,1,0,0,0],[11,6,10,1,0,0,0,0],[12,1,1,0,0,0,0,0],[1,0,0,0,0,0,0,0]],[[6,11,10,1,1,1,1,15],[11,10,1,15,4,3,3,4],[6,1,15,9,3,3,4,1],[6,1,9,6,10,4,15,6],[1,12,6,10,6,1,1,9],[1,11,10,6,1,0,0,1],[0,1,6,10,6,1,0,1],[0,0,1,1,1,0,0,0]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[1,1,0,0,0,0,0,0],[6,6,1,1,0,0,0,0]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,1,1,1,1],[0,0,0,1,1,9,6,6]],[[11,11,6,6,1,0,0,0],[11,2,11,2,6,1,0,0],[6,11,6,11,6,6,1,0],[9,6,9,6,11,6,1,0],[4,9,4,9,6,6,6,1],[1,4,1,4,6,1,6,1],[4,4,1,1,9,9,1,6],[3,3,8,2,15,6,9,1]],[[0,0,1,9,9,6,6,11],[0,1,9,9,1,1,9,6],[0,1,9,1,7,14,1,9],[0,1,15,1,13,7,1,9],[0,1,15,15,1,1,4,4],[0,1,15,15,15,4,4,4],[0,0,1,3,15,1,1,1],[0,0,1,3,15,2,8,8]],[[3,3,3,4,1,15,6,1],[3,3,4,1,4,1,9,1],[1,1,1,4,3,4,1,0],[4,15,1,1,1,10,1,0],[1,3,9,9,11,1,1,0],[3,3,3,6,6,6,1,0],[4,4,4,9,9,9,9,1],[1,1,1,1,1,1,1,1]],[[0,0,0,1,1,4,2,3],[0,0,0,1,4,1,4,3],[0,0,1,4,3,4,1,1],[0,0,1,6,10,1,5,4],[0,1,6,11,10,1,1,1],[0,1,4,4,1,3,3,1],[1,4,3,3,1,4,3,1],[0,1,1,1,0,1,1,1]],[[2,8,3,9,6,6,11,1],[3,3,3,9,9,6,1,6],[3,3,3,9,15,9,6,1],[4,3,1,9,9,1,9,1],[1,1,15,1,9,1,1,0],[3,4,1,1,1,10,1,0],[9,3,9,1,11,10,1,0],[11,9,1,1,6,11,10,1]],[[15,1,0,0,1,6,10,1],[1,1,0,0,0,1,10,1],[4,1,0,0,0,0,1,0],[10,6,1,1,0,0,0,0],[6,10,6,6,1,0,0,0],[11,6,10,1,0,0,0,0],[12,1,1,0,0,0,0,0],[1,0,0,0,0,0,0,0]],[[2,8,3,9,6,6,11,1],[3,3,3,9,9,6,1,6],[3,3,3,9,15,9,6,1],[1,3,1,9,9,1,9,1],[4,1,15,1,9,1,1,0],[3,1,1,1,1,1,1,0],[1,6,10,10,1,3,3,1],[6,11,11,10,1,4,3,1]],[[0,1,15,15,3,9,4,4],[0,0,1,15,15,9,4,2],[0,0,0,1,1,1,15,4],[0,0,0,0,0,1,1,1],[0,0,0,0,1,9,6,1],[0,0,0,1,9,6,1,4],[0,0,0,1,9,6,1,4],[0,0,0,0,1,9,1,1]],[[11,10,10,1,0,1,1,0],[6,1,1,0,0,0,0,0],[1,1,0,0,0,0,0,0],[10,6,1,1,0,0,0,0],[6,10,6,6,1,0,0,0],[11,6,10,1,0,0,0,0],[12,1,1,0,0,0,0,0],[1,0,0,0,0,0,0,0]],[[0,0,0,1,1,1,11,11],[0,0,1,6,6,6,6,6],[0,1,15,1,1,1,1,1],[0,1,9,6,10,4,15,6],[1,12,6,10,6,1,1,9],[1,11,10,6,1,0,0,1],[0,1,6,10,6,1,0,1],[0,0,1,1,1,0,0,0]],[[0,0,0,0,1,1,1,1],[0,0,0,1,9,6,11,6],[0,0,1,9,6,1,1,6],[0,1,9,11,1,7,14,1],[0,1,9,6,1,13,7,1],[0,1,1,5,5,1,1,4],[1,3,3,1,3,9,4,4],[1,4,3,1,4,9,4,1]],[[0,1,1,15,3,9,4,4],[1,6,10,1,15,9,4,2],[1,6,11,10,1,1,15,4],[1,6,11,10,10,1,1,1],[1,6,11,6,1,3,15,1],[1,6,6,1,4,3,4,9],[1,6,6,1,1,4,15,5],[1,6,1,1,1,1,12,1]],[[1,1,1,1,1,1,1,0],[1,1,6,11,10,1,0,0],[4,1,11,10,1,0,0,0],[10,6,1,1,0,0,0,0],[6,10,6,6,1,0,0,0],[11,6,10,1,0,0,0,0],[12,1,1,0,0,0,0,0],[1,0,0,0,0,0,0,0]],[[1,6,1,1,1,4,3,15],[1,1,1,15,4,3,3,4],[0,1,15,9,3,3,4,1],[0,1,9,6,10,4,15,6],[1,12,6,10,6,1,1,9],[1,11,10,6,1,0,0,1],[0,1,6,10,6,1,0,1],[0,0,1,1,1,0,0,0]],[[1,0,0,0,0,0,0,0],[6,1,1,0,0,0,0,0],[11,6,6,1,1,0,0,0],[11,2,6,6,6,1,0,0],[6,11,11,6,1,6,1,0],[9,6,6,6,6,1,1,0],[3,9,6,1,6,6,6,1],[1,9,9,6,1,1,1,0]],[[0,0,0,0,1,1,1,1],[0,0,0,1,6,6,6,6],[0,1,1,6,11,11,2,11],[1,7,14,1,6,6,11,6],[1,13,7,1,9,9,6,9],[0,1,1,15,3,3,9,3],[1,15,15,3,3,3,3,3],[1,4,15,1,1,3,3,3]],[[3,15,9,9,6,6,1,0],[3,15,1,1,1,1,0,0],[3,1,3,3,1,10,1,0],[1,1,4,3,1,11,10,1],[3,3,1,1,6,11,10,1],[4,3,1,0,1,6,11,1],[1,1,0,0,0,1,11,10],[10,10,1,0,0,1,6,10]],[[1,4,15,4,4,1,4,1],[0,1,15,4,3,3,3,3],[0,0,1,4,3,3,13,3],[0,0,0,1,1,3,13,3],[0,0,1,4,3,1,1,1],[0,0,1,4,3,3,1,15],[0,0,0,1,4,1,10,10],[0,0,0,1,1,6,6,11]],[[11,11,10,1,1,0,1,10],[1,6,6,10,10,1,1,6],[9,1,1,1,1,0,0,1],[10,6,1,10,1,0,0,0],[6,1,5,6,10,1,0,0],[1,0,1,5,6,1,0,0],[0,0,0,1,1,0,0,0],[0,0,0,0,0,0,0,0]],[[0,0,0,1,4,1,1,6],[0,0,0,1,4,3,3,1],[0,0,0,0,1,4,1,5],[0,0,0,0,0,1,5,9],[0,0,0,0,0,1,9,10],[0,0,0,0,0,1,10,6],[0,0,0,0,0,0,1,1],[0,0,0,0,0,0,0,0]],[[6,6,1,1,0,0,0,0],[6,11,6,6,1,0,0,0],[9,6,11,2,6,1,0,0],[4,9,6,11,1,1,1,1],[4,4,9,1,3,1,3,3],[1,1,1,9,1,3,3,1],[2,8,4,1,6,1,1,0],[2,8,3,1,6,6,1,0]],[[0,0,0,1,9,6,11,6],[0,0,1,9,6,1,1,6],[0,1,9,11,1,7,14,1],[0,1,1,6,1,13,7,1],[1,3,3,1,3,1,1,4],[0,1,4,3,1,9,4,4],[0,1,1,1,4,9,4,1],[0,1,6,10,1,9,4,4]],[[3,3,3,1,11,6,1,0],[3,3,3,1,11,6,1,0],[4,3,1,4,11,6,1,0],[1,1,4,1,6,11,6,1],[3,4,1,1,1,11,6,1],[9,3,9,1,1,6,6,1],[11,9,1,0,0,1,6,1],[9,1,0,0,0,1,6,1]],[[0,1,6,11,1,9,4,2],[0,1,6,11,4,1,15,4],[0,1,6,11,3,4,1,1],[1,6,11,6,4,3,9,4],[1,6,11,1,1,15,5,9],[1,6,6,1,0,1,15,5],[1,6,1,0,0,1,12,11],[1,6,1,0,1,15,15,9]],[[15,1,0,0,0,0,1,0],[1,0,0,0,0,0,0,0],[1,0,0,0,0,0,0,0],[1,0,0,0,0,0,0,0],[1,0,0,0,0,0,0,0],[1,0,0,0,0,0,0,0],[10,1,0,0,0,0,0,0],[1,0,0,0,0,0,0,0]],[[0,1,0,0,1,4,3,4],[0,0,0,1,1,4,3,3],[0,0,1,15,5,6,6,3],[0,0,0,1,15,5,6,10],[0,0,0,0,1,12,6,10],[0,0,0,0,1,11,6,10],[0,0,0,0,0,1,1,6],[0,0,0,0,0,0,0,1]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[1,1,1,0,0,0,0,0],[6,6,6,1,1,0,0,0],[6,1,1,6,6,1,0,0],[1,7,14,1,2,6,1,0],[1,13,7,1,11,6,1,0]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,1],[0,0,0,0,0,0,1,6],[1,0,1,1,0,1,9,9],[11,1,3,3,1,9,3,3],[10,11,1,4,4,1,9,9]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,1],[0,0,0,0,0,1,1,10],[0,0,0,0,1,4,3,1]],[[1,1,1,6,11,2,6,1],[3,3,9,6,11,11,6,1],[3,3,9,6,11,6,6,1],[3,9,9,6,6,6,9,1],[4,4,9,9,9,9,9,1],[1,9,9,9,9,1,9,1],[9,9,9,1,1,9,1,0],[1,1,1,0,0,1,0,0]],[[1,10,11,1,9,3,3,3],[1,10,10,9,3,3,3,1],[1,1,1,1,3,3,3,1],[1,4,3,1,13,1,3,3],[1,1,4,3,1,4,4,1],[0,0,1,1,0,1,1,9],[0,0,0,0,0,0,1,1],[0,0,0,0,0,0,0,0]],[[0,0,0,1,4,3,3,3],[0,0,0,1,1,1,1,3],[0,0,1,11,12,6,6,1],[0,0,1,15,10,10,10,10],[0,1,9,9,9,9,9,9],[0,1,1,1,1,1,1,1],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0]],[[1,0,0,0,0,0,0,0],[6,1,1,0,0,0,0,0],[2,11,11,1,0,0,0,0],[11,2,2,11,1,0,0,0],[12,11,2,11,1,0,0,0],[12,12,11,2,1,0,0,0],[1,1,12,11,11,1,0,0],[8,12,12,11,2,1,0,0]],[[0,0,0,1,1,1,1,1],[0,0,1,9,6,11,6,6],[0,1,9,6,1,1,6,6],[1,9,11,1,7,2,1,12],[1,9,6,1,12,11,1,12],[1,9,5,12,1,1,1,1],[1,15,3,2,11,12,12,1],[1,15,3,12,11,12,1,2]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[1,0,0,0,0,0,0,0],[11,1,0,0,0,0,0,0],[11,1,0,0,0,0,0,0],[11,1,0,0,0,0,0,0],[1,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0]],[[8,11,12,11,11,2,1,1],[11,11,12,1,11,1,11,1],[1,11,1,11,1,11,1,11],[1,1,11,2,1,1,1,2],[11,1,11,2,1,1,1,2],[11,1,11,12,2,1,2,12],[2,11,1,1,1,11,1,1],[11,1,1,11,11,2,11,1]],[[1,15,15,2,11,12,12,2],[0,1,15,12,11,12,2,11],[0,0,1,1,1,15,12,11],[0,0,0,1,12,2,1,1],[0,0,0,1,12,2,12,11],[0,0,0,0,1,12,11,2],[0,0,0,0,0,1,11,2],[0,0,0,1,1,11,2,2]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0]],[[1,1,11,2,2,11,1,0],[1,11,2,11,11,1,0,0],[2,1,11,1,1,0,0,0],[2,1,1,0,0,0,0,0],[2,1,0,0,0,0,0,0],[2,1,0,0,0,0,0,0],[11,2,1,0,0,0,0,0],[1,1,0,0,0,0,0,0]],[[0,1,1,6,11,2,11,11],[1,6,6,6,10,11,1,1],[0,1,1,1,1,1,12,2],[0,0,1,15,1,12,11,11],[0,1,15,5,1,12,12,11],[0,1,15,5,15,1,2,11],[0,1,12,1,15,1,11,1],[0,0,1,1,1,0,1,0]],[[1,0,0,0,0,0,0,0],[6,1,1,0,0,0,0,0],[11,6,6,1,0,0,0,0],[6,11,2,6,1,0,0,0],[9,6,11,6,1,0,0,0],[4,9,6,11,1,0,0,0],[1,1,9,6,6,1,0,0],[8,4,9,6,11,1,0,0]],[[0,0,0,1,1,1,1,1],[0,0,1,9,6,11,6,6],[0,1,9,6,1,1,6,6],[1,9,11,1,7,14,1,9],[1,9,6,1,13,7,1,4],[1,9,5,5,1,1,4,4],[1,15,3,3,9,4,4,1],[1,15,3,4,9,4,1,2]],[[8,3,9,6,6,11,1,1],[3,3,9,9,6,1,6,6],[3,3,9,15,9,6,1,1],[3,1,15,1,1,3,6,1],[1,1,1,1,3,3,1,0],[10,10,1,4,3,1,3,1],[11,10,1,4,4,1,3,1],[11,10,1,1,1,10,1,0]],[[1,15,15,3,9,4,4,2],[0,1,15,15,9,4,2,3],[0,0,1,1,1,15,4,3],[0,0,0,1,4,3,1,3],[0,0,0,1,3,3,3,1],[0,0,0,0,1,3,1,6],[0,0,0,0,0,1,1,6],[0,0,0,0,1,5,1,6]],[[11,10,1,6,11,10,1,0],[10,1,1,6,11,10,1,0],[10,1,0,1,6,10,1,0],[10,1,0,1,6,10,1,0],[1,1,0,0,1,6,1,0],[1,1,0,0,0,6,1,0],[6,10,1,0,0,1,0,0],[1,1,0,0,0,0,0,0]],[[0,0,0,1,5,4,1,6],[0,0,0,1,1,4,1,6],[0,0,0,1,15,1,1,6],[0,0,1,15,1,5,1,6],[0,1,15,5,1,15,1,10],[0,1,15,5,15,1,1,10],[0,1,12,1,15,1,11,1],[0,0,1,1,1,0,1,0]],[[8,3,9,6,6,11,1,1],[3,3,9,9,6,1,6,6],[1,3,9,15,9,1,1,1],[13,1,15,1,1,3,1,1],[1,1,1,1,1,4,3,1],[10,10,1,4,3,1,3,1],[11,10,1,4,4,1,4,1],[11,10,1,1,1,10,1,0]]]},{"palette":[{"r":0,"g":12,"b":0},{"r":0,"g":0,"b":0},{"r":31,"g":31,"b":31},{"r":25,"g":19,"b":13},{"r":21,"g":13,"b":7},{"r":0,"g":8,"b":23},{"r":12,"g":12,"b":12},{"r":31,"g":0,"b":0},{"r":8,"g":8,"b":8},{"r":31,"g":27,"b":0},{"r":21,"g":15,"b":0},{"r":20,"g":20,"b":31},{"r":21,"g":21,"b":21},{"r":14,"g":14,"b":23},{"r":10,"g":10,"b":31},{"r":15,"g":11,"b":0}],"tilesheet":[[[1,1,1,1,1,1,0,0],[2,2,2,12,12,12,1,0],[12,12,12,2,2,2,1,0],[4,4,4,12,12,12,2,1],[3,3,3,4,6,1,12,1],[1,1,3,3,1,0,1,0],[4,1,1,1,1,0,0,0],[4,2,8,4,1,0,0,0]],[[0,0,0,0,0,0,1,1],[0,0,0,0,1,1,6,12],[0,0,0,1,6,6,12,2],[0,0,1,6,6,12,2,12],[0,0,0,1,6,6,12,4],[0,0,0,1,6,6,6,3],[0,0,0,1,3,3,6,3],[0,0,0,1,3,3,6,3]],[[4,2,8,3,1,0,0,0],[11,13,13,13,1,0,0,0],[13,11,11,11,1,0,0,0],[1,13,11,1,6,1,0,0],[12,1,1,6,12,1,1,0],[1,2,2,12,1,4,4,1],[1,1,12,1,4,3,3,1],[7,1,1,14,4,3,3,1]],[[0,0,0,1,1,3,13,13],[0,0,1,14,11,1,14,13],[0,1,10,9,14,14,1,14],[1,10,1,1,9,10,1,6],[0,1,3,3,1,1,1,1],[1,4,3,1,10,1,3,3],[1,4,1,9,14,11,4,3],[0,1,1,10,14,14,4,3]],[[1,9,1,1,1,1,1,0],[2,1,1,0,0,0,0,0],[11,11,1,0,0,0,0,0],[15,1,0,0,0,0,0,0],[9,1,0,0,0,0,0,0],[15,1,0,0,0,0,0,0],[10,15,1,0,0,0,0,0],[1,1,0,0,0,0,0,0]],[[1,13,1,10,1,1,1,1],[1,11,13,1,14,14,10,1],[1,11,13,1,10,9,1,2],[1,11,13,13,1,1,11,2],[1,11,13,13,1,15,15,10],[1,11,13,13,1,15,15,10],[1,13,1,1,1,15,1,15],[1,1,0,0,0,1,0,1]],[[0,0,0,0,0,0,0,0],[1,1,1,1,1,1,0,0],[2,2,2,12,12,12,1,0],[12,12,12,2,2,2,1,0],[4,4,4,12,12,12,2,1],[3,3,3,4,6,1,12,1],[1,1,3,3,1,0,1,0],[4,1,1,1,1,0,0,0]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,1,1],[0,0,0,0,1,1,6,12],[0,0,0,1,6,6,12,2],[0,0,1,6,6,12,2,12],[0,0,0,1,6,6,12,4],[0,0,0,1,6,6,6,3],[0,0,0,1,3,3,6,3]],[[4,2,8,4,1,0,0,0],[4,2,8,3,1,0,0,0],[11,13,13,13,1,0,0,0],[1,11,11,11,1,0,0,0],[3,1,11,1,3,1,0,0],[3,1,1,4,3,3,1,0],[1,14,9,1,3,4,1,0],[14,14,9,1,4,1,0,0]],[[0,0,0,1,3,3,6,3],[0,0,0,1,1,3,13,13],[0,0,1,14,11,1,1,13],[0,1,10,9,14,14,1,1],[1,10,1,1,1,1,1,3],[0,1,1,4,4,1,3,3],[0,1,13,3,3,1,1,3],[0,1,14,3,3,1,15,1]],[[1,10,1,1,1,0,0,0],[11,1,2,11,1,0,0,0],[13,11,2,2,11,1,0,0],[1,13,11,11,15,1,0,0],[1,15,15,10,9,1,0,0],[1,15,15,10,15,1,0,0],[1,15,1,15,10,15,1,0],[0,1,0,1,1,1,0,0]],[[1,11,1,1,1,11,11,11],[1,11,13,1,11,2,2,11],[1,11,1,11,2,11,11,1],[1,11,1,11,11,15,1,0],[0,1,15,15,10,9,1,0],[0,1,15,15,10,15,1,0],[0,1,15,1,15,10,15,1],[0,0,1,0,1,1,1,0]],[[1,9,1,1,1,1,1,0],[11,1,11,1,0,0,0,0],[11,11,2,11,1,0,0,0],[1,11,11,15,15,1,1,0],[0,1,15,15,9,15,15,1],[0,0,1,15,15,10,1,0],[0,0,0,1,15,1,0,0],[0,0,0,0,1,0,0,0]],[[13,13,1,10,1,1,1,1],[11,13,13,1,14,10,1,2],[11,13,1,10,9,1,2,11],[11,13,1,1,1,11,11,1],[11,1,15,15,9,15,1,0],[13,1,1,10,15,1,0,0],[1,0,0,1,15,15,1,0],[0,0,0,0,1,1,0,0]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[1,1,1,1,0,0,0,0]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,1]],[[12,12,12,12,1,1,0,0],[2,2,2,2,12,12,1,0],[12,2,12,12,2,1,0,0],[6,12,6,12,1,0,0,0],[3,6,3,6,12,1,0,0],[3,3,1,1,6,1,0,0],[1,1,3,1,1,1,0,0],[3,1,1,1,3,3,1,0]],[[0,0,0,0,1,1,1,12],[0,0,1,1,6,12,12,2],[0,1,6,6,12,2,2,12],[0,0,1,6,12,12,6,6],[0,1,6,6,6,6,4,3],[0,0,1,3,6,1,4,3],[0,0,1,3,6,4,1,1],[0,1,11,14,1,1,2,8]],[[13,13,13,1,4,3,3,1],[11,11,1,11,1,4,3,1],[1,1,2,2,11,1,1,0],[1,11,2,11,15,1,0,0],[5,1,15,10,9,1,0,0],[1,1,15,10,15,1,0,0],[1,1,15,15,10,15,1,0],[0,0,1,1,1,1,0,0]],[[1,10,14,14,9,1,13,13],[0,1,10,9,1,1,1,11],[0,0,1,1,10,9,1,1],[0,0,1,10,14,14,1,15],[0,1,11,1,5,1,3,1],[0,1,11,2,1,4,3,3],[0,0,1,11,11,1,4,3],[0,0,0,1,1,1,1,1]],[[4,2,8,3,1,1,0,0],[11,13,13,13,1,3,1,0],[13,11,11,11,1,3,3,1],[1,13,11,1,4,3,4,1],[12,1,1,2,1,4,1,0],[1,2,2,12,1,1,0,0],[1,1,12,1,0,0,0,0],[7,15,1,0,0,0,0,0]],[[1,9,1,0,0,0,0,0],[11,1,11,1,0,0,0,0],[11,11,2,11,1,0,0,0],[1,11,11,15,15,1,1,0],[0,1,15,15,9,15,15,1],[0,0,1,15,15,10,1,0],[0,0,0,1,15,1,0,0],[0,0,0,0,1,0,0,0]],[[4,2,8,3,1,0,0,0],[11,13,13,13,1,0,0,0],[1,11,11,11,1,0,0,0],[1,13,11,1,0,0,0,0],[2,1,1,0,0,1,1,0],[12,1,9,1,1,4,4,1],[1,2,14,11,1,3,3,1],[1,9,5,14,1,3,3,1]],[[0,0,0,1,1,1,1,13],[0,0,1,11,1,14,11,1],[0,1,11,1,10,9,14,14],[0,1,11,10,1,1,9,10],[0,1,11,1,4,3,1,1],[1,11,13,1,4,3,3,1],[1,11,13,1,1,4,3,3],[1,11,13,1,1,1,4,4]],[[1,10,1,1,1,1,1,0],[11,1,11,1,0,0,0,0],[11,11,2,11,1,0,0,0],[1,11,11,15,15,1,1,0],[0,1,15,15,9,15,15,1],[0,0,1,15,15,10,1,0],[0,0,0,1,15,1,0,0],[0,0,0,0,1,0,0,0]],[[11,11,13,1,1,1,1,1],[1,11,1,1,14,10,1,11],[0,1,1,10,9,1,11,2],[0,0,1,1,1,11,2,1],[0,1,15,15,9,15,1,0],[0,0,1,10,15,1,0,0],[0,0,0,1,15,15,1,0],[0,0,0,0,1,1,0,0]],[[0,0,0,0,0,0,1,1],[0,0,0,0,1,1,6,12],[0,0,0,1,6,6,12,2],[0,0,1,6,6,12,2,12],[0,1,1,1,6,6,12,4],[1,4,3,3,1,6,6,3],[1,4,3,3,1,3,6,3],[1,1,1,1,3,3,6,3]],[[1,14,11,1,1,3,13,13],[1,5,14,9,1,1,14,13],[1,10,9,1,4,1,1,14],[0,1,1,3,3,4,1,6],[0,1,4,3,3,3,1,12],[1,11,1,4,3,1,4,1],[11,11,13,1,1,1,1,1],[11,13,1,0,1,15,7,7]],[[1,9,1,1,1,1,1,0],[11,1,11,1,0,0,0,0],[11,11,2,11,1,0,0,0],[1,11,11,15,15,1,1,0],[0,1,15,15,9,15,15,1],[0,0,1,15,15,10,1,0],[0,0,0,1,15,1,0,0],[0,0,0,0,1,0,0,0]],[[1,13,1,0,1,1,10,1],[0,1,0,1,14,10,1,11],[0,0,1,10,9,1,11,2],[0,0,1,1,1,11,2,1],[0,1,15,15,9,15,1,0],[0,0,1,10,15,1,0,0],[0,0,0,1,15,15,1,0],[0,0,0,0,1,1,0,0]],[[0,0,0,0,0,0,0,0],[0,1,0,0,0,0,0,0],[1,12,1,0,0,0,0,0],[1,12,12,1,1,0,0,0],[12,2,12,12,12,1,0,0],[12,2,2,12,12,12,1,0],[6,12,2,2,2,12,12,1],[3,6,12,12,12,2,12,1]],[[0,0,0,0,0,0,0,0],[0,1,1,0,0,0,0,0],[1,3,3,1,0,0,0,1],[1,4,3,3,1,0,1,12],[0,1,4,14,14,1,1,12],[0,1,5,14,9,10,1,6],[0,0,1,10,1,1,6,6],[0,0,0,1,4,1,6,1]],[[3,3,6,6,6,12,12,1],[1,3,6,3,3,6,12,1],[1,3,1,1,1,6,1,0],[3,3,3,3,3,1,0,0],[13,1,1,3,1,12,1,0],[11,11,1,1,2,12,1,0],[1,1,6,2,12,1,9,1],[6,6,1,1,1,14,9,1]],[[0,0,0,0,1,1,1,1],[0,0,0,0,1,6,1,3],[0,0,0,0,1,12,1,3],[0,0,0,0,0,1,13,1],[0,0,0,0,0,1,13,11],[0,0,0,0,1,6,1,13],[0,0,0,1,11,1,12,1],[0,0,1,11,2,11,1,12]],[[1,1,4,3,5,14,10,1],[11,1,4,3,5,14,1,0],[11,1,4,4,1,1,0,0],[15,11,1,1,0,0,0,0],[15,10,15,1,0,0,0,0],[10,9,1,0,0,0,0,0],[15,10,15,1,0,0,0,0],[1,1,1,0,0,0,0,0]],[[0,0,1,11,2,2,11,1],[0,0,0,1,11,11,1,2],[0,0,0,0,1,1,1,11],[0,0,0,0,0,0,0,1],[0,0,0,0,0,0,1,15],[0,0,0,0,0,0,1,15],[0,0,0,0,0,0,0,1],[0,0,0,0,0,0,0,0]],[[1,1,1,1,1,0,0,0],[2,2,12,12,12,1,0,0],[12,12,2,2,2,1,0,0],[4,4,12,12,12,2,1,0],[3,3,4,6,1,12,1,0],[1,3,3,1,1,1,3,1],[1,1,1,1,1,1,3,1],[2,8,4,1,4,4,3,1]],[[0,0,0,0,0,1,1,1],[0,0,0,1,1,6,12,2],[0,0,1,6,6,12,2,12],[0,1,6,6,12,2,12,4],[0,0,1,6,6,12,4,3],[0,0,1,6,6,6,3,1],[0,0,1,3,3,6,3,4],[0,0,1,3,3,6,3,4]],[[2,8,3,1,4,4,3,1],[13,13,13,1,1,14,14,1],[11,11,11,1,9,14,13,1],[13,11,1,1,1,2,9,1],[1,1,3,3,1,4,1,0],[14,11,1,3,3,1,0,0],[14,14,1,3,3,1,0,0],[10,1,1,1,1,0,0,0]],[[0,0,0,1,1,1,13,4],[0,0,0,1,14,11,1,11],[0,0,1,10,9,14,14,1],[0,1,10,1,1,9,10,1],[0,0,1,4,3,1,1,9],[0,0,1,4,3,3,1,2],[0,1,11,1,4,4,1,9],[1,11,11,13,1,1,1,1]],[[1,10,1,1,0,0,0,0],[11,1,2,11,1,0,0,0],[13,11,2,2,11,1,0,0],[1,13,11,11,15,1,0,0],[1,15,15,10,9,1,0,0],[1,15,15,10,15,1,0,0],[1,15,1,15,10,15,1,0],[0,1,0,1,1,1,0,0]],[[1,11,13,1,1,11,11,11],[1,11,13,1,11,2,2,11],[1,11,1,11,2,11,11,1],[1,13,1,11,11,15,1,0],[0,1,15,15,10,9,1,0],[0,1,15,15,10,15,1,0],[0,1,15,1,15,10,15,1],[0,0,1,0,1,1,1,0]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,1,0]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[1,0,0,0,0,0,0,0],[13,1,0,0,0,0,0,0],[11,13,1,0,0,0,0,0],[11,13,1,1,0,0,0,0],[13,1,1,2,1,1,1,0]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,1,1],[0,0,0,0,0,1,13,13],[0,0,1,0,1,13,13,11],[0,1,12,1,3,3,3,13],[1,12,1,3,1,3,3,4]],[[1,1,1,1,1,1,10,1],[2,2,6,10,9,10,10,1],[2,2,2,6,10,10,10,1],[1,11,11,6,15,10,1,0],[3,1,11,1,15,15,15,1],[3,1,1,0,1,1,1,0],[4,1,0,0,0,0,0,0],[1,0,0,0,0,0,0,0]],[[13,1,12,2,12,1,15,1],[1,6,6,12,1,1,7,1],[1,14,1,1,4,1,7,1],[9,1,4,3,1,1,15,1],[1,4,3,1,9,1,1,3],[1,4,1,9,14,5,4,3],[10,1,1,10,14,5,4,4],[1,0,1,1,1,1,1,1]],[[1,12,1,4,1,1,3,4],[1,2,12,12,1,4,4,6],[1,12,2,12,12,4,6,6],[0,1,12,2,12,6,6,1],[0,0,1,12,6,6,1,9],[0,0,0,1,6,6,1,10],[0,0,0,0,1,1,1,1],[0,0,0,0,0,0,0,0]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[1,1,0,0,0,0,0,0],[12,12,1,0,0,0,0,0],[2,2,1,0,0,0,0,0],[12,12,2,1,0,0,0,0],[6,1,12,1,0,0,0,0]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,1,1,1,1,1,1,1],[1,1,6,12,2,2,2,12],[6,6,12,2,12,12,12,2],[6,12,2,12,4,4,4,12],[6,6,12,4,3,3,3,4]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,1,0,0,0,0,1,1],[1,11,1,0,0,1,6,6],[1,13,11,1,0,0,1,6]],[[1,0,1,0,0,0,0,0],[1,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[1,1,0,1,1,1,1,0],[14,11,1,3,3,3,3,1],[14,14,1,3,3,1,1,0],[1,1,0,1,1,0,0,0]],[[6,6,6,3,1,1,3,3],[3,3,6,3,4,1,1,1],[3,3,6,3,2,8,4,1],[1,3,13,13,2,8,3,1],[14,1,14,13,13,13,13,1],[10,1,1,14,11,11,11,1],[1,6,12,1,13,11,1,9],[6,1,6,2,1,1,1,10]],[[13,13,13,11,1,0,0,1],[1,1,13,13,11,1,1,6],[0,0,1,1,13,11,1,1],[0,0,0,0,1,1,14,11],[0,0,0,1,1,10,9,14],[0,0,1,14,14,1,1,9],[0,0,1,1,13,14,1,1],[0,1,4,4,1,14,1,6]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0]],[[15,15,1,6,12,2,1,1],[2,2,11,1,1,1,0,0],[11,2,2,11,1,0,0,0],[13,11,11,11,15,1,0,0],[13,15,15,10,9,1,0,0],[1,15,15,10,15,1,0,0],[1,15,1,15,10,15,1,0],[0,1,0,1,1,1,0,0]],[[0,1,3,3,4,1,1,15],[0,1,3,3,4,1,1,11],[0,0,1,1,1,1,1,1],[0,0,0,1,15,1,11,11],[0,0,1,15,10,15,11,2],[0,1,15,15,15,10,11,11],[1,15,15,15,9,15,15,1],[0,1,1,1,1,1,1,0]],[[0,0,0,0,0,0,0,0],[1,1,1,1,1,1,0,0],[2,2,2,12,12,12,1,0],[12,12,12,2,2,2,1,0],[4,4,4,12,12,12,2,1],[3,3,3,4,6,1,12,1],[1,1,3,3,1,0,1,0],[4,1,1,1,1,0,0,0]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,1,1],[0,0,0,0,1,1,6,12],[0,0,0,1,6,6,12,2],[0,0,1,6,6,12,2,12],[0,0,0,1,6,6,12,4],[0,0,0,1,6,6,6,3],[0,0,0,1,3,3,6,3]],[[4,2,8,4,1,0,0,0],[4,2,8,3,1,1,0,0],[11,13,13,13,1,3,1,0],[13,11,11,13,1,3,1,0],[1,13,13,1,4,3,3,1],[12,1,1,1,4,4,3,1],[6,12,1,14,1,1,1,0],[15,15,1,14,13,14,1,0]],[[0,0,0,1,3,3,6,11],[0,0,1,1,1,3,13,13],[0,1,4,3,3,1,1,13],[0,1,4,3,3,1,14,1],[0,1,1,4,4,1,6,14],[0,1,10,1,1,1,1,6],[0,0,1,9,10,1,4,1],[0,1,11,1,1,15,15,15]],[[1,9,1,1,14,1,0,0],[11,1,2,11,1,0,0,0],[13,11,2,2,11,1,0,0],[1,13,11,11,15,1,0,0],[1,15,15,10,9,1,0,0],[1,15,15,10,15,1,0,0],[1,15,1,15,10,15,1,0],[0,1,0,1,1,1,0,0]],[[0,1,11,13,1,11,11,11],[0,1,11,1,11,2,2,11],[1,11,1,11,2,11,11,1],[1,11,1,11,11,15,1,0],[0,1,15,15,10,9,1,0],[0,1,15,15,10,15,1,0],[0,1,15,1,15,10,15,1],[0,0,1,0,1,1,1,0]],[[4,2,8,4,1,0,0,0],[4,2,8,3,1,0,0,0],[11,13,13,13,1,0,1,0],[13,11,11,13,1,1,3,1],[1,13,13,1,4,3,4,1],[12,1,1,1,4,4,1,0],[6,12,1,14,1,1,1,0],[15,15,1,14,13,14,1,0]]]},{"palette":[{"r":0,"g":12,"b":0},{"r":0,"g":0,"b":0},{"r":31,"g":31,"b":31},{"r":31,"g":23,"b":13},{"r":25,"g":17,"b":7},{"r":15,"g":8,"b":27},{"r":14,"g":20,"b":31},{"r":31,"g":0,"b":20},{"r":0,"g":23,"b":0},{"r":21,"g":14,"b":31},{"r":6,"g":12,"b":23},{"r":19,"g":25,"b":30},{"r":10,"g":16,"b":27},{"r":27,"g":31,"b":31},{"r":9,"g":2,"b":21},{"r":3,"g":0,"b":15}],"tilesheet":[[[0,0,0,0,0,0,0,0],[1,0,0,0,0,0,0,0],[13,1,1,0,0,0,0,0],[4,3,3,1,0,0,0,0],[4,4,3,3,1,0,0,0],[13,2,4,4,1,0,0,0],[10,11,2,13,1,0,0,0],[4,2,8,3,1,0,0,0]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,1,1,1],[0,0,0,0,1,11,13,13],[0,0,0,1,11,13,2,13],[0,0,1,11,13,2,13,4],[0,0,1,11,13,13,10,11],[0,0,1,11,13,2,13,10],[0,1,11,13,13,2,13,4]],[[4,2,8,3,1,0,0,0],[4,4,4,11,13,1,0,0],[13,4,11,2,10,1,0,0],[13,10,13,10,11,1,0,0],[13,10,13,12,11,1,1,0],[11,10,11,12,11,3,3,1],[14,11,10,13,11,4,3,1],[14,11,13,13,11,4,3,1]],[[0,1,11,13,13,2,13,4],[0,1,11,13,13,13,2,13],[0,1,11,11,13,13,13,2],[0,1,6,11,13,11,11,13],[1,6,11,11,11,14,15,11],[1,6,11,6,14,5,14,15],[1,6,11,14,5,14,3,3],[1,6,11,14,5,14,4,3]],[[14,11,13,2,13,11,1,0],[6,11,11,13,2,13,1,0],[15,11,12,11,12,11,13,1],[15,6,15,6,13,12,11,1],[5,15,5,15,6,13,1,0],[9,5,14,5,15,6,1,0],[14,14,1,14,14,1,0,0],[1,1,0,1,1,0,0,0]],[[1,6,6,14,5,14,4,3],[1,6,6,14,5,9,14,14],[1,6,6,14,5,9,5,15],[1,6,14,5,9,5,15,5],[1,6,14,5,5,15,5,9],[1,14,5,5,15,5,5,9],[1,1,14,14,1,14,14,14],[0,1,1,1,0,1,1,1]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[1,1,0,0,0,0,0,0],[3,3,1,0,0,0,0,0],[4,3,3,1,0,0,0,0],[2,4,4,1,0,0,0,0],[11,2,13,1,0,0,0,0]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,1,1,1,1],[0,0,0,1,11,13,13,13],[0,0,1,11,13,2,13,4],[0,1,11,13,2,13,4,4],[0,1,11,13,13,10,11,13],[0,1,11,13,2,13,10,10]],[[2,8,3,1,0,0,0,0],[2,8,3,1,0,1,1,0],[4,4,11,13,1,3,3,1],[4,11,2,10,14,3,3,1],[10,13,10,11,14,3,4,1],[10,13,12,11,14,4,1,0],[14,11,12,11,14,5,1,0],[3,14,13,11,14,5,1,0]],[[1,11,13,13,2,13,4,4],[1,11,13,13,2,13,4,4],[1,11,13,13,13,2,13,4],[1,11,11,13,13,13,2,13],[1,12,11,13,11,11,13,13],[12,11,11,11,14,14,15,13],[12,11,6,14,5,5,15,14],[11,11,14,5,9,5,14,3]],[[3,14,13,11,14,1,0,0],[3,14,2,13,11,1,0,0],[14,11,13,2,13,1,1,0],[14,12,11,12,11,13,11,1],[5,15,6,13,12,12,1,0],[9,5,15,6,13,11,12,1],[9,9,5,15,12,1,1,0],[15,15,15,15,1,0,0,0]],[[11,11,14,5,9,5,14,4],[11,6,14,5,9,5,14,4],[11,6,14,5,9,9,5,14],[11,6,14,5,9,9,5,5],[11,14,5,9,9,5,5,15],[11,14,5,9,5,15,15,5],[15,5,5,5,15,5,5,9],[0,15,15,15,15,15,15,15]],[[14,11,11,2,13,11,1,0],[6,11,6,13,6,13,11,1],[15,6,15,11,13,12,13,1],[5,15,5,15,6,13,1,1],[5,5,9,5,15,6,1,0],[14,5,5,5,5,14,1,0],[1,14,14,14,14,1,0,0],[0,1,1,1,1,0,0,0]],[[1,6,6,14,5,14,4,3],[1,12,14,5,9,5,14,15],[1,6,14,5,9,5,14,5],[1,14,5,9,5,14,5,9],[15,5,5,5,14,5,5,5],[1,14,5,14,5,5,14,14],[0,1,14,1,14,14,1,1],[0,0,1,0,1,1,0,0]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[1,0,0,0,0,0,0,0],[2,1,1,0,0,0,0,0],[13,2,13,1,0,0,0,0]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,1,1],[0,0,0,0,1,1,2,2],[0,0,0,1,11,13,13,13]],[[3,3,2,13,1,0,0,0],[2,3,3,13,1,0,0,0],[3,2,3,1,1,0,0,0],[3,3,4,2,13,1,0,0],[4,4,2,13,1,1,0,0],[4,13,4,4,14,5,1,0],[4,1,1,11,14,9,5,1],[11,4,4,11,13,5,9,1]],[[0,0,1,11,13,4,3,3],[0,1,1,12,4,3,3,3],[1,13,13,2,4,3,3,3],[0,1,1,13,2,4,3,3],[0,1,5,14,10,2,4,4],[1,5,5,14,4,10,2,13],[1,5,14,11,4,1,1,4],[1,5,14,13,11,4,12,13]],[[13,11,12,13,2,5,9,1],[10,13,12,2,13,5,9,1],[10,13,12,13,11,5,5,1],[10,13,12,11,5,5,1,0],[13,10,11,11,5,5,1,0],[11,11,4,3,3,1,9,1],[1,4,3,3,3,15,5,1],[1,1,1,1,1,1,1,0]],[[0,1,11,2,13,10,13,10],[0,1,2,13,10,13,12,11],[1,11,13,13,10,13,12,11],[1,13,12,11,10,13,12,13],[1,13,12,11,11,10,13,2],[1,11,13,12,11,11,13,13],[0,1,11,1,1,11,11,11],[0,0,1,0,0,1,1,1]],[[4,2,8,3,14,1,0,0],[4,4,4,11,13,14,1,0],[13,4,11,2,10,5,1,0],[13,10,13,10,11,5,1,0],[13,10,13,12,11,5,1,0],[11,10,11,12,11,5,5,1],[14,11,10,13,11,5,5,1],[14,11,13,13,11,14,5,1]],[[14,11,11,2,13,11,14,1],[6,11,6,13,6,13,11,1],[15,6,15,11,13,12,13,1],[5,15,5,15,6,13,1,1],[5,5,9,5,15,6,1,0],[14,5,5,5,5,14,1,0],[1,14,14,14,14,1,0,0],[0,1,1,1,1,0,0,0]],[[4,2,8,3,1,0,0,0],[4,4,4,11,13,1,0,0],[13,4,11,2,10,1,0,0],[13,10,13,10,11,1,0,0],[13,10,13,12,1,1,1,0],[5,5,5,1,4,3,3,1],[9,9,5,1,4,3,3,1],[9,9,9,5,1,4,4,1]],[[0,1,11,13,13,2,13,4],[0,1,11,13,13,13,2,13],[0,1,11,11,13,13,13,2],[0,1,6,11,13,11,11,13],[1,6,11,11,11,14,5,5],[1,6,11,6,14,5,9,9],[1,6,11,14,5,5,9,9],[1,6,11,14,14,5,5,9]],[[5,9,5,5,13,1,1,0],[5,5,5,13,6,13,11,1],[5,5,14,11,13,12,13,1],[5,14,15,15,6,13,1,1],[14,15,9,5,15,6,1,0],[14,5,5,5,5,14,1,0],[1,14,14,14,14,1,0,0],[0,1,1,1,1,0,0,0]],[[1,6,6,14,15,14,5,5],[1,12,14,5,5,15,14,5],[1,6,14,5,5,5,15,14],[1,14,5,9,5,5,15,14],[15,5,9,5,5,15,14,5],[1,14,5,14,5,15,14,14],[0,1,14,1,14,14,1,1],[0,0,1,0,1,1,0,0]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,1,1,1],[0,0,0,0,1,11,13,13],[0,0,0,1,11,13,2,13],[0,0,1,11,13,2,13,4],[0,1,1,1,13,13,10,11],[1,3,3,4,1,2,13,10],[1,3,3,4,1,2,13,4]],[[1,4,4,1,13,2,13,4],[0,1,1,1,13,13,2,13],[0,1,5,5,15,13,13,2],[1,14,5,9,5,15,11,13],[1,14,5,9,9,5,15,11],[1,14,14,5,9,9,5,15],[1,1,14,5,5,5,5,5],[1,1,14,14,5,5,14,5]],[[14,11,11,2,13,11,1,0],[6,11,6,13,6,13,11,1],[15,6,15,11,13,12,13,1],[5,15,5,15,6,13,1,1],[5,5,9,5,15,6,1,0],[14,5,5,5,5,14,1,0],[1,14,14,14,14,1,0,0],[0,1,1,1,1,0,0,0]],[[1,6,1,14,14,14,1,14],[1,12,15,1,1,1,14,15],[1,6,14,14,14,14,5,5],[1,14,5,9,5,5,9,9],[1,14,5,5,9,9,5,5],[0,1,14,14,5,5,14,14],[0,0,1,14,14,14,1,1],[0,0,0,1,1,1,0,0]],[[0,0,0,0,0,0,0,0],[1,0,0,0,0,0,0,0],[3,1,1,1,0,0,0,0],[3,4,13,13,1,0,0,0],[3,4,13,1,0,0,0,0],[4,2,13,1,1,1,0,0],[2,13,4,1,3,3,1,0],[2,1,4,1,4,3,3,1]],[[0,0,0,0,1,1,1,0],[0,0,1,1,4,3,3,1],[0,1,11,4,3,3,2,3],[1,11,4,4,3,3,3,2],[1,12,4,4,3,3,3,3],[1,13,13,2,4,3,3,3],[12,12,4,13,2,4,4,4],[10,11,11,4,13,13,13,4]],[[1,4,11,1,1,4,3,1],[2,12,11,13,15,1,1,0],[10,2,12,11,13,13,11,1],[12,10,2,12,13,12,1,0],[12,10,13,12,13,13,13,1],[12,11,12,13,2,13,12,13],[13,13,11,13,13,2,13,1],[13,2,13,13,11,13,13,1]],[[10,11,13,4,2,8,8,4],[10,11,13,11,4,4,4,13],[10,14,11,2,11,10,2,12],[10,14,6,13,2,10,2,12],[10,15,15,11,13,10,13,2],[15,3,3,15,13,11,10,13],[15,4,3,15,11,13,11,12],[15,4,4,15,11,13,13,11]],[[2,2,13,13,2,12,13,2],[2,13,11,13,13,2,12,13],[13,2,12,11,11,13,12,12],[11,13,2,12,12,11,13,1],[15,11,13,2,13,1,11,1],[5,15,15,15,1,0,1,0],[9,5,5,5,1,0,0,0],[1,1,1,1,0,0,0,0]],[[15,15,15,5,15,11,13,13],[15,5,5,5,15,11,11,13],[1,5,9,5,15,11,12,11],[0,1,5,9,5,15,11,12],[0,1,5,9,5,15,15,5],[0,0,1,5,5,15,5,9],[0,0,0,1,5,5,1,5],[0,0,0,0,1,1,0,1]],[[1,0,0,0,0,0,1,0],[13,1,1,0,0,1,4,1],[4,3,3,1,1,4,3,1],[4,4,3,3,1,3,4,1],[13,2,4,4,1,4,1,0],[10,11,2,13,1,1,0,0],[4,2,8,3,1,0,0,0],[4,2,8,3,1,0,0,0]],[[0,0,0,0,0,1,1,1],[0,0,0,0,1,11,13,13],[0,0,0,1,11,13,2,13],[0,0,1,11,13,2,13,4],[0,0,1,11,13,13,10,11],[0,0,1,11,13,2,13,10],[0,1,11,13,13,2,13,4],[0,1,11,13,13,2,13,4]],[[4,4,4,11,13,1,0,0],[13,4,11,2,1,0,0,0],[13,10,13,1,0,0,0,0],[13,10,13,10,1,0,0,0],[15,10,11,12,12,1,0,0],[5,15,15,10,11,1,0,0],[9,5,5,15,1,1,0,0],[9,9,5,15,4,3,0,0]],[[0,1,11,13,13,13,2,13],[0,1,11,11,13,13,13,2],[0,1,6,11,13,11,11,13],[1,6,6,11,11,11,14,14],[1,6,11,11,6,14,15,5],[1,6,11,6,14,15,5,9],[1,6,11,6,14,15,5,9],[1,6,6,14,5,15,14,5]],[[9,9,9,5,4,3,1,0],[9,9,9,5,1,4,3,1],[5,9,5,1,11,1,1,0],[14,5,5,1,12,13,1,0],[14,14,1,11,15,12,11,1],[15,14,15,15,5,1,12,1],[14,15,5,5,1,0,1,0],[1,1,1,1,0,0,0,0]],[[1,6,6,14,5,15,14,5],[1,6,6,14,5,15,14,5],[1,6,14,5,9,5,15,14],[1,6,14,5,9,5,15,14],[1,14,5,9,5,9,5,15],[1,14,14,5,5,5,5,5],[0,1,1,14,14,14,14,14],[0,0,0,1,1,1,1,1]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[1,1,1,0,0,0,0,0],[1,13,13,1,0,0,0,0],[2,13,1,0,0,0,0,0],[13,10,11,1,0,0,0,0],[1,10,13,11,1,0,0,0]],[[0,0,0,0,0,0,0,0],[0,0,1,1,1,1,0,0],[1,1,3,3,3,3,1,1],[3,3,3,3,2,2,3,3],[13,13,3,3,3,3,2,3],[4,13,2,2,3,3,3,3],[4,4,4,13,2,13,4,2],[10,4,1,1,1,4,4,1]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,1],[0,0,0,0,0,0,1,13],[0,0,0,0,0,1,11,15],[0,0,0,1,1,6,11,13],[0,0,1,6,6,11,13,11]],[[11,13,10,10,11,1,0,0],[12,6,13,2,1,1,0,0],[2,13,12,13,13,2,1,0],[12,12,13,1,1,13,13,1],[11,11,13,2,1,1,1,0],[1,1,11,13,13,1,0,0],[13,1,1,1,11,1,0,0],[1,0,0,0,1,0,0,0]],[[11,13,4,4,4,13,2,6],[13,11,12,12,2,12,6,2],[11,12,13,2,12,13,11,12],[13,11,12,12,11,13,13,11],[2,13,11,11,11,13,2,13],[13,2,1,1,6,11,13,2],[1,13,13,1,1,1,11,13],[0,1,1,0,0,0,1,1]],[[0,1,6,6,11,10,10,10],[0,1,10,10,10,12,13,11],[0,1,12,6,12,13,11,13],[1,12,6,12,13,13,11,13],[0,1,6,12,13,13,11,13],[0,0,1,1,11,13,13,11],[0,0,0,0,1,1,1,1],[0,0,0,0,0,0,0,0]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,9,7,9,0,0,0],[0,9,7,2,7,9,0,0],[0,7,2,2,2,7,0,0],[0,9,7,2,7,9,0,0],[0,0,9,7,9,0,0,0]],[[0,0,0,0,0,0,0,0],[5,0,0,0,0,0,0,0],[7,5,5,0,0,0,0,0],[13,7,7,5,0,0,0,0],[4,3,3,7,5,0,0,0],[4,4,3,3,7,5,0,0],[13,2,4,4,7,5,0,0],[10,11,2,13,7,5,0,0]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,5,5,5],[0,0,0,0,5,7,7,7],[0,0,0,5,7,11,13,13],[0,0,5,7,11,13,2,13],[0,5,7,11,13,2,13,4],[0,5,7,11,13,13,10,11],[0,5,7,11,13,2,13,10]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[5,0,0,0,0,0,0,0],[7,5,0,0,0,0,0,0],[7,5,0,0,0,0,0,0],[7,5,0,0,0,0,0,0],[5,0,0,0,0,0,0,0]],[[4,4,4,3,7,5,0,0],[4,1,1,3,7,5,0,0],[4,4,4,11,13,7,5,5],[13,4,11,2,10,7,7,7],[13,10,13,10,11,7,3,3],[14,10,13,14,1,3,3,3],[5,14,14,5,14,3,3,3],[9,5,5,9,5,14,3,7]],[[5,7,11,13,13,2,13,4],[5,7,11,13,13,2,13,4],[5,7,11,13,13,13,2,13],[5,7,11,13,13,13,13,2],[5,7,11,13,13,13,11,13],[7,6,11,13,13,11,6,14],[7,6,11,13,11,6,14,5],[7,6,11,11,6,14,5,9]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0]],[[9,9,9,9,5,14,7,5],[9,9,9,5,14,7,5,0],[5,9,5,5,14,11,7,5],[5,5,5,14,10,13,7,5],[5,5,5,14,13,10,13,7],[15,5,14,14,13,11,7,5],[5,15,5,5,14,13,11,7],[15,15,1,1,1,1,1,5]],[[7,6,11,11,6,14,5,9],[7,6,11,6,14,5,15,5],[7,6,11,6,14,5,15,5],[12,11,6,14,5,9,5,15],[12,11,6,14,5,9,5,15],[11,6,14,5,9,9,9,5],[1,15,5,5,5,5,5,5],[0,1,15,15,15,15,15,15]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[1,0,0,0,0,1,1,0],[13,1,1,0,1,3,3,1],[4,3,3,1,3,3,4,1],[2,4,3,3,1,4,1,0],[6,2,4,4,14,1,0,0],[4,6,2,13,14,5,1,0]],[[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,1,1,0,0,1,1,1],[1,3,3,1,1,11,13,13],[1,4,3,4,3,1,13,6],[0,1,4,4,1,13,6,2],[0,1,15,1,14,13,13,6],[1,9,1,5,14,13,2,4]],[[4,2,8,3,14,5,1,0],[4,2,8,3,14,5,5,1],[4,4,4,11,13,14,5,1],[13,4,11,2,10,14,5,1],[13,10,13,10,11,14,5,1],[13,10,13,12,11,14,5,1],[11,10,11,12,11,14,14,1],[13,11,10,11,13,11,1,0]],[[1,1,5,5,14,13,2,4],[1,5,9,5,14,11,2,4],[1,5,9,5,14,11,13,2],[1,5,9,5,5,14,11,13],[1,5,9,9,5,14,11,13],[1,5,5,9,5,14,11,11],[0,1,5,9,5,15,11,11],[0,1,5,9,5,15,11,11]],[[11,13,11,13,2,11,1,0],[11,2,13,2,11,2,11,1],[11,2,11,2,13,12,13,1],[6,2,12,11,2,11,12,1],[6,2,12,12,11,13,1,0],[14,6,2,12,12,11,13,1],[14,14,6,11,6,1,1,0],[1,1,1,1,1,0,0,0]],[[0,0,1,5,15,14,14,6],[0,0,1,15,5,5,14,6],[0,1,14,5,9,5,14,6],[0,1,5,9,9,9,5,14],[1,14,5,5,5,9,5,14],[1,5,14,14,14,5,5,5],[1,14,1,1,1,14,14,14],[0,1,0,0,0,1,1,1]],[[4,2,7,3,14,5,1,0],[4,2,7,3,14,5,5,1],[4,4,4,11,13,14,5,1],[13,4,11,2,1,14,5,1],[13,10,13,10,1,14,5,1],[13,10,13,12,6,14,5,1],[11,10,11,12,11,14,14,1],[13,11,10,11,13,11,1,0]]]},{"palette":[{"r":0,"g":12,"b":0},{"r":0,"g":0,"b":0},{"r":31,"g":31,"b":31},{"r":0,"g":27,"b":0},{"r":31,"g":17,"b":10},{"r":25,"g":15,"b":0},{"r":27,"g":0,"b":0},{"r":21,"g":0,"b":0},{"r":31,"g":27,"b":0},{"r":28,"g":21,"b":0},{"r":21,"g":13,"b":0},{"r":0,"g":26,"b":31},{"r":0,"g":18,"b":31},{"r":0,"g":12,"b":27},{"r":0,"g":8,"b":23},{"r":0,"g":0,"b":14}]},{"palette":[{"r":0,"g":12,"b":0},{"r":0,"g":0,"b":0},{"r":31,"g":31,"b":31},{"r":31,"g":21,"b":13},{"r":25,"g":15,"b":7},{"r":16,"g":0,"b":6},{"r":31,"g":12,"b":20},{"r":23,"g":0,"b":12},{"r":0,"g":8,"b":23},{"r":31,"g":31,"b":22},{"r":31,"g":31,"b":0},{"r":25,"g":25,"b":0},{"r":19,"g":19,"b":0},{"r":21,"g":11,"b":3},{"r":15,"g":8,"b":27},{"r":9,"g":2,"b":21}]}]
			`);
			//}}}
		initialize(vanillaCharData);
	}
	//}}}

});


