import ColorScheme from 'color-scheme';
import KolorWheel from 'kolorwheel';

class Color {
    constructor() {
	}

    /*
	Function: getColorScheme
	 */
	getColorScheme(numColors, alpha = false, keyColors = null) {
		var iterations = Math.ceil(numColors / 16);
		var scheme = new ColorScheme;

		if(keyColors == null) {
			keyColors = JSON.parse(JSON.stringify(Config.keyColors));
		}
		
		var colors = [];
		for(var i = 0; i < iterations && keyColors.length > 0; i++) {
			scheme.from_hex(keyColors.shift())
				.scheme("tetrade")
				.variation("default")
				.distance(1.0);
			colors = colors.concat(scheme.colors());
		}
		
		if(alpha !== false) {
			for(var key in colors) {
				var c = colors[key].substring(1).split('');
				c = '0x'+c.join('');
				colors[key] = 'rgba('+[(c>>16)&255, (c>>8)&255, c&255].join(',')+','+alpha+')';
			}
		}
		else {
			for(var key in colors) {
				colors[key] = "#"+colors[key];
			}
		}
		
		while(colors.length > numColors) {
			colors.pop();
		}
		
		return colors;
	}

	hexToRgba(hexColor, alpha = 1.0) {
		var c = hexColor.substring(1).split('');
		c = '0x'+c.join('');
		return 'rgba('+[(c>>16)&255, (c>>8)&255, c&255].join(',')+','+alpha+')';
	}
	
	getMonoColorScheme(numColors, baseColor = "#5B83AD", targetColor = "#223140") {
		
		var kw = new KolorWheel(baseColor);
		var target = kw.abs(targetColor, numColors);
		
		var colors = [];
		for(var i = 0; i < numColors; i++) {
			var hex = target.get(i).getHex();
			colors.push(hex);
		}
		return colors;
	}
	
	getVariedColorScheme(numColors, hue = null, saturation = 100, lightness = 50) {
		var colors = [];
		var hueInc = 360 / numColors;
		if(hue == null) {
			hue = hueInc;
		}
		
		for (var n = 0; n < numColors; n++) {
			var color = new KolorWheel([hue, saturation, lightness]);
			colors.push(color.getHex());
			hue += hueInc;
		}
		return colors;
	}
}

export { Color as default }