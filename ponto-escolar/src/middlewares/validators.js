const { body, param, query } = require('express-validator');
const { isValidCpf, normalizeCpf } = require('../utils/cpf');
const { validateRequest } = require('./validateRequest');

const QR_TOKEN_REGEX = /^[a-f0-9]{64}$/i;

function withValidation(rules) {
  return [...rules, validateRequest];
}

function cpfRule(field = 'cpf', required = true) {
  const chain = body(field).customSanitizer((value) => normalizeCpf(value));
  if (required) {
    chain.notEmpty().withMessage('CPF e obrigatorio');
  } else {
    chain.optional();
  }
  return chain
    .isLength({ min: 11, max: 11 })
    .withMessage('CPF deve ter 11 digitos')
    .custom((value) => {
      if (!isValidCpf(value)) {
        throw new Error('CPF invalido');
      }
      return true;
    });
}

function getQrCodeCandidate(value, { req }) {
  return String(value || req.body.qr_code || req.body.qrCode || req.body.qrToken || '');
}

function qrCodeRule() {
  return body('qrCode')
    .customSanitizer(getQrCodeCandidate)
    .trim()
    .notEmpty()
    .withMessage('QR Code e obrigatorio')
    .matches(QR_TOKEN_REGEX)
    .withMessage('QR Code invalido');
}

const adminLoginValidator = withValidation([
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email e obrigatorio')
    .isLength({ max: 150 })
    .withMessage('Email muito longo')
    .isEmail()
    .withMessage('Email invalido')
    .normalizeEmail({ gmail_remove_dots: false }),
  body('senha')
    .isString()
    .withMessage('Senha deve ser texto')
    .isLength({ min: 8, max: 72 })
    .withMessage('Senha deve ter entre 8 e 72 caracteres')
]);

const createFuncionarioValidator = withValidation([
  body('nome')
    .trim()
    .notEmpty()
    .withMessage('Nome e obrigatorio')
    .isLength({ min: 3, max: 55 })
    .withMessage('Nome deve ter entre 3 e 55 caracteres')
    .matches(/^[^<>]*$/)
    .withMessage('Nome contem caracteres invalidos')
    .escape(),
  cpfRule('cpf', true),
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email e obrigatorio')
    .isLength({ max: 150 })
    .withMessage('Email muito longo')
    .isEmail()
    .withMessage('Email invalido')
    .normalizeEmail({ gmail_remove_dots: false }),
  body('senha')
    .isString()
    .withMessage('Senha deve ser texto')
    .isLength({ min: 8, max: 72 })
    .withMessage('Senha deve ter entre 8 e 72 caracteres'),
  body('cargo_id')
    .optional()
    .isInt({ min: 1 })
    .withMessage('cargo_id invalido')
    .toInt(),
  body('ativo')
    .optional()
    .isIn(['true', 'false', true, false, 1, 0, '1', '0'])
    .withMessage('ativo deve ser booleano')
    .toBoolean()
]);

const updateFuncionarioValidator = withValidation([
  param('id').isInt({ min: 1 }).withMessage('ID de funcionario invalido').toInt(),
  body('nome')
    .optional()
    .trim()
    .isLength({ min: 3, max: 55 })
    .withMessage('Nome deve ter entre 3 e 55 caracteres')
    .matches(/^[^<>]*$/)
    .withMessage('Nome contem caracteres invalidos')
    .escape(),
  cpfRule('cpf', false),
  body('email')
    .optional()
    .trim()
    .isLength({ max: 150 })
    .withMessage('Email muito longo')
    .isEmail()
    .withMessage('Email invalido')
    .normalizeEmail({ gmail_remove_dots: false }),
  body('senha')
    .optional()
    .isString()
    .withMessage('Senha deve ser texto')
    .isLength({ min: 8, max: 72 })
    .withMessage('Senha deve ter entre 8 e 72 caracteres'),
  body('cargo_id')
    .optional()
    .isInt({ min: 1 })
    .withMessage('cargo_id invalido')
    .toInt(),
  body('ativo')
    .optional()
    .isIn(['true', 'false', true, false, 1, 0, '1', '0'])
    .withMessage('ativo deve ser booleano')
    .toBoolean()
]);

const funcionarioStatusValidator = withValidation([
  param('id').isInt({ min: 1 }).withMessage('ID de funcionario invalido').toInt(),
  body('ativo')
    .notEmpty()
    .withMessage('ativo e obrigatorio')
    .isIn(['true', 'false', true, false, 1, 0, '1', '0'])
    .withMessage('ativo deve ser booleano')
    .toBoolean()
]);

const paginationValidator = withValidation([
  query('page').optional().isInt({ min: 1 }).withMessage('page deve ser >= 1').toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit deve ser entre 1 e 100').toInt(),
  query('ativo').optional().isIn(['true', 'false', '1', '0']).withMessage('ativo invalido').toBoolean(),
  query('q').optional().trim().isLength({ max: 120 }).withMessage('q deve ter no maximo 120 caracteres').escape()
]);

const qrTokenIdParamValidator = withValidation([
  param('id').isInt({ min: 1 }).withMessage('ID do token invalido').toInt()
]);

const validateQrTokenValidator = withValidation([
  qrCodeRule()
]);

const funcionarioLoginValidator = withValidation([
  qrCodeRule(),
  body('login')
    .optional()
    .trim()
    .isLength({ min: 3, max: 150 })
    .withMessage('Login invalido'),
  cpfRule('cpf', false),
  body('senha')
    .isString()
    .withMessage('Senha deve ser texto')
    .isLength({ min: 8, max: 72 })
    .withMessage('Senha deve ter entre 8 e 72 caracteres')
]);

const baterPontoValidator = withValidation([
  qrCodeRule(),
  body('latitude')
    .notEmpty()
    .withMessage('Localizacao obrigatoria para bater ponto')
    .bail()
    .isFloat({ min: -90, max: 90 })
    .withMessage('latitude invalida')
    .toFloat(),
  body('longitude')
    .notEmpty()
    .withMessage('Localizacao obrigatoria para bater ponto')
    .bail()
    .isFloat({ min: -180, max: 180 })
    .withMessage('longitude invalida')
    .toFloat()
]);

module.exports = {
  adminLoginValidator,
  createFuncionarioValidator,
  updateFuncionarioValidator,
  funcionarioStatusValidator,
  paginationValidator,
  qrTokenIdParamValidator,
  validateQrTokenValidator,
  funcionarioLoginValidator,
  baterPontoValidator
};
