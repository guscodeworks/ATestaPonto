// parse() adaptado de dotenv 17.4.2 lib/main.js (https://github.com/motdotla/dotenv).
// Copyright (c) 2015, Scott Motte. All rights reserved.
// SPDX-License-Identifier: BSD-2-Clause - texto integral em META-INF/LICENSE-dotenv.txt.
package br.com.atestaponto.config;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.context.config.ConfigDataEnvironmentPostProcessor;
import org.springframework.boot.env.EnvironmentPostProcessor;
import org.springframework.core.Ordered;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.MapPropertySource;
import org.springframework.core.env.StandardEnvironment;

// Le somente ./.env, se existir, com a semantica do dotenv do gateway (aspas, #, \, export e multilinhas).
// Fica abaixo de -D e do ambiente e acima de application.properties. dotenv-java diverge, por isso nao e usado.
public class DotenvEnvironmentPostProcessor implements EnvironmentPostProcessor, Ordered {

    // \s e trim() do JavaScript incluem espacos Unicode e BOM, ao contrario do \s do Java.
    private static final String WS =
            "[\\t\\n\\x0B\\f\\r \\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000\\uFEFF]";
    private static final Pattern LINE = Pattern.compile(
            ("(?:^|^)WS*(?:exportWS+)?([\\w.-]+)(?:WS*=WS*?|:WS+?)"
                    + "(WS*'(?:\\\\'|[^'])*'|WS*\"(?:\\\\\"|[^\"])*\"|WS*`(?:\\\\`|[^`])*`|[^#\\r\\n]+)?"
                    + "WS*(?:#.*)?(?:$|$)").replace("WS", WS),
            Pattern.MULTILINE);
    private static final Pattern TRIM = Pattern.compile(("^WS+|WS+$").replace("WS", WS));
    private static final Pattern QUOTED = Pattern.compile("^(['\"`])([\\s\\S]*)\\1$", Pattern.MULTILINE);

    @Override
    public int getOrder() {
        // Antes de ConfigData, para application.properties ja resolver as chaves do .env.
        return ConfigDataEnvironmentPostProcessor.ORDER - 1;
    }

    @Override
    public void postProcessEnvironment(ConfigurableEnvironment environment, SpringApplication application) {
        Path file = Path.of(".env");
        if (!Files.isRegularFile(file)) {
            return;
        }
        String source;
        try {
            source = new String(Files.readAllBytes(file), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException("Nao foi possivel ler o .env", e);
        }
        environment.getPropertySources().addAfter(StandardEnvironment.SYSTEM_ENVIRONMENT_PROPERTY_SOURCE_NAME,
                new MapPropertySource("dotenv [.env]", parse(source)));
    }

    private static Map<String, Object> parse(String source) {
        Map<String, Object> values = new LinkedHashMap<>();
        Matcher line = LINE.matcher(source.replaceAll("\r\n?", "\n"));
        while (line.find()) {
            String value = TRIM.matcher(line.group(2) == null ? "" : line.group(2)).replaceAll("");
            boolean doubleQuoted = value.startsWith("\"");
            value = QUOTED.matcher(value).replaceAll("$2");
            if (doubleQuoted) {
                value = value.replace("\\n", "\n").replace("\\r", "\r");
            }
            values.put(line.group(1), value);
        }
        return values;
    }
}
