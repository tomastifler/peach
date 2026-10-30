# Entity Fact Seed

Peach ships `resources/seed/entities.json` with the app, using verified public text sources to reduce repeated scraping. It contains canonical names, aliases, source-site IDs, official-site and social links, person profiles, and agency and studio relationships. The seed contains no work files, user ledger, avatars, covers or any other image bytes.

## How Users Get Updates

Upgrading Peach gets the seed bundled with that version. After scanning and collection settle, the task center schedules a profile import automatically; app startup itself does not trigger the import.

The import matches only people, studios and agencies already recognized on this machine, so an empty library does not generate another person's entity set. Aliases and source IDs are used for matching, and duplicate identities and conflicts produce review artifacts; manual edits and data from other collection sources are protected by ownership. Data the seed wrote itself can be updated by newer versions, and cumulative withdrawals target only explicitly recorded erroneous facts. A record's absence from the data pack does not mean local data is deleted.

When a person's current name is a registered alias in the seed with confidence of at least 0.9, and the seed's canonical name is in Chinese characters and the identity is unique, the import adopts the Chinese canonical name and syncs the work credits. The original name is kept as an alias, and manual choices and unregistered custom names stay as they are. The ledger is backed up automatically before names are updated, and the activity record shows the number of Chinese names; the seed batch withdrawal entry can restore the original names and work credits, keeping later manual choices. See [ADR-0122](adr/0122-seed-performer-names-and-gallery-preparation.md) for details.

## How Maintainers Update

1. Complete data collection and corrections in an isolated worktree. The maintainer's real ledger is only a read-only export source, and no database file goes into the repository.
2. Use `scripts/seed_pack.py export`, explicitly giving `--db` pointing at the maintained ledger and `--version` for the incremented version. The default output is `resources/seed/entities.json` in the current app resources; the revision number of format 2 increments automatically, and cumulative withdrawals are inherited from the existing output file. Use `--previous` when a baseline must be specified, and `--withdrawals` supplies reviewed exact withdrawals.
3. Use `scripts/seed_pack.py validate` to check the pack; this entry does not open the ledger. Review the facts, sources, relationships, profiles and cumulative withdrawals in the Git diff, and confirm there are no credentials, local paths or scraping debris.
4. Test, commit and integrate the data pack together with the related corrections, through the existing GitGud/GitHub release entry. The wheel, Docker, Windows and macOS share the resource directory, and release builds must include the seed.

An example version is `2026-10-23.1`; a content change must use a version and revision higher than the current pack. Exporting the same version and the same facts repeatedly stays byte-identical; different content under the same version is rejected. Ordinary users' scans and scraping never upload data to the public repository automatically, and CI does not read the maintainer's local ledger.

A private export uses `--out` to point to a location outside the repository. The public seed and private backups use the same format, but the distribution target is explicitly chosen by the maintainer.

## Plaintext, Digests and Encryption

The public pack uses plaintext JSON, keeping fact differences reviewable. The maintainer accepts that the combination of entities included may reflect their own library; this does not authorize publishing user ledgers, media, credentials or private run records.

The SHA-256 digest of format 2 binds the version, revision, facts and cumulative withdrawals. At runtime, structural validation and the persistent import history reject content corruption, same-version replacement and revision rollback. A digest is not a digital signature and cannot resist an attacker who controls both the content and the digest; source authenticity relies on the app's existing release channels.

A public pack that every user can read is not suited to hiding content behind a shared key. Handing the key to the client also hands the decryption ability to the recipient. Private backups that need confidentiality can use a separate private key, and encryption cannot replace authorization to publish the content.

The architectural boundaries are in [ADR-0117](adr/0117-public-entity-seed-distribution.md), and exact corrections in [ADR-0106](adr/0106-seed-correction-history-and-explicit-withdrawals.md).
