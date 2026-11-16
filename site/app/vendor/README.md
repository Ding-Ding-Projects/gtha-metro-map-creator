# Vendored libraries

Both are unmodified UMD builds from the npm registry, loaded on demand by `mod-print.js`.

| File | Package | Version | Size | Licence |
| --- | --- | --- | --- | --- |
| `jspdf.umd.min.js` | [jspdf](https://www.npmjs.com/package/jspdf) | 4.2.1 | 420,165 bytes | MIT, see `jspdf.LICENSE` |
| `svg2pdf.umd.min.js` | [svg2pdf.js](https://www.npmjs.com/package/svg2pdf.js) | 2.9.0 | 87,804 bytes | MIT, see `svg2pdf.LICENSE` |

To update: `npm pack jspdf@<version> svg2pdf.js@<version>` in a temporary directory, copy `package/dist/jspdf.umd.min.js`, `package/dist/svg2pdf.umd.min.js` and each `package/LICENSE`, then update this table and re-run `scripts/verify/print.steps.json`.
