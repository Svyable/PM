# PM Project Fleets — Mission-first workspace

PM can initialize an existing ChatGPT Project as a set of specialized conversation workstreams.

## Quickstart

1. Create a ChatGPT Project using ChatGPT's own interface and open its Project overview.
2. Open PM's native Chrome side panel.
3. Choose **Seed a project fleet**.
4. Select Business Model Lab, Scientific Research Lab, Math Proof Engine, or Brainswarm.
5. Write the shared Project mission, including constraints and desired deliverables.
6. Inspect the role preview. The default six roles are distinct; a larger count creates additional independent tracks.
7. Choose effort (High by default), then Launch. First validate with one or two chats in a disposable Project.
8. PM sends each role a different prompt and records the verified new conversation's role mapping in local Chrome storage.
9. For later work, choose **Continue a saved project fleet** to return to the same conversation IDs with role-specific follow-ups.

## Blueprint roles

| Blueprint | Primary roles |
|---|---|
| Business Model Lab | Opportunity Architect; Customer Investigator; Unit Economics Analyst; Competitive Intelligence; Go-to-Market Strategist; Investor / Red Team |
| Scientific Research Lab | Research Question; Literature & Provenance; Experimental Designer; Methodology & Statistics; Replication & Falsification; Scientific Synthesis |
| Math Proof Engine | Problem Formalizer; Example Explorer; Lemma Architect; Counterexample Hunter; Independent Prover; Proof Auditor |
| Brainswarm | Systems Architect; Frontier Explorer; Pragmatic Operator; Adversarial Critic; Evidence Hunter; Integration Lead |

For larger fleets PM creates independent tracks with distinct assignments. The template is a starting architecture, not a claim of automatic inter-chat collaboration.

## Continuation semantics

Only chats PM has verified and recorded belong to a fleet's role ledger. The ledger is kept locally in Chrome's extension storage, keyed to Project ID. It holds role mapping, conversation ID/URL, mission, template and continuation cycle. PM will not invent role mappings for unrelated old threads.

PM cannot automatically read sibling conversations, cross-post their answers or synthesize outputs behind the scenes. Every role generates a human-readable **Cross-thread handoff** to support human project-level coordination. This is semicoordinated work under a shared mission, not a connected autonomous multi-agent runtime.

If only some fleet threads were created successfully, the ledger contains only those successes. Do not blindly reseed because that could create duplicates; inspect the run and continue the verified threads.

## Submission safety

PM uses ChatGPT's visible contenteditable composer. It requires a genuine editor input transaction, finds the enabled Send control, and makes one submission attempt. If no Send button can be identified, it attempts Enter once. A disabled Send button is an actionable failure, not permission to press Enter. PM only reports a verified send after a NEW matching user message appears.

Unconfirmed submissions are never automatically repeated. Inspect the conversation before manual retries. PM cannot bypass ChatGPT account limits or guarantee ongoing compatibility with ChatGPT's evolving interface.

## Real-browser acceptance gates

- [ ] Seed one Business Model Lab thread with High effort, verify its first user message.
- [ ] Seed three different roles, verify all prompts differ and URLs are distinct.
- [ ] Continue the same three roles in their original conversations.
- [ ] Verify the panel remains visible across browser tab switches.
- [ ] Check disabled Send and changed routes cannot cause accidental duplicate messages.
- [ ] Test authenticated Chrome behavior and applicable distribution terms before public v1 launch.

See [v1 launch gates](V1_LAUNCH_CHECKLIST.md) and [the QA runbook](QA_RUNBOOK.md).
