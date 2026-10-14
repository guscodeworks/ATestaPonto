const TOKEN_PATTERN = /^[a-f0-9]{64}$/i;

function isValidTokenFormat(token) {
  return typeof token === 'string' && TOKEN_PATTERN.test(token.trim());
}

module.exports = {
  isValidTokenFormat
};
