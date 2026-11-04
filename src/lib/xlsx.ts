import { zipSync, strToU8 } from 'fflate'

/* Minimal, dependency-light .xlsx writer (SpreadsheetML). Supports several sheets, strings, numbers, dates (as ISO
 * strings), a bold header row, column widths and an auto-filter. Enough for exports; no formulas or styles beyond that. */
export type Cell = string | number | null | undefined | Date
export type Sheet = { name: string; header: string[]; rows: Cell[][]; widths?: number[] }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const col = (i: number) => { let n = i + 1, s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26) } return s }
const safeName = (n: string) => n.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Sheet'

function cellXml(ref: string, v: Cell, style?: number): string {
  const st = style ? ` s="${style}"` : ''
  if (v == null || v === '') return ''
  if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${st}><v>${v}</v></c>`
  if (v instanceof Date) return `<c r="${ref}" t="inlineStr"${st}><is><t>${esc(v.toISOString())}</t></is></c>`
  let s = String(v)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}` // neutralise formula injection
  return `<c r="${ref}" t="inlineStr"${st}><is><t xml:space="preserve">${esc(s)}</t></is></c>`
}

function sheetXml(sh: Sheet): string {
  const widths = (sh.widths ?? sh.header.map((h, i) => Math.min(60, Math.max(h.length, ...sh.rows.slice(0, 200).map((r) => String(r[i] ?? '').length)) + 2)))
  const cols = `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
  const head = `<row r="1">${sh.header.map((h, i) => cellXml(`${col(i)}1`, h, 1)).join('')}</row>`
  const body = sh.rows.map((r, ri) => `<row r="${ri + 2}">${r.map((v, ci) => cellXml(`${col(ci)}${ri + 2}`, v)).join('')}</row>`).join('')
  const ref = `A1:${col(Math.max(0, sh.header.length - 1))}${sh.rows.length + 1}`
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${cols}<sheetData>${head}${body}</sheetData><autoFilter ref="${ref}"/></worksheet>`
}

export function buildXlsx(sheets: Sheet[]): Uint8Array {
  const files: Record<string, Uint8Array> = {}
  const names = sheets.map((s) => safeName(s.name))
  files['[Content_Types].xml'] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`)
  files['_rels/.rels'] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`)
  files['xl/workbook.xml'] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`)
  files['xl/_rels/workbook.xml.rels'] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`)
  files['xl/styles.xml'] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF121212"/></patternFill></fill></fills><borders count="1"><border/></borders><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" applyFont="1" applyFill="1"/></cellXfs></styleSheet>`)
  sheets.forEach((s, i) => { files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(s)) })
  return zipSync(files, { level: 6 })
}
export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
