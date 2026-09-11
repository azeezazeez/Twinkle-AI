package com.ai.chatbot_backend.controller;

import com.ai.chatbot_backend.exception.AIServiceException;

import com.ai.chatbot_backend.dto.ChatMessage;
import com.ai.chatbot_backend.dto.ChatRequest;
import com.ai.chatbot_backend.dto.ChatResponse;
import com.ai.chatbot_backend.dto.ChatSession;
import com.ai.chatbot_backend.dto.User;
import com.ai.chatbot_backend.service.RedisEventService;
import com.ai.chatbot_backend.service.ChatHistoryService;
import com.ai.chatbot_backend.service.GroqService;
import com.ai.chatbot_backend.service.UserService;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import org.apache.tika.Tika;
import org.apache.tika.exception.TikaException;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.net.URLEncoder;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/chat")
@RequiredArgsConstructor
@Slf4j
public class ChatController {

    private static final String VISION_MODEL =
            "qwen/qwen3.8-27b";

    private static final int MAX_IMAGES_PER_MESSAGE = 3;
    private static final long MAX_TOTAL_IMAGE_BYTES = 15L * 1024L * 1024L;
    private static final long MAX_TOTAL_ATTACHMENT_BYTES = 25L * 1024L * 1024L;

    private final GroqService groqService;
    private final ChatHistoryService chatHistoryService;
    private final UserService userService;
    private final RedisEventService redisEventService;
    private final ObjectMapper objectMapper;


    // =========================================================
    // HELPERS
    // =========================================================

    private User getCurrentUser(HttpSession session) {

        Long userId = (Long) session.getAttribute("userId");

        if (userId == null) {
            return null;
        }

        return userService.getUserById(userId);
    }


    private ChatSession convertToSessionDTO(ChatSession session) {

        ChatSession dto = new ChatSession();

        dto.setId(session.getId());
        dto.setSessionName(session.getSessionName());
        dto.setCreatedAt(session.getCreatedAt());
        dto.setUpdatedAt(session.getUpdatedAt());

        return dto;
    }


    private ChatMessage convertToMessageDTO(ChatMessage message) {

        ChatMessage dto = new ChatMessage();

        dto.setId(message.getId());
        dto.setSessionId(message.getSessionId());
        dto.setRole(message.getRole());
        dto.setContent(message.getContent());
        dto.setTimestamp(message.getTimestamp());

        if (message.getAttachmentData() != null
                && !message.getAttachmentData().isBlank()) {

            try {

                dto.setAttachments(
                        objectMapper.readValue(
                                message.getAttachmentData(),
                                new TypeReference<List<String>>() {}
                        )
                );

            } catch (Exception e) {

                log.warn(
                        "Could not parse persisted attachments for message {}: {}",
                        message.getId(),
                        e.getMessage()
                );

                dto.setAttachments(List.of());
            }

        } else {

            dto.setAttachments(List.of());
        }

        return dto;
    }


    private boolean isSessionNotFoundError(String message) {

        if (message == null) {
            return false;
        }

        String lower = message.toLowerCase(Locale.ROOT);

        return lower.contains("session not found")
                || lower.contains("no such session")
                || lower.contains("could not find")
                || lower.contains("unable to find");
    }


    // =========================================================
    // STATUS
    // =========================================================

    @GetMapping("/status")
    public ResponseEntity<Map<String, Object>> getStatus() {

        Map<String, Object> response = new HashMap<>();

        response.put("status", "connected");
        response.put("message", "Chat backend is running");
        response.put("timestamp", LocalDateTime.now().toString());

        return ResponseEntity.ok(response);
    }


    // =========================================================
    // SEND - JSON
    // =========================================================

    @PostMapping(
            value = "/send",
            consumes = MediaType.APPLICATION_JSON_VALUE
    )
    public ResponseEntity<?> sendMessage(
            @Valid @RequestBody ChatRequest request,
            HttpSession session) {

        return processMessage(
                request.getMessage(),
                request.getSessionId(),
                request.getModel(),
                List.of(),
                session
        );
    }


    // =========================================================
    // SEND WITH FILES - MULTIPART
    // =========================================================

