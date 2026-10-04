package br.com.atestaponto.address.config;

import java.net.http.HttpClient;
import java.time.Duration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpHeaders;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

@Configuration
public class BrasilApiConfiguration {

    @Bean
    public RestClient brasilApiRestClient(
            RestClient.Builder builder,
            @Value("${integrations.brasilapi.base-url}") String baseUrl,
            @Value("${integrations.brasilapi.connect-timeout}") Duration connectTimeout,
            @Value("${integrations.brasilapi.read-timeout}") Duration readTimeout) {
        if (connectTimeout.isZero() || connectTimeout.isNegative()
                || readTimeout.isZero() || readTimeout.isNegative()) {
            throw new IllegalArgumentException("Os timeouts da BrasilAPI devem ser positivos");
        }
        HttpClient httpClient = HttpClient.newBuilder()
                .connectTimeout(connectTimeout)
                .followRedirects(HttpClient.Redirect.NEVER)
                .build();
        JdkClientHttpRequestFactory requestFactory = new JdkClientHttpRequestFactory(httpClient);
        requestFactory.setReadTimeout(readTimeout);
        return builder.baseUrl(baseUrl)
                .defaultHeader(HttpHeaders.USER_AGENT, "ATestaPonto-backend-spring")
                .requestFactory(requestFactory).build();
    }
}
