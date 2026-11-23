# PM / Proceed Methodically

**One mission. A fleet of specialized conversations.** PM is a local-first Chrome extension that can initialize a ChatGPT Project with role-specific threads, continue a saved fleet, or dispatch a single prompt across selected existing conversations.

[**Download PM v0.13.0 candidate (ZIP)**](https://github.com/Svyable/PM/raw/refs/heads/main/docs/downloads/PM-Chrome-Extension-v0.13.0.zip) · [**Product site + complete guide**](https://svyable.github.io/PM/) · [**Website source**](docs/index.html)

## Install

1. Download the standalone ZIP above and extract it.
2. Open `chrome://extensions` in Chrome, Brave, or another compatible Chromium browser.
3. Enable **Developer mode** and click **Load unpacked**.
4. Select the extracted **`extension/` folder** containing `manifest.json`.
5. **Reload your existing ChatGPT Project tab** after installing or updating the extension. On its overview page (ending in `/project`), click the PM toolbar icon or the small lower-right PM launcher to open Chrome's native side panel. Try **1 conversation** first.

No PM service account, backend, or telemetry.

## PM 0.12 — Release-candidate reliability

PM now checks the **live Project composer** before enabling Launch, without requiring a Reconnect button. The panel distinguishes a detected Project URL from a ready editor and shows ChatGPT's selected effort when observable.

Its dispatcher saves a submission baseline **before clicking Send**. If the website navigates and destroys the original content script, PM can inspect the destination conversation for a genuinely new matching user message. This is read-only recovery: it **never clicks Send a second time**. A pre-send navigation *after* text has been inserted pauses instead of automatically reinjecting a draft.

Dispatch status messages are serialized with the queue so late updates cannot resurrect completed sends. If a verified fleet send succeeds but the local role ledger cannot be saved, PM pauses and surfaces the storage problem instead of silently losing the mapping or resending.

PM also respects visible ChatGPT usage/rate-limit notices and stops dispatch rather than trying to bypass an account limit. **No backend, no private ChatGPT API, no automated cross-thread message sharing.**

For background reliability, PM temporarily marks only its **current dispatch tab** as non-discardable, then restores the tab's normal Chrome behavior after processing, on Stop, and when pausing. This guards against automatic tab discarding; it **cannot eliminate browser background timer throttling or browser-level resource freezes**. Chrome also offers [Memory Saver exceptions](https://support.google.com/chrome/answer/12929150) for sites users choose to keep active. PM never changes global Chrome performance settings.

The automated test suite now includes a [real Chromium extension smoke test](.github/workflows/browser-smoke.yml) against an **offline synthetic ChatGPT-shaped page**, covering a real browser editor transaction, Send, an existing-chat continuation, a new fleet chat, and its saved role mapping. This is independent of the mocked queue tests, but it is **not an authenticated test of ChatGPT's production website**.

Automated tests cover these paths. **Stable v1 still requires a signed-in Chrome test proving a real Send in a disposable Project.** See the [acceptance checklist](docs/V1_LAUNCH_CHECKLIST.md).

## Full Chrome Side Panel (v0.10)

PM's full command center lives in Chrome's native, resizable side panel. The Project overview retains a minimal floating launcher at the lower right; there is no injected full-height iframe or forced page resize.

The dashboard includes a live dispatch timeline with explicit **scanning / page readiness / sending / verification** stages, plus a project inventory showing:

- **Chats discovered:** visible conversations and previously scanned ones; a manual **Scan entire project** action scrolls the lazy-loaded list. This is not guaranteed to be a total until scanning finishes.
- **Open chat tabs:** Chrome tabs in that specific ChatGPT project.
- **Generating detected:** a best-effort count from responsive *open* conversation tabs whose UI currently exposes a Stop control. Closed tabs and unresponsive pages are **not** covered.
- **Visited in PM:** conversations the browser has actually activated while PM was installed, tracked locally. **Visited is not the same as read.** ChatGPT does not reliably expose a native per-chat read/unread flag through the project page.
- **Conversation inventory:** names, visible snippets and updated labels when the project DOM exposes them, linked to open the individual chat, with PM visit and open-tab annotations.

All activity and inventory information stays in Chrome local storage. PM does not scrape private API endpoints, read hidden app state, or claim to know if closed threads are generating.

## PM v0.10 — Full side panel and automatic Project connection

The browser toolbar PM icon now opens **Chrome's native side panel**, not a small popup. Keep it open while working in other tabs. Chrome controls its placement and resizable width. A compact PM launcher is also visible at the lower right of each ChatGPT Project overview; click it to open the same **window-wide** side panel that stays available when you switch tabs. Chrome requires a user gesture to open an extension side panel, so PM does not force it open without a click.

The launch form is always visible in the full panel, even when a run is paused; there is no Reconnect button. PM automatically discovers an open ChatGPT Project tab and adapts when you switch Projects. To send, keep at least one Project overview tab open and select the intended Project before launching.

If ChatGPT changes route **before** Send, PM tries restoring the originally queued conversation in the same tab up to twice, without marking it sent or moving the queue. The fail-closed logic still pauses if it cannot verify the correct route, and **never** retries an uncertain click.

**Upgrade:** stop any run created by an earlier PM version; load PM 0.10 unpacked at `chrome://extensions`, and refresh your Project page. Click the PM toolbar icon or the bottom-right on-page launcher.

## PM 0.13.0 — Stronger Send and verification

- Prefer the **enabled Send button in the active composer**, not an obsolete disabled control or an unrelated page button.
- Wait for the composer to settle after prompt injection, fail safely if it is replaced, and never overwrite a draft to coerce the editor.
- If there is no Send button, use the active composer form's `requestSubmit()` when available; otherwise attempt a single Enter event. If Send is visible but disabled, do not bypass it.
- Verify that the number of actual matching user turns increases; rerendering an *old* matching message is not success. Count connected rendered user turns even when a background tab has no visible layout box.
- Record which gesture PM attempted (Send button, form submit or Enter) and preserve uncertain outcomes without automatically retrying.

These improvements pass automated mocks but still require an authenticated signed-in Chrome test with a disposable ChatGPT Project before public stable v1. See [live QA](docs/QA_RUNBOOK.md).

## PM Project Fleets (v0.11)

PM now begins with the **Project mission**, not merely the number of copies of one prompt. Choose **Seed a project fleet** in the Chrome side panel, pick one of four blueprints, and define the mission. PM creates role-specific new conversations inside the selected Project and records the successful chat-to-role mappings in Chrome local storage.

- **Business Model Lab:** opportunity, customers, unit economics, competitive intelligence, go-to-market, investor/red-team.
- **Scientific Research Lab:** hypotheses, provenance, experiments, statistics, replication, synthesis.
- **Math Proof Engine:** formalization, examples, lemmas, counterexamples, proof attempts, proof audit.
- **Brainswarm:** systems architecture, exploration, execution, adversarial critique, evidence, integration.

Choose **Continue a saved project fleet** to reenter those *same mapped conversations* with individualized next-step instructions. Larger fleets use distinct tracks/waves, not 100 identical prompts. You create the ChatGPT Project through ChatGPT first; PM seeds and continues that selected Project.

**This is parallel work, not magical cross-chat communication.** PM cannot claim sibling conversations share live memory, nor automatically integrate their answers. Templates ask for explicit human-readable cross-thread handoffs. See the [Fleet User Guide](docs/FLEETS.md).

**Submission reliability (0.11):** PM no longer writes directly to ProseMirror's DOM if its native insertion fails. It resolves the real Send control and reports *injected, submitting, verifying*. If no send button is detectable, it makes one Enter attempt; a disabled Send remains a failure and any unconfirmed submission is never auto-retried.

## Continue existing threads or start new ones (v0.9)

PM now has three clearly defined dispatch strategies:

- **Continue existing** (default): discover existing conversations in the Project and submit the instruction to each selected thread, preserving its history.
- **Start new Project threads:** open a fresh Project overview per queued item and submit the instruction as the first message. PM verifies that ChatGPT created a conversation **inside the same Project** and that a matching new user message appeared.
- **Mixed:** choose the total conversation count and how many of those should be new. PM continues the requested existing conversations first, then creates the selected number of new conversations.

Creating a new conversation requires sending a prompt. PM does not claim to create empty conversations or automatically coordinate responses across threads. If there are fewer existing chats than requested in mixed mode, PM processes those found plus the explicitly requested new chats; it does **not** silently substitute extra new conversations.

A new chat with an uncertain send is recorded for inspection and is not retried automatically. Test one new conversation first to confirm that the current ChatGPT UI routes it to the selected Project.

### Effort-picker compatibility (0.9.1)

PM now prioritizes the visible current-effort control over generic reasoning navigation, recognizes when High is already selected, and waits longer for background tab menus to render. If the selected effort cannot be verified, PM reports the detected menu labels and **does not send**. The `Keep current` mode is a diagnostic workaround, not a promise of High effort. A Chrome background tab should not require manual focus, but browser Memory Saver or Energy Saver can delay or suspend background activity.

## Use PM

Open a ChatGPT Project overview, click PM, and choose a count (1–1,000), instruction (default: `proceed methodically`), effort (default: **High**), spacing (default: 4 seconds), slow-page patience (default: 3 minutes, configurable from 1 to 10), and whether to keep launched tabs open. Click **Launch PM**.

PM **streams the first discovered chat batch into the dispatch queue immediately** rather than waiting for a full project scan. It opens each chat in a new tab, waits for the **exact queued conversation URL, reported chat ID, and visible composer**, checks the requested effort, inserts the prompt, clicks **Send**, and records the result. **Sent** now requires a newly rendered user message matching your instruction; clearing the composer does not count as proof. Dispatch is sequential; previously launched chats may continue generating at the same time. Reopen the popup to monitor, pause/resume, stop, open an affected conversation directly from its result, or export JSON logs.

**No silent waiting:** While discovering chats and waiting for pages, the Command Center shows the current stage, discovered count, target chat and elapsed readiness time instead of an empty activity log. A full inventory scan is optional and separate from dispatch.

**Slow-page recovery:** PM does not use Chrome's early `complete` event as proof that a conversation has loaded. A delayed or transiently wrong conversation ID does not advance the queue. After a readiness timeout, PM pauses with the same chat and tab still selected; Resume retries readiness without sending a duplicate. Results also include separate page-readiness and send-confirmation timing fields.

**Safeguards:** Existing drafts are not overwritten. Unsupported effort selections fail closed. Unconfirmed sends are not retried automatically. Repeated unexpected failures pause the run.

### Behavior and limits

- PM only targets **existing project conversations**, not new chats.
- Conversations remain independent. PM does not share their answers or coordinate reasoning across chats.
- Normal ChatGPT subscription, model and rate limits apply. PM does not bypass them.
- PM uses the visible UI, not a private ChatGPT API. Selectors can break as ChatGPT changes.
- PM keeps settings, queue and results in Chrome local storage; no PM server or analytics.
- PM is independent and **not affiliated with OpenAI**.

**v1 launch candidate status:** Mock DOM, project panel and Chrome service-worker integration tests cover streaming queue discovery, slow navigation, temporary mismatched conversation IDs, same-tab retry after readiness timeout, duplicate tab-event recovery, and uncertain-send circuit breaking, but successful dispatch on a live, authenticated ChatGPT session has not been independently verified. Test 1 chat, inspect the sent message, then test 5 before attempting larger batches.

## Preparing for PM v1

**0.13.0 is a feature candidate, not a stable v1 release.** Before the product can be advertised publicly as v1, the maintainer needs to verify the extension in a signed-in Chrome session, enable GitHub Pages, approve a source license and review applicable OpenAI/Chrome Web Store terms.

- [v1 go/no-go and live-browser test checklist](docs/V1_LAUNCH_CHECKLIST.md)
- [Authenticated browser QA runbook](docs/QA_RUNBOOK.md)
- [Project Fleet templates and role-based continuation](docs/FLEETS.md)
- [Privacy and data-handling disclosure](docs/privacy.html)
- [Chrome Web Store listing and permission justifications](docs/STORE_LISTING_DRAFT.md)

The critical 0.8 changes fix missing attempt tokens on all failure outcomes, keep an unconfirmed final send in an attention-needed state, and prevent concurrent Launch clicks from starting overlapping jobs. The installer now has a reproducible source-backed build and byte-level integrity check.

## Repository layout

    extension/manifest.json       — Chrome MV3 manifest
    extension/background.js       — queue, tab launches, recovery and watchdog
    extension/content.js          — project scan, effort picker, composer and send
    extension/popup.html          — configuration and run status
    extension/popup.css
    extension/popup.js
    extension/project-panel.js — mounts persistent side panel on project pages
    extension/panel.html      — command center interface
    extension/panel.css
    extension/panel.js        — inventory and observed activity
    extension/icons/             — PM branding in PNG sizes
    docs/index.html              — single-file billboard and complete guide
    docs/downloads/              — direct install ZIP
    tests/adapter.mock.cjs       — mock scan, drafts and single-send checks
    tests/panel.mock.cjs      — dock, collapse, project-route cleanup
    scripts/package.mjs      — deterministic installer packaging
    .github/workflows/check.yml  — automated validation
    .github/workflows/pages.yml  — Pages deployment

## Verify and package

Requires Node 20+ and no third-party npm dependencies.

- node --check extension/background.js
- node --check extension/content.js
- node --check extension/popup.js
- node tests/adapter.mock.cjs
- node tests/coordinator.mock.cjs
- node tests/panel.mock.cjs
- node scripts/package.mjs --verify

To build a new deterministic archive locally, run node scripts/package.mjs. This writes to dist/ without changing the repository. Use the --write-repo option only when explicitly preparing a new verified release.

See [GitHub Actions](https://github.com/Svyable/PM/actions) for CI results.

## Activate GitHub Pages (one-time owner action)

The product site has been committed at [`docs/index.html`](docs/index.html). To publish it at **https://svyable.github.io/PM/**:

1. Visit [**Svyable/PM → Settings → Pages**](https://github.com/Svyable/PM/settings/pages).
2. Under **Build and deployment → Source**, select **GitHub Actions**.
3. [Rerun **Publish PM website**](https://github.com/Svyable/PM/actions/workflows/pages.yml) or commit another change to `docs/`.

The workflow tried to create the Pages site itself, but GitHub denied that permission (`Resource not accessible by integration`). Once Pages is enabled, the included workflow will publish subsequent updates automatically.

## License

The source is publicly viewable; a redistribution license has not yet been selected or approved by the owner. Public repository access alone does not grant open-source redistribution rights.