    @PostMapping(
            value = "/send",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE
    )
    public ResponseEntity<?> sendMessageWithFiles(
            HttpServletRequest request,
            @RequestPart(value = "files", required = false)
            List<MultipartFile> files,
            HttpSession session) {

        try {

            /*
             * IMPORTANT:
             *
             * Read multipart text fields directly from the servlet request.
             *
             * This prevents Spring from trying to convert a multipart part
             * with Content-Type application/octet-stream into String/Long.
             */
            String message = request.getParameter("message");
            String model = request.getParameter("model");
            String sessionIdText = request.getParameter("sessionId");

            Long sessionId = null;

            if (sessionIdText != null
                    && !sessionIdText.isBlank()) {

                try {

                    sessionId = Long.parseLong(
                            sessionIdText.trim()
                    );

                } catch (NumberFormatException e) {

                    throw new IllegalArgumentException(
                            "Invalid sessionId: " + sessionIdText
                    );
                }
            }


            List<String> imageBase64 =
                    new ArrayList<>();

            List<String> imageMimeTypes =
                    new ArrayList<>();

            // Every uploaded file is persisted as a data URL so the
            // frontend can show the attachment after sending and refresh.
            List<String> attachmentUrls =
                    new ArrayList<>();

            long totalAttachmentBytes = 0L;

            StringBuilder extractedText =
                    new StringBuilder();


            // =====================================================
            // PROCESS FILES
            // =====================================================

            long totalImageBytes = 0L;
            int imageCount = 0;

            if (files != null) {

                for (MultipartFile file : files) {

                    if (file == null || file.isEmpty()) {
                        continue;
                    }

                    String filename =
                            safeFilename(
                                    file.getOriginalFilename()
                            );

                    /*
                     * Resolve MIME type using:
                     *
                     * 1. Apache Tika
                     * 2. filename extension
                     * 3. browser MIME as final fallback
                     *
                     * application/octet-stream is rejected.
                     */
                    String mime =
                            resolveMimeType(file);

                    log.info(
                            "Received file: name={}, browserMime={}, resolvedMime={}, size={}",
                            filename,
                            file.getContentType(),
                            mime,
                            file.getSize()
                    );

                    totalAttachmentBytes += file.getSize();

                    if (totalAttachmentBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
                        throw new IllegalArgumentException(
                                "Attachments are too large. Keep the total uploaded file size under 25MB per message."
                        );
                    }

                    byte[] fileBytes = file.getBytes();

                    String encodedFilename =
                            URLEncoder.encode(
                                    filename,
                                    StandardCharsets.UTF_8
                            ).replace("+", "%20");

                    attachmentUrls.add(
                            "data:"
                                    + mime
                                    + ";name="
                                    + encodedFilename
                                    + ";base64,"
                                    + Base64.getEncoder().encodeToString(fileBytes)
                    );


                    // =================================================
                    // IMAGE
                    // =================================================

                    if (mime.startsWith("image/")) {

                        imageCount++;
                        if (imageCount > MAX_IMAGES_PER_MESSAGE) {
                            throw new IllegalArgumentException(
                                    "You can attach a maximum of "
                                            + MAX_IMAGES_PER_MESSAGE
                                            + " images per message."
                            );
                        }

                        totalImageBytes += file.getSize();
                        if (totalImageBytes > MAX_TOTAL_IMAGE_BYTES) {
                            throw new IllegalArgumentException(
                                    "Images are too large. Keep the total image size under 15MB per message."
                            );
                        }

                        imageBase64.add(
                                Base64.getEncoder()
                                        .encodeToString(
                                                fileBytes
                                        )
                        );

                        imageMimeTypes.add(mime);

                        continue;
                    }


                    // =================================================
                    // DOCUMENT
                    // =================================================

                    String text =
                            extractText(
                                    file,
                                    mime
                            );

                    if (text != null
                            && !text.isBlank()) {

                        if (extractedText.length() > 0) {
                            extractedText.append("\n\n");
                        }

                        extractedText
                                .append("===== ")
                                .append(filename)
                                .append(" =====\n")
                                .append(text);
                    }
                }
            }


            // =====================================================
            // BUILD USER MESSAGE
            // =====================================================

            String userMessage =
                    message == null
                            ? ""
                            : message.trim();


            if (extractedText.length() > 0) {

                if (userMessage.isBlank()) {

                    userMessage =
                            "The user uploaded document(s) but did not provide a question or instruction. "
                            + "Return the COMPLETE document content in a clean, readable Markdown format. "
                            + "Preserve the source content faithfully: include ALL sections, headings, bullets, numbering, "
                            + "dates, names, technologies, project details, contact information, links, and other factual content. "
                            + "Do not summarize, shorten, review, rewrite, or omit sections. "
                            + "Do not stop after the title, name, subtitle, or first section. Continue through the entire extracted document. "
                            + "You may improve Markdown formatting only; do not change the actual information. "
                            + "Do not add an introduction, conclusion, analysis, or commentary. "
                            + "Output only the complete formatted document content.\n\n"
                            + extractedText;

                } else {

                    userMessage =
                            userMessage
                                    + "\n\nAttached document content:\n"
                                    + extractedText;
                }
            }


            // =====================================================
            // VALIDATION
            // =====================================================

            if (userMessage.isBlank()
                    && imageBase64.isEmpty()) {

                throw new IllegalArgumentException(
                        "Message or at least one supported file is required"
                );
            }


            if (userMessage.isBlank()) {

                userMessage =
                        "Analyse the attached image(s) carefully "
                        + "and answer using the information visible in them.";
            }


            // =====================================================
            // PROCESS
            // =====================================================

            return processMessageWithFiles(
                    userMessage,
                    sessionId,
                    model,
                    imageBase64,
                    imageMimeTypes,
                    attachmentUrls,
                    session
            );        } catch (AIServiceException e) {
            throw e;
        } catch (IllegalArgumentException e) {
log.warn(
                    "Invalid file upload: {}",
                    e.getMessage()
            );

            ChatResponse errorResponse =
                    new ChatResponse();

            errorResponse.setError(
                    e.getMessage()
            );

            return ResponseEntity
                    .status(HttpStatus.BAD_REQUEST)
                    .body(errorResponse);


        } catch (Exception e) {

            log.error(
                    "File chat error: {}",
                    e.getMessage(),
                    e
            );

            ChatResponse errorResponse =
                    new ChatResponse();

            errorResponse.setError(
                    e.getMessage() != null
                            ? e.getMessage()
                            : "Failed to process file"
            );

            return ResponseEntity
                    .status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(errorResponse);
        }
    }


