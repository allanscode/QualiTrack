interface Account { id: number; email?: string; name?: string; role?: string; suspended?: boolean }
export interface AccountCheck {
  status: 'active_agent' | 'suspended_agent' | 'end_user' | 'not_found' | 'review';
  zendesk_user_id?: number;
}
export async function checkMissingZendeskAccount(
  origin: string, headers: HeadersInit, email: string, name: string,
  request: typeof fetch = fetch,
): Promise<AccountCheck> {
  const search = async (query: string): Promise<Account[]> => {
    const response = await request(`${origin}/api/v2/users/search.json?query=${encodeURIComponent(query)}&per_page=100`, {
      headers, signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`Zendesk account verification failed (${response.status})`);
    const data = await response.json();
    if (!Array.isArray(data.users) || data.next_page || data.count > data.users.length) {
      throw new Error('Incomplete Zendesk account verification');
    }
    return data.users;
  };
  const normalizedEmail = email.toLowerCase().trim();
  const matches = (await search(normalizedEmail)).filter(user => user.email?.toLowerCase().trim() === normalizedEmail);
  if (matches.length > 1) return { status: 'review' };
  if (matches.length === 1) {
    const user = matches[0];
    const status = user.role === 'end-user' ? 'end_user'
      : ['agent', 'admin'].includes(user.role || '')
        ? user.suspended === true ? 'suspended_agent' : 'active_agent' : 'review';
    return { status, zendesk_user_id: user.id };
  }
  // A changed email must not be mistaken for an absent account. Any result
  // from the name search requires manual identity review, never deactivation.
  const possible = await search(name);
  return { status: possible.length ? 'review' : 'not_found' };
}
