// F053 -- Reporting, PDF/CSV Export & Customer Reports (CSV half). Pure
// row-to-CSV formatting. Requires an explicit column allowlist (`key` +
// `header` per column) rather than dumping every field of whatever object
// is passed in -- same "declared allowlist, not implicit passthrough"
// principle as templateRenderer.js's `allowedVariables`, applied here to
// satisfy SYS-AUTH-007 ("exports... apply the same object-level
// authorization as detail pages") -- a caller must deliberately choose
// what appears in an export, not accidentally leak a field via ...spread.

/**
 * @typedef {Object} CsvColumn
 * @property {string} key
 * @property {string} header
 */

/**
 * @param {Record<string, unknown>[]} rows
 * @param {CsvColumn[]} columns
 * @returns {string}
 */
function toCsv(rows, columns) {
  if (!Array.isArray(columns) || columns.length === 0) {
    throw new Error("toCsv: columns is required -- refusing to export without an explicit column allowlist");
  }
  if (!Array.isArray(rows)) {
    throw new Error("toCsv: rows must be an array");
  }

  const headerLine = columns.map((column) => escapeCsvField(column.header)).join(",");
  const dataLines = rows.map((row) => columns.map((column) => escapeCsvField(row[column.key])).join(","));

  return [headerLine, ...dataLines].join("\r\n");
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function escapeCsvField(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  const needsQuoting = /[",\r\n]/.test(text);
  const escaped = text.replace(/"/g, '""');
  return needsQuoting ? `"${escaped}"` : escaped;
}

module.exports = { toCsv, escapeCsvField };