    // =========================================================
    // FILE HELPERS
    // =========================================================

    private String safeFilename(String filename) {

        if (filename == null || filename.isBlank()) {
            return "uploaded-file";
        }

        String normalized =
                filename.replace('\\', '/');

        return normalized.substring(
                normalized.lastIndexOf('/') + 1
        );
    }


    /**
     * Resolves the real MIME type instead of trusting only
     * MultipartFile#getContentType().
     *
     * Browser/proxy MIME values can sometimes be:
     * application/octet-stream
     *
     * Tika + filename extension are therefore preferred.
     */
    private String resolveMimeType(
            MultipartFile file
    ) throws IOException {

        String filename =
                safeFilename(
                        file.getOriginalFilename()
                );

        String browserMime =
                file.getContentType();


        // =====================================================
        // TIKA DETECTION
        // =====================================================

        Tika tika =
                new Tika();

        try {

            String detected =
                    tika.detect(
                            file.getBytes(),
                            filename
                    );

            if (detected != null
                    && !detected.isBlank()
                    && !"application/octet-stream"
                        .equalsIgnoreCase(detected)) {

                return normalizeMimeType(
                        detected
                );
            }

        } catch (Exception e) {

            log.warn(
                    "MIME detection failed for {}: {}",
                    filename,
                    e.getMessage()
            );
        }


        // =====================================================
        // EXTENSION FALLBACK
        // =====================================================

        String name =
                filename.toLowerCase(
                        Locale.ROOT
                );

        Map<String, String> extensions =
                new LinkedHashMap<>();


        // Documents
        extensions.put(
                ".pdf",
                "application/pdf"
        );

        extensions.put(
                ".txt",
                "text/plain"
        );

        extensions.put(
                ".csv",
                "text/csv"
        );

        extensions.put(
                ".tsv",
                "text/tab-separated-values"
        );

        extensions.put(
                ".json",
                "application/json"
        );

        extensions.put(
                ".xml",
                "application/xml"
        );

        extensions.put(
                ".html",
                "text/html"
        );

        extensions.put(
                ".htm",
                "text/html"
        );

        extensions.put(
                ".md",
                "text/markdown"
        );

        extensions.put(
                ".markdown",
                "text/markdown"
        );

        extensions.put(
                ".rtf",
                "application/rtf"
        );


        // Microsoft Office
        extensions.put(
                ".doc",
                "application/msword"
        );

        extensions.put(
                ".docx",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        );

        extensions.put(
                ".xls",
                "application/vnd.ms-excel"
        );

        extensions.put(
                ".xlsx",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );

        extensions.put(
                ".ppt",
                "application/vnd.ms-powerpoint"
        );

        extensions.put(
                ".pptx",
                "application/vnd.openxmlformats-officedocument.presentationml.presentation"
        );


        // OpenDocument
        extensions.put(
                ".odt",
                "application/vnd.oasis.opendocument.text"
        );

        extensions.put(
                ".ods",
                "application/vnd.oasis.opendocument.spreadsheet"
        );

        extensions.put(
                ".odp",
                "application/vnd.oasis.opendocument.presentation"
        );


        // Images
        extensions.put(
                ".png",
                "image/png"
        );

        extensions.put(
                ".jpg",
                "image/jpeg"
        );

        extensions.put(
                ".jpeg",
                "image/jpeg"
        );

        extensions.put(
                ".webp",
                "image/webp"
        );

        extensions.put(
                ".gif",
                "image/gif"
        );

        extensions.put(
                ".bmp",
                "image/bmp"
        );

        extensions.put(
                ".tif",
                "image/tiff"
        );

        extensions.put(
                ".tiff",
                "image/tiff"
        );


        for (Map.Entry<String, String> entry
                : extensions.entrySet()) {

            if (name.endsWith(entry.getKey())) {

                return entry.getValue();
            }
        }


        // =====================================================
        // BROWSER MIME FALLBACK
        // =====================================================

        if (browserMime != null
                && !browserMime.isBlank()
                && !"application/octet-stream"
                    .equalsIgnoreCase(browserMime)) {

            return normalizeMimeType(
                    browserMime
            );
        }


        throw new IllegalArgumentException(
                "Unsupported or unknown file type: "
                        + filename
        );
    }


