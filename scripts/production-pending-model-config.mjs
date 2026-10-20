export const DEFAULT_PENDING_MODEL = 'google/gemma-4-31b-it';

export function pendingModelFromConfig(rows) {
  const id = rows?.[0]?.model_id;
  if (!id) return DEFAULT_PENDING_MODEL;
  if (typeof id !== 'string' || !/^[a-zA-Z0-9._:-]+\/[a-zA-Z0-9._:-]+$/.test(id))
    throw new Error('Modelo configurado inválido.');
  return id;
}

export async function loadPendingModel(sql, project) {
  const table = await sql(project, `SELECT to_regclass('public.ai_model_config') IS NOT NULL AS ready`);
  if (!table[0]?.ready) return DEFAULT_PENDING_MODEL;
  return pendingModelFromConfig(await sql(project, `SELECT model_id FROM public.ai_model_config WHERE id='default'`));
}
