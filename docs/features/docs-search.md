# Documentation search

The documentation page (`site/docs/index.html`) has a sticky search bar above the articles and an adjacent regular expression builder. The code is in `site/docs/docs-search.js` and `site/docs/docs-search.css`.

## Search

- Type in the pill field to search every article section. Plain text is the default; the `.*` button switches to regular expression mode and shows the builder.
- Results are grouped by article, with the article title, a match count and up to three snippets with the match in `<mark>`. The summary shows the total matches and the number of articles.
- Clicking a result scrolls to the section and highlights every occurrence in that article, with the chosen one emphasised. The contents list shows a count beside each article with matches.
- Keyboard: type, then Down and Up move through the results, Enter opens one, Escape clears the search and the highlights, `/` focuses the field.
- Flags: Ignore case (on by default) and Whole word. Whole word uses Unicode letter and digit boundaries.

## Regex builder

- Tokens insert into the field: groups, alternation, character classes, a custom set, repeats including `{n,m}`, anchors and escapes. A token wraps the current selection where that makes sense. Mode, query, flags and any error are shared between the field and the builder, so editing either updates the other.
- A plain-language explanation of the pattern, for example `"fre", then either "quen" or "q". Case is ignored.`
- A sample line with live highlighting and a match count.
- An invalid pattern shows the engine's error under the builder and on the field (`aria-invalid`); nothing throws.

## Safety

Patterns run in a Web Worker that is terminated after 400 ms, and a search stops at 500 matches. When either limit is hit the summary says the search was cut short. A pattern such as `(a+)+$` cannot freeze the page. Patterns are limited to 200 characters. Where Web Workers are unavailable the same caps apply inline, but a runaway pattern could then block until it finishes.

## Languages and appearance

The search UI has English and Cantonese strings, chosen from `navigator.language` and switched with the button beside `.*`; the choice is stored in local storage. It follows the site's colour tokens, light and dark, respects reduced motion, and fits a 390 px width without horizontal scrolling.

## Verification

`scripts/verify/docs-search.steps.json`, run with `scripts/verify/edge-drive.mjs` against `/docs/`, checks the counts, regex, invalid pattern, catastrophic pattern cut-off, scrolling, keyboard, builder sync, Cantonese, dark theme and overflow.
