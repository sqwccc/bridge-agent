FROM eclipse-temurin:25-jdk-alpine AS builder
WORKDIR /workspace
COPY .mvn/ .mvn/
COPY mvnw pom.xml ./
RUN sed -i 's/\r$//' mvnw && chmod +x mvnw
COPY src/ src/
RUN ./mvnw --batch-mode -DskipTests package

FROM eclipse-temurin:25-jre-alpine
WORKDIR /app
RUN addgroup -S bridgemind && adduser -S -G bridgemind bridgemind
COPY --from=builder --chown=bridgemind:bridgemind /workspace/target/bridgemind-server-1.0.0.jar application.jar
USER bridgemind
EXPOSE 8088
ENTRYPOINT ["java","-jar","/app/application.jar"]
