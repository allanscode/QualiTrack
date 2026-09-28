/** Supabase keeps the JSON body of non-2xx function responses in error.context. */
export async function edgeFunctionErrorMessage(error: unknown, fallback: string): Promise<string> {
  if (error && typeof error === 'object' && 'context' in error) {
    const context = error.context;
    if (context instanceof Response) {
      try {
        const body: unknown = await context.clone().json();
        if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') {
          return body.error;
        }
      } catch {
        // A platform error may have no JSON response body.
      }
    }
  }
  if (error instanceof Error && error.message && !error.message.includes('non-2xx status code')) return error.message;
  return fallback;
}
