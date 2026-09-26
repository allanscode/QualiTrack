---
name: design-taste-frontend
description: Anti-slop frontend skill for landing pages, dashboards, and redesigns. The agent reads the brief, infers the right design direction, and ships interfaces that do not look templated. Real design systems when applicable, audit-first on redesigns, strict pre-flight check.
---

# tasteskill: Anti-Slop Frontend Skill

> Every rule below is **contextual**. None of it fires automatically. First read the brief, then pull only what fits.

---

## 0. BRIEF INFERENCE (Read the Room Before Anything Else)

Before touching code or tweaking dials, **infer what the user actually wants**. Most LLM design output is bad because the model jumps to a default aesthetic instead of reading the room.

### 0.A Read these signals first
1. **Page kind** - dashboard (operational / analytics / audit), landing (SaaS / consumer / agency), form / flow (triage / evaluation).
2. **Vibe words** the user used - "clean", "minimalist", "calm", "Linear-style", "executive", "dense", "dark tech".
3. **Reference signals** - URLs linked, screenshots pasted, products named.
4. **Audience** - Auditors, managers, directors, end-users. The audience picks the aesthetic, not personal taste.
5. **Brand assets that already exist** - WebPosto brand, tokens, Tailwind colors, dark/light theme.
6. **Quiet constraints** - accessibility, high data density, performance, mobile support.

### 0.B Anti-Default Discipline
Do not default to: AI-purple gradients, centered hero over dark mesh, three equal feature cards, generic glassmorphism on everything, infinite-loop micro-animations everywhere, Inter + slate-900.

---

## 1. THE THREE DIALS (Core Configuration)

* **`DESIGN_VARIANCE: 6`** - 1 = Perfect Symmetry, 10 = Artsy Chaos
* **`MOTION_INTENSITY: 5`** - 1 = Static, 10 = Cinematic / Physics
* **`VISUAL_DENSITY: 6`** - 1 = Art Gallery / Airy, 10 = Cockpit / Packed Data

For operational enterprise software like QualiTrack:
- Keep `DESIGN_VARIANCE: 5-6` (structured, predictable, clean).
- Keep `MOTION_INTENSITY: 4-5` (fast, responsive, feedback-driven).
- Keep `VISUAL_DENSITY: 6-7` (dense metrics, clear tables, readable labels).

---

## 2. DESIGN ENGINEERING DIRECTIVES

### 2.1 Typography & Rhythm
* Hierarchy must be obvious at 3 meters away.
* Metric values: `font-mono font-black` with tabular numbers.
* Micro-labels: uppercase, tracking-wider, `text-[10px]` or `text-[11px]`.
* Body text: readable line-height (`leading-relaxed`), max-width constrained for long text.

### 2.2 Color & Contrast Calibration
* One primary accent per context (e.g. brand-accent, emerald for success, rose for critical error).
* No washed-out gray-on-gray text. Contrast ratio must always meet WCAG AA (4.5:1).
* Status badges: tinted background with solid border (`bg-level-xxx/10 text-level-xxx border-level-xxx/20`).

### 2.3 Materiality & Elevation
* Group related data with subtle borders (`border-surface-border`), not deep black drop shadows.
* Cards should exist only when separation communicates mental grouping.
* Data tables and Bento grids must breathe without wasted vertical gaps.

### 2.4 Tactile States & Feedback
* Every interactive button must have immediate visual feedback on hover and active (`:active:scale-[0.98]`).
* Loading states should use sleek skeletons or dedicated inline spinners, not blank screens.
* Long technical snippets (like SQL logs, stack traces) belong in monospace blocks with copy/expand capabilities.
