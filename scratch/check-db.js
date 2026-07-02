const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
supabase.from('segment_settings').select('intraday_leverage, intraday_type').eq('segment', 'MCX-OPT').eq('side', 'SELL').then(res => console.log(res.data));
