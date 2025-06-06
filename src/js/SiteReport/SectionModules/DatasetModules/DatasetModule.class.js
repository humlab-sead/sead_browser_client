import { method } from "lodash";

class DatasetModule {
    constructor(analysis) {
        this.methodIds = [];
    }

	renderDatasetContacts(siteData, contactIds) {

		//reduce contactIds down to just unique values
		contactIds = contactIds.filter((value, index, self) => {
			return self.indexOf(value) === index;
		});


		let datasetContacts = [];
		for(let k in contactIds) {
			let contactId = contactIds[k];
			let foundContact = false;
			for(let contactKey in siteData.lookup_tables.dataset_contacts) {
				if(siteData.lookup_tables.dataset_contacts[contactKey].contact_id == contactId) {
					foundContact = true;
					datasetContacts.push(siteData.lookup_tables.dataset_contacts[contactKey])
				}
			}
			if(!foundContact) {
				console.warn("Contact not found in lookup table:", contactId);
			}
		}

		if(datasetContacts.length == 0) {
			return "";
		}

		let html = "<ul>";
		datasetContacts.forEach(contact => {
			html += "<li class='dataset-contact'>";
			if(contact.contact_first_name) {
				html += "<div class='dataset-contact-name'>"+contact.contact_first_name+"</div>";
			}
			if(contact.contact_last_name) {
				html += "<div class='dataset-contact-name'>"+contact.contact_last_name+"</div>";
			}
			if(contact.contact_email) {
				html += "<div class='dataset-contact-email'>"+contact.contact_email+"</div>";
			}
			if(contact.contact_address_1) {
				html += "<div class='dataset-contact-phone'>"+contact.contact_address_1+"</div>";
			}
			if(contact.contact_address_2) {
				html += "<div class='dataset-contact-phone'>"+contact.contact_address_2+"</div>";
			}
			if(contact.contact_location_name) {
				html += "<div class='dataset-contact-notes'>"+contact.contact_location_name+"</div>";
			}
			if(contact.contact_url) {
				html += "<div class='dataset-contact-notes'>"+contact.contact_url+"</div>";
			}
			if(contact.contact_type_description) {
				html += "<div class='dataset-contact-notes'>"+contact.contact_type_description+"</div>";
			}
			html += "</li>";
		});

		html += "</ul>";
		
		return html;
	}

	renderDatasetReference_DEPRECATED(siteData, biblioIds) { //use this.sqs.renderBiblioReference instead
		let datasetBiblio = [];
		for(let k in biblioIds) {
			let biblioId = biblioIds[k];
			let foundBiblio = false;
			for(let bibKey in siteData.lookup_tables.biblio) {
				if(siteData.lookup_tables.biblio[bibKey].biblio_id == biblioId) {
					foundBiblio = true;
					datasetBiblio.push(siteData.lookup_tables.biblio[bibKey])
				}
			}
			if(!foundBiblio) {
				console.warn("Biblio not found in lookup table:", biblioId);
			}
		}

		if(datasetBiblio.length == 0) {
			return "";
		}

		let html = "<ul>";
		datasetBiblio.forEach(biblio => {
			html += "<div class='dataset-biblio'>";
			if(biblio.full_reference) {
				html += "<li class='dataset-biblio-full-reference'>"+biblio.full_reference+"</li>";
			}
			else {
				html += "<li>";
				if(biblio.author) {
					html += "<span class='dataset-biblio-author'>"+biblio.author+"</span>";
				}
				if(biblio.year) {
					html += "<span class='dataset-biblio-year'>"+biblio.year+"</span>";
				}
				if(biblio.title) {
					html += "<span class='dataset-biblio-title'>"+biblio.title+"</span>";
				}
				if(biblio.doi) {
					html += "<span class='dataset-biblio-doi'>"+biblio.doi+"</span>";
				}
				if(biblio.isbn) {
					html += "<span class='dataset-biblio-isbn'>"+biblio.isbn+"</span>";
				}
				if(biblio.url) {
					html += "<span class='dataset-biblio-url'>"+biblio.url+"</span>";
				}
				if(biblio.notes) {
					html += "<span class='dataset-biblio-notes'>"+biblio.notes+"</span>";
				}
				if(biblio.bugs_reference) {
					html += "<span class='dataset-biblio-bugs-reference'>"+biblio.bugs_reference+"</span>";
				}
				html += "</li>";
			}
			
			html += "</div>";
		});

		html += "</ul>";
		
		return html;
	}


