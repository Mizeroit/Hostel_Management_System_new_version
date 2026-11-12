class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);

  if (error.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ message: 'A record with that value already exists.' });
  }
  if (error.code === 'ER_NO_REFERENCED_ROW_2') {
    return res.status(400).json({ message: 'A referenced record does not exist.' });
  }
  if (error.code === 'ER_ROW_IS_REFERENCED_2') {
    return res.status(409).json({ message: 'This record is still referenced by other records.' });
  }
  if (['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND'].includes(error.code)) {
    return res.status(503).json({ message: 'Database is unavailable. Please try again later.' });
  }

  const status = error.status || 500;
  if (status >= 500) console.error(error);
  return res.status(status).json({
    message: status >= 500 ? 'An unexpected server error occurred.' : error.message
  });
}

module.exports = { HttpError, asyncHandler, errorHandler };
