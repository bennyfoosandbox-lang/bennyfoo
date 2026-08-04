# Publishing & hosting

This copy of the skill publishes into **bennyfoo** (github.com/bennyfoosandbox-lang/bennyfoo), Benny Foo's profile site, already live on **Vercel** at `https://bennyfoo.vercel.app/`. There is no setup left to do — Vercel auto-deploys every push to `main`. The one thing to get right is **where inside the repo** this skill writes.

## REPO_DIR is `ai-digest/`, never the repo root

The repo root (`index.html`, `assets/`, `utilities/`) is Benny's profile homepage — do not write, overwrite, or regenerate anything there. This skill's `REPO_DIR` is the **`ai-digest/` subfolder**:

```
bennyfoo/
  index.html                  # profile homepage — never touched by this skill
  utilities/                  # unrelated tools — never touched by this skill
  assets/                     # shared site CSS, fonts, icons — read-only for this skill
  ai-digest/                  # ← REPO_DIR for this skill
    index.html                 # the AI Digest hub (topic cards) — from root-index-template.html
    <topic-slug>/
      index.html                # topic's digest list — from index-template.html
      <topic-slug>-YYYY-MMM-DD.html   # one per run — from digest-template.html
    knowledge-base/
      <topic-slug>.md           # dedup memory, unchanged format
```

So wherever the main SKILL.md says `REPO_DIR/...`, read that as `ai-digest/...` relative to the bennyfoo repo root — e.g. the "root landing page" is `ai-digest/index.html`, not `bennyfoo/index.html`.

## Design system: linked, not self-contained

Earlier versions of this skill (when it published to a standalone repo) rendered fully self-contained HTML with inline CSS. This copy instead **links the site's real stylesheet and fonts** (`../../assets/css/main.css`, Satoshi via `../../assets/fonts/*`) so every digest page matches the profile site's actual design system — same ink/paper/orange palette, same card and pill components — and stays in sync automatically if that stylesheet ever changes. The templates already have these paths wired in; just fill the placeholders, don't add new inline `<style>` blocks.

The shared digest CSS classes (`.digest-item`, `.digest-sources`, `.digest-dot`, `.digest-run`, `.digest-legend`, `.digest-tally`, `.digest-nav-links`, `.digest-footnote`, `.digest-body`) live in `bennyfoo/assets/css/main.css` under the "AI Digest" section, built on top of the site's existing `.util-hero` / `.util-section` / `.util-grid` / `.util-card` patterns used by the Utilities pages. Reuse those classes; don't invent new ones per run.

## Regenerating the topic index each run

After writing the new digest, rebuild `ai-digest/{slug}/index.html` from `assets/index-template.html`:
- List every `{slug}-*.html` file in the folder (exclude `index.html`), sort **newest first** by the date in the filename.
- Emit one row per digest into `{{ROWS}}`:
  ```html
  <a class="digest-run" href="./{slug}-2026-Jul-20.html">
    <span class="digest-run-date">20 Jul 2026</span>
    <span class="digest-run-count">5 items</span>
  </a>
  ```
- Fill `{{TOPIC}}`, `{{SLUG}}` and `{{COUNT}}`.

## Regenerating the AI Digest hub each run

`ai-digest/index.html` (from `assets/root-index-template.html`) lists every topic and links into its per-topic index. Rebuild it on every run so new topics appear:
- Scan directories directly under `ai-digest/`, skipping `knowledge-base`. A directory is a topic if it contains an `index.html`.
- For each topic: title from `knowledge-base/{slug}.md` frontmatter (`topic:`), digest count = number of `{slug}-*.html` files, latest date parsed from the newest filename.
- Emit one card per topic into `{{CARDS}}`, most-recently-updated first:
  ```html
  <a class="util-card" href="./{slug}/index.html">
    <span class="util-card-tag">{short tag, e.g. "Business · Daily"}</span>
    <h3>{topic title}</h3>
    <p>{one-line description of the topic}</p>
    <span class="util-card-go">{N} digests · latest {DD Mon YYYY} →</span>
  </a>
  ```
  The tag and description are only meaningful the *first* time a topic appears — write something short and specific, then carry it forward unchanged on later regenerations (don't reword it every run). Only the count and latest date need to update each time.

## Adding the topic to site navigation

If this is the **first-ever** topic for the site (i.e. `ai-digest/` doesn't exist yet), also add "AI Digest" to the main nav and footer of `bennyfoo/index.html` and every `bennyfoo/utilities/*.html` page — see any existing nav for the pattern (`<a href="ai-digest/">AI Digest</a>` from the root, `<a href="../ai-digest/">AI Digest</a>` from one level down). This is a one-time change; skip it once the link already exists.

## Runtime citation checker

Unchanged in behavior from earlier versions: a best-effort, client-side, no-cors liveness probe (`.digest-dot` classes driven by the inline `<script>` at the bottom of `digest-template.html`). It reports "domain responded / didn't," not a real HTTP status, because static hosting can't do a server-side check without a serverless function. That's an acceptable tradeoff here — bennyfoo is a Vercel project already, so a `/api/check.js` server-side upgrade (real HTTP status, no CORS limit) is possible later if the best-effort signal ever feels too soft; it isn't built yet, so don't assume it exists.