    private String normalizeMimeType(
            String mime
    ) {

        if (mime == null) {
            return "application/octet-stream";
        }

        String normalized =
                mime.trim()
                        .toLowerCase(
                                Locale.ROOT
                        );


        if ("image/jpg".equals(normalized)) {
            return "image/jpeg";
        }


        if ("application/x-pdf"
                .equals(normalized)) {

            return "application/pdf";
        }


        return normalized;
    }


    private String extractText(
            MultipartFile file,
            String mime
    ) throws IOException, TikaException {

        String filename =
                file.getOriginalFilename() == null
                        ? "file"
                        : file.getOriginalFilename();


        String lower =
                filename.toLowerCase(
                        Locale.ROOT
                );


        Tika tika =
                new Tika();


        String detected =
                tika.detect(
                        file.getBytes(),
                        filename
                );


        // =====================================================
        // PLAIN TEXT FORMATS
        // =====================================================

        if (lower.endsWith(".txt")
                || lower.endsWith(".csv")
                || lower.endsWith(".tsv")
                || lower.endsWith(".json")
                || lower.endsWith(".xml")
                || lower.endsWith(".html")
                || lower.endsWith(".htm")
                || lower.endsWith(".md")
                || lower.endsWith(".markdown")
                || lower.endsWith(".rtf")
                || detected.startsWith("text/")) {

            return new String(
                    file.getBytes(),
                    StandardCharsets.UTF_8
            );
        }


        // =====================================================
        // PDF / OFFICE / OTHER DOCUMENTS
        // =====================================================

        String parsed =
                tika.parseToString(
                        file.getInputStream()
                );


        if (parsed == null
                || parsed.isBlank()) {

            throw new IllegalArgumentException(
                    "Could not extract readable text from "
                            + filename
            );
        }


        // =====================================================
        // LIMIT VERY LARGE DOCUMENTS
        // =====================================================

        if (parsed.length() > 100_000) {

            return parsed.substring(
                    0,
                    100_000
            ) + "\n\n[File content truncated at 100,000 characters.]";
        }


        return parsed;
    }


    // =========================================================
    // MESSAGE PROCESSING
    // =========================================================

    private ResponseEntity<?> processMessage(
            String message,
            Long sessionId,
            String model,
            List<String> imageBase64,
            HttpSession session
    ) {

        return processMessageWithFiles(
                message,
                sessionId,
                model,
                imageBase64,
                List.of(),
                List.of(),
                session
        );
    }


