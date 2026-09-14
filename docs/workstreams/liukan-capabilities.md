# Liu Kanshan API / relay lane

Delivered 2026-09-12. Router export is `createLiukanCapabilitiesRouter()` from `server/liukan/capabilities-router.ts`, mounted at `/api/liukan` before the existing progress router. Final paths: `GET /capabilities`, `POST /capabilities/run`, `GET /config`, `POST /config`, `POST /general-chat`. Frontend export `LiukanCapabilities({ onClose?, onOpenSource? })` from `src/LiukanCapabilities.tsx`; `onOpenSource(url)` lets root retain the same embedded workspace.

The existing inbox uses `POST /api/liukan/inbox/:id/chat`; root repairs the old frontend `/ask` caller. Root owns `shared/liukan.ts` and `shared/liukan-inbox.ts` source unions; they accept `relay` as well as `zhihu-zhida`.

Read-only CLI capabilities run only after explicit button submission. Personal account actions require `confirmPrivateAccess: true`; no automatic private-data request or pagination, no upload/publish, no arbitrary command execution. Private results are not written to reading memory. Source summaries remain labeled excerpts. Relay configuration is independent of game-generation configuration and saved server-side; GET only returns sanitized public fields.

## Implemented behavior

13 documented abilities: Zhihu search, global search, current hot list, Zhida answer, own contents, own followees, recent favorites, favorite lists, favorite items, knowledge bases, knowledge items, knowledge search and quota. These are useful API abilities and are not counted toward the user's separate 50 animation actions. Official CLI runtime `capabilities` and `--help` were checked. Read references: CLI, HTTP API, user API, OAuth, hackathon, hackathon content, hackathon OAuth, MCP and open-platform. CLI version `0.5.0-beta.20260826061344` is the installed runtime; Skill `0.5.3-beta.20260904115023` is the documentation package version.

All commands come from a fixed switch and use `spawn(..., { shell: false })`; request fields, resource IDs, query sizes and page bounds are validated before the child starts. At most two ability requests run at once; identical concurrent queries reuse one child. Unknown commands, uploads and shell arguments are absent. Private-account reads require a user-selected checkbox and submit button. There is no automatic pagination or polling of quota. Results expose only documented display fields; search scope remains an excerpt and user data refers specifically to the configured account. Knowledge content chunks retain order. String `NextOffset` is strictly converted within the supported page range.

The independent `LiukanConfigStore` persists at `.local/liukan/config.json` by atomic rename. Public status omits `apiKey`. Empty key fields reuse a saved key only for the same endpoint; changing the endpoint requires a replacement key. `useWorkshopRelay: true` copies the existing server-side workshop configuration only after the user clicks the copy button. Chat Completions and Responses are supported without shell invocation, with redirects disabled, a 60-second deadline, 512 KiB response cap and no automatic retries. The configured transport now serves general chat, verified progress recall and learned-post chat. Progress replay/source hashes remain enforced by the original services. General chat itself makes no private lookup or automatic generation call.

UI contains chat, abilities and settings tabs. API keys only stay in transient password-field state until saving and are never written to browser storage. Source buttons delegate to root's embedded reading workspace and contain no new-tab/top-level navigation. Result text is rendered as React text, including any source HTML markup as inert characters.

## Verification

- `npx tsc --noEmit`: passed after implementation and root integration.
- `npx tsx --test tests/liukan-capabilities.test.ts tests/liukan-zhida.test.ts tests/liukan-inbox.test.ts`: 24/24 passed, including nine new capability/config/relay tests. Relay success/partial/error cases use explicit fixtures, not paid live relay evidence.
- `npx tsx server/liukan/verify-live.ts --run-live`: real ephemeral HTTP router, one real hot request and one real general chat request, both HTTP 200; combined 2187 ms; one real hot result; 127-character answer, source `zhihu-zhida`, model `zhida-fast-1p5`. Evidence `output/liukan-capabilities/live.json` at `2026-09-12T13:09:53.680Z`. It truthfully explains how to start at the story workshop and feed a selected answer to Kanshan.
- No private-account reads, uploads, game generation or image requests were made by the live verifier. No shared server was restarted. Existing inbox/progress contracts passed the focused suite.

## Integration acceptance still owned by root

Root has mounted router and component. Root must inspect the combined desktop/mobile UI and exercise the guide/pet/source-to-game experience. This lane's real HTTP test does not claim integrated browser acceptance or verification of a newly supplied custom relay. Current real-chat evidence uses the default configured Zhida transport.
