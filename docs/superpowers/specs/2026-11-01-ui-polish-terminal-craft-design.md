# UI polish — terminal craft cues + mobile

Date: 2026-11-01  
Status: implemented (Slate variant from design/main.pen)

## Goal

Keep ngoding’s current dark palette and IBM Plex identity. Fix layout friction on Play and Problems, nudge chrome toward terminal craft, and make small screens usable. Design in pen.dev first, then port to CSS/HTML with minimal JS.

## Scope

**In**

- Play (`/play`) and Problems (`/problems`) — shared visual system
- Desktop splitter grip and drag/focus states
- Problems layout-mode cue (`Split` / `Editor` / `Shell`)
- Sidebar header and action alignment (Play tree toolbar; Problems header rhythm)
- Mobile (~720px): drawer sidebar, stacked workspace, larger splitter hit target
- pen.dev mock frames, then `style.css` + small HTML/aria tweaks; drag/layout class hooks in `play-ui.js` / `ui.js` if needed

**Out**

- Rebrand, new product features, landing page
- VM/agent/protocol changes
- Icon library overhaul (unicode/CSS grips are enough)
- Changing Problems grading or Play tree/build behavior

## Visual direction

- **Terminal craft polish**, not a redesign: denser, mono where it signals “tool,” same greens (`--bg`, `--panel`, `--line`, `--fg`, `--muted`, `--accent`, `--bad`).
- Prefer alignment and affordances over new chrome boxes.

## Desktop

### Splitter

- Keep a thin horizontal rail between editor and terminal.
- Add a centered grip (short dashed or mono ticks).
- Brighten on hover, focus, and while dragging (`:focus` / a `.dragging` class from existing pointer handlers).
- Do not turn the splitter into a thick decorative bar on desktop.

### Layout mode (Play + Problems)

- Replace the text cycle button with an **icon layout control on the right** of the toolbar (JSFiddle-style).
- Click opens a small menu with four modes, each with icon + label:
  - **Vertical** — editor above shell (today’s split; migrate `split` → `vertical`)
  - **Horizontal** — editor left, shell right (new)
  - **Editor only** — hide shell
  - **Shell only** — hide editor
- Button icon reflects the active mode; accent border when the menu is open or mode is non-default as needed.
- **Hover hints** (`title` / accessible tooltip): short name + one-line description (and keyboard hint if any).
- Same control on Play and Problems.

### Run / Build icons

- Run and Build toolbar buttons include a small lucide-style icon (`play` / `hammer`) beside the label.
- Keep text labels; icons are affordance, not icon-only (except the layout picker, which is icon-first with tooltip).

### Play sidebar

- **Two-row chrome**:
  1. Brand (`ngoding`) left; **status pill** (`ready`) and **Reset** (icon-only with tooltip on Play) on the right of that same row — `space-between`, enough gap that brand never overlaps status. Play sidebar ~260px so the row fits.
  2. **Mode chip** (`Problems` / `Play`, icon + label) centered under the brand row — accent pill, easy to spot, never overlapping status.
- Tree actions in one strip: New file / New folder / Rename / Delete — shared height and gap; avoid uneven wrap.

### Problems sidebar

- Same two-row chrome: brand + status on row 1; centered **Play** mode chip on row 2.
- Problem tabs, article, Check, sandbox details, credits: same structure; tighten spacing/alignment only.

## Mobile (~720px)

- Stack: workspace fills the viewport; sidebar becomes a collapsible drawer (overlay or top sheet).
- Top bar: brand, cross-mode link, control to open Files/Problem drawer, abbreviated status.
- Prefer Split / Editor / Shell (or equivalent focus) over fine-grained dragging; splitter hit target ~12px with the same grip cue.
- Toolbars may wrap at a consistent row height; tree actions stay one horizontal scroll strip when needed.
- Keep Run, Build, Check, Reset available; primary actions stay in the sticky toolbar.

## pen.dev deliverables

One `.pen` file under `designs/` with four frames:

1. Play desktop — sidebar alignment + splitter grip  
2. Problems desktop — layout mode cue + sidebar rhythm  
3. Play mobile (~390px wide) — drawer + stacked workspace  
4. Problems mobile — same chrome pattern  

Export PNGs for review. Iterate in pen.dev before coding if cues look wrong.

## Implementation notes

- Primary surface: `public/style.css`.
- Light markup/aria in `public/play.html`, `public/problems.html`.
- Optional: set/clear a dragging class on `#split` in `public/play-ui.js` and `public/ui.js`; strengthen layout-toggle pressed styling.
- No changes to agent, VM persistence, grading, or build detection.

## Testing

- Desktop: splitter hover/focus/drag visible; layout cycle state clear; sidebar actions aligned on Play and Problems.
- ~390px width: drawer open/close; workspace usable; primary actions reachable; no broken overflow from toolbars.
- Existing Play/Problems e2e still pass (layout CSS should not break selectors relied on by tests).

## Success criteria

- Drag and layout-mode affordances are obvious without reading docs.
- Sidebar buttons/status sit on a consistent grid.
- Phone can open files/problems and run/check without desktop-only chrome fighting the viewport.
- Product still reads as the same ngoding theme, slightly more terminal-craft.
