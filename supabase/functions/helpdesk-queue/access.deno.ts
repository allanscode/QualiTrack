import { assertEquals, assertThrows } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import { canReadQueueTicket, trustedZendeskCursor } from './access.ts';

Deno.test('Zendesk cursor is pinned to the configured host and queue path', () => {
  const path = '/api/v2/views/123/tickets.json';
  assertEquals(trustedZendeskCursor(`https://company.zendesk.com${path}?page=2`, 'company', path),
    `https://company.zendesk.com${path}?page=2`);
  assertThrows(() => trustedZendeskCursor('https://attacker.example/collect', 'company', path));
  assertThrows(() => trustedZendeskCursor('https://company.zendesk.com/api/v2/users.json', 'company', path));
  assertThrows(() => trustedZendeskCursor('https://company.zendesk.com.evil.example/api/v2/views/123/tickets.json', 'company', path));
  assertThrows(() => trustedZendeskCursor('https://company.zendesk.com/api/v2/search.json?query=other',
    'company', '/api/v2/search.json', 'type:ticket'));
});

Deno.test('distributed tickets require the current monitor owner', () => {
  assertEquals(canReadQueueTicket('qualidade', 'monitor-1', 'negativas', 'monitor-2'), false);
  assertEquals(canReadQueueTicket('qualidade', 'monitor-1', 'filhos', 'monitor-1'), true);
  assertEquals(canReadQueueTicket('qualidade', 'monitor-1', 'filhos', null), false);
  assertEquals(canReadQueueTicket('gestor_qualidade', 'supervisor', 'filhos', 'monitor-1'), true);
  assertEquals(canReadQueueTicket('suporte', 'agent', 'positivas', null), false);
});
