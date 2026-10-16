import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { dbMock, checkRateLimitMock, loggerMock } = vi.hoisted(() => ({
  dbMock: {
    user: { update: vi.fn() },
    passwordReset: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn(),
  },
  checkRateLimitMock: vi.fn(),
  loggerMock: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/db', () => ({ db: dbMock }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: checkRateLimitMock }));
vi.mock('@/lib/logger', () => ({ logger: loggerMock }));

import { POST } from './route';

const token = 'd'.repeat(64);

function request() {
  return new NextRequest('http://localhost/api/auth/reset-password', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token, password: 'NewPassword123' }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  checkRateLimitMock.mockResolvedValue(null);
  dbMock.passwordReset.findUnique.mockResolvedValue({
    token,
    userId: 'user-1',
    usedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    user: { id: 'user-1', email: 'u@example.com' },
  });
  dbMock.user.update.mockResolvedValue({});
  dbMock.passwordReset.update.mockResolvedValue({});
  dbMock.passwordReset.updateMany.mockResolvedValue({ count: 0 });
  dbMock.$transaction.mockResolvedValue([]);
});

describe('POST /api/auth/reset-password', () => {
  it('treats the emailed single-use reset token as mailbox proof and verifies the account', async () => {
    const res = await POST(request());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    const userUpdate = dbMock.user.update.mock.calls[0][0];
    expect(userUpdate.where).toEqual({ id: 'user-1' });
    expect(userUpdate.data.emailVerified).toBeInstanceOf(Date);
    expect(userUpdate.data.sessionVersion).toEqual({ increment: 1 });
    expect(dbMock.$transaction).toHaveBeenCalledTimes(1);
  });
});
