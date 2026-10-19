import { afterEach, describe, expect, it, vi } from 'vitest';
import { privilegedMode, aiGatewayFetch } from '@/integrations/supabase/privileged.server';
import { signablePath } from '@/lib/enquiry-schema';

describe('privileged access selection', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
  it('goes direct when managed keys exist, even with a bridge secret', () => {
    const env = { SUPABASE_SERVICE_ROLE_KEY: 'x', LOVABLE_API_KEY: 'y', ENKOP_BRIDGE_SECRET: 's' };
    expect(privilegedMode('db', env)).toBe('direct');
    expect(privilegedMode('ai', env)).toBe('direct');
  });
  it('uses the bridge when only the bridge secret exists', () => {
    expect(privilegedMode('db', { ENKOP_BRIDGE_SECRET: 's' })).toBe('bridge');
    expect(privilegedMode('ai', { ENKOP_BRIDGE_SECRET: 's' })).toBe('bridge');
  });
  it('reports unavailable when neither exists', () => {
    expect(privilegedMode('db', {})).toBe('none');
    expect(privilegedMode('ai', {})).toBe('none');
  });
  it('sends bridge AI calls with the secret header and no gateway key', async () => {
    vi.stubEnv('LOVABLE_API_KEY', ''); vi.stubEnv('ENKOP_BRIDGE_SECRET', 'shh'); vi.stubEnv('ENKOP_BRIDGE_URL', 'https://bridge.test');
    const f = vi.fn().mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', f);
    await aiGatewayFetch('/videos/abc');
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe('https://bridge.test/api/public/enkop-bridge/ai/videos/abc');
    expect(new Headers(init.headers).get('x-enkop-bridge-secret')).toBe('shh');
    expect(new Headers(init.headers).get('authorization')).toBeNull();
  });
  it('only signs the media path shapes the app uses', () => {
    const id = '0b0e1c2d-3e4f-4a5b-8c6d-7e8f9a0b1c2d';
    expect(signablePath('homepage/scene-1.mp4')).toBe(true);
    expect(signablePath(`${id}/photos/a.jpg`)).toBe(true);
    expect(signablePath(`${id}/tours/${id}.mp4`)).toBe(true);
    expect(signablePath('team/gerard.jpg')).toBe(true);
    expect(signablePath('homepage/../secret')).toBe(false);
    expect(signablePath('private/x.pdf')).toBe(false);
  });
});
