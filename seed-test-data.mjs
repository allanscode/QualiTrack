import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://amyfyngzkqqzixmreeih.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFteWZ5bmd6a3Fxeml4bXJlZWloIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5OTQyNzUsImV4cCI6MjA5MzU3MDI3NX0.rKbSWx96EFJQdeCIXCRzGYiYTbKcFD7bn7ym2WauB4o';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function seed() {
  console.log('🌱 Iniciando seed do banco de dados...');

  // 1. Teams
  console.log('\n📋 Criando team...');
  const { data: team, error: teamError } = await supabase
    .from('teams')
    .insert({ name: 'Equipe Alpha', sigla: 'ALF', active: true, description: 'Equipe de atendimento Alpha' })
    .select();
  
  if (teamError) {
    console.error('❌ Erro ao criar team:', teamError);
    return;
  }
  const teamId = team[0].id;
  console.log('✅ Team criado:', teamId);

  // 2. Users
  console.log('\n👥 Criando usuários...');
  const usersToInsert = [
    { id: '00000000-0000-0000-0000-000000000001', name: 'Admin QualiTrack', email: 'admin@qualitrack.local', role: 'admin', active: true, team_ids: [teamId] },
    { id: '00000000-0000-0000-0000-000000000002', name: 'João Suporte', email: 'suporte@teste.com', role: 'suporte', active: true, team_ids: [teamId] },
    { id: '00000000-0000-0000-0000-000000000003', name: 'Maria Auditora', email: 'auditor@teste.com', role: 'qualidade', active: true, team_ids: [teamId] },
    { id: '00000000-0000-0000-0000-000000000004', name: 'Carlos Gestor Suporte', email: 'gestor.suporte@teste.com', role: 'gestor_suporte', active: true, team_ids: [teamId] },
    { id: '00000000-0000-0000-0000-000000000005', name: 'Ana Gestora Qualidade', email: 'gestor.qualidade@teste.com', role: 'gestor_qualidade', active: true, team_ids: [teamId] }
  ];

  const { data: users, error: usersError } = await supabase
    .from('users')
    .insert(usersToInsert)
    .select();

  if (usersError) {
    console.error('❌ Erro ao criar usuários:', usersError);
    return;
  }
  console.log('✅ Usuários criados:', users.length);

  // 3. Forms
  console.log('\n📋 Criando formulário...');
  const { data: form, error: formError } = await supabase
    .from('forms')
    .insert({ 
      id: 'form-suporte-geral', 
      title: 'Ficha de Atendimento Geral - Suporte', 
      description: 'Avaliação padrão de interações dos agentes de atendimento técnico.', 
      team_id: team[0].id, 
      active: true, 
      createdBy: '00000000-0000-0000-0000-000000000001', 
      sections: [] 
    })
    .select();

  if (formError) {
    console.error('❌ Erro ao criar formulário:', formError);
    return;
  }
  console.log('✅ Formulário criado:', form[0].id);

  // 4. User teams
  console.log('\n🔗 Criando user_teams...');
  const userTeamsData = [
    { user_id: '00000000-0000-0000-0000-000000000002', team_id: team[0].id },
    { user_id: '00000000-0000-0000-0000-000000000003', team_id: team[0].id },
    { user_id: '00000000-0000-0000-0000-000000000004', team_id: team[0].id },
    { user_id: '00000000-0000-0000-0000-000000000005', team_id: team[0].id }
  ];

  const { data: userTeamsResult, error: utError } = await supabase
    .from('user_teams')
    .insert(userTeamsData)
    .select();

  if (utError) {
    console.error('❌ Erro ao criar user_teams:', utError);
  } else {
    console.log('✅ User teams criados:', userTeamsResult.length);
  }

  // 5. User preferences
  console.log('\n⚙️ Criando preferências...');
  const prefsData = [
    { user_id: '00000000-0000-0000-0000-000000000002', preferences: { theme: 'system', sidebar_color: '' } },
    { user_id: '00000000-0000-0000-0000-000000000003', preferences: { theme: 'system', sidebar_color: '' } },
    { user_id: '00000000-0000-0000-0000-000000000004', preferences: { theme: 'system', sidebar_color: '' } },
    { user_id: '00000000-0000-0000-0000-000000000005', preferences: { theme: 'system', sidebar_color: '' } }
  ];

  const { data: prefsResult, error: prefsError } = await supabase
    .from('user_preferences')
    .insert(prefsData)
    .select();

  if (prefsError) {
    console.error('❌ Erro ao criar preferências:', prefsError);
  } else {
    console.log('✅ Preferências criadas:', prefs.length);
  }

  console.log('\n🎉 Seed concluído com sucesso!');
  console.log('✅ Dados de teste prontos para validação do Realtime');
}

seed().catch(console.error);