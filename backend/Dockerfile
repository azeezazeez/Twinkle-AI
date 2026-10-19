# Stage 1: Build
FROM eclipse-temurin:17-jdk-alpine AS build
RUN apk add --no-cache maven
WORKDIR /app
COPY pom.xml .
RUN mvn dependency:go-offline -B
COPY src src
RUN mvn package -DskipTests

# Stage 2: Run
FROM eclipse-temurin:17-jre-alpine
WORKDIR /app

# Install Tesseract OCR + English language data
RUN apk add --no-cache tesseract-ocr tesseract-ocr-data-eng

# FIX: The actual tessdata directory in Alpine is /usr/share/tesseract-ocr/4.00/tessdata/
# The old path /usr/share/tessdata does not exist, causing Tesseract to crash with SIGSEGV
ENV TESSDATA_PREFIX=/usr/share/tesseract-ocr/4.00/tessdata

# Verify Tesseract can find its language files at build time (will fail build if broken)
RUN tesseract --list-langs 2>&1 | grep -q "eng" && echo "✅ Tesseract eng language found" || (echo "❌ Tesseract language data missing" && exit 1)

COPY --from=build /app/target/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-jar", "app.jar"]
