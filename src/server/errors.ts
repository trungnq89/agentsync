export type DomainErrorCode =
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'INVALID_TRANSITION'
  | 'EDIT_WINDOW_CLOSED'
  | 'VALIDATION'
  | 'UNAUTHORIZED';

/** Business-rule error. `message` is Vietnamese and safe to show to users/agents. */
export class DomainError extends Error {
  code: DomainErrorCode;
  constructor(code: DomainErrorCode, message: string) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
  }
}
