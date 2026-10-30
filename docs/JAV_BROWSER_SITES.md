# JAV Userscript Site List

Sites, mirror domains, and detection methods are maintained in the [full site table of peach-mitao/peach-userscript](https://github.com/peach-mitao/peach-userscript/blob/main/docs/SITES.md). The single machine-readable source is that repository's [`jav-sites.json`](https://github.com/peach-mitao/peach-userscript/blob/main/jav-sites.json).

Peach validates source addresses with the `web/integrations/jav-sites.json` release snapshot; the matching script, version, upstream commit, and SHA256 record are published together. For the sync flow see [Userscript](JAV_BROWSER.md#artifact-sync).

## Integration Methods

「自动识别」使用作品详情页主标题和明确番号字段；DMM、MGS 的详情地址交给 Peach 现有商品号解析器识别。识别不到或存在冲突时使用脚本菜单。「选中番号」需要先选中一个完整番号，选择脚本菜单「选中番号加入 Peach」，再点击添加按钮。两种方式都由 Peach 校验番号并执行同一条磁力搜索、云下载和入库流程。

## Gap Filling

The independent repository collects mirrors and missing source sites from the explicit site declarations of popular Sleazy JAV scripts, recording the script version, SHA256, domain ownership, HTTPS responses, and redirects. Maintainers review candidates and then update the list; over-broad wildcards, dead domains, and domains whose identity cannot be confirmed stay pending review. For sources and judgments see [site candidate review](https://github.com/peach-mitao/peach-userscript/blob/main/docs/MIRROR_REVIEW.md).

A registered domain does not mean the site is currently reachable, nor that a combined acceptance of a real browser extension, the source site, and cloud drive downloads has been obtained. The script depends on the userscript manager's access permission to registered sites.
