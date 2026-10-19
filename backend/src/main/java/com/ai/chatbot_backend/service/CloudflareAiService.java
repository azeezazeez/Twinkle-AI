package com.ai.chatbot_backend.service;

import com.ai.chatbot_backend.exception.AIServiceException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import okhttp3.MediaType;
import okhttp3.MultipartBody;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;


@Service
@Slf4j
public class CloudflareAiService {

    public static final String MODEL_PREFIX = "@cf/";

    private static final int MAX_RATE_LIMIT_RETRIES = 2;
    private static final long DEFAULT_BACKOFF_MS = 1000L;
    private static final long MAX_BACKOFF_MS = 15000L;
    private static final int MAX_OUTPUT_TOKENS = 4096;
    private static final int MAX_IMAGE_PROMPT_CHARS = 2048;

    @Value("${cloudflare.account-id:}")
    private String accountId;

    @Value("${cloudflare.api-token:}")
    private String apiToken;

    @Value("${cloudflare.api.base-url:https://api.cloudflare.com/client/v4}")
    private String baseUrl;

    @Value("${cloudflare.models:@cf/openai/gpt-oss-20b,@cf/openai/gpt-oss-120b,@cf/meta/llama-3.1-8b-instruct-fp8-fast}")
    private String configuredModels;

    @Value("${cloudflare.fallback-models:@cf/openai/gpt-oss-20b,@cf/meta/llama-3.1-8b-instruct-fp8-fast}")
    private String fallbackModels;

    @Value("${cloudflare.image.model:@cf/black-forest-labs/flux-1-schnell}")
    private String imageModel;

    @Value("${cloudflare.image.fallback-model:@cf/black-forest-labs/flux-2-klein-4b}")
    private String imageFallbackModel;

    private final ObjectMapper objectMapper;
    private final OkHttpClient client;

    public CloudflareAiService(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
        this.client = new OkHttpClient.Builder()
                .connectTimeout(15, TimeUnit.SECONDS)
                .writeTimeout(30, TimeUnit.SECONDS)
                .readTimeout(120, TimeUnit.SECONDS)
                .build();
    }

    // =========================================================
    // MODEL HELPERS
    // =========================================================

    public boolean isCloudflareModel(String model) {
        return model != null && model.trim().startsWith(MODEL_PREFIX);
    }

    public boolean isImageModel(String model) {
        if (model == null) return false;
        String m = model.trim();
        return m.equals(imageModel) || m.equals(imageFallbackModel);
    }

    public String getImageModel() {
        return imageModel;
    }

    public boolean isConfigured() {
        return !accountId.isBlank() && !apiToken.isBlank();
    }

    /** Chat models plus the image model, for the /models endpoint. */
    public List<String> getAvailableModels() {
        LinkedHashSet<String> models = new LinkedHashSet<>(split(configuredModels));
        models.add(imageModel);
        return new ArrayList<>(models);
    }

    /** First configured text model; used when an image-model prompt is plain conversation. */
    public String getDefaultChatModel() {
        for (String m : split(configuredModels)) {
            if (!isImageModel(m)) return m;
        }
        throw new AIServiceException("No Cloudflare chat model is configured.");
    }

    private static final java.util.regex.Pattern CONVERSATIONAL = java.util.regex.Pattern.compile(
            "^\\s*(hi+|hello+|hey+|hii+|yo|hola|namaste|sup|howdy|good\\s+(morning|afternoon|evening|night)|"
                    + "how\\s+are\\s+you|who\\s+are\\s+you|what\\s+can\\s+you\\s+do|what'?s\\s+up|thanks?|thank\\s+you|"
                    + "ok(ay)?|bye|help|test|testing)\\b[\\s\\p{Punct}]*(there|twinkle|buddy|friend|bro)?[\\s\\p{Punct}]*$",
            java.util.regex.Pattern.CASE_INSENSITIVE);
    private static final java.util.regex.Pattern IMAGE_WORDS = java.util.regex.Pattern.compile(
            "\\b(image|picture|photo|draw|paint|sketch|illustration|logo|wallpaper|render|portrait|poster|generate|create|make)\\b",
            java.util.regex.Pattern.CASE_INSENSITIVE);

    /** False for greetings/small talk, which must get a text reply instead of a random image. */
    public static boolean isImageRequest(String prompt) {
        String t = prompt == null ? "" : prompt.trim();
        if (t.isEmpty()) return false;
        if (IMAGE_WORDS.matcher(t).find()) return true;
        return !(t.length() <= 60 && CONVERSATIONAL.matcher(t).matches());
    }

    private boolean isChatModel(String model) {
        return split(configuredModels).contains(model) && !isImageModel(model);
    }

    private static List<String> split(String csv) {
        List<String> out = new ArrayList<>();
        if (csv == null) return out;
        for (String part : csv.split(",")) {
            String v = part.trim();
            if (!v.isEmpty()) out.add(v);
        }
        return out;
    }

