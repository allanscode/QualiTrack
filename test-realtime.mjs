import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://amyfyngzkqqzixmreeih.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFteWZ5bmd6a3Fxeml4bXJlZWloIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5OTQyNzUsImV4cCI6MjA5MzU3MDI3NX0.rKbSWx96EFJQdeCIXCRzGYiYTbKcFD7bn7ym2WauB4o';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testRealtime() {
  console.log('🔌 Conectando ao Supabase...');
  
  // 1. Login (use credenciais válidas - substitua por credenciais reais)
  const email = 'qualidade@webposto.com.br';  // admin user from mock data
  const password = '123456';  // default password for mock users
  
  const { data: auth, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password
  });
  
  if (authError) {
    console.error('❌ Login falhou:', authError.message);
    console.log('💡 Verifique se o usuário existe e a senha está correta');
    console.log('💡 Usuários de teste: qualidade@webposto.com.br / 123456');
    return;
  }
  
  console.log('✅ Logado como:', auth.user.email);
  
  // 2. Subscribe realtime
  const channel = supabase
    .channel('test-monitorias')
    .on('postgres_changes', { 
      event: '*', 
      schema: 'public', 
      table: 'monitorias' 
    }, (payload) => {
      console.log('🔔 REALTIME EVENT RECEIVED:', payload);
      console.log('   Event:', payload.eventType);
      console.log('   New:', payload.new);
      console.log('   Old:', payload.old);
    })
    .subscribe((status) => {
      console.log('📡 Subscription status:', status);
    });
  
  // Aguarda subscribe
  await new Promise(r => setTimeout(r, 2000));
  
  // 3. Buscar IDs válidos para o insert
  console.log('🔍 Buscando IDs válidos para o teste...');
  
  // Buscar um form válido
  const { data: forms } = await supabase.from('forms').select('id').limit(1);
  const formId = forms?.[0]?.id;
  
  // Buscar um auditor (qualidade)
  const { data: auditors } = await supabase.from('users').select('id').eq('role', 'qualidade').limit(1);
  const evaluatorId = auditors?.[0]?.id;
  
  // Buscar um agente (suporte)
  const { data: agents } = await supabase.from('users').select('id').eq('role', 'suporte').limit(1);
  const evaluatedId = agents?.[0]?.id;
  
  // Buscar team
  const { data: teams } = await supabase.from('teams').select('id').limit(1);
  const teamId = teams?.[0]?.id;
  
  if (!formId || !evaluatorId || !evaluatedId || !teamId) {
    console.error('❌ Não foi possível obter IDs válidos. Verifique se há dados no banco.');
    console.log('Forms:', forms);
    console.log('Auditors:', auditors);
    console.log('Agents:', agents);
    console.log('Teams:', teams);
    await supabase.auth.signOut();
    return;
  }
  
  console.log('✅ IDs obtidos:', { formId, evaluatorId, evaluatedId, teamId });
  
  // 4. Inserir monitoria de teste
  console.log('📝 Inserindo monitoria de teste...');
  const ticketId = `TEST-RT-${Date.now()}`;
  const { data, error } = await supabase
    .from('monitorias')
    .insert({
      form_id: formId,
      evaluator_id: evaluatorId,
      evaluated_id: evaluatedId,
      ticket_id: ticketId,
      channel: 'Chat',
      ticket_date: new Date().toISOString().split('T')[0],
      analysis_date: new Date().toISOString().split('T')[0],
      status: 'pendente_revisao',
      score: 85,
      team_id: teamId
    })
    .select();
  
  if (error) {
    console.error('❌ Insert error:', error);
  } else {
    console.log('✅ Monitoria criada:', data);
  }
  
  // Aguarda realtime processar
  await new Promise(r => setTimeout(r, 3000));
  
  // Cleanup
  supabase.removeChannel(channel);
  await supabase.auth.signOut();
  console.log('✅ Teste concluído');
}

testRealtime().catch(console.error);