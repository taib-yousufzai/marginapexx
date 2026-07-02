const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log('Fetching all segment_settings...');
  
  // Update segment_settings
  const { data: settings, error: err1 } = await supabase
    .from('segment_settings')
    .select('*')
    .like('segment', '%OPT%')
    .eq('side', 'BUY');
    
  if (err1) {
    console.error('Error fetching segment_settings:', err1);
  } else {
    console.log(`Found ${settings.length} segment_settings for Option BUY.`);
    let updatedCount = 0;
    for (const setting of settings) {
      const { error: updateErr } = await supabase
        .from('segment_settings')
        .update({
          intraday_leverage: 10,
          holding_leverage: 10,
          intraday_type: 'Multiplier',
          holding_type: 'Multiplier'
        })
        .eq('id', setting.id);
        
      if (updateErr) {
        console.error(`Error updating setting ${setting.id}:`, updateErr);
      } else {
        updatedCount++;
      }
    }
    console.log(`Updated ${updatedCount} segment_settings.`);
  }

  // Update scalper_segment_settings
  const { data: scalperSettings, error: err2 } = await supabase
    .from('scalper_segment_settings')
    .select('*')
    .like('segment', '%OPT%')
    .eq('side', 'BUY');
    
  if (err2) {
    console.error('Error fetching scalper_segment_settings:', err2);
  } else {
    console.log(`Found ${scalperSettings.length} scalper_segment_settings for Option BUY.`);
    let updatedCount = 0;
    for (const setting of scalperSettings) {
      const { error: updateErr } = await supabase
        .from('scalper_segment_settings')
        .update({
          intraday_leverage: 10,
          holding_leverage: 10,
          intraday_type: 'Multiplier',
          holding_type: 'Multiplier'
        })
        .eq('id', setting.id);
        
      if (updateErr) {
        console.error(`Error updating scalper setting ${setting.id}:`, updateErr);
      } else {
        updatedCount++;
      }
    }
    console.log(`Updated ${updatedCount} scalper_segment_settings.`);
  }
}

run();
