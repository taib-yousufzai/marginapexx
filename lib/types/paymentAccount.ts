/**
 * Mirrors the public.payment_accounts table columns exactly.
 */
export type PaymentAccount = {
  id: string;
  account_holder: string;
  bank_name: string;
  account_no: string;
  ifsc: string;
  upi_id: string;
  qr_image_url: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};
