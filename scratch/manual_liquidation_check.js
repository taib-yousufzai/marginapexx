const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

function computeLiquidationThreshold(walletBalance, liquidationPercentage) {
  if (walletBalance <= 0 || liquidationPercentage <= 0) return 0;
  return -(walletBalance * (liquidationPercentage / 100));
}

async function runManualCheck() {
  console.log("=== STARTING MANUAL LIQUIDATION CHECK ===\n");

  // 1. Fetch profiles, open positions, and segment settings
  const [profilesRes, positionsRes, segmentSettingsRes] = await Promise.all([
    supabase.from('profiles').select('id, email, full_name, balance, auto_sqoff'),
    supabase.from('positions').select('*').eq('status', 'open'),
    supabase.from('segment_settings').select('*')
  ]);

  if (profilesRes.error) {
    console.error("Error fetching profiles:", profilesRes.error);
    return;
  }
  if (positionsRes.error) {
    console.error("Error fetching positions:", positionsRes.error);
    return;
  }
  if (segmentSettingsRes.error) {
    console.error("Error fetching segment settings:", segmentSettingsRes.error);
    return;
  }

  const profiles = profilesRes.data || [];
  const positions = positionsRes.data || [];
  const segmentSettings = segmentSettingsRes.data || [];

  console.log(`Found ${profiles.length} profiles, ${positions.length} open positions, and ${segmentSettings.length} segment settings.\n`);

  // Build maps for quick lookup
  const profilesMap = new Map(profiles.map(p => [p.id, p]));
  const segmentSettingsMap = new Map();
  for (const s of segmentSettings) {
    const key = `${s.user_id}|${s.segment}|${s.side}`;
    segmentSettingsMap.set(key, Number(s.exit_buffer ?? 0.0017));
  }

  // Group positions by user_id
  const userPositions = {};
  for (const pos of positions) {
    if (!userPositions[pos.user_id]) {
      userPositions[pos.user_id] = [];
    }
    userPositions[pos.user_id].push(pos);
  }

  let breachCount = 0;

  for (const [userId, userPosList] of Object.entries(userPositions)) {
    const profile = profilesMap.get(userId);
    if (!profile) {
      console.warn(`Warning: Position found for unknown user ID: ${userId}`);
      continue;
    }

    const balance = Number(profile.balance ?? 0);
    const autoSqoffPercent = Number(profile.auto_sqoff ?? 90);
    const threshold = computeLiquidationThreshold(balance, autoSqoffPercent);

    let totalFloatingPnl = 0;
    const posDetails = [];

    for (const pos of userPosList) {
      const ltp = Number(pos.ltp ?? pos.entry_price ?? 0);
      const entryPrice = Number(pos.entry_price ?? pos.avg_price ?? 0);
      const qty = Number(pos.qty_open ?? 0);

      if (isNaN(entryPrice) || isNaN(qty) || qty <= 0) {
        posDetails.push({
          symbol: pos.symbol,
          side: pos.side,
          qty,
          entryPrice,
          ltp,
          pnl: 0,
          status: "SKIP (NaN/Invalid)"
        });
        continue;
      }

      const exitBuffer = segmentSettingsMap.get(`${userId}|${pos.settlement}|${pos.side}`) ?? 0.0017;
      
      const pnl = pos.side === 'BUY'
        ? ((ltp * (1 - exitBuffer)) - entryPrice) * qty
        : (entryPrice - (ltp * (1 + exitBuffer))) * qty;

      totalFloatingPnl += pnl;
      posDetails.push({
        symbol: pos.symbol,
        side: pos.side,
        qty,
        entryPrice,
        ltp,
        pnl
      });
    }

    const isBreached = totalFloatingPnl <= threshold;
    const marginRatio = threshold !== 0 ? (totalFloatingPnl / threshold) * 100 : 0;

    console.log(`--------------------------------------------------`);
    console.log(`User: ${profile.full_name} (${profile.email || 'No Email'})`);
    console.log(`User ID: ${profile.id}`);
    console.log(`Balance: ₹${balance.toFixed(2)}`);
    console.log(`Auto-Sqoff threshold: ${autoSqoffPercent}% (₹${threshold.toFixed(2)})`);
    console.log(`Current floating PnL: ₹${totalFloatingPnl.toFixed(2)}`);
    console.log(`Margin Usage Ratio: ${marginRatio.toFixed(2)}%`);
    
    if (isBreached) {
      console.log(`STATUS: 🚨 BREACHED / SHOULD BE LIQUIDATED 🚨`);
      breachCount++;
    } else if (totalFloatingPnl < 0 && totalFloatingPnl <= threshold * 0.8) {
      console.log(`STATUS: ⚠️ WARNING (Close to liquidation threshold) ⚠️`);
    } else {
      console.log(`STATUS: ✅ Healthy`);
    }

    console.log("Positions:");
    for (const p of posDetails) {
      console.log(`  - ${p.side} ${p.qty}x ${p.symbol} @ Entry: ₹${p.entryPrice.toFixed(2)} | LTP: ₹${p.ltp.toFixed(2)} | PnL: ₹${p.pnl.toFixed(2)}`);
    }
  }

  console.log(`\n=========================================`);
  console.log(`MANUAL CHECK COMPLETE. Breached users: ${breachCount}`);
  console.log(`=========================================`);
}

runManualCheck();
