import debounce from "lodash/debounce";
import { Tabulator, FormatModule, SelectRowModule, InteractionModule, TooltipModule, SortModule, ResponsiveLayoutModule, ResizeTableModule } from "tabulator-tables";

Tabulator.registerModule(FormatModule);
Tabulator.registerModule(SelectRowModule);
Tabulator.registerModule(InteractionModule);
Tabulator.registerModule(TooltipModule);
Tabulator.registerModule(SortModule);
Tabulator.registerModule(ResponsiveLayoutModule);
Tabulator.registerModule(ResizeTableModule);

class SearchManager {
    constructor(sqs) {
        this.sqs = sqs;
        this.searchResults = [];
    }

    async search(searchTerm) {
        return new Promise((resolve, reject) => {
            $.ajax({
                url: this.sqs.config.dataServerAddress + "/freesearch/"+searchTerm,
                type: "GET",
                contentType: "application/json",
                success: (data) => {
                    this.searchResults = data;
                    resolve(data);
                },
                error: (data) => {
                    reject(data);
                }
            });
        });
    }

    getSearchResults() {
        return this.searchResults;
    }

    sqsMenu() {
		let menuItems = [];
        menuItems.push({
            name: "search",
            title: "<span class='result-tab-title'>Search</span>",
            visible: true,
            icon: "",
            staticSelection: false,
            callback: () => {
                console.log("search");
                let content = $("#templates > #search-dialog-template")[0].cloneNode(true);
                $(content).attr("id", "search-dialog");
                $(content).show();
		        this.sqs.dialogManager.showPopOver("Search", content.outerHTML);

                //bind callback for the input field, with some debounce
                let searchInput = $("#search-input");


                /*
                this.tabulatorTable = new Tabulator("#result-datatable", {
			data: this.data.rows,
			placeholder:"No data",
			layout: "fitColumns",
			initialSort:[
				{column:"analysis_entities", dir:"desc"},
			],
			selectable: true,
			columns: tableColumns,
		});
                */

                searchInput.on("input", debounce(() => {
                    if(searchInput.val().length > 1) {
                        this.search(searchInput.val()).then((data) => {
                            this.renderSearchResultsTable(data);
                        });
                    }
                }
                , 500));
            }
        });

		return {
			title: "VIEW :",
			layout: "horizontal",
			collapsed: false,
			anchor: "#search-menu",
			staticSelection: false,
			showMenuTitle: false,
			viewPortResizeCallback: () => {
			},
			items: menuItems
		};
	}

    renderSearchResultsTableOLD(data) {
        $("#search-results").empty();

        $("#search-results").html(`
            <table>
                <thead>
                    <tr>
                        <th><input type='checkbox' /></th>
                        <th>Site ID</th>
                        <th>Site Name</th>
                        <th>Site description</th>
                    </tr>
                </thead>
            </table`);

        data.forEach((result) => {
            let resultElement = $(`
                <tr class='free-text-search-result-row'>
                    <td><input type='checkbox' /></td>
                    <td>`+result.site_id+`</td>
                    <td>`+result.site_name+`</td>
                    <td>`+result.site_description+`</td>
                </tr>
            `);
            resultElement.on("click", () => {
                console.log(result);
            });
            $("#search-results").append(resultElement);
        });
    }

    renderSearchResultsTable(data) {
        // Clear the #search-results div
        $("#search-results").empty();

        // Initialize the Tabulator table
        let table = new Tabulator("#search-results", {
            data: data, // Pass in the search results data
            placeholder:"No results",
            layout: "fitColumns", // Auto-size columns to fit the content
            initialSort: [
                { column: "score", dir: "desc" } // Sort by site_id in ascending order
            ],
            pagination: "local", // Enable local pagination
            paginationSize: 10, // Number of rows per page
            selectable: true,
            columns: [
                { title: "<input type='checkbox' />", field: "checkbox", formatter: "rowSelection", hozAlign: "center", headerSort: false, width: 100, cellClick: function (e, cell) {
                    cell.getRow().toggleSelect();
                }},
                { title: "Search relevance", field: "score", sorter: "number", width: 100, formatter: (cell, formatterParams, onRendered) => { return parseFloat(cell.getValue()).toFixed(1); } },
                { title: "Site ID", field: "site_id", sorter: "number", width: 100 }, // Sort by site_id
                { title: "Site Name", field: "site_name", sorter: "string", width: 100 }, // Sort by site_name
                { title: "Site Description", field: "site_description", sorter: "string", width: 300, 
                    formatter: (cell) => {
                      let description = cell.getValue();
                      if(!description) {
                        return "";
                      }
                      let maxLength = 50; // Limit to 50 characters for display
                      let truncated = description.length > maxLength ? description.substring(0, maxLength) + "..." : description;
      
                      // Set full description as a tooltip (hover text)
                      cell.getElement().setAttribute("title", description);
      
                      return truncated;
                    } 
                }
            ],
            rowClick: function (e, row) { // Add click event for the row
                console.log(row.getData()); // Log the row data
            }
        });
    }
}

export default SearchManager;