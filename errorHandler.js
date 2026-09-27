// Consistent API error shape. Never leak stack traces or DB errors to the client.
function errorHandler(err, req, res, next) {
  console.error(err);

  const status = err.status || 500;
  const code = err.code || 'INTERNAL_ERROR';
  const message = status < 500 ? err.message : 'Something went wrong. Please try again.';

  res.status(status).json({
    success: false,
    error: { code, message },
  });
}

class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

module.exports = { errorHandler, ApiError };