    // =========================================================
    // CHAT
    // =========================================================

    public String generateResponse(List<Map<String, Object>> messages, String requestedModel) {
        return streamResponse(messages, requestedModel, chunk -> { });
    }

    /**
     * Streams a chat completion. If the requested model fails before any
     * text is produced, the configured fallback models are tried in order.
     */
    public String streamResponse(
            List<Map<String, Object>> messages,
            String requestedModel,
            Consumer<String> onDelta) {

        requireConfigured();

        String requested = requestedModel == null ? "" : requestedModel.trim();
        if (!isChatModel(requested)) {
            throw new IllegalArgumentException("Unsupported Cloudflare model: " + requested);
        }

        LinkedHashSet<String> chain = new LinkedHashSet<>();
        chain.add(requested);
        for (String fallback : split(fallbackModels)) {
            if (isChatModel(fallback)) chain.add(fallback);
        }

        AIServiceException last = null;
        for (String model : chain) {
            boolean[] emitted = {false};
            Consumer<String> tracking = chunk -> {
                emitted[0] = true;
                onDelta.accept(chunk);
            };
            try {
                String text = streamOnce(messages, model, tracking);
                if (!text.isBlank()) return text;
                last = new AIServiceException("Cloudflare returned an empty response.");
            } catch (AIServiceException e) {
                if (emitted[0]) throw e; // Never mix two models' output.
                last = e;
            }
            log.warn("Cloudflare model {} failed; trying next fallback if available.", model);
        }
        throw last != null ? last : new AIServiceException("Cloudflare AI is unavailable.");
    }

    private String streamOnce(List<Map<String, Object>> messages, String model, Consumer<String> onDelta) {
        Map<String, Object> body = new HashMap<>();
        body.put("model", model);
        body.put("messages", messages);
        body.put("temperature", 0.5);
        body.put("max_tokens", MAX_OUTPUT_TOKENS);
        body.put("stream", true);
        if (model.startsWith("@cf/openai/gpt-oss")) {
            // Short reasoning keeps time-to-first-token low; the large model
            // gets a bit more for harder coding/analysis prompts.
            body.put("reasoning_effort", model.contains("120b") ? "medium" : "low");
        }

        int attempt = 0;
        while (true) {
            try {
                Request request = new Request.Builder()
                        .url(accountUrl() + "/ai/v1/chat/completions")
                        .header("Authorization", "Bearer " + apiToken)
                        .post(RequestBody.create(
                                objectMapper.writeValueAsBytes(body),
                                MediaType.get("application/json; charset=utf-8")))
                        .build();

                try (Response response = client.newCall(request).execute()) {
                    if (!response.isSuccessful()) {
                        int status = response.code();
                        if (status == 429 && attempt < MAX_RATE_LIMIT_RETRIES) {
                            long delay = retryDelay(response.header("Retry-After"), attempt++);
                            log.warn("Cloudflare rate limited. model={}, retry in {} ms", model, delay);
                            sleep(delay);
                            continue;
                        }
                        throw httpError(status, response);
                    }
                    if (response.body() == null) {
                        throw new AIServiceException("Cloudflare returned an empty stream.");
                    }
                    return readStream(response, onDelta);
                }
            } catch (AIServiceException e) {
                throw e;
            } catch (IOException e) {
                log.error("Cloudflare connection failed. model={}, error={}", model, e.getClass().getSimpleName());
                throw new AIServiceException("Unable to connect to the Cloudflare AI service.", e);
            }
        }
    }

