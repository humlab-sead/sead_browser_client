import ExcelJS from 'exceljs';

class ExportManager {
    constructor(sqs) {
        this.sqs = sqs;
    }

    async contentItemToExcelBlobUrl(contentItem) {
        const ws_name = "SEAD Data";
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet(ws_name);

        let styles = {
            header1: { size: 14, bold: true },
            header2: { size: 12, bold: true },
        }

        dataRows.forEach(row => {
            let addStyle = null;
            if(typeof row[0] == 'object') {
                if(row[0].style == 'header2') {
                    addStyle = styles.header2;
                }
                row.splice(0, 1);
            }

            ws.addRow(row);
            
            if(addStyle != null) {
                ws.lastRow.font = addStyle;
            }
        });

        let buffer = await wb.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/octet-stream' });
        const blobUrl = URL.createObjectURL(blob);
        console.log(blobUrl);
        return blobUrl;

        /*
        wb.xlsx.writeBuffer().then(buffer => {
            const blob = new Blob([buffer], { type: 'application/octet-stream' });
            const blobUrl = URL.createObjectURL(blob);

            //$("#site-report-xlsx-export-download-btn").attr("href", blobUrl);
            //$("#site-report-xlsx-export-download-btn").attr("download", filename+".xlsx");

            console.log(buffer);
            console.log(blob);

            //URL.revokeObjectURL(blobUrl);
        });
        */
    }
}

export default ExportManager;