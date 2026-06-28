import { hasPermission, ROLE_PERMISSIONS } from '../permissions';

describe('Permissions Layer', () => {
  it('should allow super_admin to perform all defined actions', () => {
    // Super admins have specific permissions array. Let's just check a few critical ones.
    expect(hasPermission('super_admin', 'CREATE_ADMIN')).toBe(true);
    expect(hasPermission('super_admin', 'VIEW_USERS')).toBe(true);
    expect(hasPermission('super_admin', 'MANAGE_GLOBAL_SETTINGS')).toBe(true);
  });

  it('should correctly restrict admin permissions', () => {
    expect(hasPermission('admin', 'VIEW_USERS')).toBe(true);
    expect(hasPermission('admin', 'CREATE_BROKER')).toBe(true);
    
    // Admins cannot create other admins or manage global settings
    expect(hasPermission('admin', 'CREATE_ADMIN')).toBe(false);
    expect(hasPermission('admin', 'MANAGE_GLOBAL_SETTINGS')).toBe(false);
  });

  it('should correctly restrict broker permissions', () => {
    expect(hasPermission('broker', 'VIEW_USERS')).toBe(true);
    expect(hasPermission('broker', 'CREATE_USER')).toBe(true);
    
    // Brokers cannot create brokers
    expect(hasPermission('broker', 'CREATE_BROKER')).toBe(false);
    expect(hasPermission('broker', 'MANAGE_TEMPLATES')).toBe(false);
  });

  it('should correctly restrict user permissions', () => {
    // Users can only view their own stuff
    expect(hasPermission('user', 'VIEW_OWN_PROFILE')).toBe(true);
    expect(hasPermission('user', 'VIEW_OWN_ORDERS')).toBe(true);
    
    // Users cannot view other users or create users
    expect(hasPermission('user', 'VIEW_USERS')).toBe(false);
    expect(hasPermission('user', 'CREATE_USER')).toBe(false);
  });

  it('should gracefully handle invalid or unknown roles', () => {
    // @ts-ignore - testing invalid input
    expect(hasPermission('invalid_role', 'VIEW_USERS')).toBe(false);
    // @ts-ignore
    expect(hasPermission(null, 'VIEW_USERS')).toBe(false);
  });
});
