import colors from "../stylesheets/colors.scss";
import ColorScheme from 'color-scheme';
import KolorWheel from 'kolorwheel';

class Color {
    constructor() {
		this.colors = colors;
	}

	generateDistinctColors(numColors, alpha = 1.0) {
		const colors = [];
		const saturation = 70;  // 0–100
		const lightness = 50;   // 0–100
		const hueOffset = 220;  
	  
		for (let i = 0; i < numColors; i++) {
		  const hue = Math.round((360 / numColors) * i) + hueOffset;
		  if (alpha !== false) {
			// Convert HSL to RGB
			const rgb = this.hslToRgb(hue / 360, saturation / 100, lightness / 100);
			colors.push(`rgba(${rgb.join(',')},${alpha})`);
		  } else {
			colors.push(`hsl(${hue}, ${saturation}%, ${lightness}%)`);
		  }
		}
	  
		return colors;
	  }
	  
	  // Helper function: HSL to RGB
	  hslToRgb(h, s, l) {
		let r, g, b;
	  
		if (s === 0) {
		  r = g = b = l; // achromatic
		} else {
		  const hue2rgb = function(p, q, t) {
			if(t < 0) t += 1;
			if(t > 1) t -= 1;
			if(t < 1/6) return p + (q - p) * 6 * t;
			if(t < 1/2) return q;
			if(t < 2/3) return p + (q - p) * (2/3 - t) * 6;
			return p;
		  };
	  
		  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
		  const p = 2 * l - q;
		  r = hue2rgb(p, q, h + 1/3);
		  g = hue2rgb(p, q, h);
		  b = hue2rgb(p, q, h - 1/3);
		}
	  
		return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
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

	/**
	 * Generate a color based on taxonomic hierarchy (family/genus/species)
	 * Taxa from the same family will have similar hues, same genus will be even closer,
	 * and species will vary in lightness.
	 */
	getTaxonomicColor(familyName, genusName, speciesName) {
		// Simple hash function to convert string to number
		const hashString = (str) => {
			if (!str) return 0;
			let hash = 0;
			for (let i = 0; i < str.length; i++) {
				hash = ((hash << 5) - hash) + str.charCodeAt(i);
				hash = hash & hash; // Convert to 32bit integer
			}
			return Math.abs(hash);
		};

		// Base hue from family name (0-360)
		const familyHash = hashString(familyName);
		const baseHue = familyHash % 360;

		// Genus creates a small variation in hue (±20 degrees)
		const genusHash = hashString(genusName);
		const genusOffset = (genusHash % 40) - 20;
		const hue = (baseHue + genusOffset + 360) % 360;

		// Species affects lightness (40-70% range for good visibility)
		const speciesHash = hashString(speciesName);
		const lightness = 40 + (speciesHash % 30);

		// Keep saturation relatively high (60-85%)
		const saturation = 60 + (genusHash % 25);

		return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
	}
}

export { Color as default }