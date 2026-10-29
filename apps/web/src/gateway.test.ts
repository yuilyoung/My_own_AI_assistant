import { afterEach, describe, expect, it, vi } from 'vitest';
import { GatewayClient } from './gateway';

afterEach(() => vi.unstubAllGlobals());

describe('GatewayClient', () => {
  it('sends bearer authentication and correct mode', async () => {
    const mock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: 'session-1' }) });
    vi.stubGlobal('fetch', mock);
    const result = await new GatewayClient('secret').createSession('companion');
    expect(result.id).toBe('session-1');
    expect(mock).toHaveBeenCalledWith('/api/sessions', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ mode: 'companion' }),
      headers: expect.objectContaining({ Authorization: 'Bearer secret' }),
    }));
  });
  it('does not retry failed authentication', async () => {
    const mock = vi.fn().mockResolvedValue({ ok: false, status: 401 });
    vi.stubGlobal('fetch', mock);
    await expect(new GatewayClient('bad').status()).rejects.toThrow('Gateway HTTP 401');
    expect(mock).toHaveBeenCalledTimes(1);
  });
  it('encodes session and turn identifiers', async () => {
    const mock = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    vi.stubGlobal('fetch', mock);
    await new GatewayClient('token').cancelTurn('a/b', 'c d');
    expect(mock.mock.calls[0][0]).toBe('/api/sessions/a%2Fb/turns/c%20d');
  });
});
