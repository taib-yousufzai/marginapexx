import { NextResponse } from 'next/server';

export async function GET() {
  const apiKey = process.env.KITE_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Kite API key not configured' }, { status: 500 });
  }

  // Redirect to Zerodha login
  const url = `https://kite.zerodha.com/connect/login?api_key=${apiKey}&v=3`;
  return NextResponse.redirect(url);
}
