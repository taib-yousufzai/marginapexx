/**
 * Pure CSV generation helpers for pay-in / pay-out exports.
 * No side effects, no DOM calls — all inputs are passed explicitly.
 */

export type PayRequest = {
  id: string;
  user_id: string;
  type: "DEPOSIT" | "WITHDRAWAL";
  amount: number;
  status: "PENDING" | "APPROVED" | "REJECTED";
  account_name: string | null;
  account_no: string | null;
  ifsc: string | null;
  upi: string | null;
  utr: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Escapes a single CSV field value.
 *
 * - Returns empty string for null or undefined.
 * - If the value (as a string) contains commas, double-quotes, or newlines,
 *   wraps it in double-quotes and doubles any internal double-quotes.
 * - Otherwise returns the value as a plain string.
 *
 * Validates: Requirements 17.4
 */
export function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }

  const str = String(value);

  // Check if quoting is required
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    // Double any internal double-quotes, then wrap in double-quotes
    return '"' + str.replace(/"/g, '""') + '"';
  }

  return str;
}

/**
 * Converts an array of PayRequest objects to a CSV string.
 *
 * Columns (in order): id, user_id, type, amount, status, account_name,
 * account_no, ifsc, upi, created_at, updated_at
 *
 * Each field is passed through csvEscape. The result is the header row
 * followed by one row per item, all joined by newlines.
 *
 * Validates: Requirements 17.2, 17.4
 */
export function toCsvPayRequests(items: PayRequest[]): string {
  const header = 'id,user_id,type,amount,status,account_name,account_no,ifsc,upi,utr,created_at,updated_at';

  const rows = items.map((item) =>
    [
      csvEscape(item.id),
      csvEscape(item.user_id),
      csvEscape(item.type),
      csvEscape(item.amount),
      csvEscape(item.status),
      csvEscape(item.account_name),
      csvEscape(item.account_no),
      csvEscape(item.ifsc),
      csvEscape(item.upi),
      csvEscape(item.utr),
      csvEscape(item.created_at),
      csvEscape(item.updated_at),
    ].join(',')
  );

  return [header, ...rows].join('\n');
}
