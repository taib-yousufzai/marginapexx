const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const dotenv = require('dotenv');

// Load env vars
const envFile = fs.readFileSync('.env.local');
const envConfig = dotenv.parse(envFile);

const supabase = createClient(
  envConfig.NEXT_PUBLIC_SUPABASE_URL,
  envConfig.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  console.log('--- 1. Updating demo@gmail.com segments ---');
  const demoUserId = 'dfa9b057-9187-4054-9ae6-9179c620666e';
  
  // Fetch current segments first
  const { data: profile, error: fetchErr } = await supabase
    .from('profiles')
    .select('segments')
    .eq('id', demoUserId)
    .single();

  if (fetchErr) {
    console.error('Error fetching profile:', fetchErr);
    return;
  }

  const currentSegments = profile.segments || [];
  const targetSegments = ['INDEX-FUT', 'STOCK-OPT'];
  let updatedSegments = [...currentSegments];

  targetSegments.forEach(seg => {
    if (!updatedSegments.includes(seg)) {
      updatedSegments.push(seg);
    }
  });

  console.log('Old segments:', currentSegments);
  console.log('New segments to save:', updatedSegments);

  const { error: updateErr } = await supabase
    .from('profiles')
    .update({ segments: updatedSegments })
    .eq('id', demoUserId);

  if (updateErr) {
    console.error('Error updating segments:', updateErr);
  } else {
    console.log('Successfully updated segments for demo@gmail.com!');
  }

  console.log('--- 2. Seeding COMEX instruments ---');
  const comexInstruments = [
    {
      id: 'GC=F',
      instrument_token: 0,
      tradingsymbol: 'Gold',
      name: 'Gold',
      exchange: 'COMEX',
      instrument_type: 'COMEX',
      segment: 'COMEX',
      underlying_symbol: 'Gold'
    },
    {
      id: 'SI=F',
      instrument_token: 0,
      tradingsymbol: 'Silver',
      name: 'Silver',
      exchange: 'COMEX',
      instrument_type: 'COMEX',
      segment: 'COMEX',
      underlying_symbol: 'Silver'
    },
    {
      id: 'CL=F',
      instrument_token: 0,
      tradingsymbol: 'Crude Oil',
      name: 'Crude Oil',
      exchange: 'COMEX',
      instrument_type: 'COMEX',
      segment: 'COMEX',
      underlying_symbol: 'Crude Oil'
    },
    {
      id: 'HG=F',
      instrument_token: 0,
      tradingsymbol: 'Copper',
      name: 'Copper',
      exchange: 'COMEX',
      instrument_type: 'COMEX',
      segment: 'COMEX',
      underlying_symbol: 'Copper'
    }
  ];

  const { error: seedErr } = await supabase
    .from('instruments')
    .upsert(comexInstruments, { onConflict: 'id' });

  if (seedErr) {
    console.error('Error seeding COMEX instruments:', seedErr);
  } else {
    console.log('Successfully seeded 4 COMEX instruments into instruments table!');
  }
}

run();
