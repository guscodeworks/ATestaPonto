const { body, param, query } = require("express-validator");
const { isValidCpf, normalizeCpf } = require("../utils/cpf");
const { validateRequest } = require("./validateRequest");
const {
  PERFIL_SEDUC,
  PERFIL_DIRETORIA,
  PERFIS_ESCOLARES,
} = require("./adminScope");

// Perfis administrativos válidos para concessão (espelham o ENUM do banco).
const PERFIS_ADM = [PERFIL_SEDUC, PERFIL_DIRETORIA, ...PERFIS_ESCOLARES];

// Token de QR Code de ponto: 64 caracteres hexadecimais.
const QR_TOKEN_REGEX = /^[a-f0-9]{64}$/i;

// Caminho aceito para links de acesso via QR Code (com ou sem barra inicial/final).
const QR_ACCESS_PATH_REGEX = /^\/?ponto\/acessar\/?$/i;
const CARGO_TYPES = ["FUNCIONARIO", "INSPETOR", "PROFESSOR"];

// Edição aceita os mesmos cargos do cadastro (PROFESSOR incluído).
const EDITABLE_CARGO_TYPES = CARGO_TYPES;
const EDITABLE_EMPLOYEE_FIELDS = new Set([
  "nome",
  "email",
  "telefone",
  "cargo",
  "entrada",
  "saida_almoco",
  "retorno_almoco",
  "saida",
]);
const CARGO_TIME_FIELDS = [
  "entrada",
  "saida_almoco",
  "retorno_almoco",
  "saida",
];
const TIME_REGEX = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function timeToSeconds(value) {
  const [hours, minutes, seconds = "0"] = String(value).split(":");
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
}

// Regras + validateRequest centralizado.
function withValidation(rules) {
  return [...rules, validateRequest];
}

/**
 * Normaliza CPF antes de validar para bloquear formatos diferentes do mesmo documento.
 */
function cpfRule(field = "cpf", required = true) {
  const chain = body(field).customSanitizer((value) => normalizeCpf(value));
  if (required) {
    chain.notEmpty().withMessage("CPF e obrigatorio");
  } else {
    chain.optional();
  }
  return chain
    .isLength({ min: 11, max: 11 })
    .withMessage("CPF deve ter 11 digitos")
    .custom((value) => {
      if (!isValidCpf(value)) {
        throw new Error("CPF invalido");
      }
      return true;
    });
}

// Aceita qrCode, qr_code ou qrToken (compat. com versões antigas).
function getQrCodeCandidate(value, { req }) {
  return String(
    value || req.body.qr_code || req.body.qrCode || req.body.qrToken || ""
  );
}

function qrCodeRule() {
  return body("qrCode")
    .customSanitizer(getQrCodeCandidate)
    .trim()
    .notEmpty()
    .withMessage("Link de ponto e obrigatorio")
    .custom((value) => {
      const normalized = String(value || "").trim();

      // O QR atual aceita link de acesso; tokens antigos continuam validos na entrada.
      if (
        QR_TOKEN_REGEX.test(normalized) ||
        QR_ACCESS_PATH_REGEX.test(normalized)
      ) {
        return true;
      }

      /* Também aceita a URL completa lida pelo QR Code (ex: https://dominio/ponto/acessar),
       extraindo e validando apenas o pathname.
       */
      try {
        const url = new URL(normalized);
        if (QR_ACCESS_PATH_REGEX.test(url.pathname)) {
          return true;
        }
      } catch (_error) {
        // Valor não é uma URL válida; cai no erro padrão abaixo.
      }

      throw new Error("Link de ponto invalido");
    });
}

