// Vite substitutes the development implementation only for the dev server/tests.
import type { User } from '../types';
import type { mockDb as developmentDb } from './mockDb.dev';
const disabled = (): never => { throw new Error('Mock indisponível em produção. Configure o Supabase.'); };
export const mockDb: typeof developmentDb = {
  get: disabled, insert: disabled, update: disabled, upsert: disabled, delete: disabled,
};
export function getMockData<T>(_key: string): T[] { return disabled(); }
export function setMockData<T>(_key: string, _data: T[]): void { disabled(); }
export function resolveMockUserEmail(_email: string): string | undefined { return undefined; }
export function findMockUserById(_id: string): User | undefined { return undefined; }
