const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://amyfyngzkqqzixmreeih.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFteWZ5bmd6a3Fxeml4bXJlZWloIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5OTQyNzUsImV4cCI6MjA5MzU3MDI3NX0.rKbSWx96EFJQdeCIXCRzGYiYTbKcFD7bn7ym2WauB4o'
);

async function check() {
  const { data: users, error: usersError } = await supabase.from('users').select('id, email, role');
  console.log('Users:', users?.length || 0, usersError || '');
  
  const { data: teams, error: teamsError } = await supabase.from('teams').select('id, name');
  console.log('Teams:', teams?.length || 0, teamsError || '');
  
  const { data: forms, error: formsError } = await supabase.from('forms').select('id, title');
  console.log('Forms:', forms?.length || 0, formsError || '');
  
  const { data: monitorias, error: monError } = await supabase.from('monitorias').select('id');
  console.log('Monitorias:', monitorias?.length || 0, monError || '');
}

check().catch(console.error);