interface ViewTicket {
  id: number;
  subject?: string | null;
  assignee_id?: number | null;
  requester_id?: number | null;
}

interface ViewUser { id: number; name?: string | null }
interface ViewRelated { id: number }

export interface ViewTicketPage<
  TTicket extends ViewTicket,
  TUser extends ViewUser,
  TGroup extends ViewRelated,
  TOrganization extends ViewRelated,
> {
  tickets: TTicket[];
  users?: TUser[];
  groups?: TGroup[];
  organizations?: TOrganization[];
  meta?: { has_more?: boolean };
  links?: { next?: string | null };
}

function normalizedSearchText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ').trim();
}

/** Searches the actual view snapshot, including the sideloaded assignee's name. */
export function ticketMatchesViewSearch(ticket: ViewTicket, users: Map<number, ViewUser>, term: string): boolean {
  const numeric = term.trim().match(/^#?(\d+)$/);
  if (numeric) return String(ticket.id) === numeric[1];
  const query = normalizedSearchText(term);
  if (!query) return false;
  return [ticket.subject, users.get(ticket.assignee_id || 0)?.name, users.get(ticket.requester_id || 0)?.name]
    .some(value => Boolean(value && normalizedSearchText(value).includes(query)));
}

/** Reads view pages until a useful result page is filled or the view ends. */
export async function collectViewSearchPage<
  TTicket extends ViewTicket,
  TUser extends ViewUser,
  TGroup extends ViewRelated,
  TOrganization extends ViewRelated,
>(options: {
  initialUrl: string;
  term: string;
  pageSize: number;
  fetchPage: (url: string) => Promise<ViewTicketPage<TTicket, TUser, TGroup, TOrganization>>;
  validateNext: (url: string) => string;
  maxPages?: number;
}): Promise<{
  tickets: TTicket[];
  users: TUser[];
  groups: TGroup[];
  organizations: TOrganization[];
  nextCursor: string | null;
  hasMore: boolean;
}> {
  const tickets: TTicket[] = [];
  const users = new Map<number, TUser>();
  const groups = new Map<number, TGroup>();
  const organizations = new Map<number, TOrganization>();
  let url: string | null = options.initialUrl;
  let scanned = 0;
  while (url && tickets.length < options.pageSize && scanned < (options.maxPages ?? 40)) {
    const page = await options.fetchPage(url);
    if (!Array.isArray(page.tickets)) throw new Error('A view do Zendesk não retornou os chamados esperados.');
    for (const user of page.users || []) users.set(user.id, user);
    for (const group of page.groups || []) groups.set(group.id, group);
    for (const organization of page.organizations || []) organizations.set(organization.id, organization);
    tickets.push(...page.tickets.filter(ticket => ticketMatchesViewSearch(ticket, users, options.term)));
    scanned++;
    if (page.meta?.has_more) {
      if (!page.links?.next) throw new Error('A view do Zendesk não retornou o cursor da próxima página.');
      url = options.validateNext(page.links.next);
    } else {
      url = null;
    }
  }
  return {
    tickets,
    users: [...users.values()],
    groups: [...groups.values()],
    organizations: [...organizations.values()],
    nextCursor: url,
    hasMore: Boolean(url),
  };
}
