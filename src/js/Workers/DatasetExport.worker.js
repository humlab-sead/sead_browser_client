// Helper function to chunk an array into smaller arrays
function chunkArray(array, numChunks) {
	const chunks = [];
	const chunkSize = Math.ceil(array.length / numChunks);

	for (let i = 0; i < numChunks; i++) {
		const start = i * chunkSize;
		const end = start + chunkSize;
		if (start < array.length) {
			chunks.push(array.slice(start, end));
		} else {
			chunks.push([]); // Add an empty array if there are not enough items left
		}
	}
	return chunks;
}

// Function to fetch data in series and merge results
async function fetchDatagroupsInChunks(methodId, selectedSites, dataServerAddress) {
	const numChunks = 10;
	const minThreshold = 10; // Minimum threshold to start chunking
	let siteChunks;
	if (selectedSites.length < minThreshold) {
		// If less than threshold, put all in one chunk
		siteChunks = [selectedSites];
	} else {
		// Otherwise, chunk into numChunks parts
		siteChunks = chunkArray(selectedSites, numChunks);
	}

	let allResults = [];

	let progress = 0;
	for (const chunk of siteChunks) {
		try {
			const response = await fetch(dataServerAddress+'/datagroups', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ siteIds: chunk, methodIds: [methodId] })
			});
			const data = await response.json();
			progress++;

			// Send progress back to the main thread
			postMessage({
				type: 'progress',
				progress: progress,
				total: siteChunks.length
			});

			allResults = allResults.concat(data); // Merge results into one big array
		} catch (error) {
			console.error('Error fetching data:', error);
			// Handle error (you might want to retry or skip the chunk)
		}
	}

	// Send the final results back to the main thread
	postMessage({
		type: 'complete',
		results: allResults
	});
}

// Listen for messages from the main thread
onmessage = function(e) {
	const { methodId, selectedSites, dataServerAddress } = e.data;
	fetchDatagroupsInChunks(methodId, selectedSites, dataServerAddress);
};