    private ResponseEntity<?> processMessageWithFiles(
            String message,
            Long sessionId,
            String model,
            List<String> imageBase64,
            List<String> imageMimeTypes,
            List<String> attachmentUrls,
            HttpSession session
    ) {



        // =====================================================
        // AUTHENTICATION
        // =====================================================

        User currentUser =
                getCurrentUser(session);

        boolean isAuthenticated =
                currentUser != null;

        Long savedUserMessageId =
                null;


        // =====================================================
        // CONVERSATION HISTORY
        // =====================================================

        List<Map<String, String>>
                conversationHistory =
                new ArrayList<>();


        // =====================================================
        // SESSION HANDLING
        // =====================================================

        if (isAuthenticated) {

            if (sessionId == null) {

                ChatSession newSession =
                        chatHistoryService.createNewSession(
                                currentUser,
                                "New Chat"
                        );

                sessionId =
                        newSession.getId();

                log.info(
                        "Created new session: {}",
                        sessionId
                );

            } else if (
                    !chatHistoryService
                            .sessionExistsForUser(
                                    sessionId,
                                    currentUser
                            )
            ) {

                log.warn(
                        "Stale session {} for user {} - creating new session",
                        sessionId,
                        currentUser.getId()
                );

                ChatSession newSession =
                        chatHistoryService.createNewSession(
                                currentUser,
                                "New Chat"
                        );

                sessionId =
                        newSession.getId();
            }


            // =================================================
            // LOAD LAST 10 MESSAGES
            // =================================================

            List<ChatMessage>
                    previousMessages =
                    chatHistoryService.getSessionMessages(
                            sessionId
                    );


            int startIndex =
                    Math.max(
                            0,
                            previousMessages.size() - 10
                    );


            for (int i = startIndex;
                 i < previousMessages.size();
                 i++) {

                ChatMessage msg =
                        previousMessages.get(i);


                conversationHistory.add(
                        Map.of(
                                "role",
                                msg.getRole(),

                                "content",
                                msg.getContent()
                        )
                );
            }


            // =================================================
            // PERSIST ALL ATTACHMENTS
            // =================================================

            String attachmentData = null;

            if (attachmentUrls != null
                    && !attachmentUrls.isEmpty()) {

                try {

                    attachmentData =
                            objectMapper.writeValueAsString(
                                    attachmentUrls
                            );

                } catch (Exception e) {

                    throw new RuntimeException(
                            "Failed to persist file attachments",
                            e
                    );
                }
            }


            // =================================================
            // SAVE USER MESSAGE
            // =================================================

            ChatMessage savedUserMessage =
                    chatHistoryService.saveMessage(
                            sessionId,
                            "user",
                            message,
                            attachmentData
                    );


            savedUserMessageId =
                    savedUserMessage.getId();


            // =================================================
            // REDIS EVENT
            // =================================================

            redisEventService.sendUserEvent(
                    "MESSAGE_SENT",
                    currentUser.getId()
                            + ":"
                            + sessionId
            );
        }


        // =====================================================
        // AVAILABLE MODELS
        // =====================================================

        List<String>
                availableModels =
                groqService.getAvailableModels();


        if (availableModels == null
                || availableModels.isEmpty()) {

            throw new IllegalStateException(
                    "No Groq models are configured."
            );
        }


        // =====================================================
        // SELECT MODEL
        // =====================================================

        String requestedModel =
                model == null
                        || model.isBlank()
                        ? availableModels.get(0)
                        : model.trim();


        if (!availableModels.contains(
                requestedModel
        )) {

            log.warn(
                    "Requested model '{}' is unavailable. Falling back to '{}'.",
                    requestedModel,
                    availableModels.get(0)
            );

            requestedModel =
                    availableModels.get(0);
        }


        // =====================================================
        // AI RESPONSE
        // =====================================================

        String aiResponse;


        if (imageBase64 != null
                && !imageBase64.isEmpty()) {

            /*
             * Images are supported only by:
             *
             * qwen/qwen3.8-27b
             */
            if (!VISION_MODEL.equals(
                    requestedModel
            )) {

                throw new IllegalArgumentException(
                        "Image uploads are supported only by Qwen Vision Pro."
                );
            }


            aiResponse =
                    groqService.generateResponseWithImages(
                            message,
                            conversationHistory,
                            imageBase64,
                            imageMimeTypes,
                            requestedModel
                    );

        } else {

            aiResponse =
                    groqService.generateResponse(
                            message,
                            conversationHistory,
                            requestedModel
                    );
        }


        // =====================================================
        // SAVE AI RESPONSE
        // =====================================================

        if (isAuthenticated
                && sessionId != null) {

            chatHistoryService.saveMessage(
                    sessionId,
                    "assistant",
                    aiResponse
            );


            redisEventService.sendUserEvent(
                    "AI_RESPONSE_SENT",
                    currentUser.getId()
                            + ":"
                            + sessionId
            );
        }


        // =====================================================
        // BUILD RESPONSE
        // =====================================================

        ChatResponse chatResponse =
                new ChatResponse();


        chatResponse.setResponse(
                aiResponse
        );


        if (isAuthenticated) {

            chatResponse.setSessionId(
                    sessionId
            );

            chatResponse.setUserMessageId(
                    savedUserMessageId
            );
        }


        return ResponseEntity.ok(
                chatResponse
        );
    }


    // =========================================================
    // AVAILABLE MODELS
    // =========================================================

    @GetMapping("/models")
    public ResponseEntity<Map<String, Object>>
    getAvailableModels(
            HttpSession session
    ) {

        Map<String, Object> response =
                new HashMap<>();


        if (getCurrentUser(session) == null) {

            response.put(
                    "models",
                    List.of()
            );

            response.put(
                    "authenticated",
                    false
            );


            return ResponseEntity
                    .status(
                            HttpStatus.UNAUTHORIZED
                    )
                    .body(response);
        }


        List<String> models =
                new ArrayList<>(
                        groqService.getAvailableModels()
                );


        response.put(
                "models",
                models
        );


        response.put(
                "defaultModel",
                groqService
                        .getAvailableModels()
                        .get(0)
        );


        response.put(
                "authenticated",
                true
        );


        return ResponseEntity.ok(
                response
        );
    }


