import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ role: true, read: vi.fn() }));
vi.mock('@/integrations/supabase/auth-middleware', () => ({ requireSupabaseAuth: {} }));
vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => {
    const roleQuery = { select: () => roleQuery, eq: () => roleQuery, maybeSingle: async () => ({ data: state.role ? { role: 'admin' } : null, error: null }) };
    const leadQuery = { select: () => leadQuery, order: () => leadQuery, limit: async () => { state.read(); return { data: [], error: null }; } };
    const builder = {
      middleware: () => builder,
      inputValidator: () => builder,
      handler: (handler: (args: unknown) => unknown) => () => handler({ context: { userId: 'verified-user', supabase: { from: (table: string) => table === 'user_roles' ? roleQuery : leadQuery } } }),
    };
    return builder;
  },
}));
import { getEnquiries } from '@/lib/enquiries.functions';

describe('enquiry administrator access', () => {
  beforeEach(() => { state.role = true; state.read.mockClear(); });
  it('allows a verified administrator to read enquiries', async () => {
    expect(await getEnquiries()).toEqual([]);
    expect(state.read).toHaveBeenCalledOnce();
  });
  it('rejects users without an administrator role before reading leads', async () => {
    state.role = false;
    await expect(getEnquiries()).rejects.toThrow('Administrator access required.');
    expect(state.read).not.toHaveBeenCalled();
  });
});