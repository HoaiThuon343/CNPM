function download(blob, filename) {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
}

async function excel({ title, scope, cards, note, columns, rows, formatCell }) {
    const { default: ExcelJS } = await import('exceljs/dist/exceljs.min.js')
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Báo cáo')
    sheet.addRow([title]).font = { bold: true, size: 16 }
    sheet.addRow([scope])
    if (note) sheet.addRow([note])
    cards.forEach(card => sheet.addRow(card))
    sheet.addRow([])
    const header = sheet.addRow(columns.map(([, label]) => label))
    header.font = { bold: true }
    columns.forEach(([, label, type], index) => {
        sheet.getColumn(index + 1).width = type ? Math.max(17, label.length + 3) : Math.max(24, label.length + 3)
    })
    for (const item of rows) {
        const row = sheet.addRow(columns.map(column => {
            const [key, , type] = column
            if (type === 'USD' || (type === 'currency' && item.currency === 'USD')) return item[key] / 100
            if (type) return item[key]
            return formatCell(item, column)
        }))
        columns.forEach(([, , type], index) => {
            if (type === 'USD' || (type === 'currency' && item.currency === 'USD')) row.getCell(index + 1).numFmt = '"$"#,##0.00'
            if (type === 'currency' && item.currency === 'VND') row.getCell(index + 1).numFmt = '#,##0" đ"'
        })
    }
    return new Blob([await workbook.xlsx.writeBuffer()], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
}

async function pdf({ title, scope, cards, note, columns, rows, formatCell }) {
    const [{ default: pdfMake }, { default: fonts }] = await Promise.all([
        import('pdfmake/build/pdfmake.js'), import('pdfmake/build/vfs_fonts.js'),
    ])
    pdfMake.addVirtualFileSystem(fonts)
    const body = [
        columns.map(([, label]) => ({ text: label, bold: true })),
        ...rows.map(row => columns.map(column => String(formatCell(row, column) ?? ''))),
    ]
    return pdfMake.createPdf({
        info: { title },
        pageSize: 'A4',
        pageOrientation: columns.length > 4 ? 'landscape' : 'portrait',
        defaultStyle: { fontSize: 10 },
        content: [
            { text: title, fontSize: 19, bold: true, margin: [0, 0, 0, 6] },
            { text: scope, margin: [0, 0, 0, 8] },
            ...cards.map(([label, value]) => ({ text: `${label}: ${value}` })),
            ...(note ? [{ text: note, margin: [0, 8, 0, 0] }] : []),
            {
                layout: 'lightHorizontalLines',
                margin: [0, 10, 0, 0],
                table: { headerRows: 1, widths: columns.map(() => '*'), body },
            },
        ],
    }).getBlob()
}

export async function downloadReport(format, data) {
    const blob = await (format === 'xlsx' ? excel(data) : pdf(data))
    download(blob, `bao-cao-${data.section}.${format}`)
}
