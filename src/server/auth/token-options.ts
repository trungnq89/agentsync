// Dependency-free: safe to import from client components.
export type TokenScope = 'member' | 'manager';
export const TOKEN_LIFETIMES = [30, 90, 180] as const;
export const DEFAULT_TOKEN_DAYS = 90;
