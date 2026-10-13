import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planPrimaryGroupLinks } from './team-primary-group-plan.mjs';
const state = { teams: [{ id: 'pj', name: 'PJ Trindade', kind: 'team' },
  { id: 'cf', kind: 'group', zendesk_group_id: 10 }, { id: 'escala', kind: 'group', zendesk_group_id: 11 },
  { id: 'payments', kind: 'group', zendesk_group_id: 12 }],
  agents: [{ id: 'davi', name: 'Davi', primary_team_id: 'pj' }, { id: 'igor', name: 'Igor', primary_team_id: 'pj' }],
  links: [{ team_id: 'pj', group_id: 'cf' }, { team_id: 'pj', group_id: 'payments' }] };
const audit = { success: true, rows: [
  { user_id: 'davi', current_team: 'PJ Trindade', zendesk_primary_group_ids: [11] },
  { user_id: 'igor', current_team: 'PJ Trindade', zendesk_primary_group_ids: [10] }] };
test('links only the union of primary groups without mutating agents or ticket history', () => {
  const before = JSON.stringify(state);
  const [plan] = planPrimaryGroupLinks(state, audit);
  assert.deepEqual(plan.desired, ['cf', 'escala']);
  assert.deepEqual(plan.add, ['escala']);
  assert.deepEqual(plan.remove, ['payments']);
  assert.equal(JSON.stringify(state), before);
});
test('preserves all links if any active agent is missing or has ambiguous groups', () => {
  for (const ids of [[], [10, 11]]) {
    const [plan] = planPrimaryGroupLinks(state, { success: true, rows: [audit.rows[0], { ...audit.rows[1], zendesk_primary_group_ids: ids }] });
    assert.deepEqual(plan.remove, []); assert.deepEqual(plan.add, []);
    assert.deepEqual(plan.unresolved, ['Igor']);
  }
});
test('does not resolve missing groups by name or alter teams without agents', () => {
  const [plan] = planPrimaryGroupLinks(state, { success: true, rows: [audit.rows[0], { ...audit.rows[1], zendesk_primary_group_ids: [999] }] });
  assert.deepEqual(plan.remove, []);
  assert.deepEqual(planPrimaryGroupLinks({ ...state, agents: [] }, audit), []);
  assert.throws(() => planPrimaryGroupLinks(state, { success: false }));
});

test('binds legacy groups only by a unique exact name and never overwrites another ID', () => {
  const legacy = structuredClone(state);
  legacy.teams[1] = { id: 'cf', kind: 'group', name: 'Cliente Final', zendesk_group_id: null };
  const live = structuredClone(audit);
  live.rows[1].zendesk_primary_groups = ['Cliente Final'];
  assert.deepEqual(planPrimaryGroupLinks(legacy, live)[0].groupBindings, [{ id: 'cf', zendesk_group_id: 10 }]);
  legacy.teams.push({ ...legacy.teams[1], id: 'duplicate' });
  assert.deepEqual(planPrimaryGroupLinks(legacy, live)[0].remove, []);
  legacy.teams.pop(); legacy.teams[1].zendesk_group_id = 999;
  assert.deepEqual(planPrimaryGroupLinks(legacy, live)[0].remove, []);
});
