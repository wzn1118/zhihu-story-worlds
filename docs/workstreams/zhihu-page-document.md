# Zhihu native document rendering

Owner: native DOM document lane. Scope: `server/zhihu-page-document.ts` and focused tests only. Existing authenticated browser/profile and shared server remain with the integration owner.

`createZhihuPageDocument(page, posts)` clones the already-open live Zhihu document, retains original typography, layout, official image URLs and accessible stylesheets, and emits inert HTML for an `iframe sandbox="allow-same-origin"` with no scripts. Cross-origin original stylesheets remain allowlisted stylesheet links; same-origin and readable CSS are copied inline. Text selection works on real DOM rather than JPEG pixels.

Each snapshot gets a fresh UUID. Original interactive nodes and their inert counterparts share `data-redleaf-control="<document UUID>-<sequence>"`; the backend must check the current document ID before resolving a click or fill. Supported answer roots receive `data-redleaf-post` only after canonical URL or lossless decimal metadata identity matching against the server-provided post list. Old mapping attributes are replaced each time.

Scripts, frames, executable URLs, source JSON, event attributes, form submission attributes, input values, hidden controls and token-bearing data are removed. The emitted CSP disables scripts, connections, forms, objects, subframes and base URLs. Asset loading is limited to official Zhihu/Zhimg HTTPS hosts and raster data URLs. No cookies or storage are read or transferred.

Validation: all four isolated Chromium fixture cases passed: unchanged Chinese text and native selection with the original computed font size; malicious DOM/credential removal; lossless 20-digit answer identity and stale-control replacement; image dimensions and stylesheet preservation. `tsc --noEmit` passed with the current shared tree. These use a disposable browser context, not the authenticated profile. Real authenticated browser acceptance belongs to the integration owner; fixtures are not counted as real captured answers.

The first fixture discovered a transport encoding omission in the test response, now corrected to `text/html; charset=utf-8`. Browser code is a fixed application function compiled independently of tsx naming helpers; the `posts` object is passed through Playwright's structured argument channel and never interpolated into executable source.
