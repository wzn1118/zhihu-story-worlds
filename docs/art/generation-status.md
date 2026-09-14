# Initial Art Generation Status

Status: **stopped for style calibration** on 2026-09-06.

The user's latest correction is authoritative. The rental-apartment image was
explicitly rejected as reading like Korean webtoon art rather than the requested
last-century Japanese animation. Root also rejected the office image's long
pointed chins, shiny fragmented hair, and dark soft rendering. These images must
not be published, brightened into purported acceptance, or reused as approved
identity references.

## Requests

- There are **no in-flight requests**. All submitted image requests have ended.
- No further generation or editing request is authorized for this art worker's
  current pass. Root is taking over a single-image style calibration.
- No images have been published to `public/assets` by this worker.
- No exposure adjustment, enlargement, or other image processing has been run.
- The unexecuted publication helper has been removed to prevent accidental
  delivery of unapproved artwork.

## Retained Outputs

| World | Original PNG | Actual Pixels | Status |
| --- | --- | --- | --- |
| `velvet-alibi` | `output/imagegen/initial-scenes/double-life-v2/double-life-01.png` | 1672 x 941 | Rejected by user |
| `blue-blood` | `output/imagegen/initial-scenes/blue-blood-reference-v2/blue-blood-01.png` | 1672 x 941 | Rejected by root against latest user correction |
| `double-pursuit` | `output/imagegen/initial-scenes/double-pursuit-reference/double-pursuit-01.png` | 4096 x 2304 | Returned and inspected, unapproved; hold for root review |

Every output was inspected with `view_image`. The first two requests asked for
4K but received smaller images; they must never be described as native 4K. The
third is a real 4096 x 2304 delivery, but its tenant still has youthful eyes and
a short nose relative to the user's mature reference, so resolution alone does
not make it accepted.

The user's actual reference image was attached to both the office and corridor
requests. The rental-apartment request was already in flight when that reference
arrived; it was only compared to the reference after delivery.

## Failure And Recovery Record

- Initial `double-life` request: explicit provider content-moderation rejection,
  no delivered image. Preserved separately from the successful `double-life-v2`.
- Initial `blue-blood-reference` request: explicit provider content-moderation
  rejection, no delivered image. Preserved separately from the successful
  `blue-blood-reference-v2`.
- The subsequent requests used revised positive descriptions of the same benign
  scenes. No request with an unknown submission outcome was resubmitted.
- Each successful source PNG has its full source response, SHA-256 hash, recovery
  record, durable archive copy and cleanup receipt under ignored `output/`.
  Delivery cleanup status was `deleted` for all three successful images.
- Credentials and signed URLs were not copied into public assets or these docs.

Public URL names remain reserved only, not implemented by this pass:
`/assets/blue-blood.webp`, `/assets/velvet-alibi.webp`,
`/assets/double-pursuit.webp`. Earlier names `double-life` and `night-pursuit`
are working aliases, not canonical world ids.
