package br.com.atestaponto.punch.service;

import br.com.atestaponto.punch.dto.PunchRequest;
import br.com.atestaponto.punch.dto.PunchResponse;
import br.com.atestaponto.punch.repository.PunchRepository;
import br.com.atestaponto.punch.repository.PunchRepository.Row;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.TreeMap;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PunchService {
    private static final ZoneId BRASILIA = ZoneId.of("America/Sao_Paulo");
    private static final DateTimeFormatter DATE_TIME = DateTimeFormatter.ofPattern("uuuu-MM-dd HH:mm:ss");
    private static final List<String> TYPES = List.of("ENTRADA", "SAIDA_ALMOCO", "RETORNO_ALMOCO", "SAIDA");
    private static final long MAX_SAFE_INTEGER = 9007199254740991L;
    private final PunchRepository repository;
    private final ObjectMapper json;

    public PunchService(PunchRepository repository, ObjectMapper json) {
        this.repository = repository;
        this.json = json;
    }

    private long employeeId(PunchRequest request) {
        JsonNode id = request.funcionario_id();
        if (id == null || !id.isIntegralNumber() || !id.canConvertToLong()
                || id.longValue() < 1 || id.longValue() > MAX_SAFE_INTEGER) {
            throw new PunchException(401, "UNAUTHORIZED", "Sessao do funcionario invalida");
        }
        return id.longValue();
    }

    private PunchException badRequest(String message) { return new PunchException(400, "BAD_REQUEST", message); }
    private PunchException forbidden(String message) { return new PunchException(403, "FORBIDDEN", message); }
    private PunchException notFound(String message) { return new PunchException(404, "NOT_FOUND", message); }
    private PunchException conflict(String message) { return new PunchException(409, "CONFLICT", message); }

    @Transactional
    public PunchResponse.Registration register(PunchRequest request) {
        long employeeId = employeeId(request);
        String key = request.chave_idempotencia();
        if (key == null || !key.matches("(?i)[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}")) {
            throw badRequest("chaveIdempotencia deve ser um UUID v4");
        }
        key = key.toLowerCase(Locale.ROOT);
        JsonNode reading;
        try {
            reading = request.leitura_json() == null ? null : json.readTree(request.leitura_json());
        } catch (JsonProcessingException error) {
            throw badRequest("Localizacao invalida para registro de ponto");
        }
        if (reading == null || !reading.isArray() || (reading.size() != 2 && reading.size() != 4)
                || !coordinate(reading.get(0), 90) || !coordinate(reading.get(1), 180)) {
            throw badRequest("Localizacao invalida para registro de ponto");
        }
        String hash = sha256(request.leitura_json());
        var employee = repository.lockEmployee(employeeId);
        var previous = repository.lockIdempotency(employeeId, key);
        if (previous != null) {
            if (!previous.hash().equals(hash)) throw conflict("Chave de idempotencia ja usada com outros dados");
            try {
                return new PunchResponse.Registration(true, json.readTree(previous.response()));
            } catch (JsonProcessingException error) {
                throw new IllegalStateException("Resposta de idempotencia invalida", error);
            }
        }
        if (employee == null) throw notFound("Funcionario nao encontrado");
        if (!employee.ativo()) throw forbidden("Funcionario inativo");
        if (reading.size() != 4 || !reading.get(2).isNumber() || !Double.isFinite(reading.get(2).doubleValue())
                || reading.get(2).doubleValue() <= 0 || reading.get(2).doubleValue() > 100
                || !reading.get(3).isIntegralNumber() || !reading.get(3).canConvertToLong()
                || reading.get(3).longValue() <= 0 || reading.get(3).longValue() > MAX_SAFE_INTEGER) {
            throw badRequest("Leitura GPS exige precisao maior que zero e de ate 100 metros, com timestamp em milissegundos.");
        }
        Long linkId = repository.activeLink(employeeId, true);
        if (linkId == null) throw notFound("Funcionario sem vinculo ativo");
        var location = repository.location(linkId);
        if (location == null) throw notFound("Unidade escolar do vinculo nao encontrada");
        double distance = distance(location, reading.get(0).doubleValue(), reading.get(1).doubleValue(),
                reading.get(2).doubleValue());
        var now = Instant.now().atZone(BRASILIA);
        LocalDate date = now.toLocalDate();
        List<Row> rows = repository.day(linkId, date, true);
        // Replay retorna antes desta regra; novas acoes revalidam o GPS depois de adquirir os locks.
        long age = Instant.now().toEpochMilli() - reading.get(3).longValue();
        if (age > 60000 || age < -5000) {
            throw badRequest("Leitura GPS vencida ou com horario futuro. Atualize a localizacao e confira o relogio do aparelho.");
        }
        int next = next(times(rows));
        if (next == 4) throw conflict("Funcionario ja realizou 4 batidas hoje");
        String dateTime = DATE_TIME.format(now);
        long id = repository.insert(linkId, date, TYPES.get(next), dateTime);
        String cpf = employee.cpf() == null ? "" : employee.cpf().replaceAll("[^0-9]", "");
        var response = new PunchResponse.Registered(
                new PunchResponse.Punch(id, next + 1, TYPES.get(next), dateTime, distance),
                new PunchResponse.Employee(employee.id(), employee.nome(), employee.email(),
                        cpf.length() == 11 ? "***.***.***-" + cpf.substring(9) : "***.***.***-**"));
        JsonNode responseJson = json.valueToTree(response);
        repository.saveIdempotency(employeeId, key, hash, responseJson.toString());
        return new PunchResponse.Registration(false, responseJson);
    }

    private String sha256(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException error) {
            throw new IllegalStateException(error);
        }
    }

    private boolean coordinate(JsonNode value, double bound) {
        return value != null && value.isNumber() && Double.isFinite(value.doubleValue())
                && Math.abs(value.doubleValue()) <= bound;
    }

    private double distance(PunchRepository.Location location, double latitude, double longitude, double accuracy) {
        if (location.latitude() == null || location.longitude() == null || location.radius() == null
                || !Double.isFinite(location.latitude().doubleValue()) || Math.abs(location.latitude().doubleValue()) > 90
                || !Double.isFinite(location.longitude().doubleValue()) || Math.abs(location.longitude().doubleValue()) > 180
                || location.radius() <= 0) {
            throw forbidden("Geolocalizacao da unidade nao configurada corretamente. Contate a administracao.");
        }
        double originLat = location.latitude().doubleValue(), originLon = location.longitude().doubleValue();
        double dLat = (latitude - originLat) * Math.PI / 180, dLon = (longitude - originLon) * Math.PI / 180;
        double lat1 = originLat * Math.PI / 180, lat2 = latitude * Math.PI / 180;
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        a = Math.min(1, Math.max(0, a));
        double meters = 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        if (meters + accuracy > location.radius()) {
            throw forbidden("A localizacao e sua margem de precisao devem estar dentro da area permitida da escola.");
        }
        return new BigDecimal(meters).setScale(2, RoundingMode.HALF_UP).doubleValue();
    }

    private LocalDate referenceDate(PunchRequest request) {
        return (request.referencia() == null ? Instant.now() : request.referencia()).atZone(BRASILIA).toLocalDate();
    }

    private String[] times(List<Row> rows) {
        String[] result = new String[4];
        for (Row row : rows) {
            int index = TYPES.indexOf(row.type());
            if (index >= 0 && row.time() != null && !row.time().equals("00:00:00")) result[index] = row.time();
        }
        return result;
    }

    private int next(String[] times) {
        for (int i = 0; i < times.length; i++) if (times[i] == null) return i;
        return 4;
    }

    @Transactional(readOnly = true)
    public PunchResponse.Today today(PunchRequest request) {
        long employeeId = employeeId(request);
        var employee = repository.dashboard(employeeId);
        if (employee == null) throw notFound("Funcionario nao encontrado");
        if (!employee.ativo()) throw forbidden("Funcionario inativo");
        if (employee.entrada() == null || employee.saidaAlmoco() == null || employee.retornoAlmoco() == null
                || employee.saida() == null || employee.cargo() == null || employee.cargo().isEmpty()) {
            throw notFound("Funcionario sem vinculo ativo");
        }
        Long linkId = repository.activeLink(employeeId, false);
        if (linkId == null) throw notFound("Funcionario sem vinculo ativo");
        if (repository.location(linkId) == null) throw notFound("Unidade escolar do vinculo nao encontrada");
        LocalDate date = referenceDate(request);
        String[] times = times(repository.day(linkId, date, false));
        int next = next(times);
        return new PunchResponse.Today(new PunchResponse.EmployeeSummary(employee.nome(), employee.cargo()),
                new PunchResponse.Schedule(employee.entrada(), employee.saidaAlmoco(), employee.retornoAlmoco(), employee.saida()),
                new PunchResponse.Day(date.toString(), times[0], times[1], times[2], times[3]),
                next == 4 ? null : TYPES.get(next), next == 4);
    }

    @Transactional(readOnly = true)
    public PunchResponse.History history(PunchRequest request) {
        long employeeId = employeeId(request);
        JsonNode rawMonth = request.mes();
        String month;
        if (rawMonth == null) month = YearMonth.from(referenceDate(request)).toString();
        else {
            if (!rawMonth.isTextual() || !rawMonth.textValue().matches("[0-9]{4}-(0[1-9]|1[0-2])")) {
                throw badRequest("mes deve usar o formato YYYY-MM");
            }
            month = rawMonth.textValue();
            if (Integer.parseInt(month.substring(0, 4)) < 1000) throw badRequest("mes deve conter um ano valido");
        }
        YearMonth period = YearMonth.parse(month);
        List<Row> rows = repository.history(employeeId, period.atDay(1), period.atEndOfMonth());
        // Mantem a ordenacao legada por chave textual e nunca mistura vinculos no mesmo dia.
        var groups = new TreeMap<String, List<Row>>();
        for (Row row : rows) groups.computeIfAbsent(row.date() + ":" + row.linkId(), key -> new ArrayList<>()).add(row);
        List<PunchResponse.HistoryDay> records = new ArrayList<>();
        for (var punches : groups.values()) {
            Row row = punches.getFirst();
            String[] times = times(punches);
            Integer minutes = null;
            if (Arrays.stream(times).allMatch(time -> time != null)) {
                int[] seconds = Arrays.stream(times).mapToInt(time -> LocalTime.parse(time).toSecondOfDay()).toArray();
                if (seconds[0] < seconds[1] && seconds[1] < seconds[2] && seconds[2] < seconds[3]) {
                    minutes = (seconds[1] - seconds[0] + seconds[3] - seconds[2]) / 60;
                }
            }
            records.add(new PunchResponse.HistoryDay(row.date(), times[0], times[1], times[2], times[3],
                    minutes, minutes == null ? "INCOMPLETO" : "COMPLETO", row.linkId(), row.schoolId(), row.schoolName()));
        }
        long complete = records.stream().filter(record -> record.total_minutos() != null).count();
        return new PunchResponse.History(month, new PunchResponse.Summary(
                records.stream().map(PunchResponse.HistoryDay::data_referencia).distinct().count(), complete,
                records.size() - complete, records.stream().filter(record -> record.total_minutos() != null)
                        .mapToLong(PunchResponse.HistoryDay::total_minutos).sum()), records);
    }
}
