# JAV Userscript Site List

Sites, mirror domains, and detection methods are maintained in the [full site table of peach-mitao/peach-userscript](https://github.com/peach-mitao/peach-userscript/blob/main/docs/SITES.md). The single machine-readable source is that repository's [`jav-sites.json`](https://github.com/peach-mitao/peach-userscript/blob/main/jav-sites.json).

Peach validates source addresses with the `web/integrations/jav-sites.json` release snapshot; the matching script, version, upstream commit, and SHA256 record are published together. For the sync flow see [Userscript](JAV_BROWSER.md#artifact-sync).

## Integration Methods

"Auto-detect" reads the main title and explicit code fields of a work detail page, and uses the script menu when detection fails or conflicts. "Selected code" requires selecting a complete code first, choosing "Add selected code to Peach" from the script menu, then clicking the add button. Both methods have Peach validate the code and run the same magnet search, cloud download, and ingest flow.

## Gap Filling

The independent repository collects mirrors and missing source sites from the explicit site declarations of popular Sleazy JAV scripts, recording the script version, SHA256, domain ownership, HTTPS responses, and redirects. Maintainers review candidates and then update the list; over-broad wildcards, dead domains, and domains whose identity cannot be confirmed stay pending review. For sources and judgments see [site candidate review](https://github.com/peach-mitao/peach-userscript/blob/main/docs/MIRROR_REVIEW.md).

A registered domain does not mean the site is currently reachable, nor that a combined acceptance of a real browser extension, the source site, and cloud drive downloads has been obtained. The script depends on the userscript manager's access permission to registered sites.
