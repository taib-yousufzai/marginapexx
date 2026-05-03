/**
 * Pure validation helpers for pay-in / pay-out requests.
 * No side effects, no DB calls — all inputs are passed explicitly.
 */

export type WalletRules = {
  withdraw_enabled: boolean;
  allowed_days: string[];
  start_time: string; // "HH:MM"
  end_time: string; // "HH:MM"
  min_withdraw: number;
  min_deposit: number;
};

export type ValidatedPayRequest = {
  type: 'DEPOSIT' | 'WITHDRAWAL';
  amount: number;
  account_name?: string;
  account_no?: string;
  ifsc?: string;
  upi?: string;
  utr?: string;
  screenshot_url?: string;
};

/**
 * Validates a raw pay request body against wallet rules and the current UTC time.
 *
 * Validation order:
 *  1. missing/invalid type → 400 "Invalid type"
 *  2. non-positive amount → 400 "Invalid amount"
 *  3. DEPOSIT below min_deposit → 400 "Amount below minimum deposit"
 *  4. WITHDRAWAL with withdraw_enabled=false → 400 "Withdrawals are currently disabled"
 *  5. WITHDRAWAL on disallowed day → 400 "Withdrawals not allowed on this day"
 *  6. WITHDRAWAL outside time window → 400 "Withdrawals not allowed at this time"
 *  7. WITHDRAWAL below min_withdraw → 400 "Amount below minimum withdrawal"
 *  8. WITHDRAWAL missing account_name/account_no/ifsc → 400 "Bank details required for withdrawal"
 */
export function validatePayRequest(
  body: unknown,
  rules: WalletRules,
  nowUtc: Date,
): { valid: true; data: ValidatedPayRequest } | { valid: false; error: string; status: number } {
  if (
    typeof body !== 'object' ||
    body === null ||
    !('type' in body) ||
    (body as Record<string, unknown>).type !== 'DEPOSIT' &&
      (body as Record<string, unknown>).type !== 'WITHDRAWAL'
  ) {
    return { valid: false, error: 'Invalid type', status: 400 };
  }

  const raw = body as Record<string, unknown>;
  const type = raw.type as 'DEPOSIT' | 'WITHDRAWAL';

  // 2. Non-positive amount
  const amount = typeof raw.amount === 'number' ? raw.amount : Number(raw.amount);
  if (!isFinite(amount) || amount <= 0) {
    return { valid: false, error: 'Invalid amount', status: 400 };
  }

  // 3. DEPOSIT below minimum
  if (type === 'DEPOSIT' && amount < rules.min_deposit) {
    return { valid: false, error: 'Amount below minimum deposit', status: 400 };
  }

  if (type === 'WITHDRAWAL') {
    // 4. Withdrawals disabled
    if (!rules.withdraw_enabled) {
      return { valid: false, error: 'Withdrawals are currently disabled', status: 400 };
    }

    // 5. Disallowed day
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const currentDay = dayNames[nowUtc.getUTCDay()];
    if (!rules.allowed_days.includes(currentDay)) {
      return { valid: false, error: 'Withdrawals not allowed on this day', status: 400 };
    }

    // 6. Outside time window
    const currentHHMM = `${String(nowUtc.getUTCHours()).padStart(2, '0')}:${String(nowUtc.getUTCMinutes()).padStart(2, '0')}`;
    if (currentHHMM < rules.start_time || currentHHMM >= rules.end_time) {
      return { valid: false, error: 'Withdrawals not allowed at this time', status: 400 };
    }

    // 7. Below minimum withdrawal
    if (amount < rules.min_withdraw) {
      return { valid: false, error: 'Amount below minimum withdrawal', status: 400 };
    }

    // 8. Missing bank details
    const accountName = raw.account_name;
    const accountNo = raw.account_no;
    const ifsc = raw.ifsc;
    if (
      !accountName || typeof accountName !== 'string' || accountName.trim() === '' ||
      !accountNo || typeof accountNo !== 'string' || accountNo.trim() === '' ||
      !ifsc || typeof ifsc !== 'string' || ifsc.trim() === ''
    ) {
      return { valid: false, error: 'Bank details required for withdrawal', status: 400 };
    }

    return {
      valid: true,
      data: {
        type,
        amount,
        account_name: accountName,
        account_no: accountNo,
        ifsc,
        upi: typeof raw.upi === 'string' ? raw.upi : undefined,
      },
    };
  }

  // DEPOSIT — valid
  // 9. Deposit requires screenshot_url, UTR is optional but must be 12 digits if provided
  if (type === 'DEPOSIT') {
    const screenshotUrl = raw.screenshot_url;
    if (!screenshotUrl || typeof screenshotUrl !== 'string' || screenshotUrl.trim() === '') {
      return { valid: false, error: 'Payment screenshot is required', status: 400 };
    }

    const utr = raw.utr;
    if (utr && (typeof utr !== 'string' || !/^\d{12}$/.test(utr))) {
      return { valid: false, error: 'Invalid UTR: Must be exactly 12 digits if provided', status: 400 };
    }

    return {
      valid: true,
      data: {
        type,
        amount,
        upi: typeof raw.upi === 'string' ? raw.upi : undefined,
        utr: typeof utr === 'string' ? utr : undefined,
        screenshot_url: screenshotUrl,
      },
    };
  }

  return { valid: false, error: 'Internal validation error', status: 500 };
}

/**
 * Computes the ledger balance from a list of transactions.
 * Balance = sum(DEPOSIT amounts) - sum(WITHDRAWAL amounts)
 * Returns 0 for an empty array.
 */
export function computeBalance(transactions: Array<{ type: string; amount: number }>): number {
  return transactions.reduce((balance, txn) => {
    if (txn.type === 'DEPOSIT') return balance + txn.amount;
    if (txn.type === 'WITHDRAWAL') return balance - txn.amount;
    return balance;
  }, 0);
}