    // =========================================================
    // SESSIONS
    // =========================================================

    @GetMapping("/sessions")
    public ResponseEntity<Map<String, Object>>
    getUserSessions(
            HttpSession session
    ) {

        Map<String, Object> response =
                new HashMap<>();


        try {

            User currentUser =
                    getCurrentUser(session);


            if (currentUser == null) {

                response.put(
                        "sessions",
                        List.of()
                );

                response.put(
                        "authenticated",
                        false
                );


                return ResponseEntity.ok(
                        response
                );
            }


            List<ChatSession> sessions =
                    chatHistoryService.getUserSessions(
                            currentUser
                    );


            List<ChatSession> sessionDTOs =
                    sessions.stream()
                            .map(this::convertToSessionDTO)
                            .collect(Collectors.toList());


            response.put(
                    "sessions",
                    sessionDTOs
            );


            response.put(
                    "authenticated",
                    true
            );


            return ResponseEntity.ok(
                    response
            );


        } catch (Exception e) {

            log.error(
                    "Error fetching sessions: {}",
                    e.getMessage(),
                    e
            );


            response.put(
                    "sessions",
                    List.of()
            );


            response.put(
                    "error",
                    e.getMessage()
            );


            return ResponseEntity
                    .status(
                            HttpStatus.INTERNAL_SERVER_ERROR
                    )
                    .body(response);
        }
    }


    // =========================================================
    // HISTORY
    // =========================================================

    @GetMapping("/history/{sessionId}")
    public ResponseEntity<Map<String, Object>>
    getSessionHistory(
            @PathVariable Long sessionId,
            HttpSession session
    ) {

        Map<String, Object> response =
                new HashMap<>();


        try {

            User currentUser =
                    getCurrentUser(session);


            if (currentUser == null) {

                response.put(
                        "messages",
                        List.of()
                );

                response.put(
                        "authenticated",
                        false
                );


                return ResponseEntity.ok(
                        response
                );
            }


            boolean exists =
                    chatHistoryService.sessionExistsForUser(
                            sessionId,
                            currentUser
                    );


            if (!exists) {

                response.put(
                        "messages",
                        List.of()
                );

                response.put(
                        "sessionId",
                        sessionId
                );

                response.put(
                        "stale",
                        true
                );


                return ResponseEntity
                        .status(
                                HttpStatus.NOT_FOUND
                        )
                        .body(response);
            }


            List<ChatMessage> messages =
                    chatHistoryService.getSessionMessages(
                            sessionId
                    );


            List<ChatMessage> messageDTOs =
                    messages.stream()
                            .map(this::convertToMessageDTO)
                            .collect(Collectors.toList());


            response.put(
                    "messages",
                    messageDTOs
            );


            response.put(
                    "sessionId",
                    sessionId
            );


            response.put(
                    "authenticated",
                    true
            );


            return ResponseEntity.ok(
                    response
            );


        } catch (Exception e) {

            log.error(
                    "Error fetching history: {}",
                    e.getMessage(),
                    e
            );


            response.put(
                    "messages",
                    List.of()
            );


            response.put(
                    "error",
                    e.getMessage()
            );


            return ResponseEntity.ok(
                    response
            );
        }
    }


    // =========================================================
    // NEW SESSION
    // =========================================================

    @PostMapping("/new-session")
    public ResponseEntity<Map<String, Object>>
    createNewSession(
            HttpSession session
    ) {

        Map<String, Object> response =
                new HashMap<>();


        try {

            User currentUser =
                    getCurrentUser(session);


            if (currentUser == null) {

                response.put(
                        "error",
                        "User not logged in"
                );


                return ResponseEntity
                        .status(
                                HttpStatus.UNAUTHORIZED
                        )
                        .body(response);
            }


            ChatSession newSession =
                    chatHistoryService.createNewSession(
                            currentUser,
                            "New Chat"
                    );


            redisEventService.sendUserEvent(
                    "SESSION_CREATED",
                    currentUser.getId()
                            + ":"
                            + newSession.getId()
            );


            response.put(
                    "id",
                    newSession.getId()
            );


            response.put(
                    "sessionName",
                    newSession.getSessionName()
            );


            response.put(
                    "message",
                    "New session created successfully"
            );


            return ResponseEntity.ok(
                    response
            );


        } catch (Exception e) {

            log.error(
                    "Error creating session: {}",
                    e.getMessage(),
                    e
            );


            response.put(
                    "error",
                    e.getMessage()
            );


            return ResponseEntity
                    .status(
                            HttpStatus.INTERNAL_SERVER_ERROR
                    )
                    .body(response);
        }
    }


