package br.com.atestaponto.config;

import com.zaxxer.hikari.HikariDataSource;
import java.io.ByteArrayInputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermissions;
import java.security.KeyStore;
import java.security.cert.CertificateFactory;
import java.util.Base64;
import org.springframework.beans.factory.config.BeanPostProcessor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;

@Configuration(proxyBeanMethods = false)
public class DatabaseTlsConfiguration {
    @Bean
    static BeanPostProcessor databaseTls(Environment env) {
        return new BeanPostProcessor() {
            @Override
            public Object postProcessBeforeInitialization(Object bean, String name) {
                if (!(bean instanceof HikariDataSource dataSource)
                        || !env.getProperty("DB_SSL_ENABLED", Boolean.class, false)) return bean;
                // Converte a CA do ambiente para o truststore privado desta conexão; nunca altera o truststore da JVM.
                Path storeFile = null;
                try {
                    byte[] pem = Base64.getDecoder().decode(env.getRequiredProperty("DB_SSL_CA_BASE64"));
                    var certificates = CertificateFactory.getInstance("X.509")
                            .generateCertificates(new ByteArrayInputStream(pem));
                    if (certificates.isEmpty()) throw new IllegalArgumentException();
                    var store = KeyStore.getInstance("PKCS12");
                    char[] password = java.util.UUID.randomUUID().toString().toCharArray();
                    store.load(null, password);
                    int index = 0;
                    for (var certificate : certificates) store.setCertificateEntry("ca-" + index++, certificate);
                    storeFile = Files.createTempFile("atestaponto-mysql-", ".p12");
                    if (Files.getFileStore(storeFile).supportsFileAttributeView("posix"))
                        Files.setPosixFilePermissions(storeFile, PosixFilePermissions.fromString("rw-------"));
                    storeFile.toFile().deleteOnExit();
                    try (var output = Files.newOutputStream(storeFile)) { store.store(output, password); }
                    var properties = dataSource.getDataSourceProperties();
                    properties.setProperty("sslMode", "VERIFY_IDENTITY");
                    properties.setProperty("fallbackToSystemTrustStore", "false");
                    properties.setProperty("trustCertificateKeyStoreUrl", storeFile.toUri().toString());
                    properties.setProperty("trustCertificateKeyStoreType", "PKCS12");
                    properties.setProperty("trustCertificateKeyStorePassword", new String(password));
                } catch (Exception invalid) {
                    if (storeFile != null) {
                        try { Files.deleteIfExists(storeFile); } catch (java.io.IOException ignored) { }
                    }
                    throw new IllegalArgumentException("Configuracao TLS MySQL invalida");
                }
                return bean;
            }
        };
    }
}
