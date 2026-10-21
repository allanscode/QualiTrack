# QWP / Zendesk reconciliation - 20/10/2026

The final active QWP decision was treated as the source of truth. We compared 183 final monitorias and their Zendesk tickets.

- **143 tickets** were verified with the evaluation field and verdict tags aligned to QWP.
- **40 tickets** remain divergent. Every one is `solved`; QWP says `negativa` while Zendesk still says `positiva`.
- Zendesk rejected updates for these 40 with HTTP 422 because required field **Categoria** (ID `40618174555540`) is blank. Zendesk requires it to update solved tickets. We did not infer or modify Category, status, comments, or other ticket data.
- Every attempted update sent only evaluation fields and tags, with no `comment` or `status`. Final state was re-read from Zendesk.
- The blocked ticket IDs and each ticket's final values are in the CSV evidence below.

Evidence files:

- `2026-10-20-qwp-zendesk-final-verification.csv`: final Zendesk state compared with the QWP verdict.
- `2026-10-20-qwp-zendesk-correction-results.csv`: per-ticket correction result and blocking exception.
- `2026-10-20-qwp-zendesk-divergences.csv`: initial comparison and expected QWP verdict.

## Code changes

- Standard and child publishers now align the evaluation field and tags `positiva`/`negativa`, `analisado_qa`, and `qwp_filho_avaliado` for children. They remove the opposite verdict tag.
- Closed tickets receive only field and tag updates; publishers omit comments and status.
- Regular forms with a stale child marker use normal score calculation. Critical errors no longer zero scores automatically and instead require human review.
- The child queue has a manual evaluation action.
- Migrations `20261020220000` and `20261020230000` were applied to production.

## Critical-error score reconciliation

The first migration did not select candidates because localized history text was encoded differently from the stored history. The complementary migration `20261021001000` selected the untouched cohorts by status, source, resolution, and history shape:

- **299** positive-CSAT AI monitorias still awaiting human review had their normal scores recalculated. They remain pending with answers, evidence, and critical-error records intact.
- **4** automatically completed deadline monitorias had their normal scores recalculated. They remain concluded; all recalculated scores are below 75%, so their negative verdict remains.
- Human decisions, manager-edited records, and contestations were preserved.
- The private audit table records all 303 previous zero scores and their recalculated scores.
