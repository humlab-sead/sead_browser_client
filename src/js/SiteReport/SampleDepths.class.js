/*
* Class: SampleDepths
*
* The depths of a site's samples. SEAD keeps them both as coordinates and as dimensions of the samples, as the upper
* and lower boundaries of the sample or as a single depth, always in metres and going downwards. A sample's depth is
* here an interval from its upper to its lower boundary, which is a single point when only one depth is recorded.
*/

//Coordinate methods which are a depth, and which boundary of the sample they are
const depthCoordinateMethods = {
	116: "upper", //Depth surface to upper sample boundary
	125: "upper", //Upper sample boundary (positive depth)
	115: "lower", //Depth from surface lower sample boundary
	122: "lower", //Depth surface to lower sample boundary
	126: "lower", //Lower sample boundary (positive depth)
	79: "point", //Depth from surface
	77: "point" //Depth from reference level
};

//Sample dimensions which are a depth, and which boundary of the sample they are. Negative depths count upwards.
const depthDimensions = {
	19: { boundary: "upper", sign: 1 }, //Positive boundary depth from surface upper
	20: { boundary: "upper", sign: -1 }, //Upper boundary depth (negative) from surface
	23: { boundary: "upper", sign: 1 }, //Upper boundary depth (positive) from reference
	27: { boundary: "upper", sign: 1 }, //Upper boundary depth from unknown reference
	21: { boundary: "lower", sign: 1 }, //Lower boundary depth (positive) from surface
	22: { boundary: "lower", sign: -1 }, //Lower boundary depth (negative) from surface
	25: { boundary: "lower", sign: 1 }, //Lower boundary depth (positive) from reference
	2: { boundary: "lower", sign: 1 } //Lower boundary depth from unknown reference
};

class SampleDepths {
	constructor(siteData) {
		this.depths = new Map();
		siteData.sample_groups.forEach(sampleGroup => {
			sampleGroup.physical_samples.forEach(sample => {
				let depth = this.readDepth(sample);
				if(depth) {
					depth.sampleGroupId = sampleGroup.sample_group_id;
					this.depths.set(sample.physical_sample_id, depth);
				}
			});
		});
	}

	/*
	* Function: readDepth
	*
	* The depth of a sample as { upper, lower }, or null if it has none. Its coordinates go before its dimensions.
	*/
	readDepth(sample) {
		let boundaries = {};

		(sample.coordinates || []).forEach(coordinate => {
			let boundary = depthCoordinateMethods[coordinate.coordinate_method_id];
			let value = parseFloat(coordinate.measurement);
			if(boundary && !isNaN(value) && typeof boundaries[boundary] == "undefined") {
				boundaries[boundary] = value;
			}
		});

		(sample.dimensions || []).forEach(dimension => {
			let depthDimension = depthDimensions[dimension.dimension_id];
			let value = parseFloat(dimension.dimension_value);
			if(depthDimension && !isNaN(value) && typeof boundaries[depthDimension.boundary] == "undefined") {
				boundaries[depthDimension.boundary] = value * depthDimension.sign;
			}
		});

		let values = [boundaries.upper, boundaries.lower, boundaries.point].filter(value => typeof value != "undefined");
		if(values.length == 0) {
			return null;
		}
		if(typeof boundaries.upper != "undefined" && typeof boundaries.lower != "undefined") {
			return { upper: Math.min(boundaries.upper, boundaries.lower), lower: Math.max(boundaries.upper, boundaries.lower) };
		}
		return { upper: values[0], lower: values[0] };
	}

	/*
	* Function: getDepth
	*
	* The depth of a sample as { upper, lower }, or null if it has none.
	*/
	getDepth(physicalSampleId) {
		let depth = this.depths.get(Number(physicalSampleId));
		return depth ? depth : null;
	}

	/*
	* Function: hasProfile
	*
	* Whether these samples can be drawn as a depth profile: at least two of them, and at least half of them, have a depth,
	* and those all come from the same sample group, since depths from different profiles or trenches can't be compared.
	*/
	hasProfile(physicalSampleIds) {
		let depths = this.getDepths(physicalSampleIds);
		if(depths.length < 2 || depths.length < physicalSampleIds.length / 2) {
			return false;
		}
		return new Set(depths.map(depth => depth.sampleGroupId)).size == 1;
	}

	/*
	* Function: isStratigraphic
	*
	* Whether most of these samples have a depth of their own, as down a profile, rather than many of them sharing
	* the same few depths, as in a survey across an area.
	*/
	isStratigraphic(physicalSampleIds) {
		let depths = this.getDepths(physicalSampleIds);
		let distinctDepths = new Set(depths.map(depth => depth.upper+"-"+depth.lower));
		return depths.length > 0 && distinctDepths.size >= depths.length * 0.8;
	}

	getDepths(physicalSampleIds) {
		return physicalSampleIds.map(id => this.getDepth(id)).filter(depth => depth != null);
	}
}

export { SampleDepths as default }
