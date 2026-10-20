import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pendingModelFromConfig, loadPendingModel, DEFAULT_PENDING_MODEL } from './production-pending-model-config.mjs';

test('candidate runner uses develop model and falls back when no setting exists', () => {
  assert.equal(pendingModelFromConfig([{ model_id: 'provider/text:free' }]), 'provider/text:free');
  assert.equal(pendingModelFromConfig([]), DEFAULT_PENDING_MODEL);
  assert.equal(pendingModelFromConfig(null), DEFAULT_PENDING_MODEL);
  assert.throws(() => pendingModelFromConfig([{ model_id: 'bad model' }]), /inválido/);
});

test('candidate runner reads only the develop model setting', async () => {
  const calls = [];
  const sql = async (project, query) => {
    calls.push({ project, query });
    return calls.length === 1 ? [{ ready: true }] : [{ model_id: 'provider/text:free' }];
  };
  assert.equal(await loadPendingModel(sql, 'develop-project'), 'provider/text:free');
  assert.equal(calls.length, 2);
  assert.ok(calls.every(call => call.project === 'develop-project' && /^SELECT/.test(call.query)));
  assert.equal(await loadPendingModel(async () => [{ ready: false }], 'develop-project'), DEFAULT_PENDING_MODEL);
});
