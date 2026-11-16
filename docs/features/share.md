# Share link

Copies a link that contains the whole map. Implemented in `site/app/mod-share.js` and `mod-share.css`.

## How it works

- The map JSON is compressed with the browser's `CompressionStream('deflate-raw')`, encoded as
  base64url and placed in the URL fragment: `https://host/app/#map=...`. A fragment is never sent
  to a server, so the map stays in the browser.
- **Share link** (Scenarios sheet, and the Export menu) builds the link, copies it to the clipboard
  and opens a dialog showing the link and its length in characters. If automatic copying is
  blocked, the text is selected for manual copying.
- Links longer than 32,000 characters are not offered; the dialog suggests Save project instead.
  The bundled GTHA template produces a link of about 14,300 characters.
- On load, a `#map=` fragment is decompressed (capped at 8 MB), validated with the normal map
  validator and offered in a dialog. Accepting opens it as a new scenario named "Shared map";
  dismissing ignores it. Existing work is never overwritten, and the fragment is cleared either way.
- A browser without `CompressionStream` shows a message and suggests Save project.

## Failure modes

An unreadable, oversized or invalid link shows "This share link could not be read" and changes nothing.

## Verification

`scripts/verify/scenarios.steps.json` builds a link, reloads the page on it and checks that the
shared map appears as a new scenario with the same route count.