    // =========================================================
    // RENAME SESSION
    // =========================================================

    @PatchMapping("/rename")
    public ResponseEntity<Map<String, Object>>
    renameSession(
            @RequestBody Map<String, Object> request,
            HttpSession session
    ) {

        Map<String, Object> response =
                new HashMap<>();


        try {

            User currentUser =
                    getCurrentUser(session);


            if (currentUser == null) {

                response.put(
                        "error",
                        "User not logged in"
                );


                return ResponseEntity
                        .status(
                                HttpStatus.UNAUTHORIZED
                        )
                        .body(response);
            }


            Object sessionIdObj =
                    request.get("sessionId");


            if (sessionIdObj == null) {

                response.put(
                        "error",
                        "sessionId is required"
                );


                return ResponseEntity
                        .status(
                                HttpStatus.BAD_REQUEST
                        )
                        .body(response);
            }


            Long sessionId =
                    ((Number) sessionIdObj)
                            .longValue();


            String name =
                    (String) request.get("name");


            if (name == null
                    || name.trim().isEmpty()) {

                response.put(
                        "error",
                        "Session name cannot be empty"
                );


                return ResponseEntity
                        .status(
                                HttpStatus.BAD_REQUEST
                        )
                        .body(response);
            }


            boolean exists =
                    chatHistoryService.sessionExistsForUser(
                            sessionId,
                            currentUser
                    );


            if (!exists) {

                response.put(
                        "error",
                        "Session not found"
                );


                return ResponseEntity
                        .status(
                                HttpStatus.NOT_FOUND
                        )
                        .body(response);
            }


            ChatSession updatedSession =
                    chatHistoryService.renameSession(
                            sessionId,
                            name.trim()
                    );


            response.put(
                    "success",
                    true
            );


            response.put(
                    "sessionId",
                    updatedSession.getId()
            );


            response.put(
                    "sessionName",
                    updatedSession.getSessionName()
            );


            return ResponseEntity.ok(
                    response
            );


        } catch (Exception e) {

            log.error(
                    "Error renaming session: {}",
                    e.getMessage(),
                    e
            );


            response.put(
                    "error",
                    e.getMessage()
            );


            return ResponseEntity
                    .status(
                            HttpStatus.INTERNAL_SERVER_ERROR
                    )
                    .body(response);
        }
    }


    // =========================================================
    // GENERATE TITLE
    // =========================================================

    @PostMapping("/generate-title")
    public ResponseEntity<Map<String, Object>>
    generateTitle(
            @RequestBody Map<String, String> request,
            HttpSession session
    ) {

        Map<String, Object> response =
                new HashMap<>();


        try {

            User currentUser =
                    getCurrentUser(session);


            if (currentUser == null) {

                response.put(
                        "error",
                        "User not logged in"
                );


                return ResponseEntity
                        .status(
                                HttpStatus.UNAUTHORIZED
                        )
                        .body(response);
            }


            String firstMessage =
                    request.get("firstMessage");


            if (firstMessage == null
                    || firstMessage.trim().isEmpty()) {

                response.put(
                        "error",
                        "Message cannot be empty"
                );


                return ResponseEntity
                        .status(
                                HttpStatus.BAD_REQUEST
                        )
                        .body(response);
            }


            String truncated =
                    firstMessage.length() > 100
                            ? firstMessage.substring(
                                    0,
                                    100
                            )
                            : firstMessage;


            String prompt =
                    String.format(
                            "Generate a very short, concise title (maximum 5-7 words) for a "
                                    + "conversation that starts with: \"%s\". "
                                    + "Return ONLY the title, no quotes, no explanation.",
                            truncated
                    );


            String title =
                    groqService.generateResponse(
                            prompt,
                            List.of()
                    );


            title =
                    title
                            .replace("\"", "")
                            .replace("'", "")
                            .trim();


            if (title.length() > 60) {

                title =
                        title.substring(
                                0,
                                57
                        ) + "...";
            }


            response.put(
                    "title",
                    title
            );


            response.put(
                    "success",
                    true
            );


            return ResponseEntity.ok(
                    response
            );


        } catch (Exception e) {

            log.error(
                    "Error generating title: {}",
                    e.getMessage(),
                    e
            );


            String raw =
                    request.getOrDefault(
                            "firstMessage",
                            "New Chat"
                    );


            String fallbackTitle =
                    raw.length() > 30
                            ? raw.substring(
                                    0,
                                    30
                            ) + "..."
                            : raw;


            response.put(
                    "title",
                    fallbackTitle
            );


            response.put(
                    "success",
                    false
            );


            return ResponseEntity.ok(
                    response
            );
        }
    }


    // =========================================================
    // DELETE SESSION
    // =========================================================

