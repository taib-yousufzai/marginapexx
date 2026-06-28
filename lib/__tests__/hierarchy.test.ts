import { isUserInHierarchy } from '../hierarchy';

// Mock Supabase client
const createMockSupabase = (profilesTable: Record<string, any>) => ({
  from: (table: string) => ({
    select: (columns: string) => ({
      eq: (field: string, value: string) => ({
        single: async () => {
          if (table !== 'profiles') return { data: null, error: new Error('Table not found') };
          const row = profilesTable[value];
          if (!row) return { data: null, error: new Error('Row not found') };
          
          if (columns === 'role') return { data: { role: row.role }, error: null };
          if (columns === 'parent_id') return { data: { parent_id: row.parent_id }, error: null };
          
          return { data: row, error: null };
        }
      })
    })
  })
});

describe('Hierarchy Traversal', () => {
  const mockDb = {
    'super_admin_1': { id: 'super_admin_1', role: 'super_admin', parent_id: null },
    'admin_1': { id: 'admin_1', role: 'admin', parent_id: 'super_admin_1' },
    'admin_2': { id: 'admin_2', role: 'admin', parent_id: 'super_admin_1' },
    'broker_1': { id: 'broker_1', role: 'broker', parent_id: 'admin_1' },
    'broker_2': { id: 'broker_2', role: 'broker', parent_id: 'admin_2' },
    'user_1': { id: 'user_1', role: 'user', parent_id: 'broker_1' },
    'user_2': { id: 'user_2', role: 'user', parent_id: 'broker_2' },
  };

  const supabase = createMockSupabase(mockDb) as any;

  it('allows super_admin to access any user', async () => {
    expect(await isUserInHierarchy(supabase, 'super_admin_1', 'user_1')).toBe(true);
    expect(await isUserInHierarchy(supabase, 'super_admin_1', 'admin_1')).toBe(true);
  });

  it('allows admin to access their own broker and user', async () => {
    expect(await isUserInHierarchy(supabase, 'admin_1', 'broker_1')).toBe(true);
    expect(await isUserInHierarchy(supabase, 'admin_1', 'user_1')).toBe(true);
  });

  it('denies admin access to other admins or their brokers', async () => {
    expect(await isUserInHierarchy(supabase, 'admin_1', 'admin_2')).toBe(false);
    expect(await isUserInHierarchy(supabase, 'admin_1', 'broker_2')).toBe(false);
    expect(await isUserInHierarchy(supabase, 'admin_1', 'user_2')).toBe(false);
  });

  it('allows broker to access their own user', async () => {
    expect(await isUserInHierarchy(supabase, 'broker_1', 'user_1')).toBe(true);
  });

  it('denies broker access to other brokers users', async () => {
    expect(await isUserInHierarchy(supabase, 'broker_1', 'user_2')).toBe(false);
  });

  it('denies users access to anyone else', async () => {
    expect(await isUserInHierarchy(supabase, 'user_1', 'user_2')).toBe(false);
    expect(await isUserInHierarchy(supabase, 'user_1', 'broker_1')).toBe(false);
  });

  it('allows a user to access themselves', async () => {
    expect(await isUserInHierarchy(supabase, 'user_1', 'user_1')).toBe(true);
    expect(await isUserInHierarchy(supabase, 'broker_1', 'broker_1')).toBe(true);
  });
});
