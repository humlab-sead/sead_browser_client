import colors from "../stylesheets/colors.scss";
import ColorScheme from 'color-scheme';
import KolorWheel from 'kolorwheel';

class Color {
    constructor() {
		this.colors = colors;
	}

	getNiceColorScheme(count, baseColor = "#2d5e8d", options = {}) {
		if (!Number.isInteger(count) || count <= 0) return [];

		const cfg = {
			spread: 1.0,
			chromaMin: 0.06,
			chromaMax: 0.16,
			lightnessMin: 0.50,
			lightnessMax: 0.80,
			baseLightnessPull: 0.55,
			preferWhiteBg: true,
			minContrastLightness: 0.45,
			vibrancy: 0.5, // 0-1 scale: controls color saturation/chroma (0 = muted, 1 = vibrant)
			seed: 0, // Seed for reproducible variations (any number)

			// internal: allow a single retry to avoid too-close colors
			maxRetries: 1,
			_retry: 0,
			_hueOffsetsOverride: null,

			...options,
		};

		// Apply vibrancy to chroma range
		// vibrancy 0 = very muted (0.03-0.08)
		// vibrancy 0.5 = balanced (0.06-0.16)
		// vibrancy 1 = very vibrant (0.12-0.28)
		const vibrancyScale = cfg.vibrancy;
		const baseChromaMin = 0.03 + (0.09 * vibrancyScale);
		const baseChromaMax = 0.08 + (0.20 * vibrancyScale);
		cfg.chromaMin = baseChromaMin;
		cfg.chromaMax = baseChromaMax;

		const base = baseColor ? this.parseHexColor(baseColor) : null;
		const baseOklch = base ? this.srgbToOklch(base) : null;

		// Apply seed offset to center hue for variation
		const seedHueOffset = (cfg.seed * 37.5) % 360; // 37.5 degrees per seed increment
		const centerHue = baseOklch ? ((baseOklch.h + seedHueOffset) % 360) : ((30 + seedHueOffset) % 360);
		const baseL = baseOklch ? clamp(baseOklch.l, 0, 1) : 0.68;
		const baseC = baseOklch ? clamp(baseOklch.c, 0, 0.25) : 0.11;

		const goldenAngle = 137.50776405003785;

		// Apply seed to the golden angle distribution for reproducible variation
		const seedPhaseShift = (cfg.seed * 0.618033988749895) % 1; // Use golden ratio for phase shift
		const hueOffsets =
			Array.isArray(cfg._hueOffsetsOverride) && cfg._hueOffsetsOverride.length >= count
			? cfg._hueOffsetsOverride.slice(0, count)
			: buildHueOffsets(count, goldenAngle, cfg.spread, seedPhaseShift);

		const colors = [];
		for (let i = 0; i < count; i++) {
			const h = mod(centerHue + hueOffsets[i], 360);

			const t = count === 1 ? 0.5 : i / (count - 1);
			let L = lerp(cfg.lightnessMin, cfg.lightnessMax, smoothstep(t));
			if (baseOklch) L = lerp(L, baseL, cfg.baseLightnessPull);

			if (baseOklch) {
			if (baseL < 0.35) L = Math.max(L, 0.55);
			if (baseL > 0.85) L = Math.min(L, 0.78);
			}

			const wobble = 0.02 * Math.sin((i + 1) * 2.1);
			let C = clamp(baseC + 0.06 + wobble, cfg.chromaMin, cfg.chromaMax);

			if (!baseOklch) {
			C = clamp(
				lerp(cfg.chromaMin, cfg.chromaMax, 0.35 + 0.65 * fract(i * 0.618)),
				cfg.chromaMin,
				cfg.chromaMax
			);
			}

			let rgb = this.oklchToSrgbGamutMapped({ l: L, c: C, h });

			if (cfg.preferWhiteBg) {
			const o = this.srgbToOklch(rgb);
			if (o.l < cfg.minContrastLightness) {
				rgb = this.oklchToSrgbGamutMapped({ l: cfg.minContrastLightness, c: o.c, h: o.h });
			}
			}

			colors.push(this.rgbToHex(rgb));
		}

		// One-time retry if any generated color is too close to base.
		if (base && cfg._retry < cfg.maxRetries) {
			const baseHex = this.rgbToHex(base);
			const tooClose = colors.some((hx) => colorDistanceHex.call(this, hx, baseHex) < 0.06);

			if (tooClose) {
			// rotate offsets and retry once
			const rotated = hueOffsets.slice(1).concat(hueOffsets[0]);
			return this.getNiceColorScheme(count, baseColor, {
				...cfg,
				_retry: cfg._retry + 1,
				_hueOffsetsOverride: rotated,
			});
			}
		}

		return colors;

		// ------------------------- local helpers (method-scoped) -------------------------

		function buildHueOffsets(n, stepDeg, spread, phaseShift = 0) {
			const offsets = [];
			for (let k = 0; k < n; k++) {
				// Add phase shift multiplied by k to create variation based on seed
				const offset = mod((k + phaseShift * n) * stepDeg * spread, 360);
				offsets.push(offset);
			}
			const recentered = offsets.map((a) => (a > 180 ? a - 360 : a));
			recentered.sort((a, b) => Math.abs(a) - Math.abs(b));
			return recentered;
		}

		function colorDistanceHex(hex1, hex2) {
			const c1 = this.parseHexColor(hex1);
			const c2 = this.parseHexColor(hex2);
			if (!c1 || !c2) return 1;

			const o1 = this.srgbToOklch(c1);
			const o2 = this.srgbToOklch(c2);

			const dl = o1.l - o2.l;
			const dc = o1.c - o2.c;

			// Hue distance on circle
			const dhRaw = Math.abs(o1.h - o2.h);
			const dh = Math.min(dhRaw, 360 - dhRaw) / 180; // 0..1 scaled

			// Weighted (guardrail, not a strict metric)
			return Math.sqrt(dl * dl + dc * dc + 0.25 * dh * dh);
		}

		function clamp(v, lo, hi) {
			return Math.min(hi, Math.max(lo, v));
		}
		function lerp(a, b, t) {
			return a + (b - a) * t;
		}
		function mod(a, n) {
			return ((a % n) + n) % n;
		}
		function fract(x) {
			return x - Math.floor(x);
		}
		function smoothstep(t) {
			t = clamp(t, 0, 1);
			return t * t * (3 - 2 * t);
		}
	}


