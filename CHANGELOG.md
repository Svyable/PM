# PM / Proceed Methodically — Changelog

## 0.13.0 — Prime-time reliability candidate (2026-11-22)

**Focus:** trustworthy dispatch, project health, recovery, browser validation.

- **Readiness:** the native side panel checks the actual ChatGPT Project composer and reports effort when observable. No manual Reconnect action.
- **Send verification:** a read-only destination-page witness can confirm a newly submitted user turn even if a full navigation destroys the original content script. No duplicate submission.
- **Safety:** a route change after PM inserted an unsent draft pauses for inspection. Pre-insertion navigation may still use bounded automatic route repair.
- **Concurrency:** dispatch-stage updates are serialized and monotonic; stale stages cannot overwrite completed job state.
- **Fleet integrity:** failures saving a verified role-to-chat mapping are reported and pause the queue rather than hanging or resending.
- **Account limits:** visible ChatGPT rate or usage limits pause dispatch rather than trying to bypass them.
- **Background tabs:** only the actively dispatched PM-owned tab is temporarily protected from Chrome auto-discard, then returned to normal. This does not eliminate background timer throttling.
- **Testing:** real Chromium MV3 integration smoke added using an offline, synthetic ChatGPT-shaped webpage, alongside adapter, worker, fleet and packaging tests.
- **Transparency:** honest completion labels and diagnostic messages; the result export remains local to the browser.

**Release status:** candidate. A successful authenticated test against a live ChatGPT Project is a separate acceptance gate. PM is independent and not affiliated with OpenAI. No guaranteed ability to send 100 prompts without usage limits.

## 0.11.1 — Reliable Send selection

- Prefer the enabled Send control inside the target composer; never bypass disabled Send.
- One native form-submit or Enter fallback when no Send control can be identified.
- Verify new matching user turns instead of interpreting a cleared composer as success.
- Wait for a target conversation to finish generating.

## 0.11.0 — Mission-first Project Fleets

- Four specialized blueprints: Business Model Lab, Scientific Research Lab, Math Proof Engine and Brainswarm.
- Distinct workstream prompts under a common mission, role-to-chat mapping and mapped continuation.
- Live submission stages and native Chrome side-panel fleet wizard.
- Cross-thread handoffs for manual integration; no invented automatic inter-agent communication.

## 0.10.1 — Window-persistent command center

- Global Chrome side panel, available across browser tab switches.
- Automatic Project selection without a Reconnect button.
- Bounded recovery for redirects explicitly occurring before Send.

Older development builds are available in the [repository history](https://github.com/Svyable/PM). The current installer is linked from [README.md](README.md).

For the release test matrix, see [docs/V1_LAUNCH_CHECKLIST.md](docs/V1_LAUNCH_CHECKLIST.md).
