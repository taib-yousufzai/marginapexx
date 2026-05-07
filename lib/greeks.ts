/**
 * Black-Scholes Option Greeks Library
 */

function normalCDF(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.7814779 + t * (-1.821256 + t * 1.3302744))));
  return x > 0 ? 1 - p : p;
}

function normalPDF(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

/**
 * Calculate Black-Scholes Greeks
 */
export function calculateGreeks(
  S: number, // Spot Price
  K: number, // Strike Price
  T: number, // Time to Expiry in Years
  r: number, // Risk-free rate (e.g. 0.1 for 10%)
  sigma: number, // Implied Volatility (e.g. 0.2 for 20%)
  type: 'CE' | 'PE'
) {
  if (T <= 0) return { delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0 };
  
  const d1 = (Math.log(S / K) + (r + sigma * sigma / 2) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);

  const delta = type === 'CE' ? normalCDF(d1) : normalCDF(d1) - 1;
  const gamma = normalPDF(d1) / (S * sigma * Math.sqrt(T));
  const vega = S * normalPDF(d1) * Math.sqrt(T) / 100; // Divided by 100 to show per 1% change in IV

  let theta: number;
  if (type === 'CE') {
    theta = -(S * normalPDF(d1) * sigma) / (2 * Math.sqrt(T)) - r * K * Math.exp(-r * T) * normalCDF(d2);
  } else {
    theta = -(S * normalPDF(d1) * sigma) / (2 * Math.sqrt(T)) + r * K * Math.exp(-r * T) * normalCDF(-d2);
  }
  theta = theta / 365; // Per day

  return { delta, gamma, theta, vega };
}

/**
 * Solve for Implied Volatility (IV) using Newton-Raphson
 */
export function calculateIV(
  targetPrice: number,
  S: number,
  K: number,
  T: number,
  r: number,
  type: 'CE' | 'PE'
): number {
  if (targetPrice <= 0 || T <= 0) return 0;

  let sigma = 0.5; // Initial guess
  for (let i = 0; i < 20; i++) {
    const d1 = (Math.log(S / K) + (r + sigma * sigma / 2) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);
    
    let price: number;
    if (type === 'CE') {
      price = S * normalCDF(d1) - K * Math.exp(-r * T) * normalCDF(d2);
    } else {
      price = K * Math.exp(-r * T) * normalCDF(-d2) - S * normalCDF(-d1);
    }

    const vega = S * normalPDF(d1) * Math.sqrt(T);
    const diff = targetPrice - price;

    if (Math.abs(diff) < 0.0001) return sigma;
    sigma = sigma + diff / vega;
    
    if (sigma <= 0) sigma = 0.0001;
  }
  return sigma;
}