const createFuncionarioValidator = withValidation([
  // A senha inicial nao faz parte deste contrato: ela e gerada e protegida
  // exclusivamente pelo service depois que os dados cadastrais sao validados.
  body("nome")
    .trim()
    .notEmpty()
    .withMessage("Nome e obrigatorio")
    .isLength({ min: 3, max: 55 })
    .withMessage("Nome deve ter entre 3 e 55 caracteres")
    .matches(/^[^<>]*$/)
    .withMessage("Nome contem caracteres invalidos")
    .escape(),
  cpfRule("cpf", true),
  body("email")
    .trim()
    .notEmpty()
    .withMessage("Email e obrigatorio")
    .isLength({ max: 150 })
    .withMessage("Email muito longo")
    .isEmail()
    .withMessage("Email invalido")
    .normalizeEmail({ gmail_remove_dots: false }),
 body("cargo_id")
   .custom((_value, { req }) => {
     if (Object.prototype.hasOwnProperty.call(req.body, "cargo_id")) {
       throw new Error("cargo_id nao e aceito no cadastro de funcionario");
     }
     return true;
   }),
   
  // unidade_escolar_id é OBRIGATORIO no novo schema: o vínculo funcional
  // (que carrega a jornada) exige uma unidade, e a geolocalização do ponto
  // passa a vir dessa unidade. Aqui validamos apenas a forma (inteiro > 0);
  // a existência da unidade é confirmada no service (consulta ao model), que
  // também recebe essa mesma gestão de transação para o vínculo.
  body("unidade_escolar_id")
    .customSanitizer((value) => {
      if (value === undefined || value === null || value === "") return NaN;
      return Number(value);
    })
    .custom((value) => {
      if (!Number.isFinite(value) || !Number.isInteger(value) || value < 1) {
        throw new Error(
          "unidade_escolar_id e obrigatorio e deve ser um inteiro positivo"
        );
      }
      return true;
    }),
  body("cargo")
    .trim()
    .notEmpty()
    .withMessage("cargo e obrigatorio")
    .toUpperCase()
    .isIn(CARGO_TYPES)
    .withMessage("cargo invalido"),
  body(CARGO_TIME_FIELDS)
    .trim()
    .notEmpty()
    .withMessage("horario de cargo e obrigatorio")
    .matches(TIME_REGEX)
    .withMessage("horario de cargo invalido"),
  body("saida").custom((_value, { req }) => {
    const times = CARGO_TIME_FIELDS.map((field) => req.body[field]);
    if (times.some((time) => !TIME_REGEX.test(String(time || "")))) {
      return true;
    }

    const seconds = times.map(timeToSeconds);
    const ordered = seconds.every(
      (value, index) => index === 0 || seconds[index - 1] < value
    );
    if (!ordered) {
      throw new Error(
        "horarios devem seguir entrada < saida_almoco < retorno_almoco < saida"
      );
    }
    return true;
  }),
  body("telefone")
    .customSanitizer((value) => {
      const digits = String(value || "").replace(/\D/g, "");
      return digits || null;
    })
    .custom((value) => {
      if (value === null || /^\d{10,11}$/.test(value)) return true;
      throw new Error("telefone deve ter 10 ou 11 digitos");
    }),
  
  /* Aceita diferentes representações de booleano pois o valor pode chegar como
   string (form-data/querystring) ou como boolean/number (JSON).
  */
  body("ativo")
    .exists()
    .withMessage("ativo e obrigatorio")
    .isIn(["true", "false", true, false, 1, 0, "1", "0"])
    .withMessage("ativo deve ser booleano")
    .toBoolean(),
]);

const employeeIdValidator = withValidation([
  param("id")
    .isInt({ min: 1 })
    .withMessage("ID de funcionario invalido")
    .toInt(),
]);

const updateFuncionarioValidator = withValidation([
  param("id")
    .isInt({ min: 1 })
    .withMessage("ID de funcionario invalido")
    .toInt(),
  body().custom((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("Corpo da requisicao invalido");
    }

    const fields = Object.keys(value);
    if (fields.length === 0) {
      throw new Error("Informe ao menos um campo para atualizacao");
    }

    if (fields.some((field) => !EDITABLE_EMPLOYEE_FIELDS.has(field))) {
      throw new Error("A requisicao contem campos nao permitidos");
    }

    return true;
  }),
  body("nome")
    .optional()
    .trim()
    .isLength({ min: 3, max: 150 })
    .withMessage("Nome deve ter entre 3 e 150 caracteres")
    .matches(/^[^<>]*$/)
    .withMessage("Nome contem caracteres invalidos")
    .escape(),
  body("email")
    .optional()
    .trim()
    .isLength({ max: 150 })
    .withMessage("Email muito longo")
    .isEmail()
    .withMessage("Email invalido")
    .normalizeEmail({ gmail_remove_dots: false }),
  body("telefone")
    .optional({ nullable: true })
    .customSanitizer((value) => {
      if (value === null || value === "") return null;
      return String(value).replace(/\D/g, "");
    })
    .custom((value) => value === null || /^\d{10,11}$/.test(value))
    .withMessage("Telefone deve ter 10 ou 11 digitos"),
  body("cargo")
    .optional()
    .trim()
    .toUpperCase()
    .isIn(EDITABLE_CARGO_TYPES)
    .withMessage("cargo invalido"),
  ...CARGO_TIME_FIELDS.map((field) =>
    body(field)
      .optional()
      .trim()
      .matches(TIME_REGEX)
      .withMessage(`${field} deve estar no formato HH:mm`)
  ),
]);

function employeeActivationValidator(expectedConfirmation) {
  return withValidation([
    param("id")
      .isInt({ min: 1 })
      .withMessage("ID de funcionario invalido")
      .toInt(),
    body().custom((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("Corpo da requisicao invalido");
      }

      const fields = Object.keys(value);
      if (fields.length !== 1 || fields[0] !== "confirmacao") {
        throw new Error("Envie somente o campo confirmacao");
      }

      return true;
    }),
    body("confirmacao")
      .isString()
      .withMessage("confirmacao deve ser texto")
      .equals(expectedConfirmation)
      .withMessage(`confirmacao deve ser ${expectedConfirmation}`),
  ]);
}

const deactivateEmployeeValidator = employeeActivationValidator("DESATIVAR");
const reactivateEmployeeValidator = employeeActivationValidator("REATIVAR");

