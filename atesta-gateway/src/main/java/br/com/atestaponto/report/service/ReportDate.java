package br.com.atestaponto.report.service;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

final class ReportDate {
    private ReportDate() {}

    static LocalDate parse(String value) {
        if (value == null || !value.matches("\\d{4}-\\d{2}-\\d{2}")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Data invalida. Use o formato YYYY-MM-DD");
        }
        try {
            return LocalDate.parse(value);
        } catch (DateTimeParseException error) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Data invalida. Use o formato YYYY-MM-DD");
        }
    }
}
