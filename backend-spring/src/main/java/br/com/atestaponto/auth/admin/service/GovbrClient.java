package br.com.atestaponto.auth.admin.service;

import java.net.URI;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import org.springframework.web.util.UriComponentsBuilder;

@Service
public class GovbrClient {
    private final String authorizeUrl, tokenUrl, userinfoUrl, clientId, secret, redirectUri;
    private final RestClient client;

    public GovbrClient(@Value("${admin.govbr.authorize-url}") String authorizeUrl,
            @Value("${admin.govbr.token-url}") String tokenUrl,
            @Value("${admin.govbr.userinfo-url}") String userinfoUrl,
            @Value("${admin.govbr.client-id}") String clientId,
            @Value("${admin.govbr.client-secret}") String secret,
            @Value("${admin.govbr.redirect-uri}") String redirectUri,
            @Value("${admin.session.secure}") boolean secure) {
        for (String url : new String[]{authorizeUrl, tokenUrl, userinfoUrl, redirectUri}) {
            URI uri = URI.create(url);
            if (uri.getHost() == null || uri.getUserInfo() != null || uri.getFragment() != null
                    || !("https".equals(uri.getScheme()) || (!secure && "http".equals(uri.getScheme())))) {
                throw new IllegalArgumentException("URL Gov.br invalida");
            }
        }
        if (clientId.isBlank() || secret.isBlank()
                || !"/auth/govbr/callback".equals(URI.create(redirectUri).getPath())
                || URI.create(redirectUri).getQuery() != null) {
            throw new IllegalArgumentException("Configuracao Gov.br invalida");
        }
        this.authorizeUrl = authorizeUrl;
        this.tokenUrl = tokenUrl;
        this.userinfoUrl = userinfoUrl;
        this.clientId = clientId;
        this.secret = secret;
        this.redirectUri = redirectUri;
        var factory = new JdkClientHttpRequestFactory(HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(3)).followRedirects(HttpClient.Redirect.NEVER).build());
        factory.setReadTimeout(Duration.ofSeconds(8));
        this.client = RestClient.builder().requestFactory(factory).build();
    }

    public String authorize(String state, String challenge) {
        return UriComponentsBuilder.fromUriString(authorizeUrl).replaceQuery(null)
                .queryParam("response_type", "code").queryParam("client_id", clientId)
                .queryParam("redirect_uri", redirectUri).queryParam("scope", "openid email profile")
                .queryParam("state", state).queryParam("code_challenge", challenge)
                .queryParam("code_challenge_method", "S256").build().encode().toUriString();
    }

    public Map<?, ?> identity(String code, String verifier) {
        try {
            var form = new LinkedMultiValueMap<String, String>();
            form.add("grant_type", "authorization_code");
            form.add("code", code);
            form.add("client_id", clientId);
            form.add("client_secret", secret);
            form.add("redirect_uri", redirectUri);
            form.add("code_verifier", verifier);
            var tokens = client.post().uri(tokenUrl).headers(h -> h.setBasicAuth(clientId, secret))
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED).body(form).retrieve().body(Map.class);
            if (tokens == null || !(tokens.get("access_token") instanceof String token) || token.isBlank()) {
                throw new IllegalArgumentException();
            }
            var identity = client.get().uri(userinfoUrl).headers(h -> h.setBearerAuth(token))
                    .retrieve().body(Map.class);
            if (identity == null || !(identity.get("sub") instanceof String sub) || sub.isBlank()
                    || !(identity.get("cpf") instanceof String cpf) || !cpf.matches("[0-9]{11}")) {
                throw new IllegalArgumentException();
            }
            return identity;
        } catch (RuntimeException failure) {
            // Nao propaga corpo, URL ou causa do provedor: podem conter credenciais.
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Falha na autenticacao Gov.br");
        }
    }
}
