import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || '';

console.log('URL:', supabaseUrl);
console.log('Key:', supabaseAnonKey.substring(0, 10) + '...');

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function main() {
  try {
    const { data, error } = await supabase.from('users').select('*').limit(1);
    if (error) {
      console.error('Error selecting from users:', error);
      return;
    }
    console.log('Columns of users:', data ? Object.keys(data[0] || {}) : 'no data');
  } catch (err) {
    console.error('Catch error:', err);
  }
}

main();