const paginationValidator = withValidation([
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("page deve ser >= 1")
    .toInt(),
  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("limit deve ser entre 1 e 100")
    .toInt(),
  query("ativo")
    .optional()
    .isIn(["true", "false", "1", "0"])
    .withMessage("ativo invalido")
    .toBoolean(),
  query("cargo")
    .optional()
    .trim()
    .toUpperCase()
    .isIn(CARGO_TYPES)
    .withMessage("cargo invalido"),
  query("q")
    .optional()
    .trim()
    .isLength({ max: 120 })
    .withMessage("q deve ter no maximo 120 caracteres")
    .escape(),
]);

const qrShortcutIdParamValidator = withValidation([
  param("id")
    .isInt({ min: 1 })
    .withMessage("ID do link de ponto invalido")
    .toInt(),
]);

const validateQrShortcutValidator = withValidation([qrCodeRule()]);

const funcionarioLoginValidator = withValidation([
  body("identificador")
    // Compatibilidade de entrada com clientes anteriores. Independentemente
    // do nome recebido, apenas identificador normalizado segue para o service.
    .customSanitizer((value, { req }) => {
      const candidate = value ?? req.body.login ?? req.body.email ?? req.body.cpf;
      const normalized = String(candidate || "").trim();
      return normalized.includes("@")
        ? normalized.toLowerCase()
        : normalizeCpf(normalized);
    })
    .notEmpty()
    .withMessage("CPF ou email e obrigatorio")
    .bail()
    .isLength({ max: 150 })
    .withMessage("CPF ou email invalido")
    .bail()
    .custom((value) => {
      const valid = value.includes("@")
        ? EMAIL_REGEX.test(value)
        : isValidCpf(value);
      if (!valid) throw new Error("CPF ou email invalido");
      return true;
    }),
  body("senha")
    .isString()
    .withMessage("Senha deve ser texto")
    .isLength({ min: 8, max: 72 })
    .withMessage("Senha deve ter entre 8 e 72 caracteres"),
]);

const baterPontoValidator = withValidation([
  body("latitude")
    .notEmpty()
    .withMessage("Localizacao obrigatoria para bater ponto")
    .bail()
    .isFloat({ min: -90, max: 90 })
    .withMessage("latitude invalida")
    .toFloat(),
  body("longitude")
    .notEmpty()
    .withMessage("Localizacao obrigatoria para bater ponto")
    .bail()
    .isFloat({ min: -180, max: 180 })
    .withMessage("longitude invalida")
    .toFloat(),
]);

// Validação de formato apenas para concessão de acesso administrativo. Regras
// cross-field (perfil <-> diretoria/unidade, período, escopo do concedente)
// ficam no service, que as aplica antes de gravar.
const createAcessoValidator = withValidation([
  cpfRule("cpf", true),
  // nome é obrigatório só quando a identidade admin ainda não existe (service checa).
  body("nome")
    .optional()
    .trim()
    .isLength({ min: 3, max: 150 })
    .withMessage("Nome deve ter entre 3 e 150 caracteres")
    .matches(/^[^<>]*$/)
    .withMessage("Nome contem caracteres invalidos")
    .escape(),
  body("email")
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 150 })
    .withMessage("Email muito longo")
    .isEmail()
    .withMessage("Email invalido")
    .normalizeEmail({ gmail_remove_dots: false }),
  body("perfil")
    .trim()
    .notEmpty()
    .withMessage("perfil e obrigatorio")
    .toUpperCase()
    .isIn(PERFIS_ADM)
    .withMessage("perfil invalido"),
  body("diretoria_ensino_id")
    .optional()
    .isInt({ min: 1 })
    .withMessage("diretoria_ensino_id invalido")
    .toInt(),
  body("unidade_escolar_id")
    .optional()
    .isInt({ min: 1 })
    .withMessage("unidade_escolar_id invalido")
    .toInt(),
  body("status")
    .optional()
    .trim()
    .toUpperCase()
    .isIn(["ATIVO", "SUSPENSO"])
    .withMessage("status invalido"),
  body("data_inicio")
    .optional()
    .isISO8601({ strict: true })
    .withMessage("data_inicio invalida")
    .toDate(),
  body("data_fim")
    .optional()
    .isISO8601({ strict: true })
    .withMessage("data_fim invalida")
    .toDate(),
]);

const acessoIdValidator = withValidation([
  param("id")
    .isInt({ min: 1 })
    .withMessage("ID de acesso invalido")
    .toInt(),
]);

module.exports = {
  createFuncionarioValidator,
  employeeIdValidator,
  updateFuncionarioValidator,
  deactivateEmployeeValidator,
  reactivateEmployeeValidator,
  paginationValidator,
  qrShortcutIdParamValidator,
  validateQrShortcutValidator,
  funcionarioLoginValidator,
  baterPontoValidator,
  createAcessoValidator,
  acessoIdValidator,
};
