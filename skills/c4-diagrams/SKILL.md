---
name: c4-diagrams
description: Make or refresh C4 architecture diagrams (level 1 system context, level 2 containers, level 3 components, level 4 code) for whatever project the session is in, built only from the documents and code in the current folder and the folders below it. Flags every place the written code disagrees with the documents, naming the feature, the ADRs responsible and the diagrams that show it. Writes Mermaid sources, SVG copies and a README to docs/c4/ (or c4/), publishes one private viewing page, and does it all without stopping for approval. Use whenever the user runs /c4-diagrams, or asks to "draw the architecture", "make C4 diagrams", "make a system context / container / component diagram", "diagram this system", or "update the C4 diagrams".
argument-hint: "[subfolder] [levels, e.g. 1 2]"
allowed-tools: Read, Write, Edit, Glob, Grep, Agent, Artifact, Bash(node ~/.claude/skills/c4-diagrams/build.mjs:*), Bash(git ls-files:*), Bash(git log:*), Bash(grep:*), Bash(find:*), Bash(wc:*), Bash(mkdir:*)
---

# C4 diagrams

Draw the system that this folder describes, as C4 diagrams. The diagrams are built from the folder's
own documents and code, and the user has said this skill runs **without approval**. So never ask a
question, never wait for a go-ahead and never present a plan to confirm. Make a sensible call, record
it as an assumption, and keep going. The only output is the report at the end.

`SKILL_DIR` below means the folder this file is in: `~/.claude/skills/c4-diagrams`. Always call the
helper by its full path, `~/.claude/skills/c4-diagrams/build.mjs`.

## Ground rules

- **Read only inside the root.** The root is the folder the session is running in. If the arguments
  name a subfolder of it, the root is that subfolder instead. Never read parent folders, the home
  folder or other projects.
- **Write only to the output folder** (`docs/c4/` or `c4/`, which `scan` chooses). Never edit the
  project's own documents or code, even to fix something you notice. Mention it in the report.
- **Never read a file `scan` lists as a possible secret.** Never put a secret, key, password, account
  number, email address or personal data into a diagram. The viewing page is published.
- **Levels:** draw all four by default. If the arguments name levels (`1 2`), draw only those, and
  keep the existing diagrams of other levels as they are.

## 1. Scan

```
node ~/.claude/skills/c4-diagrams/build.mjs scan <root>
```

This lists every file worth reading, grouped as docs, infra, manifests, code, pages and data. It
leaves out dependencies, build output, lock files, media and possible secrets. It also prints the
output folder and whether an earlier run's `manifest.json` exists there.

If a manifest exists, read it and every `.mmd` file next to it before anything else. Reuse their node
IDs, names, layout direction and diagram split wherever the sources still agree, so diagrams change
only where the system changed. Keep any hand edits in the `.mmd` files unless the sources now say
otherwise. Keep the manifest's `artifactUrl`.

## 2. Read

Work out what to read from the scan:

1. **Overviews first:** READMEs, architecture or design docs, CLAUDE.md, and decision records (ADRs).
2. **What runs where:** infrastructure (Terraform, CloudFormation or SAM, Docker, Kubernetes, CI
   workflows) and manifests (`package.json`, `pom.xml` and similar). These name the containers and
   their technology most reliably.
3. **Code** for levels 3 and 4: entry points (handlers, controllers, `main`), then the folders that
   form the parts of each container.
4. **Feature notes, question lists, meeting notes:** for people, outside systems and anything still
   undecided.
5. **HTML pages** are usually mockups or generated output. Read one or two only when they're the sole
   source for something.

If the scan lists more than about 60 docs, or more than about 150 code files, split the reading
across parallel `Explore` agents, one each for docs, infra plus manifests, and code. Each agent
should return facts, each with the file path it came from. Otherwise read the files yourself.

**Gather, with a source path for each:**
- people (roles that use the system);
- outside systems;
- containers (anything that runs or stores data: apps, functions, services, databases, queues,
  buckets);
- each container's technology;
- the components inside each container;
- the important classes inside each component;
- every relationship, with what it's for and how it works.

**Ignore what's no longer current:**
- folders named like `archive`, `old`, `deprecated`, `superseded`, `DecidedAgainst` or `rejected`;
- ADRs whose status is Superseded, Rejected or Deprecated;
- text struck through with `~~`.

**Later phases:** things the documents put in a later phase (Phase 2, "future", "not in MVP") are
not drawn. List them under `later` in the manifest.

**When sources disagree,** use this order, unless the project names its own source of truth (in a
README, CLAUDE.md or similar), which then wins:
1. code that exists;
2. accepted decision records, a later one over an earlier one;
3. architecture and design docs;
4. feature notes;
5. meeting notes and open-question lists.

Within one rank, the newer document wins (use `git log -1 --format=%cs -- <file>` when there's no
date in the file). Record every real disagreement between documents under `conflicts`, with what
you drew.

**When the documents disagree with code that's written,** that's a *mismatch*. It is never a plain
conflict. Draw what the code does, and record a `mismatches` entry with:
- **the feature:** its plain name, and the feature docs that describe it (feature notes, specs, user
  stories);
