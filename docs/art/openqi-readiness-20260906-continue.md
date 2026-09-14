# OpenQI Readiness Check: 2026-09-06 Continue

Checked at approximately 2026-09-06 07:28-07:30 +08:00.

## Result

The existing OpenQI configuration and model-list request work. Funding recovery
is **not confirmed**. A successful model-list request contains no account balance
and does not establish that the next image request can be paid for.

No paid generation, configuration change, provider switch, account-session read,
or undocumented authenticated request was made during this check. No new image
was produced. The previously recorded two internally reviewed independent
designs therefore remain unchanged by this check.

## Current Evidence

The bundled safety client was used from `E:/知乎` with the existing private config
at `E:/CodexHome/openqi-imagegen.env`. Its content was consumed only by the client.

| Check | Observed result |
| --- | --- |
| `configure_openqi.py --config E:/CodexHome/openqi-imagegen.env status` | Exit 0; configured `true`; base URL `https://img.openqi.sbs/v1`; image model `gpt-image-2`; video model `seedance-2`. |
| `openqi_imagegen.py --config E:/CodexHome/openqi-imagegen.env models --timeout 30` | Exit 0; successful structured model-list response. The CLI does not print a success HTTP status code. |
| Current image model | `gpt-image-2` is listed; supported resolutions include `1K`, `2K`, and `4K`; supported ratios include `2:3` and `16:9`. |
| Model-list balance evidence | No balance, credits, or funding result is present. |
| Public website | Unauthenticated GET of `https://img.openqi.sbs` returned HTTP 200. |
| Public docs | Unauthenticated GET of `https://img.openqi.sbs/docs` returned HTTP 200 and referenced `/assets/index--PtjLZS1.js`. |

The website is client-rendered. Relevant public documentation and balance-label
code were inspected in its publicly referenced JavaScript asset, without cookies,
API credentials, a logged-in DOM, or a browser account store.

## Supported Balance Query

Neither the bundled API reference nor the public documentation lists a balance
or credit endpoint for the media API. The documented media routes cover models,
image generation/editing, and video creation/status/content. The bundled CLI
also has no balance or quota command.

The public website source does contain an account settings view with a credit
balance. That view obtains user data through the website's own authenticated
session. This establishes that a website balance display exists; it does not
establish that the private media API key can be used to read it. The website
session endpoint was not called, and no session credential was read.

Accordingly, no supported read-only balance query usable by the existing safe
media client was found in the checked sources. This is an evidence limit, not
proof that the service has no other supported account interface. No guessed
authentication or billing paths were probed.

## Earlier Evidence And Remaining Limit

The prior image request at 2026-09-06 06:34:52 +08:00 returned HTTP 402,
insufficient credits, and produced zero images. This is earlier evidence,
recorded in `docs/choice-outcomes-and-rewind.md` and its referenced
`output/imagegen/zhang-wei-resume-20260906/manifest.json`; the paid request was
not rerun in this check.

The current results neither confirm that the account is still empty nor confirm
that it has been replenished. Confirmation would require an actual current
account-balance result from an authorized supported interface or a report that
the account has been replenished. Model visibility alone is insufficient.

## Sources

- Skill: `E:/CodexHome/skills/openqi-imagegen/SKILL.md`.
- API reference: `E:/CodexHome/skills/openqi-imagegen/references/api.md`.
- Safe client: `E:/CodexHome/skills/openqi-imagegen/scripts/openqi_imagegen.py`.
- Safe status command: `E:/CodexHome/skills/openqi-imagegen/scripts/configure_openqi.py`.
- Public documentation: <https://img.openqi.sbs/docs>.
- Public source asset linked by that page: <https://img.openqi.sbs/assets/index--PtjLZS1.js>.

The hosted web-reader attempt returned a tool-level HTTP 503. Direct,
unauthenticated PowerShell requests to the public website succeeded afterward;
the tool-level error was not treated as an OpenQI API outage.