    private String readStream(Response response, Consumer<String> onDelta) throws IOException {
        StringBuilder full = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(response.body().byteStream(), StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (!line.startsWith("data:")) continue;
                String data = line.substring(5).trim();
                if (data.isEmpty()) continue;
                if ("[DONE]".equals(data)) break;
                try {
                    JsonNode content = objectMapper.readTree(data)
                            .path("choices").path(0).path("delta").path("content");
                    if (content.isTextual() && !content.asText().isEmpty()) {
                        String chunk = content.asText();
                        full.append(chunk);
                        onDelta.accept(chunk);
                    }
                } catch (IOException parseError) {
                    log.debug("Ignoring malformed Cloudflare stream event.");
                }
            }
        }
        return full.toString();
    }

    // =========================================================
    // IMAGE GENERATION
    // =========================================================

    /** Generates an image and returns it as a data URL (data:image/...;base64,...). */
    public String generateImage(String prompt) {
        requireConfigured();

        String text = prompt == null ? "" : prompt.trim();
        if (text.isEmpty()) {
            throw new IllegalArgumentException("Describe the image you want to generate.");
        }
        if (text.length() > MAX_IMAGE_PROMPT_CHARS) {
            text = text.substring(0, MAX_IMAGE_PROMPT_CHARS);
        }

        try {
            return runImageModel(imageModel, text);
        } catch (AIServiceException primaryError) {
            if (imageFallbackModel == null || imageFallbackModel.isBlank()
                    || imageFallbackModel.equals(imageModel)) {
                throw primaryError;
            }
            log.warn("Primary image model failed; trying fallback model.");
            return runImageModel(imageFallbackModel, text);
        }
    }

    private String runImageModel(String model, String prompt) {
        int attempt = 0;
        while (true) {
            try {
                Request.Builder builder = new Request.Builder()
                        .url(accountUrl() + "/ai/run/" + model)
                        .header("Authorization", "Bearer " + apiToken);

                if (model.contains("flux-1-schnell")) {
                    Map<String, Object> body = new HashMap<>();
                    body.put("prompt", prompt);
                    body.put("steps", 4);
                    builder.post(RequestBody.create(
                            objectMapper.writeValueAsBytes(body),
                            MediaType.get("application/json; charset=utf-8")));
                } else {
                    // FLUX.2 models take multipart form input.
                    builder.post(new MultipartBody.Builder()
                            .setType(MultipartBody.FORM)
                            .addFormDataPart("prompt", prompt)
                            .addFormDataPart("width", "1024")
                            .addFormDataPart("height", "1024")
                            .build());
                }

                try (Response response = client.newCall(builder.build()).execute()) {
                    if (!response.isSuccessful()) {
                        int status = response.code();
                        if (status == 429 && attempt < MAX_RATE_LIMIT_RETRIES) {
                            long delay = retryDelay(response.header("Retry-After"), attempt++);
                            log.warn("Cloudflare image rate limited. model={}, retry in {} ms", model, delay);
                            sleep(delay);
                            continue;
                        }
                        throw httpError(status, response);
                    }
                    return parseImage(response);
                }
            } catch (AIServiceException e) {
                throw e;
            } catch (IOException e) {
                log.error("Cloudflare image request failed. model={}, error={}", model, e.getClass().getSimpleName());
                throw new AIServiceException("Unable to connect to the Cloudflare AI service.", e);
            }
        }
    }

    private String parseImage(Response response) throws IOException {
        if (response.body() == null) {
            throw new AIServiceException("Cloudflare returned an empty image response.");
        }
        String contentType = response.header("Content-Type", "");
        if (contentType.startsWith("image/")) {
            String b64 = Base64.getEncoder().encodeToString(response.body().bytes());
            return "data:" + contentType.split(";")[0] + ";base64," + b64;
        }

        JsonNode root = objectMapper.readTree(response.body().string());
        String b64 = root.path("result").path("image").asText("");
        if (b64.isBlank()) b64 = root.path("image").asText("");
        if (b64.isBlank()) {
            throw new AIServiceException("Cloudflare did not return an image.");
        }
        return "data:" + sniffMime(b64) + ";base64," + b64;
    }

    private static String sniffMime(String b64) {
        if (b64.startsWith("iVBOR")) return "image/png";
        if (b64.startsWith("UklG")) return "image/webp";
        return "image/jpeg";
    }

    // =========================================================
    // SHARED HELPERS
    // =========================================================

    private void requireConfigured() {
        if (!isConfigured()) {
            throw new AIServiceException("Cloudflare AI is not configured on the server.");
        }
    }

    private String accountUrl() {
        return baseUrl + "/accounts/" + accountId;
    }

    private AIServiceException httpError(int status, Response response) {
        String detail = "";
        try {
            if (response.body() != null) {
                detail = response.body().string();
                if (detail.length() > 300) detail = detail.substring(0, 300);
            }
        } catch (IOException ignored) {
            // Best effort only.
        }
        log.error("Cloudflare API error. status={}, response={}", status, detail);

        return switch (status) {
            case 429 -> new AIServiceException(
                    "The AI service is temporarily rate-limited. Please wait a few seconds and try again.");
            case 401, 403 -> new AIServiceException(
                    "The AI service could not authenticate the request. Please try again later.");
            case 400 -> new AIServiceException(
                    "Cloudflare could not process this request. Please rephrase and try again.");
            case 404 -> new AIServiceException(
                    "The selected AI model is currently unavailable. Please choose another model.");
            default -> new AIServiceException(
                    "The Cloudflare AI service is temporarily unavailable. Please try again shortly.");
        };
    }

    private long retryDelay(String retryAfter, int attempt) {
        if (retryAfter != null && !retryAfter.isBlank()) {
            try {
                return Math.min(Long.parseLong(retryAfter.trim()) * 1000L, MAX_BACKOFF_MS);
            } catch (NumberFormatException ignored) {
                // Fall back to exponential backoff.
            }
        }
        return Math.min(DEFAULT_BACKOFF_MS * (1L << Math.min(attempt, 4)), MAX_BACKOFF_MS);
    }

    private void sleep(long delay) {
        try {
            Thread.sleep(Math.max(0L, delay));
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new AIServiceException("Cloudflare retry was interrupted.", e);
        }
    }
}
