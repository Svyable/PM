# PM v1.0 launch gate

**State: NOT APPROVED FOR PUBLIC v1.0 RELEASE**
**Candidate: 0.10.1**
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
