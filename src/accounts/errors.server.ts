export class AccountError extends Error {
  constructor(
    public status:
      | 400
      | 401
      | 403
      | 404
      | 409
      | 410
      | 413
      | 429
      | 503
      | 507 = 400,
    public code = "INVALID_REQUEST",
  ) {
    super(code);
  }
}
