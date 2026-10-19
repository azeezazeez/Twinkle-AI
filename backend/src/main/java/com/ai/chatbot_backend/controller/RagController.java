package com.ai.chatbot_backend.controller;

import com.ai.chatbot_backend.service.RagService;
import jakarta.servlet.http.HttpSession;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.Map;

@RestController
@RequestMapping("/api/rag")
@RequiredArgsConstructor
public class RagController {
    private static final Logger log = LoggerFactory.getLogger(RagController.class);
    private final RagService ragService;

    private Long userId(HttpSession session) {
        Object id = session.getAttribute("userId");
        if (id instanceof Number number) return number.longValue();
        if (id instanceof String value) {
            try { return Long.parseLong(value); } catch (NumberFormatException ignored) { return null; }
        }
        return null;
    }

    @PostMapping(value = "/documents", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<?> upload(@RequestParam("file") MultipartFile file, HttpSession session) {
        Long userId = userId(session);
        if (userId == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", "Please sign in."));
        log.info("Received RAG upload request; userId={}, filename={}, sizeBytes={}",
                userId, file == null ? "(missing)" : file.getOriginalFilename(), file == null ? 0 : file.getSize());
        try { return ResponseEntity.ok(ragService.ingest(userId, file)); }
        catch (IllegalArgumentException e) {
            log.warn("RAG upload rejected; userId={}, reason={}", userId, e.getMessage());
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
        catch (IllegalStateException e) {
            log.error("RAG upload unavailable; userId={}, reason={}", userId, e.getMessage());
            return ResponseEntity.status(503).body(Map.of("error", e.getMessage()));
        }
        catch (Exception e) {
            log.error("Unexpected RAG upload failure; userId={}, type={}, message={}",
                    userId, e.getClass().getSimpleName(), e.getMessage(), e);
            return ResponseEntity.status(502).body(Map.of("error", "Document processing failed. Check backend logs for the RAG ingestion stage that failed."));
        }
    }

    @GetMapping("/documents")
    public ResponseEntity<?> documents(HttpSession session) {
        Long userId = userId(session);
        if (userId == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", "Please sign in."));
        return ResponseEntity.ok(ragService.list(userId));
    }

    @DeleteMapping("/documents/{id}")
    public ResponseEntity<?> delete(@PathVariable long id, HttpSession session) {
        Long userId = userId(session);
        if (userId == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", "Please sign in."));
        ragService.delete(userId, id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/ask")
    public ResponseEntity<?> ask(@RequestBody AskRequest request, HttpSession session) {
        Long userId = userId(session);
        if (userId == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", "Please sign in."));
        if (request == null || request.question() == null || request.question().isBlank() || request.question().length() > 4000)
            return ResponseEntity.badRequest().body(Map.of("error", "Enter a question up to 4,000 characters."));
        try { return ResponseEntity.ok(ragService.ask(userId, request.question().trim(), request.documentIds())); }
        catch (IllegalStateException e) { return ResponseEntity.status(503).body(Map.of("error", e.getMessage())); }
    }

    public record AskRequest(String question, java.util.List<Long> documentIds) {}
}
