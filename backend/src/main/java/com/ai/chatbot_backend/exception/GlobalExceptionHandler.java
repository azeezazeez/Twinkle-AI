package com.ai.chatbot_backend.exception;

import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.HttpServerErrorException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

import java.net.ConnectException;
import java.net.SocketTimeoutException;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.TimeoutException;

@RestControllerAdvice
@Slf4j
public class GlobalExceptionHandler {

    @ExceptionHandler(AIServiceException.class)
    public ResponseEntity<Map<String, Object>> handleAIServiceException(
            AIServiceException ex,
            HttpServletRequest request) {

        log.error(
                "AI service error: path={}, message={}",
                request.getRequestURI(),
                ex.getMessage(),
                ex
        );

        String technicalMessage =
                ex.getMessage() == null
                        ? ""
                        : ex.getMessage().toLowerCase();

        HttpStatus status = HttpStatus.SERVICE_UNAVAILABLE;

        String userMessage =
                "The AI service is temporarily unavailable. Please try again shortly.";

        if (technicalMessage.contains("429")
                || technicalMessage.contains("too many requests")
                || technicalMessage.contains("rate_limit")
                || technicalMessage.contains("rate limit")
                || technicalMessage.contains("token per minute")
                || technicalMessage.contains("output tokens per minute")) {

            status = HttpStatus.TOO_MANY_REQUESTS;

            userMessage =
                    "The AI service is currently busy. Please wait a few seconds and try again.";

        } else if (technicalMessage.contains("401")
                || technicalMessage.contains("403")
                || technicalMessage.contains("unauthorized")
                || technicalMessage.contains("forbidden")) {

            status = HttpStatus.BAD_GATEWAY;

            userMessage =
                    "The AI service could not authenticate the request. Please try again later.";

        } else if (technicalMessage.contains("404")
                || technicalMessage.contains("model not found")) {

            status = HttpStatus.BAD_GATEWAY;

            userMessage =
                    "The selected AI model is currently unavailable. Please choose another model.";

        } else if (technicalMessage.contains("400")
                || technicalMessage.contains("bad request")
                || technicalMessage.contains("invalid request")) {

            status = HttpStatus.BAD_REQUEST;

            userMessage =
                    "The AI request could not be processed. Please check your message and try again.";

        } else if (technicalMessage.contains("timeout")
                || technicalMessage.contains("timed out")) {

            status = HttpStatus.GATEWAY_TIMEOUT;

            userMessage =
                    "The AI service took too long to respond. Please try again.";

        } else if (technicalMessage.contains("connect")
                || technicalMessage.contains("connection")
                || technicalMessage.contains("unknown host")) {

            status = HttpStatus.BAD_GATEWAY;

            userMessage =
                    "Unable to connect to the AI service right now. Please try again shortly.";

        } else if (technicalMessage.contains("413")
                || technicalMessage.contains("payload too large")
                || technicalMessage.contains("request too large")) {

            status = HttpStatus.PAYLOAD_TOO_LARGE;

            userMessage =
                    "The request is too large. Please shorten your message or upload a smaller file.";

        } else if (technicalMessage.contains("500")
                || technicalMessage.contains("502")
                || technicalMessage.contains("503")
                || technicalMessage.contains("internal server error")
                || technicalMessage.contains("service unavailable")) {

            status = HttpStatus.BAD_GATEWAY;

            userMessage =
                    "The AI service is temporarily unavailable. Please try again shortly.";
        }

        return buildErrorResponse(
                status,
                userMessage,
                "AI_SERVICE_ERROR",
                request.getRequestURI()
        );
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<Map<String, Object>> handleMaxUploadSize(
            MaxUploadSizeExceededException ex,
            HttpServletRequest request) {

        log.warn(
                "File upload too large: path={}, message={}",
                request.getRequestURI(),
                ex.getMessage()
        );

        return buildErrorResponse(
                HttpStatus.PAYLOAD_TOO_LARGE,
                "The uploaded file is too large. Please upload a smaller file.",
                "FILE_TOO_LARGE",
                request.getRequestURI()
        );
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, Object>> handleValidation(
            MethodArgumentNotValidException ex,
            HttpServletRequest request) {

        String message = ex.getBindingResult()
                .getFieldErrors()
                .stream()
                .findFirst()
                .map(error -> {
                    String defaultMessage = error.getDefaultMessage();

                    return defaultMessage == null
                            || defaultMessage.isBlank()
                            ? "Please check the submitted information."
                            : defaultMessage;
                })
                .orElse("Please check the submitted information.");

        return buildErrorResponse(
                HttpStatus.BAD_REQUEST,
                message,
                "VALIDATION_ERROR",
                request.getRequestURI()
        );
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, Object>> handleIllegalArgument(
            IllegalArgumentException ex,
            HttpServletRequest request) {

        log.warn(
                "Invalid request: path={}, message={}",
                request.getRequestURI(),
                ex.getMessage()
        );

        String message = ex.getMessage();

        if (message == null || message.isBlank()) {
            message = "The request contains invalid information.";
        }

        return buildErrorResponse(
                HttpStatus.BAD_REQUEST,
                message,
                "INVALID_REQUEST",
                request.getRequestURI()
        );
    }

    @ExceptionHandler(SocketTimeoutException.class)
    public ResponseEntity<Map<String, Object>> handleSocketTimeout(
            SocketTimeoutException ex,
            HttpServletRequest request) {

        log.error(
                "Socket timeout: path={}",
                request.getRequestURI(),
                ex
        );

        return buildErrorResponse(
                HttpStatus.GATEWAY_TIMEOUT,
                "The server took too long to respond. Please try again.",
                "TIMEOUT",
                request.getRequestURI()
        );
    }

    @ExceptionHandler(ConnectException.class)
    public ResponseEntity<Map<String, Object>> handleConnection(
            ConnectException ex,
            HttpServletRequest request) {

        log.error(
                "Connection failure: path={}",
                request.getRequestURI(),
                ex
        );

        return buildErrorResponse(
                HttpStatus.BAD_GATEWAY,
                "Unable to connect to the required service. Please try again shortly.",
                "CONNECTION_ERROR",
                request.getRequestURI()
        );
    }

    @ExceptionHandler(HttpClientErrorException.class)
    public ResponseEntity<Map<String, Object>> handleHttpClientError(
            HttpClientErrorException ex,
            HttpServletRequest request) {

        log.error(
                "External client error: status={}, path={}, response={}",
                ex.getStatusCode(),
                request.getRequestURI(),
                ex.getResponseBodyAsString()
        );

        return buildErrorResponse(
                HttpStatus.BAD_GATEWAY,
                "The external service rejected the request. Please try again.",
                "EXTERNAL_SERVICE_ERROR",
                request.getRequestURI()
        );
    }

    @ExceptionHandler(HttpServerErrorException.class)
    public ResponseEntity<Map<String, Object>> handleHttpServerError(
            HttpServerErrorException ex,
            HttpServletRequest request) {

        log.error(
                "External server error: status={}, path={}, response={}",
                ex.getStatusCode(),
                request.getRequestURI(),
                ex.getResponseBodyAsString()
        );

        return buildErrorResponse(
                HttpStatus.BAD_GATEWAY,
                "An external service is temporarily unavailable. Please try again shortly.",
                "EXTERNAL_SERVICE_ERROR",
                request.getRequestURI()
        );
    }

    @ExceptionHandler(TimeoutException.class)
    public ResponseEntity<Map<String, Object>> handleTimeout(
            TimeoutException ex,
            HttpServletRequest request) {

        log.error(
                "Timeout: path={}",
                request.getRequestURI(),
                ex
        );

        return buildErrorResponse(
                HttpStatus.GATEWAY_TIMEOUT,
                "The request timed out. Please try again.",
                "TIMEOUT",
                request.getRequestURI()
        );
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> handleUnexpected(
            Exception ex,
            HttpServletRequest request) {

        log.error(
                "Unexpected server error: path={}, message={}",
                request.getRequestURI(),
                ex.getMessage(),
                ex
        );

        return buildErrorResponse(
                HttpStatus.INTERNAL_SERVER_ERROR,
                "Something went wrong on the server. Please try again shortly.",
                "INTERNAL_SERVER_ERROR",
                request.getRequestURI()
        );
    }

    private ResponseEntity<Map<String, Object>> buildErrorResponse(
            HttpStatus status,
            String message,
            String code,
            String path) {

        Map<String, Object> body = new LinkedHashMap<>();

        body.put("error", message);
        body.put("message", message);
        body.put("code", code);
        body.put("status", status.value());
        body.put("path", path);
        body.put("timestamp", System.currentTimeMillis());

        return ResponseEntity
                .status(status)
                .body(body);
    }
}
