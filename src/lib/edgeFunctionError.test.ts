import { describe, expect, it } from 'vitest';
import { edgeFunctionErrorMessage } from './edgeFunctionError';

describe('edgeFunctionErrorMessage', () => {
  it('shows the reason sent by the Edge Function instead of the generic SDK message', async () => {
    const error = Object.assign(new Error('Edge Function returned a non-2xx status code'), {
      context: new Response(JSON.stringify({ error: 'Envio não habilitado para este destinatário no ambiente.' }), { status: 403 }),
    });
    expect(await edgeFunctionErrorMessage(error, 'Falha ao convidar usuário.')).toBe('Envio não habilitado para este destinatário no ambiente.');
  });

  it('uses a clear fallback when the response has no JSON body', async () => {
    const error = Object.assign(new Error('Edge Function returned a non-2xx status code'), {
      context: new Response('Internal error', { status: 500 }),
    });
    expect(await edgeFunctionErrorMessage(error, 'Falha ao convidar usuário.')).toBe('Falha ao convidar usuário.');
  });
});
