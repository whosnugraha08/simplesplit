require('dotenv').config({path: '.env.local'});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
supabase.from('bot_queue').select('*').order('created_at', { ascending: false }).limit(2).then(r => console.log(JSON.stringify(r.data, null, 2)));