- **the ADRs responsible:** the decision records that decided this behaviour. Find them three ways:
  - ADRs the feature docs or the code comments cite;
  - ADRs whose decisions cover it (search the ADR folder for the feature's terms);
  - for an accepted ADR that was later amended, the amending one too.

  If no ADR covers it, use `[]`. The page then says so, which is itself worth knowing.
- **the code:** the file paths, with a line number where it helps (`src/cancel/Handler.java:42`);
- **the diagrams that show it:** every diagram where the box or arrow involved appears. Flag it
  inside each one as `conventions.md` describes.

What counts as a mismatch is anything that changes a box or an arrow. For example:
- a container, component, store or outside system that's named or built differently, missing, or
  extra;
- a relationship that goes elsewhere or uses another technology;
- behaviour a box or arrow label states (who is emailed, what is stored, which service is called).

Check every documented feature that has code, not just the ones you happen to read. Wording-only
differences that change nothing on a diagram are not mismatches. Never fix the code or the
documents. Flagging is the whole job.

**Gaps:** when the documents leave something open or unsaid, draw the most likely answer as
*assumed*: a dashed box or a dotted arrow (see `conventions.md`). Add it to `assumptions`, with the
document that comes closest to saying it. Don't invent anything with no basis at all. Leave it out.

## 3. Decide what to draw

- **Level 1, system context:** always exactly one diagram. It shows the system, its people and its
  outside systems.
- **Level 2, containers:** one diagram. It shows every container inside the system boundary, plus the
  people and outside systems they touch.
- **Level 3, components:** one diagram per container that has at least three meaningful parts. If a
  container is a managed service or a simple store (a database, bucket or queue), skip it with a
  `skipped` note. Split a container with more than about 15 components into two diagrams.
- **Level 4, code:** only for components whose code exists. Draw at most three: the ones most
  central to what the system does. If there's no code, skip the level with the reason (for example
  "no code yet; the design documents don't name classes").
- **A level without enough detail is skipped,** never padded. Each skip is a `skipped` entry with the
  reason.

## 4. Write

Read `SKILL_DIR/conventions.md` and follow it exactly. It has the colours, label format, shapes, the
assumed styles and worked examples.

In the output folder, write one `.mmd` file per diagram, with these names:
- `1-context.mmd`
- `2-containers.mmd`
- `3-components-<container-slug>.mmd`
- `4-code-<component-slug>.mmd`

Then write `manifest.json`:

```json
{
  "system": "BladeBook",
  "asOf": "YYYY-MM-DD (today)",
  "artifactUrl": "keep the earlier value, or null on a first run",
  "diagrams": [
    { "file": "1-context.mmd", "level": 1, "title": "System context",
      "summary": "One or two plain sentences on what this diagram shows.",
      "sources": ["docs/architecture.md", "README.md"] }
  ],
  "assumptions": [ { "diagram": "2-containers", "text": "What was assumed and why.", "source": "docs/x.md" } ],
  "mismatches":  [ { "id": "M1", "feature": "Late-cancellation emails",
                     "docsSay": "The coach is emailed only for cancellations inside the notice period.",
                     "codeDoes": "CancelHandler emails the coach on every cancellation.",
                     "featureDocs": ["FeatureDecriptions/cancelation.md"],
                     "adrs": ["docs/adr/ADR-009-cancellation.md"],
                     "code": ["src/cancel/CancelHandler.java:42"],
                     "diagrams": ["2-containers", "3-components-booking-api"],
                     "drawnAs": "What the code does: an email on every cancellation." } ],
  "conflicts":   [ { "text": "A says X; B says Y.", "chosen": "X", "sources": ["a.md", "b.md"] } ],
  "skipped":     [ { "level": 4, "subject": "optional container or component", "reason": "No code yet." } ],
  "later":       [ { "text": "Text messages to families (Phase 2).", "source": "docs/x.md" } ],
  "sources":     ["the 5–15 files that mattered most"]
}
```

Write titles and summaries in plain language for someone who doesn't know the system, and spell out
an acronym the first time it appears. `README.md` and `c4.html` are generated by the next step, so
don't edit them by hand.

## 5. Build

```
node ~/.claude/skills/c4-diagrams/build.mjs build <output-folder>
```

This checks the manifest, renders every diagram to `svg/<name>.svg` with the Mermaid command-line
tool, and removes `.mmd` and SVG files an earlier run made that aren't in the manifest any more. It
then writes `README.md` and the viewing page, `c4.html`. The first run downloads the Mermaid tool,
which can take a minute.

- **Exit 1, mismatch problems:** a `mismatches` entry is missing a field, or a diagram it names
  doesn't carry its flag. Fix the manifest or the `.mmd` file and run build again.
- **Exit 1, parse errors:** each failing file and its error are listed. Fix those `.mmd` files and run
  build again. If a diagram still fails after three tries, simplify it (for example, remove HTML from
  its labels).
- **Exit 3, the renderer itself failed** (no network, browser download blocked): run again with
  `--no-svg`. The README says the SVGs weren't made, and the page still renders the diagrams itself.

## 6. Publish

Publish `<output-folder>/c4.html` with the Artifact tool. It's a finished page, so don't apply any
other design steps to it.

- **First run, `artifactUrl` is null:** publish it with icon `diagram` and a one-sentence description,
  such as "C4 architecture diagrams for <system>, levels 1–4, as of <date>." Put the URL you get back
  into `manifest.json`, then run build once more so the README links to it. Don't publish again
  after that.
- **Later runs, `artifactUrl` is set:** read that URL with the Artifact tool first, then publish with
  `url` set to it, so the link stays the same. If the read says the artifact is gone or isn't the
  user's, publish a new one and replace the URL.
- **No Artifact tool in this session:** skip publishing, and say so in the report.

## 7. Report

Keep it short:
- **first, if there are any: code and documents disagree.** For each one, give its ID and feature, a
  sentence on what the documents say and what the code does, the feature docs, the ADRs responsible
  (or "no ADR covers this"), and the diagrams flagged;
- the link to the page;
- the output folder;
- which levels and diagrams were drawn, and which were skipped and why;
- how many assumptions and conflicts there are, with the one or two that matter most stated in a
  sentence each;
- anything in the project's documents that looked wrong or out of date. This is reported only,
  never edited.
