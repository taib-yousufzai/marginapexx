import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');
    const interval = searchParams.get('interval') || '5m';
    const limit = searchParams.get('limit') || '500';

    if (!symbol) {
      return NextResponse.json({ error: 'Missing required parameter: symbol' }, { status: 400 });
    }

    let binanceSymbol = symbol.replace('/', '');
    if (!binanceSymbol.endsWith('USDT')) {
      binanceSymbol += 'USDT';
    }

    const response = await fetch(`https://api.binance.com/api/v3/klines?symbol=${binanceSymbol}&interval=${interval}&limit=${limit}`);
    
    if (!response.ok) {
        const errorData = await response.json();
        return NextResponse.json({ error: errorData.msg || 'Failed to fetch from Binance' }, { status: response.status });
    }

    const json = await response.json();

    if (!Array.isArray(json)) {
        return NextResponse.json({ error: 'Invalid response from Binance' }, { status: 500 });
    }
    
    return NextResponse.json(json);

  } catch (error: any) {
    console.error('Crypto Historical API Error:', error);
    return NextResponse.json({ error: 'Internal Server Error', message: error.message }, { status: 500 });
  }
}
