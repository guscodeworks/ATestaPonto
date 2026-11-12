package br.com.atestaponto.validation;

/** Validacao de CPF ja normalizado (somente digitos); a normalizacao fica com cada contrato de entrada. */
public final class Cpf {
    private Cpf() {}

    public static boolean valid(String cpf) {
        if (cpf == null || !cpf.matches("[0-9]{11}") || cpf.matches("([0-9])\\1{10}")) return false;
        for (int length = 9; length <= 10; length++) {
            int sum = 0;
            for (int i = 0; i < length; i++) sum += (cpf.charAt(i) - '0') * (length + 1 - i);
            int digit = sum * 10 % 11;
            if ((digit == 10 ? 0 : digit) != cpf.charAt(length) - '0') return false;
        }
        return true;
    }
}
