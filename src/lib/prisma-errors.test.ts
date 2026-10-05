import { describe, expect, it } from 'vitest';
import { isRecordNotFound, prismaErrorCode } from './prisma-errors';

describe('prismaErrorCode', () => {
  it('membaca kode dari error Prisma', () => {
    expect(prismaErrorCode(Object.assign(new Error('x'), { code: 'P2025' }))).toBe('P2025');
    expect(prismaErrorCode({ code: 'P2002' })).toBe('P2002');
  });

  it('null untuk error biasa / nilai aneh', () => {
    expect(prismaErrorCode(new Error('boom'))).toBeNull();
    expect(prismaErrorCode({ code: 42 })).toBeNull();
    expect(prismaErrorCode(null)).toBeNull();
    expect(prismaErrorCode(undefined)).toBeNull();
    expect(prismaErrorCode('P2025')).toBeNull();
  });
});

describe('isRecordNotFound', () => {
  it('hanya true untuk P2025', () => {
    expect(isRecordNotFound(Object.assign(new Error('x'), { code: 'P2025' }))).toBe(true);
    expect(isRecordNotFound({ code: 'P2002' })).toBe(false);
    expect(isRecordNotFound(new Error('x'))).toBe(false);
  });
});
