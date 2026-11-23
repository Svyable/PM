# PM Project OS — Project Management Guide (v0.13)

**One mission. Many specialist conversations. One place to manage the work.**

PM's resizable Chrome side panel now includes a local, project-scoped management workspace for ChatGPT Projects. The management layer is separate from ChatGPT's native interface: it does not claim to read private backend state, coordinate invisible agents, or synchronize with other users' devices.

## Start with a Project brief

On an existing ChatGPT Project overview (/project), open PM's side panel and find **PROJECT OS / WORK MANAGEMENT**.

Write and save three fields:

- **Mission:** why the Project exists; a concise strategic or research question
- **Definition of success:** the observable output or completion condition
- **Next decisive action:** the highest-value move to make next

These fields persist locally in Chrome extension storage for **that specific Project ID**. The board has an independent revision counter; another PM side panel cannot silently overwrite a more recent change.

## Tasks and milestones

Use **New task or milestone** to add an actionable work item with a title, notes, priority, due date, optional linked ChatGPT conversation, and manually tracked status. Mark **This is a milestone** for a measurable checkpoint rather than routine work.

Statuses: **To do**, **In progress**, **Blocked**, **Done**. Priorities: **Low**, **Normal**, **High**, **Critical**. Edit tasks from their cards; change status directly; delete only after confirmation. Milestones get a separate view. The overview displays open tasks, blocked work (including blocked PM workstreams), open milestones and overdue items.

PM stores up to 500 work items per Project. Due dates are local board data, not automatically scheduled reminders. PM does not execute tasks or read the linked conversation's answer to determine completion.

## Manage conversation workstreams

In **PROJECT CONVERSATIONS**, PM lists conversations actually found in ChatGPT's Project overview or accumulated through an explicit inventory scan. Search titles and snippets, or filter by a PM workstream status:

**Untriaged**, **Working**, **Waiting**, **Blocked**, **Done**.

For each chat, you can assign the status and save a short label and notes. These annotations are **manually maintained PM metadata**, not ChatGPT native read, unread, generation, or completion signals. PM continues to show real browser observations separately: open tabs, visited-in-PM timestamps, and generation indicators sampled from responsive tabs.

Use **Select filtered** to check only conversations currently matching your filters, **Clear** to reset, and **Set selected status** to update a batch. A Project change clears the selected set to prevent sending to the wrong Project.

## Selective Project dispatch

This is the bridge from management into execution:

1. Scan or refresh the Project inventory if needed.
2. Search/filter the conversations and check the ones that should get the next prompt.
3. Press **Dispatch to selected**. PM switches the launch form to **Send to selected conversations** and sets the target count from your checked conversations.
4. Enter an instruction, select an effort level and launch.
5. PM uses its existing verified-send coordinator: correct Project and chat identity, readiness, one send gesture and a newly rendered matching user turn before success.

This is not a separate bulk messaging shortcut. Duplicate selections, mismatched Project links, invalid targets, and disabled Send controls are rejected; uncertain sends are not automatically repeated.

## Run history

The **Run history** view shows up to 40 recently completed, stopped or errored PM runs per Project: mode, number verified, number failed, number uncertain and completion time. This is local operations history, not ChatGPT's full conversation analytics. The latest run retains its detailed JSON export in PM's Live Dispatch section.

## Export and import

**Export board** downloads JSON containing the Project ID, brief, tasks, due dates, notes and tracked chat statuses. Keep that file private if notes contain sensitive details. Nothing is uploaded to a PM server.

**Import board** accepts a compatible PM Project Board v1 JSON export **for the same Project ID only**. It asks for confirmation before replacing local board content. It will not edit, delete, move or send any ChatGPT conversation. Another side panel's intervening changes cause a revision conflict, requiring a refresh instead of silent data loss. Import limit: 2 MB, 500 tasks and 1,000 annotated chat IDs.

## Fleet integration

Start a Business Model Lab, Scientific Research Lab, Math Proof Engine or Brainswarm fleet using PM's launch controls. Successful new conversation IDs and their specialist roles are saved in the fleet ledger. You can link board tasks to those chat IDs once the Project inventory has discovered them. Use **Continue a saved project fleet** to send role-specific follow-ups.

PM does not automatically aggregate sibling conversations, extract full transcripts, update task statuses based on answer content, or create a synchronized multi-user team. The board is a local control plane for people coordinating their own Project work.

## Data and limitations

- Stored locally in the Chrome profile used to install PM; not synced across devices by PM.
- Separate boards per ChatGPT Project ID; changing Projects changes the visible board.
- Not an official OpenAI product. UI selectors can break if ChatGPT changes its site.
- PM does not bypass ChatGPT message quotas or browser throttling.
- Inventory may be partial unless lazy-loaded conversations are fully scanned.
- **Visited** is PM-observed navigation, not ChatGPT unread status.
- PM statuses and deadlines are manually managed, not authoritative ChatGPT activity.
- The ZIP is a release candidate until signed-in production ChatGPT verifies existing and new-thread sends.

See the [live QA runbook](QA_RUNBOOK.md), [privacy policy](privacy.html), and [source repository](https://github.com/Svyable/PM).
