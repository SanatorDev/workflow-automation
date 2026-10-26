# Zap context — reference

Condensed from Zapier Help “next steps” linked from [What is a Zap?](https://help.zapier.com/hc/en-us/articles/8496309697421-What-is-a-Zap). Use when SKILL.md is not enough.

## Quick start (building Zaps)

Source: [Zap workflows quick start guide](https://help.zapier.com/hc/en-us/articles/22234847450893-Zap-workflows-quick-start-guide)

Ways to build:

- Blank Zap in the Zap editor (progress saves as draft)
- Copilot (describe workflow in plain language; open beta)
- Pre-built Zap templates
- Copy/paste steps from another Zap

Built-in customization tools:

- **Search** steps — find existing data
- **Filters** — run only when conditions are met
- **Formatter** — transform text, dates, etc.
- **Delays** — pause between steps
- **Paths** — if/then branches (Pro+)

Advanced: Webhooks by Zapier, Code by Zapier, API by Zapier, Custom Actions & API Requests.

Each successful action completion counts as a **task**.

## Setting up a trigger

Source: [Set up your Zap trigger](https://help.zapier.com/hc/en-us/articles/8496288188429-Set-up-your-Zap-trigger)

1. Create a Zap → Zap editor
2. Select app + trigger event + connect account
3. Configure required/optional fields (required marked with `*`)
4. Test trigger → load test record(s) → continue with selected record

Notes:

- “New” vs “New or Updated” events behave differently
- Some apps return generic sample data, not live account data
- Successful test confirms connection/config; live behavior may differ

## How triggers work (polling vs instant)

Source: [How Zap triggers work](https://help.zapier.com/hc/en-us/articles/8496244568589-How-Zap-triggers-work)

Trigger type is defined by the app’s API — **you cannot change it**.

### Polling

Zapier periodically asks the app for data, then **deduplicates** by unique ID. Runs only for IDs not seen before.

Typical polling intervals by plan:

| Plan | Interval |
| --- | --- |
| Free | 15 minutes |
| Professional | 2 minutes |
| Team / Enterprise | 1 minute |

### Instant

App pushes events via **webhooks**. Zap runs as soon as Zapier receives the event. Shown with a lightning bolt in the editor.

### Limits

- Zaps trigger for **new** data after the Zap is on (or updated data if the trigger supports it)—not historical data from before publish
- Deduplication is per Zap; multiple Zaps on the same trigger can all fire

## Setting up an action

Source: [Set up your Zap action](https://help.zapier.com/hc/en-us/articles/8496257774221-Set-up-your-Zap-action)

1. Select app + action event + connect account
2. Configure fields (manual entry, mapped fields, or dropdown presets)
3. Test step — **live**: may create/change data in the connected app; or skip test

After test: **Data in** = what you sent; **Data out** = what the app returned (mappable in later steps).

## Field types

Source: [Field types in Zap workflows](https://help.zapier.com/hc/en-us/articles/8496259603341-Field-types-in-Zap-workflows)

Ways to fill a field: type a value, map from a previous step, or pick from a dropdown / custom value.

| Type | Notes |
| --- | --- |
| Date/time | Calendar icon; flexible natural-language and ISO formats; bad parse → may default to Zap run time |
| Dictionary | Key/value pairs |
| Dropdown | Preset options or custom value (often case-sensitive) |
| File | File object or URL; text becomes `.txt`; multiple → ZIP; 30s upload timeout |
| Line item | Arrays of objects (e.g. invoice lines); use Looping to process each |
| List | Multiple values; reorderable |
| Number / decimal | Number truncates decimals down; decimal keeps fractions; use `.` as separator |
| Password | Like string, value hidden |
| String / text | Default; string = single line, text = larger box |
| True/false | Boolean; casing/format may vary by app |

## Field mapping

Source: [Send data between steps by mapping fields](https://help.zapier.com/hc/en-us/articles/8496343026701-Send-data-between-steps-by-mapping-fields)

Field mapping connects an earlier step’s output field to a later step’s input so each run uses that run’s data (dynamic values).

Practices:

- Prefer mapped pills over typed static text when you need per-run data
- Mix static + dynamic in one field when useful
- Available fields come from test/sample data—re-test if a field is missing
- Match destination field type (date → date, number → number without currency symbols)
- Full step payload available via **Step Output** when a step needs structured context

## Testing steps

Source: [Test Zap steps](https://help.zapier.com/hc/en-us/articles/18811411817741-Test-Zap-steps)

- Testing creates a **test record** (fields + values) used to build later steps
- Trigger/search tests pull sample data from the app
- Action tests **perform the action live**
- Can test one step, all untested steps, or skip tests from Zap Status
- Modified test-record values affect building/testing only—not live published runs

## Key concepts glossary

Source: [Learn key concepts in Zap workflows](https://help.zapier.com/hc/en-us/articles/8496181725453-Learn-key-concepts-in-Zap-workflows)

| Term | Meaning |
| --- | --- |
| Action | Event the Zap performs after triggering |
| App | Integrated web service (9,000+ on Zapier) |
| Asset | Building block (Zap, Table, Form, Chatbot, Canvas, Agent) |
| Autoreplay | Pro+: auto-retry temporary step failures (account-wide; Enterprise overrides possible) |
| Filter | Restrict when the Zap continues |
| Multi-step Zap | More than one action, or includes filters/searches (paid) |
| Paths | If/then branching actions |
| Polling interval | How often polling triggers check for data |
| Premium app | Requires paid plan or trial |
| Task | One successfully completed action |
| Test record | Sample data used while building |
| Trigger | Event that starts the Zap |
| Zap | Automated workflow: trigger + one or more actions |
| Zap editor | UI to create/edit a Zap |
| Zap history | Log of runs and task usage |
| Zap outline | List of steps; selecting one opens the step sidebar |
| Zap run | One instance of trigger → actions |