	// Parse hex color string to RGB object
	parseHexColor(hex) {
		if (!hex) return null;
		// Remove # if present
		hex = hex.replace(/^#/, '');
		
		// Support both 3 and 6 character hex codes
		if (hex.length === 3) {
			hex = hex.split('').map(c => c + c).join('');
		}
		
		if (hex.length !== 6) return null;
		
		const r = parseInt(hex.substr(0, 2), 16) / 255;
		const g = parseInt(hex.substr(2, 2), 16) / 255;
		const b = parseInt(hex.substr(4, 2), 16) / 255;
		
		return { r, g, b };
	}

	// Convert RGB object to hex string
	rgbToHex(rgb) {
		const toHex = (v) => {
			const clamped = Math.max(0, Math.min(255, Math.round(v * 255)));
			return clamped.toString(16).padStart(2, '0');
		};
		return '#' + toHex(rgb.r) + toHex(rgb.g) + toHex(rgb.b);
	}

	// Convert sRGB to OKLch color space
	srgbToOklch(rgb) {
		// sRGB to linear RGB
		const toLinear = (c) => {
			return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
		};
		
		const r = toLinear(rgb.r);
		const g = toLinear(rgb.g);
		const b = toLinear(rgb.b);
		
		// Linear RGB to OKLab (using D65 illuminant)
		const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
		const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
		const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
		
		const l_ = Math.cbrt(l);
		const m_ = Math.cbrt(m);
		const s_ = Math.cbrt(s);
		
		const L = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_;
		const a = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_;
		const b_ = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_;
		
		// Convert to LCh
		const c = Math.sqrt(a * a + b_ * b_);
		let h = Math.atan2(b_, a) * 180 / Math.PI;
		if (h < 0) h += 360;
		
		return { l: L, c: c, h: h };
	}

	// Convert OKLch to sRGB with gamut mapping
	oklchToSrgbGamutMapped(lch) {
		const { l, c, h } = lch;
		
		// Convert LCh to Lab
		const a = c * Math.cos(h * Math.PI / 180);
		const b = c * Math.sin(h * Math.PI / 180);
		
		// OKLab to linear RGB
		const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
		const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
		const s_ = l - 0.0894841775 * a - 1.2914855480 * b;
		
		const lRgb = l_ * l_ * l_;
		const mRgb = m_ * m_ * m_;
		const sRgb = s_ * s_ * s_;
		
		let r = +4.0767416621 * lRgb - 3.3077115913 * mRgb + 0.2309699292 * sRgb;
		let g = -1.2684380046 * lRgb + 2.6097574011 * mRgb - 0.3413193965 * sRgb;
		let bVal = -0.0041960863 * lRgb - 0.7034186147 * mRgb + 1.7076147010 * sRgb;
		
		// Linear RGB to sRGB
		const fromLinear = (c) => {
			return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
		};
		
		r = fromLinear(r);
		g = fromLinear(g);
		bVal = fromLinear(bVal);
		
		// Simple gamut mapping by clamping
		r = Math.max(0, Math.min(1, r));
		g = Math.max(0, Math.min(1, g));
		bVal = Math.max(0, Math.min(1, bVal));
		
		return { r, g, b: bVal };
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