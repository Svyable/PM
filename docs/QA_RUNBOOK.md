# PM v1 Authenticated Browser QA Runbook

This runbook is for a maintainer testing PM on a ChatGPT account they are authorized to control. Mock DOM tests are NOT sufficient for v1 acceptance.

## Preparation

1. Create a small, disposable ChatGPT Project with two or three unimportant conversations. Do not use confidential or publication-critical chats for testing.
2. Open Chrome's extension manager at chrome://extensions.
3. Install the unpacked 0.8.0 candidate and reload the Project overview tab.
4. Keep Chrome Developer Tools accessible for the PM extension service worker, the project tab and the command-center frame.
5. Record Chrome version, operating system, manifest version and the installed ZIP SHA-256. Do not share account cookies, passwords or unredacted project chat contents.

## Smoke test A: Mount and no-send project inventory

- Expected: command center appears on the right. It collapses to a PM edge tab and expands again.
- Expected: project is detected without clicking Reconnect.
- Select Scan entire project. It discovers the available test chats without sending any prompt.
- Confirm open-tab and visited counts are labelled as observed and do not claim native read/unread data.
- Navigate to an individual conversation and back. The command center disappears on the conversation route and returns on the Project overview.

Record: screenshot of the dock with private information blurred; browser console errors if any.

## Smoke test B: One verified High-effort send

- Set count=1, effort=High and prompt to a non-sensitive unique test phrase.
- Click Launch exactly once.
- Expected: PM opens the correct queued chat once and sends the exact phrase once.
- Expected: the conversation shows a new user message containing that phrase.
- Expected: PM shows SENT for that chat; not merely an emptied composer.
- Do not send again to investigate a stall until the chat is manually inspected.

Record: chat title/ID, whether effort was High, approximate elapsed time, and whether PM's status matched actual chat history.

## Smoke test C: Failure paths and safety

- Draft preservation: put an unsent draft in one test conversation, target it and confirm PM skips it promptly without overwriting the draft.
- Effort unavailable: select an effort not offered in the account's UI, if possible; PM should report a visible failure and not send with a different effort.
- Keep current: choose this option and confirm PM does not change the picker.
- Delay test: use browser developer tools to apply a slow network profile to a disposable chat. Verify PM waits on the original tab and cannot send into a different conversation.
- Two-chat run: verify the correct sequence, no duplicates and a unique attempt result for each.
- Pause, resume and stop: test with a non-sensitive disposable conversation; these commands should not claim to undo already-sent prompts.
- A final unconfirmed send should remain ATTENTION NEEDED, not success.

## Smoke test D: Recovery

- With a run paused, close and reopen the popup and project dock. State should remain consistent.
- Suspend/reload the extension service worker; a paused or uncertain send should not automatically replay.
- Reload an open ChatGPT conversation during the readiness stage. Confirm PM preserves the queued chat ID or pauses safely.
- Stop before upgrading the extension version; old active run state must not become a new unprompted send.

## Smoke test E: Scale without spamming

- Make or use a disposable Project with enough harmless chats to exercise 100+ inventory entries.
- Run Scan entire project, without sending prompts to all 100.
- Watch browser responsiveness and memory use; record time to discover each batch.
- For dispatch, only test 2–5 chats initially. A genuine 100-chat batch is not a v1 code-quality prerequisite and should not be treated as guaranteed capacity.

## Report a problem safely

Include:
- PM version and Chrome version
- Project overview URL pattern WITHOUT private identifiers
- Stage displayed by PM: scanning / waiting / sending / verifying / paused
- Approximate time and whether the browser tab eventually opened
- Exported run JSON AFTER removing prompts, titles, IDs and other private contents
- Whether the target chat actually received the message once, more than once, or not at all

Do NOT post raw ChatGPT transcripts, auth tokens, cookies or unredacted run logs to public GitHub issues.

## Owner acceptance

- [ ] All required smoke tests completed and documented
- [ ] No wrong-chat sends or unexpected duplicate sends
- [ ] No silently discarded failures or falsely completed uncertain sends
- [ ] Privacy and policy reviews completed separately
- [ ] Owner approves public v1 tag and distribution

Link this signed-off runbook to the v1 GO/NO-GO tracking issue. Keep the issue open until all non-CI gates pass.

## Smoke test F: Create Project conversations (v0.9)

- [ ] Start new with target 1, effort High, unique non-sensitive prompt. Verify ChatGPT creates a new conversation IN THE SELECTED PROJECT; confirm exact first user message appears once.
- [ ] Start new with target 2, verify two distinct chat IDs and exactly one first-message submission per chat.
- [ ] Mixed with target 3 and new count 1: verify PM first continues two existing threads, then creates one new Project conversation.
- [ ] Existing draft in the new-chat Project composer must never be overwritten.
- [ ] If a new-chat submission is unconfirmed, inspect the created/attempted chat before any follow-up. PM must not automatically retry it.
- [ ] Confirm the new-chat mode does not require a full existing-chat inventory scan.
