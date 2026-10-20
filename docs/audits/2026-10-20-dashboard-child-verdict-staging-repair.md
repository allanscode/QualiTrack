# Dashboard schema mismatch in staging — 20/10/2026

## Cause

The staging application at `https://qualitrack-develop.vercel.app/` is built against `secfejmccojxsvdntljx.supabase.co`. Its dashboard projection requested `monitorias.child_verdict`, but the staging table and `vw_monitorias_suporte` did not have that column. A read-only query confirmed PostgreSQL error `42703: column "child_verdict" does not exist`; the same projection without that column succeeded. The dashboard retried this permanent schema error and stayed on “Recuperando dashboard”.

## Repair

Applied the main child-verdict migrations to the staging project:

- `20261020202000_child_tickets_bypass_pj_score_route.sql` before backfill, so binary child reviews do not enter the score-based PJ route.
- `20261020175000_child_binary_verdict.sql`, `20261020175500_child_verdict_for_completed_reviews.sql`, and `20261020180000_child_verdict_from_monitoria_conclusion.sql` to add and populate the column, enforce the final binary verdict, and expose it through the support view.
- `20261020200000_child_binary_final_verdict_publication.sql` after backfill to install the future publication trigger. It was not active during historical normalization.

The three child-verdict data migrations were registered in `supabase_migrations.schema_migrations`. The two route/publication migrations remain pending in that ledger so a later ordered migration sync can reapply them after the older pending migrations in the staging project.

## Verification

- Both `monitorias.child_verdict` and `vw_monitorias_suporte.child_verdict` are selectable.
- The 589 child monitorias now have 388 `valido` and 201 `invalido`; all 589 have `score IS NULL`.
- Child-monitoria status counts remained unchanged: 550 `concluida`, 35 `pendente_revisao`, and 4 `aguardando_gestor_qualidade`.
- `child_auto_publications` remained empty. The historical backfill ran before the update publication trigger, so it did not enqueue Zendesk writes.
- PostgREST's schema cache was notified to reload.

The staging migration history still has unrelated gaps after `20261016132741`. Review pending migrations for staging-specific data and automation effects before running a full migration sync.
