FROM maven:3.9.11-eclipse-temurin-21@sha256:6fdc855a6ed81d288ca7ca37ac6ff5e9308b612485c0801d70b25a858c83d237 AS build
WORKDIR /build
COPY pom.xml ./
COPY src ./src
RUN mvn --batch-mode --no-transfer-progress -DskipTests \
    -Dproject.build.outputTimestamp=2026-01-01T00:00:00Z clean package

FROM eclipse-temurin:21-jre-jammy@sha256:affcab5356e1270ac35d2361ee83135af2f03e8d580eca78a6d5d6fdbf048db0
RUN groupadd --gid 10001 app \
    && useradd --uid 10001 --gid app --no-create-home --shell /usr/sbin/nologin app
WORKDIR /app
COPY --from=build /build/target/backend-spring-*.jar ./app.jar
ENV SERVER_PORT=8081
USER 10001:10001
EXPOSE 8081
HEALTHCHECK --interval=30s --timeout=8s --start-period=60s --retries=3 \
    CMD ["bash", "-ec", "exec 3<>/dev/tcp/127.0.0.1/${SERVER_PORT}; printf 'GET /ready HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n' >&3; IFS= read -r status <&3; [[ $status == 'HTTP/1.1 200 '* ]]"]
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
