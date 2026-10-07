import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

const id=number=>`70000000-0000-4000-8000-${String(number).padStart(12,'0')}`;
test('invalidação final de positiva: outbox futura, final e idempotente',async t=>{
  const db=new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE SCHEMA _private;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT current_setting('request.jwt.claim.role',true) $$;
    CREATE FUNCTION _private.is_quality_team_user() RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
    CREATE TABLE monitorias(id uuid PRIMARY KEY,ticket_id text,status text,active boolean DEFAULT true,
      score numeric,satisfaction_result text,form_id uuid,form_snapshot jsonb,created_at timestamptz DEFAULT now());`);
  await db.exec(await readFile(new URL('../supabase/migrations/20261007000004_final_positive_invalidation.sql',import.meta.url),'utf8'));
  const seed=async(number,extra={})=>{
    const row={id:id(number),ticket_id:String(number),status:'pendente_revisao',active:true,score:50,satisfaction_result:'Positiva',form_id:id(999),form_snapshot:{},created_at:new Date().toISOString(),...extra};
    await db.query(`INSERT INTO monitorias(id,ticket_id,status,active,score,satisfaction_result,form_id,form_snapshot,created_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,Object.values(row));
  };
  const reset=async()=>{await db.exec(`DELETE FROM monitorias; DELETE FROM final_positive_invalidation_config;
    INSERT INTO final_positive_invalidation_config(id,enabled) VALUES(true,true); SET request.jwt.claim.role='service_role';`);};
  const close=async number=>db.query("UPDATE monitorias SET status='concluida' WHERE id=$1",[id(number)]);
  const claim=async()=>(await db.query('SELECT * FROM claim_final_positive_invalidation()')).rows;
  const authorize=async work=>(await db.query('SELECT authorize_final_positive_invalidation($1,$2) AS ok',[work.id,work.lease_id])).rows[0].ok;
  const finish=async(work,state)=>(await db.query('SELECT finish_final_positive_invalidation($1,$2,$3) AS ok',[work.id,work.lease_id,state])).rows[0].ok;
  try{
    await t.test('sem backfill e sem disparo para criação, etapa pendente, nota75, negativa ou filho',async()=>{
      await reset();await seed(1,{status:'concluida'});await seed(2);await seed(3,{score:75});
      await seed(4,{satisfaction_result:'Negativa'});await seed(5,{form_id:'6c7d1e88-841b-4da9-9a66-9f1464ce896f'});
      await seed(6,{form_snapshot:{ticket_kind:'chamado_filho'}});
      await db.exec("UPDATE monitorias SET status='contestacao_negada' WHERE ticket_id='2'");
      await close(3);await close(4);await close(5);await close(6);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM final_positive_invalidation_outbox')).rows[0].n,0);
      await close(2);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM final_positive_invalidation_outbox')).rows[0].n,1);
    });
    await t.test('feature desligada não reserva; RPCs não são concedidas ao frontend',async()=>{
      await reset();await seed(7);await close(7);await db.exec('UPDATE final_positive_invalidation_config SET enabled=false');
      assert.deepEqual(await claim(),[]);
      for(const signature of ['claim_final_positive_invalidation()','authorize_final_positive_invalidation(uuid,uuid)','finish_final_positive_invalidation(uuid,uuid,text,text,text)']){
        const privileges=(await db.query("SELECT has_function_privilege('anon',$1,'EXECUTE') AS anon,has_function_privilege('authenticated',$1,'EXECUTE') AS authenticated",[signature])).rows[0];
        assert.deepEqual(privileges,{anon:false,authenticated:false});
      }
      await db.exec("SET request.jwt.claim.role='authenticated'");
      await assert.rejects(claim(),/não autorizado/);
    });
    await t.test('reserva exclusiva e confirmação idempotente sem reenfileirar update repetido',async()=>{
      await reset();await seed(8);await close(8);const work=(await claim())[0];
      assert.equal(await authorize(work),true);assert.deepEqual(await claim(),[]);
      assert.equal(await finish(work,'applied'),true);assert.equal(await finish(work,'applied'),false);
      await close(8);assert.deepEqual(await claim(),[]);
      assert.equal((await db.query('SELECT generation FROM final_positive_invalidation_outbox')).rows[0].generation,1);
    });
    await t.test('reabertura e nota corrigida revogam a autorização antes do envio',async()=>{
      await reset();await seed(9);await close(9);const first=(await claim())[0];
      await db.exec("UPDATE monitorias SET status='em_contestacao' WHERE ticket_id='9'");
      assert.equal(await authorize(first),false);assert.equal(await finish(first,'applied'),false);
      await close(9);const second=(await claim())[0];
      assert.equal(second.generation,2);assert.notEqual(first.lease_id,second.lease_id);
      await db.exec("UPDATE monitorias SET score=90 WHERE ticket_id='9'");
      assert.equal(await authorize(second),false);assert.deepEqual(await claim(),[]);
    });
    await t.test('monitoria mais nova ativa impede aplicar resultado histórico do mesmo ticket',async()=>{
      await reset();await seed(10,{created_at:'2026-01-01T00:00:00Z'});await close(10);
      await seed(11,{ticket_id:'10',created_at:'2026-02-01T00:00:00Z'});
      assert.deepEqual(await claim(),[]);
      assert.equal((await db.query('SELECT status FROM final_positive_invalidation_outbox')).rows[0].status,'skipped');
    });
    await t.test('falhas transitórias respeitam backoff e limite de oito tentativas',async()=>{
      await reset();await seed(12);await close(12);let work=(await claim())[0];await finish(work,'pending');
      assert.deepEqual(await claim(),[]);
      await db.exec("UPDATE final_positive_invalidation_outbox SET attempts=7,next_attempt_at=now()-interval '1 minute'");
      work=(await claim())[0];assert.equal(work.attempts,8);await finish(work,'pending');
      assert.equal((await db.query('SELECT status FROM final_positive_invalidation_outbox')).rows[0].status,'blocked');
    });
  }finally{await db.close();}
});
