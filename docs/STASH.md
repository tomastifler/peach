# Stash Legacy: Inherited Defects and License Boundaries

Peach's code does not connect to Stash; the adapter layer and the offline import script have both been removed (ADR-0021). Whether to uninstall the local Stash
process and its generated data is a matter of local ops and has nothing to do with Peach.

This document answers only two things: which defects the data imported from Stash carries, and the license boundary that must be handled before distribution.

All of this data is kept: the `media_binding` table, the `asset.stash_scene_id` column, and assertions with `source='stash:*'` are all
provenance and are not cleaned up.

## Known Defects Inherited from Stash

The following three still affect the ledger and should be kept in mind when handling the related data.

- Stash's identity model is flat: uploaders, collections, and performers are packed into the same free-text field (the `演员:` prefix). The imported
  assertions therefore need tools such as `scripts/merge_duplicate_identities.py` to clean up; the canonical entity is the truth.
- The unique key of `asset_tag` is `(asset_id, tag)`, and `INSERT OR IGNORE` cannot store multiple sources of the same assertion,
  so provenance can only be approximated through the `source` column.
- The scale of `asset.rating` is Stash's rating100 (0–100); five stars are written as multiples of 20; revoking writes NULL.

## License Boundary

Stash v0.31.1 is AGPL-3.0. Peach did not copy its Go implementation and only called its independent process through the public protocol.

What must be resolved before distribution is FFmpeg: the copy Peach manages is a GPLv3/x264/x265 shared
bundle copied from an existing local build, with the full `LICENSE.txt` kept, solely for running this personal instance. It does not go into Git; until the source, license, and
notice obligations are handled, it cannot be distributed with the Peach installer. This item belongs to ADR-0023's release preparation phase.

Official sources: [Stash architecture](https://github.com/stashapp/stash/blob/develop/docs/ARCHITECTURE.md), [Scene schema](https://github.com/stashapp/stash/blob/v0.31.1/graphql/schema/types/scene.graphql), [AGPL-3.0](https://raw.githubusercontent.com/stashapp/stash/v0.31.1/LICENSE), [FFmpeg legal notes](https://www.ffmpeg.org/legal.html).
