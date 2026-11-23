# PM v1.0 launch gate

**State: NOT APPROVED FOR PUBLIC v1.0 RELEASE**
**Candidate: 0.12.0**
**Prepared: November 18, 2026**

Green automated tests demonstrate code paths, not authenticated ChatGPT compatibility or third-party authorization.

## Automated checks

- [x] JavaScript syntax and manifest validation.
- [x] DOM mock: project scanning, drafts, effort selection and exactly one Send click.
- [x] Chrome coordinator mock: slow navigation, streaming scan, queue recovery and pause/resume.
- [x] Result messages retain the attempt token even on errors.
- [x] Last unconfirmed attempt stays ATTENTION NEEDED, not completed.
- [x] Simultaneous Launch requests cannot start two jobs.
- [x] On-page command center mount, collapse and route cleanup checks.
- [x] Reproducible installer and full ZIP/source byte integrity checks.
- [x] Public, accurate privacy disclosure drafted.
- [ ] Signed-in browser acceptance tests.

## Required real-browser acceptance tests

- [ ] Install in Chrome; no errors at chrome://extensions.
- [ ] PM dashboard mounts on Project overview, collapses, expands, and disappears on conversation navigation.
- [ ] ONE conversation at High effort: message appears once in intended chat and PM marks SENT.
- [ ] ONE conversation using Keep current: no effort-picker manipulation.
- [ ] Existing draft: preserved and skipped immediately, without a 90-second hang.
- [ ] Unsupported effort: actionable failure, not wrong-effort send or silent timeout.
- [ ] Two then five chats, including a slow page: no duplicate or wrong-chat messages.
- [ ] Pause, resume and stop during scan/load/send; no automatic duplicate replay.
- [ ] Final unconfirmed send requires explicit acknowledgment and is never retried blindly.
- [ ] Chrome service-worker restart and extension update while a run is paused.
- [ ] Project inventory scan of at least 100 rows without sending 100 messages.
- [ ] Responsive dashboard at desktop, laptop and narrow widths.
- [ ] Exported JSON contains only expected run data, not full unrelated conversation bodies.
- [ ] Test Brave separately before claiming official support.

## Compliance and distribution gates

- [ ] Review OpenAI Terms of Use on programmatic extraction and usage restrictions. PM currently gathers project chat titles/snippets from visible UI; this needs an informed permission/compliance decision before broad distribution.
- [ ] Review current Chrome Web Store developer policies, especially 2026 disclosure and limited-use requirements.
- [ ] Enable GitHub Pages under Settings → Pages → GitHub Actions, and verify a real deployment of https://svyable.github.io/PM/.
- [ ] Verify a stable public privacy policy URL and complete Web Store privacy declarations.
- [ ] Decide the repository license: MIT, Apache-2.0, or proprietary. No owner-approved grant has been made yet.
- [ ] Collect real screenshots of the working extension for the store; distinguish mock previews.
- [ ] Confirm brand/trademark/non-affiliation language and support/security reporting paths.
- [ ] Explicit owner approval for any public Chrome Web Store submission or marketing launch.

## Release procedure once all gates pass

1. Feature freeze; rerun the entire check suite on main.
2. Update the manifest and interface labels to 1.0.0.
3. Run node scripts/package.mjs --write-repo, then node scripts/package.mjs --verify.
4. Review the SHA-256 installer digest, check actual Pages deployment, and publish factual release notes.
5. Create tag v1.0.0 and publish the *verified* installable archive.
6. Submit to the Chrome Web Store only after the owner approves the store metadata and policy declarations.
7. Publish a short quickstart: one verified send before expanding to five.

## Current known limitations

- Independent conversations are not automatically collaborating agents.
- Native unread/read status is not reliably exposed; PM tracks visited tabs instead.
- Generating status only covers detected activity in responsive open tabs.
- ChatGPT UI changes may break selectors or cause unconfirmed sends.
- PM stores prompts, project metadata and visit activity locally until removal.
- Authenticated production behavior has NOT been verified by the mock test suite.

## Rollback

Keep the 0.7 installer on GitHub. Stop the run, inspect uncertain sends before manually resending, and reinstall the prior build if a regression is found.

## References