    @DeleteMapping("/session/{sessionId}")
    public ResponseEntity<Map<String, Object>>
    deleteSession(
            @PathVariable Long sessionId,
            HttpSession session
    ) {

        Map<String, Object> response =
                new HashMap<>();


        try {

            User currentUser =
                    getCurrentUser(session);


            if (currentUser == null) {

                response.put(
                        "error",
                        "User not logged in"
                );


                return ResponseEntity
                        .status(
                                HttpStatus.UNAUTHORIZED
                        )
                        .body(response);
            }


            boolean exists =
                    chatHistoryService.sessionExistsForUser(
                            sessionId,
                            currentUser
                    );


            if (!exists) {

                response.put(
                        "message",
                        "Session already deleted"
                );


                return ResponseEntity.ok(
                        response
                );
            }


            chatHistoryService.deleteSession(
                    sessionId
            );


            redisEventService.sendUserEvent(
                    "SESSION_DELETED",
                    currentUser.getId()
                            + ":"
                            + sessionId
            );


            response.put(
                    "message",
                    "Session deleted successfully"
            );


            return ResponseEntity.ok(
                    response
            );


        } catch (Exception e) {

            log.error(
                    "Error deleting session: {}",
                    e.getMessage(),
                    e
            );


            response.put(
                    "error",
                    e.getMessage()
            );


            return ResponseEntity
                    .status(
                            HttpStatus.INTERNAL_SERVER_ERROR
                    )
                    .body(response);
        }
    }


    // =========================================================
    // CLEAR ALL SESSIONS
    // =========================================================

    @DeleteMapping("/sessions")
    public ResponseEntity<Map<String, Object>>
    clearAllSessions(
            HttpSession session
    ) {

        Map<String, Object> response =
                new HashMap<>();


        try {

            User currentUser =
                    getCurrentUser(session);


            if (currentUser == null) {

                response.put(
                        "error",
                        "User not logged in"
                );


                return ResponseEntity
                        .status(
                                HttpStatus.UNAUTHORIZED
                        )
                        .body(response);
            }


            chatHistoryService.clearUserSessions(
                    currentUser
            );


            redisEventService.sendUserEvent(
                    "ALL_SESSIONS_CLEARED",
                    String.valueOf(
                            currentUser.getId()
                    )
            );


            response.put(
                    "message",
                    "All sessions cleared successfully"
            );


            return ResponseEntity.ok(
                    response
            );


        } catch (Exception e) {

            log.error(
                    "Error clearing sessions: {}",
                    e.getMessage(),
                    e
            );


            response.put(
                    "error",
                    e.getMessage()
            );


            return ResponseEntity
                    .status(
                            HttpStatus.INTERNAL_SERVER_ERROR
                    )
                    .body(response);
        }
    }


    // =========================================================
    // SEARCH SESSIONS
    // =========================================================

    @GetMapping("/search")
    public ResponseEntity<Map<String, Object>>
    searchSessions(
            @RequestParam("q") String query,
            HttpSession session
    ) {

        Map<String, Object> response =
                new HashMap<>();


        try {

            User currentUser =
                    getCurrentUser(session);


            if (currentUser == null) {

                response.put(
                        "sessions",
                        List.of()
                );


                response.put(
                        "authenticated",
                        false
                );


                return ResponseEntity.ok(
                        response
                );
            }


            if (query == null
                    || query.trim().isEmpty()) {

                response.put(
                        "sessions",
                        List.of()
                );


                response.put(
                        "authenticated",
                        true
                );


                return ResponseEntity.ok(
                        response
                );
            }


            List<ChatSession> sessions =
                    chatHistoryService.getUserSessions(
                            currentUser
                    );


            String lowerQuery =
                    query.trim()
                            .toLowerCase(
                                    Locale.ROOT
                            );


            List<ChatSession> filtered =
                    sessions.stream()
                            .filter(
                                    s ->
                                            s.getSessionName() != null
                                                    && s.getSessionName()
                                                            .toLowerCase(
                                                                    Locale.ROOT
                                                            )
                                                            .contains(
                                                                    lowerQuery
                                                            )
                            )
                            .map(
                                    this::convertToSessionDTO
                            )
                            .collect(
                                    Collectors.toList()
                            );


            response.put(
                    "sessions",
                    filtered
            );


            response.put(
                    "authenticated",
                    true
            );


            return ResponseEntity.ok(
                    response
            );


        } catch (Exception e) {

            log.error(
                    "Error searching sessions: {}",
                    e.getMessage(),
                    e
            );


            response.put(
                    "sessions",
                    List.of()
            );


            response.put(
                    "error",
                    e.getMessage()
            );


            return ResponseEntity.ok(
                    response
            );
        }
    }
}
