---
name: zap-context
description: Generate accurate context about what a Zap is—triggers, actions, data flow, build/test/publish, and related Zap workflow concepts. Use when explaining Zaps, modeling Zap-like workflows, writing product copy or docs about automation, or when the user asks what a Zap is / how Zapier workflows work.
disable-model-invocation: true
---

# Zap Context

Generate grounded context about Zapier Zaps from official Zapier Help concepts. Prefer this skill’s definitions over improvising Zap terminology.

Primary source: [What is a Zap?](https://help.zapier.com/hc/en-us/articles/8496309697421-What-is-a-Zap)

For deeper topics (triggers vs polling, field types, mapping, testing, glossary), read [reference.md](reference.md).

## Core definition

A **Zap** is a workflow that connects apps to automate repetitive tasks. It consists of:

- **Trigger** — the event that starts the Zap (e.g. new email, new spreadsheet row). Zapier watches for this event and runs the Zap each time it occurs.
- **Action(s)** — what the Zap does after it triggers (e.g. create a contact, send a message, update a record). A Zap can have one or more actions.

## Data flow

Each step has fields. Values are either:

- **Static** — the same every run (typed directly)
- **Dynamic** — change each run via **field mapping** from a previous step (trigger or earlier action)

Example: map a lead’s email from the trigger into the Email field of a Create Contact action.

## Build lifecycle

1. **Build** — choose trigger/action apps and events; map fields in the Zap editor
2. **Test** — test each step; test records are sample data and may differ from live runs
3. **Publish** — turn the Zap on; it only processes **new** data created after publish

## Canonical example

Sales leads from Facebook Lead Ads → HubSpot:

1. Trigger: Facebook Lead Ads → New Lead
2. Action: HubSpot → Create Contact
3. Action: HubSpot → Create Deal
4. Action: Slack → Send Channel Message

## How to generate context

When asked for Zap context, produce a clear brief (or expand as requested) covering:

1. One-sentence Zap definition
2. Trigger vs action
3. Static vs dynamic / field mapping
4. Build → Test → Publish (and “new data only after publish”)
5. Optional: 1 short multi-step example
6. Optional: related concepts from [reference.md](reference.md) if the question needs them (polling vs instant, tasks, filters, paths, field types, testing caveats)

### Output rules

- Use Zapier terms consistently: Zap, trigger, action, step, field mapping, test record, publish, task
- Do not invent product features not covered here or in reference.md
- If unsure, say so and point to the relevant Help article listed in reference.md
- Keep default answers concise; expand only when the user asks for depth

## Source index

| Topic | Article |
| --- | --- |
| What is a Zap | https://help.zapier.com/hc/en-us/articles/8496309697421-What-is-a-Zap |
| Quick start | https://help.zapier.com/hc/en-us/articles/22234847450893-Zap-workflows-quick-start-guide |
| Set up trigger | https://help.zapier.com/hc/en-us/articles/8496288188429-Set-up-your-Zap-trigger |
| How triggers work | https://help.zapier.com/hc/en-us/articles/8496244568589-How-Zap-triggers-work |
| Set up action | https://help.zapier.com/hc/en-us/articles/8496257774221-Set-up-your-Zap-action |
| Field types | https://help.zapier.com/hc/en-us/articles/8496259603341-Field-types-in-Zap-workflows |
| Map fields | https://help.zapier.com/hc/en-us/articles/8496343026701-Send-data-between-steps-by-mapping-fields |
| Test steps | https://help.zapier.com/hc/en-us/articles/18811411817741-Test-Zap-steps |
| Key concepts | https://help.zapier.com/hc/en-us/articles/8496181725453-Learn-key-concepts-in-Zap-workflows |
