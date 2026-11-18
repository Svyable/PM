# PM / Proceed Methodically

**One prompt. Many conversations.** PM is a local-first Chrome extension that initiates a user-selected prompt across existing conversations in a ChatGPT Project.

[**Download PM v0.6.0 (ZIP)**](https://github.com/Svyable/PM/raw/refs/heads/main/docs/downloads/PM-Chrome-Extension-v0.6.0.zip) · [**Product site + complete guide**](https://svyable.github.io/PM/) · [**Website source**](docs/index.html)

## Install

1. Download the standalone ZIP above and extract it.
2. Open `chrome://extensions` in Chrome, Brave, or another compatible Chromium browser.
3. Enable **Developer mode** and click **Load unpacked**.
4. Select the extracted **`extension/` folder** containing `manifest.json`.
5. Open a ChatGPT Project overview URL ending in `/project`, pin PM to the toolbar, and try **1 conversation** first.

No PM service account, backend, or telemetry.

## Use PM

Open a ChatGPT Project overview, click PM, and choose a count (1–1,000), instruction (default: `proceed methodically`), effort (default: **High**), spacing (default: 4 seconds), slow-page patience (default: 3 minutes, configurable from 1 to 10), and whether to keep launched tabs open. Click **Launch PM**.

PM scrolls the project list, queues matching links, opens each chat in a new tab, waits for the **exact queued conversation URL, reported chat ID, and visible composer**, checks the requested effort, inserts the prompt, clicks **Send**, and records the result. **Sent** now requires a newly rendered user message matching your instruction; clearing the composer does not count as proof. Dispatch is sequential; previously launched chats may continue generating at the same time. Reopen the popup to monitor, pause/resume, stop, open an affected conversation directly from its result, or export JSON logs.

**Slow-page recovery:** PM does not use Chrome's early `complete` event as proof that a conversation has loaded. A delayed or transiently wrong conversation ID does not advance the queue. After a readiness timeout, PM pauses with the same chat and tab still selected; Resume retries readiness without sending a duplicate. Results also include separate page-readiness and send-confirmation timing fields.

**Safeguards:** Existing drafts are not overwritten. Unsupported effort selections fail closed. Unconfirmed sends are not retried automatically. Repeated unexpected failures pause the run.

### Behavior and limits

- PM only targets **existing project conversations**, not new chats.
- Conversations remain independent. PM does not share their answers or coordinate reasoning across chats.
- Normal ChatGPT subscription, model and rate limits apply. PM does not bypass them.
- PM uses the visible UI, not a private ChatGPT API. Selectors can break as ChatGPT changes.
- PM keeps settings, queue and results in Chrome local storage; no PM server or analytics.
- PM is independent and **not affiliated with OpenAI**.

**Beta status:** Mock DOM and Chrome service-worker integration tests cover slow navigation, temporary mismatched conversation IDs, same-tab retry after readiness timeout, duplicate tab-event recovery, and uncertain-send circuit breaking, but successful dispatch on a live, authenticated ChatGPT session has not been independently verified. Test 1 chat, inspect the sent message, then test 5 before attempting larger batches.

## Repository layout

    extension/manifest.json       — Chrome MV3 manifest
    extension/background.js       — queue, tab launches, recovery and watchdog
    extension/content.js          — project scan, effort picker, composer and send
    extension/popup.html          — configuration and run status
    extension/popup.css
    extension/popup.js
    extension/icons/             — PM branding in PNG sizes
    docs/index.html              — single-file billboard and complete guide
    docs/downloads/              — direct install ZIP
    tests/adapter.mock.cjs       — mock scan, drafts and single-send checks
    .github/workflows/check.yml  — automated validation
    .github/workflows/pages.yml  — Pages deployment

## Test

Run `node --check extension/background.js`, `node --check extension/content.js`, `node --check extension/popup.js`, `node tests/adapter.mock.cjs`, and `unzip -t docs/downloads/PM-Chrome-Extension-v0.6.0.zip`.

See [GitHub Actions](https://github.com/Svyable/PM/actions) for CI results.

## Activate GitHub Pages (one-time owner action)

The product site has been committed at [`docs/index.html`](docs/index.html). To publish it at **https://svyable.github.io/PM/**:

1. Visit [**Svyable/PM → Settings → Pages**](https://github.com/Svyable/PM/settings/pages).
2. Under **Build and deployment → Source**, select **GitHub Actions**.
3. [Rerun **Publish PM website**](https://github.com/Svyable/PM/actions/workflows/pages.yml) or commit another change to `docs/`.

The workflow tried to create the Pages site itself, but GitHub denied that permission (`Resource not accessible by integration`). Once Pages is enabled, the included workflow will publish subsequent updates automatically.

## License

The source is publicly viewable; a redistribution license has not yet been selected. Public repository access alone does not grant open-source redistribution rights.
