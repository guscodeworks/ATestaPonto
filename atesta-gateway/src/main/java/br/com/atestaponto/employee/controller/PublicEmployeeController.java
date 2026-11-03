package br.com.atestaponto.employee.controller;

import br.com.atestaponto.auth.admin.service.PublicEmployeeAuthorization;
import br.com.atestaponto.auth.admin.service.PublicEmployeeAuthorization.Context;
import br.com.atestaponto.employee.service.PublicEmployeeService;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.http.HttpStatus;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/admin/funcionarios")
public class PublicEmployeeController {
    public record Response<T>(boolean success, T data) {}
    private final PublicEmployeeService service;

    public PublicEmployeeController(PublicEmployeeService service) { this.service = service; }

    @GetMapping({"", "/"})
    public Response<?> list(@RequestAttribute(PublicEmployeeAuthorization.CONTEXT_ATTRIBUTE) Context context,
            @RequestParam MultiValueMap<String, String> query) {
        return new Response<>(true, service.list(context, query));
    }

    @GetMapping({"/unidades", "/unidades/"})
    public Response<?> units(@RequestAttribute(PublicEmployeeAuthorization.CONTEXT_ATTRIBUTE) Context context) {
        return new Response<>(true, service.registrationUnits(context));
    }

    @GetMapping({"/{id}", "/{id}/"})
    public Response<?> find(@RequestAttribute(PublicEmployeeAuthorization.CONTEXT_ATTRIBUTE) Context context,
            @PathVariable long id) {
        return new Response<>(true, service.find(context, id));
    }

    @PostMapping({"", "/"})
    @ResponseStatus(HttpStatus.CREATED)
    public Response<?> create(@RequestAttribute(PublicEmployeeAuthorization.CONTEXT_ATTRIBUTE) Context context,
            @RequestBody JsonNode body) {
        return new Response<>(true, service.create(context, body));
    }

    @PatchMapping({"/{id}", "/{id}/"})
    public Response<?> edit(@RequestAttribute(PublicEmployeeAuthorization.CONTEXT_ATTRIBUTE) Context context,
            @PathVariable long id, @RequestBody JsonNode body) {
        return new Response<>(true, service.edit(context, id, body));
    }

    @PatchMapping({"/{id}/desativar", "/{id}/desativar/"})
    public Response<?> deactivate(@RequestAttribute(PublicEmployeeAuthorization.CONTEXT_ATTRIBUTE) Context context,
            @PathVariable long id, @RequestBody JsonNode body) {
        return new Response<>(true, service.activation(context, id, false, body));
    }

    @PatchMapping({"/{id}/reativar", "/{id}/reativar/"})
    public Response<?> reactivate(@RequestAttribute(PublicEmployeeAuthorization.CONTEXT_ATTRIBUTE) Context context,
            @PathVariable long id, @RequestBody JsonNode body) {
        return new Response<>(true, service.activation(context, id, true, body));
    }
}
