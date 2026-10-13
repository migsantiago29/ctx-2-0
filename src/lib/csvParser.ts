export interface ParsedCsvResult {
  headers: string[]
  rows: Record<string, string>[]
}

/**
 * Robust CSV parser that correctly handles quotes, multi-line values,
 * CRLF/LF line breaks, and comma/semicolon separators.
 */
export function parseCsv(text: string): ParsedCsvResult {
  // Strip BOM if present
  let raw = text.replace(/^\uFEFF/, '').trim()
  if (!raw) return { headers: [], rows: [] }

  // Detect delimiter: sniff first line (outside quotes)
  let delimiter = ','
  const firstLineEnd = raw.indexOf('\n')
  const sample = firstLineEnd === -1 ? raw : raw.slice(0, firstLineEnd)
  const commas = (sample.match(/,/g) || []).length
  const semicolons = (sample.match(/;/g) || []).length
  if (semicolons > commas) {
    delimiter = ';'
  }

  const rows: string[][] = []
  let currentRow: string[] = []
  let currentVal = ''
  let inQuotes = false

  for (let i = 0; i < raw.length; i++) {
    const char = raw[i]
    const nextChar = raw[i + 1]

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          // Escaped quote
          currentVal += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        currentVal += char
      }
    } else {
      if (char === '"') {
        inQuotes = true
      } else if (char === delimiter) {
        currentRow.push(currentVal.trim())
        currentVal = ''
      } else if (char === '\r') {
        // ignore carriage return
      } else if (char === '\n') {
        currentRow.push(currentVal.trim())
        if (currentRow.some((c) => c !== '')) {
          rows.push(currentRow)
        }
        currentRow = []
        currentVal = ''
      } else {
        currentVal += char
      }
    }
  }

  // Push last field if present
  if (currentVal || currentRow.length > 0) {
    currentRow.push(currentVal.trim())
    if (currentRow.some((c) => c !== '')) {
      rows.push(currentRow)
    }
  }

  if (rows.length === 0) {
    return { headers: [], rows: [] }
  }

  const rawHeaders = rows[0].map((h) => h.trim().toLowerCase())
  const parsedRows: Record<string, string>[] = []

  for (let r = 1; r < rows.length; r++) {
    const rowObj: Record<string, string> = {}
    const rowVals = rows[r]
    for (let c = 0; c < rawHeaders.length; c++) {
      const headerName = rawHeaders[c]
      rowObj[headerName] = rowVals[c] !== undefined ? rowVals[c] : ''
    }
    parsedRows.push(rowObj)
  }

  return { headers: rawHeaders, rows: parsedRows }
}
