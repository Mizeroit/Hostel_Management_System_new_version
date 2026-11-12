const { HttpError } = require('../middleware/errors');

const paymentMethods = ['Cash', 'Bank transfer', 'Mobile money', 'Card'];
const genders = ['Female', 'Male', 'Other'];

function requiredText(value, label, maxLength = 255) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLength) {
    throw new HttpError(400, `${label} is required and must be at most ${maxLength} characters.`);
  }
  return value.trim();
}

function positiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) {
    throw new HttpError(400, `${label} must be a positive whole number.`);
  }
  return number;
}

function nonNegativeNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new HttpError(400, `${label} must be zero or greater.`);
  }
  return number;
}

function validDate(value, label) {
  if (value === undefined || value === null || value === '') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new HttpError(400, `${label} must be a valid date.`);
  return date.toISOString().slice(0, 10);
}

function validEmail(value, label = 'Email') {
  if (value === undefined || value === null || value === '') return null;
  const email = requiredText(value, label, 254);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, `${label} must be a valid email address.`);
  }
  return email;
}

module.exports = {
  paymentMethods,
  genders,
  requiredText,
  positiveInteger,
  nonNegativeNumber,
  validDate,
  validEmail
};