- https://openai.com/policies/terms-of-use/
- https://developer.chrome.com/docs/webstore/program-policies/
- https://developer.chrome.com/docs/webstore/troubleshooting/
- [Privacy and data handling](privacy.html)
- [Source and issue tracker](https://github.com/Svyable/PM)

### New thread creation acceptance

- [ ] One new Project chat with the exact prompt as first user message.
- [ ] Mixed run with two existing and one new chat.
- [ ] Uncertain new-chat send is never repeated automatically.

### Background-tab / High-effort compatibility gate

- [ ] With High already visible in the ChatGPT composer, PM submits once without clicking a different reasoning menu.
- [ ] With a different effort selected, PM opens the actual effort menu, selects High, and verifies it before submitting.
- [ ] Switch to another tab while the two-chat test runs; background tab processing either completes or pauses with a truthful actionable reason.
- [ ] For a focused diagnostic, choose Keep current and confirm PM does not change the current effort. This does not guarantee High.

### v0.10 native side panel / no-Reconnect gate

- [ ] PM toolbar icon opens Chrome native side panel (not a small extension popup).
- [ ] Project overview shows the small bottom-right PM launcher; it opens the same full panel on a genuine click.
- [ ] Launch form is always accessible while running/paused; there is no Reconnect button.
- [ ] Switching browser tabs does not require manual reconnect and does not change the queued Project.
- [ ] If ChatGPT navigates away before Send, PM restores the original URL in the same tab at most twice, without marking a send or duplicating it.
- [ ] For a permanently wrong route, PM pauses with an actionable reason and a Stop control.
- [ ] Browser close/reopen and service-worker restart cannot replay an uncertain Send.

- [ ] Opening PM from the Project page creates a global, window-wide side panel that remains open when the user switches Chrome tabs.

### Fleet seeding and continuation acceptance (0.11)

- [ ] Seed one chat in a disposable Project from a fleet mission, verify the exact first user message and correct Project ID.
- [ ] Seed three roles with unique prompts and distinct newly created ChatGPT conversation IDs.
- [ ] Continue the same three roles in the exact saved conversations; confirm differentiated continuation assignments.
- [ ] A failed or uncertain new-chat send must not be entered into the successful role ledger.
- [ ] No duplicate seeding in a Project that already has a saved fleet.
- [ ] Prompt appears in composer, Send becomes enabled, and exactly one submission gesture occurs with a visible confirmed user message.
- [ ] If Send remains disabled, PM does not attempt Enter or falsely report success.
- [ ] If Send is absent, only one Enter fallback is attempted and no ambiguous submission is automatically retried.

### Submission reliability v0.12.0
- [ ] One real, signed-in ChatGPT send with exactly one new user turn, correct Project and effort.
- [ ] Newly created role-specific chat has the exact first submitted prompt and a new verified ID.
- [ ] Background dispatch works while user browses other tabs; no manual focus required under ordinary Chrome conditions.
- [ ] An old identical user message re-rendering is not mistaken for a new submission.
- [ ] Disabled Send does not trigger form/Enter fallback or a success state.
- [ ] No duplicate submission after uncertainty, refresh, browser suspension or extension restart.

### PM v0.12 prime-time regression gates

- [ ] Side panel reports the actual Project composer state and effort without requiring Reconnect, and never enables launch based solely on a URL.
- [ ] After a full navigation destroys the submitting content script, a NEW exact matching user turn can be confirmed from the destination page without any repeated Send.
- [ ] Old or rerendered identical turns and stale stage messages cannot produce a false positive.
- [ ] Chat navigation after prompt injection pauses, retaining the unsent draft for inspection rather than reinjecting automatically.
- [ ] Chrome storage failure while saving a fleet role pauses with an explicit warning and never resends the verified prompt.
- [ ] Visible ChatGPT usage/rate-limit notices block dispatch; user can resume only after the limit is gone.
- [ ] Real signed-in Chrome: one existing-chat continuation AND one new Project fleet seed each produce exactly one verified user turn, with no manual tab focus.
- [ ] Review extension permissions, privacy documentation, Chrome Web Store disclosures and applicable ChatGPT service rules before wider distribution.

### PM 0.13 Project OS management acceptance
- [ ] Native side panel Project OS mission, objective, next action, task statuses, due dates and milestones persist across reload.
- [ ] Project A management data cannot appear or be overwritten from Project B; revision conflicts are reported.
- [ ] Selection and bulk status changes are scoped to real discovered Project conversations.
- [ ] Selected-only dispatcher sends exactly once to chosen known chats and nowhere else.
- [ ] Verified fleet IDs can create linked review tasks, without duplicate tasks on repeat.
- [ ] JSON export/import is same-Project and explicitly confirmed, with honest privacy disclosures.
- [ ] Real Chromium integration passes Project OS and fleet; authenticated ChatGPT production send test remains a separate release gate.
