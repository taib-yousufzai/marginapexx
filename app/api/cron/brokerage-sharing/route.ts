import { createClient } from '@supabase/supabase-js';

// Requires service role key to perform cross-user aggregations
function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error('Missing env: NEXT_PUBLIC_SUPABASE_URL');
  if (!serviceKey) throw new Error('Missing env: SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function GET(request: Request): Promise<Response> {
  try {
    // Optional: You can secure this route with an API key checking against a cron secret.
    // e.g. if (request.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) ...

    const adminClient = createAdminClient();

    // 1. Fetch all users who have a parent_id and have started trading
    const { data: users, error: userError } = await adminClient
      .from('profiles')
      .select('id, parent_id')
      .eq('has_traded', true)
      .not('parent_id', 'is', null);

    if (userError) throw userError;

    // 2. Group by parent_id to count active referrals
    const referralCounts: Record<string, string[]> = {};
    for (const u of users || []) {
      const pId = u.parent_id!;
      if (!referralCounts[pId]) referralCounts[pId] = [];
      referralCounts[pId].push(u.id);
    }

    // 3. Find brokers with >= 5 active referrals
    const qualifiedBrokers = Object.keys(referralCounts).filter(pId => referralCounts[pId].length >= 5);
    let totalBrokersPaid = 0;
    let totalBrokerageDistributed = 0;

    // 4. Process payouts per broker
    for (const brokerId of qualifiedBrokers) {
      const referredUserIds = referralCounts[brokerId];

      // Find all unshared brokerage debits for this broker's referred users
      const { data: txs, error: txError } = await adminClient
        .from('transactions')
        .select('id, amount')
        .eq('type', 'BROKERAGE_DEBIT')
        .eq('status', 'APPROVED')
        .eq('brokerage_shared', false)
        .in('user_id', referredUserIds);

      if (txError) {
        console.error(`Error fetching txs for broker ${brokerId}:`, txError);
        continue;
      }

      if (!txs || txs.length === 0) continue;

      // Sum the total brokerage
      const totalBrokerage = txs.reduce((sum, tx) => sum + (tx.amount || 0), 0);
      if (totalBrokerage <= 0) continue;

      // Calculate 5%
      const share = totalBrokerage * 0.05;

      // Update the broker's referral wallet
      // We read first, then update
      const { data: brokerData } = await adminClient
        .from('profiles')
        .select('referral_balance')
        .eq('id', brokerId)
        .single();
      
      if (brokerData) {
        await adminClient
          .from('profiles')
          .update({ referral_balance: (brokerData.referral_balance || 0) + share })
          .eq('id', brokerId);

        // Insert log record
        await adminClient
          .from('referral_earnings')
          .insert({
            referrer_id: brokerId,
            commission_amount: share,
            earning_type: 'WEEKLY_BROKERAGE',
            deposit_amount: totalBrokerage // Storing total brokerage collected here as context
          });

        // Mark transactions as shared
        const txIds = txs.map(t => t.id);
        
        // Chunk txIds into sets of 1000 just in case
        const chunkSize = 1000;
        for (let i = 0; i < txIds.length; i += chunkSize) {
          const chunk = txIds.slice(i, i + chunkSize);
          await adminClient
            .from('transactions')
            .update({ brokerage_shared: true })
            .in('id', chunk);
        }

        totalBrokersPaid++;
        totalBrokerageDistributed += share;
      }
    }

    return Response.json({
      success: true,
      message: 'Weekly brokerage sharing processed.',
      brokers_paid: totalBrokersPaid,
      total_distributed: totalBrokerageDistributed
    }, { status: 200 });

  } catch (err: any) {
    console.error('[GET /api/cron/brokerage-sharing] catch error:', err);
    return Response.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
