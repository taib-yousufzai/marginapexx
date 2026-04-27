import { NextResponse } from 'next/server';
import { requireBroker } from '../../_auth';


export async function GET(req: Request) {
  const auth = await requireBroker(req);
  if (!auth || !('adminClient' in auth) || !auth.adminClient) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { adminClient, callerUser: broker } = auth as any;

  const { data: profile, error } = await adminClient
    .from('profiles')
    .select('id, email, full_name, role, phone')
    .eq('id', broker.id)
    .single();

  if (error || !profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
  }

  return NextResponse.json(profile);
}
