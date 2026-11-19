# PM — Chrome Web Store listing draft (NOT YET SUBMITTED)

Product: PM / Proceed Methodically
Version for v1 testing: 0.8.0 launch candidate
Publisher: Svyable
Category suggestion: Productivity
Language: English
Officially affiliated with OpenAI: NO

## Listing title

PM — Proceed Methodically

## Short description (draft)

Dispatch one chosen prompt across existing ChatGPT Project conversations, with visible progress and safe pause/resume controls.

## Long description (draft)

PM is a local-first command center for your ChatGPT Projects. Open a project's overview and PM docks on the right, giving you an inventory of visible chat threads and a clear way to launch a user-selected prompt across existing conversations.

Choose the number of conversations, prompt, thinking effort, and pacing. PM opens the selected chats, checks that each conversation and composer are ready, submits the prompt through the normal ChatGPT interface, and reports what it can verify.

Features:
- Persistent, collapsible Project overview command center.
- One prompt across existing conversations, newly created conversations, or a mix of both in a ChatGPT Project.
- Effort selection (High by default, subject to your ChatGPT UI and plan).
- Lazy-loaded project chat discovery and local inventory.
- Per-conversation status, pause/stop, and run-result export.
- Local project visited/open-tab tracking and best-effort generation indicators.
- No PM account or PM-operated analytics backend.

Important: PM is independent of OpenAI, not an official ChatGPT feature. It does not bypass subscriptions, rate limits or restrictions. It does not make conversations automatically collaborate, and cannot reliably detect native unread state. ChatGPT interface changes may require extension updates. Start with one conversation, and inspect uncertain sends before retrying.

## Permission justifications for review

- chatgpt.com host permissions: discover visible project conversation links and interact with the composer during user-initiated dispatch.
- tabs: open user-selected conversation tabs and display which project tabs are open.
- storage: persist user-entered prompt/settings, the active job, project inventory, and visit records locally.
- scripting: reconnect an adapter to ChatGPT tabs already open during extension installation/reload.
- alarms: recover or mark stalled local queue states after tab delays/service-worker suspension.

## Privacy practices disclosure notes

- Data handled: user-supplied prompts, ChatGPT Project URLs/IDs, visible conversation titles/snippets, timing and success/failure records, local visit timestamps.
- Storage: Chrome extension local storage. No PM-operated remote backend.
- Data sent externally as part of its purpose: when the user launches, the prompt is submitted to ChatGPT.
- No advertising SDK, remote analytics, passwords, or cookie access in the current source.
- User can disable/uninstall the extension; exported logs are files the user controls.
- Publish and review the full policy from docs/privacy.html before submitting.

## Screenshot and media checklist

- [ ] Screenshot of the real installed right-docked command center on a ChatGPT Project overview. Blur personal/private titles and snippets.
- [ ] Screenshot of the compact dispatch form including High and selected chat count.
- [ ] Screenshot of a successful, verified single-chat activity row. Avoid private chat content.
- [ ] Screenshot of an attention-needed/error status and the resume control.
- [ ] Store icon at 128 px from extension/icons/icon128.png. Inspect it at actual size.
- [ ] Promotional artwork only if truthful; never present a mock as live authenticated functionality.

## Launch gate

Do not submit this draft to the store or publicly advertise a supported v1 until:
1. The maintainer signs off on OpenAI Terms compatibility and store-policy compliance.
2. Real authenticated manual acceptance tests are complete.
3. A source license and support/security contact approach are chosen.
4. GitHub Pages and privacy policy URL are actually live.

See V1_LAUNCH_CHECKLIST.md.