	claimDatasets(site) {
		let methodDatasets = [];
		let methodDatasetsSelectedByGroup = [];
		let methodDatasetsSelectedById = [];
		if(typeof this.methodGroupIds != "undefined" && this.methodGroupIds.length > 0) {
			methodDatasetsSelectedByGroup = site.unclaimedDatasets.filter(dataset => {
				return this.methodGroupIds.includes(dataset.method_group_id);
			});
			//console.log(this.constructor.name+" claimed datasets (by group):", methodDatasets);
		}
		if(typeof this.methodIds != "undefined") {
			methodDatasetsSelectedById = site.unclaimedDatasets.filter(dataset => {
				return this.methodIds.includes(dataset.method_id);
			});
			//console.log(this.constructor.name+" claimed datasets (by id):", methodDatasets);
		}

		methodDatasets = methodDatasetsSelectedByGroup.concat(methodDatasetsSelectedById);

		let unclaimedDatasets = [];
		site.unclaimedDatasets.forEach(dataset => {
			let isClaimed = false;
			methodDatasets.forEach(methodDataset => {
				if(methodDataset.dataset_id == dataset.dataset_id) {
					isClaimed = true;
				}
			});
			if(!isClaimed) {
				unclaimedDatasets.push(dataset);
			}
		});
		
		//site.datasets = unclaimedDatasets;
		site.unclaimedDatasets = unclaimedDatasets;
		
		/* this is much more elegant method for finding the unclaimed datasets, but it doesn't work with method groups...
		site.datasets = site.datasets.filter(dataset => {
			return !this.methodIds.includes(dataset.method_id);
		});
		*/

		return methodDatasets;
	}

	getUniqueDatasetBiblioIdsFromDataGroup(datasets, dataGroup) {
		let datasetBiblioIds = [];
		datasets.forEach(ds => {
			if(ds.dataset_id == dataGroup.dataset_id && ds.biblio_id != null) {
				//push if unique
				if(!datasetBiblioIds.includes(ds.biblio_id)) {
					datasetBiblioIds.push(ds.biblio_id);
				}
			}
		});
		return datasetBiblioIds;
	}
	
	getUniqueDatasetContactsFromDataGroup(datasets, dataGroup) {
		let datasetContacts = [];
		datasets.forEach(ds => {
			if(ds.dataset_id == dataGroup.dataset_id && ds.contacts != null) {
				//push if unique
				ds.contacts.forEach(contact => {
					if(!datasetContacts.includes(contact)) {
						datasetContacts.push(contact);
					}
				});
			}
		});
		return datasetContacts;
	}

    /**
     * Function: offerAnalyses
     */
	offerAnalyses(datasets, sectionsList) {
        return new Promise((resolve, reject) => {
            resolve();
        });
	}

    async makeSection(siteData, sections) {
		//console.log(siteData, sections);
	}

	getSectionByMethodId(methodId, sections) {
		for(let key in sections) {
			if(sections[key].name == methodId) {
				return sections[key];
			}
		}
		return null;
	}

	getAnalysisMethodMetaById(siteData, methodId) {
		if(typeof siteData.lookup_tables.methods == "undefined") {
			return null;
		}
		for(let key in siteData.lookup_tables.methods) {
			if(siteData.lookup_tables.methods[key]) {
				if(siteData.lookup_tables.methods[key].method_id == methodId) {
					return siteData.lookup_tables.methods[key];
				}
			}
		}
	}

	getSampleById(siteData, physicalSampleId) {
		if(!siteData) {
			console.warn("getSampleById: siteData is null");
		}
		for(let key in siteData.sample_groups) {
			let sampleGroup = siteData.sample_groups[key];
			for(let sKey in sampleGroup.physical_samples) {
				let sample = sampleGroup.physical_samples[sKey];
				if(sample.physical_sample_id == physicalSampleId) {
					return sample;
				}
			}
		}
		return null;
	}

	createSection(sectionData) {
		let sectionsLength = this.section.sections.push(sectionData);
		let sectionKey = sectionsLength - 1;
		return this.section.sections[sectionKey];
	}

	getSection(sectionName) {
		let sectionKey = this.sqs.findObjectPropInArray(this.section.sections, "name", sectionName);
		if(sectionKey === false) {
			return false;
		}
		return this.section.sections[sectionKey];
	}

	groupDatasetsByMethod(datasets) {
		let datasetGroups = [];
		for(let key in datasets) {
			let found = false;
			for(let gKey in datasetGroups) {
				if(datasetGroups[gKey].methodId == datasets[key].method.method_id) {
					found = true;
					datasetGroups[gKey].datasets.push(datasets[key]);
				}
			}

			if(!found) {
				datasetGroups.push({
					methodId: datasets[key].method.method_id,
					datasets: [datasets[key]]
				});
			}
		}

		return datasetGroups;
	}

	getUnitById(siteData, unit_id) {
        for(let key in siteData.lookup_tables.units) {
            let unit = siteData.lookup_tables.units[key];
            if(unit.unit_id == unit_id) {
                return unit;
            }
        }
        return null;
    }

	getMethodDescription(siteData, methodLookupKey, valueClassId) {
		if (!siteData.lookup_tables[methodLookupKey]) {
			console.warn(`Method lookup key "${methodLookupKey}" not found in lookup tables.`);
			return null;
		}
	
		for (let key in siteData.lookup_tables[methodLookupKey]) {
			if (siteData.lookup_tables[methodLookupKey][key].value_class_id == valueClassId) {
				return siteData.lookup_tables[methodLookupKey][key];
			}
		}
		return null;
	}

	getSampleGroupBySampleName(sampleName, siteData) {
		for(let key in siteData.sample_groups) {
			for(let sampleKey in siteData.sample_groups[key].physical_samples) {
				if(siteData.sample_groups[key].physical_samples[sampleKey].sample_name == sampleName) {
					return siteData.sample_groups[key]
				}
			}
		}
		return false;
	}
}

export default DatasetModule;