# Cover Framing and the Sidecar Contract

For the cover acquisition flow, see the [JAV cover skill](../.claude/skills/peach-jav-cover-workflow/SKILL.md). This file is for framing or sidecar tasks; for empirical evidence on sources and algorithms, see [Sourcing](SOURCING.md); the formal criteria, thresholds and versions live in `peach.jav_poster_crop` and `peach.face_detect`.

## Producers and Consumers

| Artifact | Generating entry point | Consumption and protection |
| --- | --- | --- |
| Face coordinates | `scripts/detect_cover_faces.py` | Keeps the normalized `cx`, `cy` and the image size; the crop axis is decided by the container ratio, and with no face the crop is centered |
| Front-cover sidecar | `scripts/poster_crop_boxes.py`, `peach.jav_poster_crop` | Stores original-image coordinates and the algorithm version, keeps the original image intact; manual boxes are not overwritten by automatic recomputation |
| Page framing | `frontend/src/card-art/framing.ts`, `frontend/src/jav-artwork.ts` | Reuses the sidecar and the shared layout, and does not copy the detection algorithm into pages |

By default only missing, version-stale or size-mismatched artifacts are recomputed, and `--redo` means explicitly recompute everything. When the algorithm changes, update the version, producers and consumers together, and verify that old sidecars are accepted and recomputed; when a running service needs to switch, use the project entry point.

## Fold Criteria

The Sobel column gradient looks for a fold that cuts out a plausible front-cover shape, rather than picking the strongest edge at a fixed percentage of the full width. The window, prominence and shape thresholds are all read from source constants.

- When a thick spine has competing peaks, choose by front-cover shape, not by which is stronger; the representative regression is ABP-968.
- The peak and the endpoint of a gradient ramp are handled separately; when the cut point does not span the full height, check the full-height seam on the right, to avoid taking the spine's text edge for a fold. ABW-147 covers the text-edge case, and TKM-005 corresponds to a known black-edge cost.
- With no full-height seam, combine isolated sharp peaks, left and right texture direction and the local baseline, to avoid cutting away front-cover content; IPZ-602, PPT-018 and ABP-627 cover the corresponding inputs.
- Crop the middle only when seams on both sides and texture together prove a centered front cover; digital-release collages, explicit full-width images and inputs failing the criteria keep following the current layout judgment.
- Wide jackets combine source, edition and image ratio, rather than judging only by a shape close to 16:9. Studios, ratio windows and exceptions follow the current implementation.

## Page Projection and Acceptance

The box expresses the front cover itself, and the page container decides the final ratio and placement; the backend does not first crop to the page shape. A traditional front cover is fully centered, and ratio padding uses the current shared derived background; for a full-width large cover, portrait fills by the main face and landscape shows it whole, with no blurred edge fill. Manual boxes and explicit full-width layouts are kept.

When verifying the algorithm and the frontend projection, check the face axis, image size, version, front-cover boundary and the actual container crop together. Behavior regression follows `tests/test_jav_poster_crop.py` and the frontend card-framing cases; passing coordinate arithmetic cannot replace actual browser pixel evidence.
