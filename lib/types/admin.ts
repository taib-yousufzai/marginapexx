/**
 * Mirrors the public.profiles table columns exactly.
 */
export interface Profile {
  id: string;                        // uuid — matches auth.users.id
  email: string;
  full_name: string | null;
  phone: string | null;
  role: string;
  parent_id: string | null;
  segments: string[] | null;
  active: boolean;
  read_only: boolean;
  demo_user: boolean;
  intraday_sq_off: boolean;
  auto_sqoff: number;
  sqoff_method: string;
  scheduled_delete_at: string | null; // ISO timestamp or null
  created_at: string;
  updated_at: string;
}

/**
 * Extends the existing USERS_LIST shape with profile data.
 * Used in UsersPage to display the user list.
 */
export interface UserWithProfile {
  // From USERS_LIST (existing)
  id: string;
  fullName: string;
  role: string;
  active: boolean;
  ledgerBal: number;
  mAvailable: number;
  openPnl: number;
  m2m: number;
  weeklyPnl: number;
  alltimePnl: number;
  marginUsed: number;
  holdingMargin: number;
  broker: string;
  mobile: string;
  // From Profile (new)
  scheduled_delete_at: string | null;
}

/**
 * Request body for POST /api/admin/users
 */
export interface CreateUserRequest {
  email: string;
  password: string;
  full_name?: string;
  phone?: string;
  role: string;
  parent_id?: string;
  segments?: string[];
  active?: boolean;
  read_only?: boolean;
  demo_user?: boolean;
  intraday_sq_off?: boolean;
  auto_sqoff?: number;
  sqoff_method?: string;
}

/**
 * Request body for PATCH /api/admin/users/[id]
 * All fields optional — only provided fields are updated.
 */
export type UpdateUserRequest = Partial<Omit<CreateUserRequest, 'email'>> & {
  email?: string;
};
