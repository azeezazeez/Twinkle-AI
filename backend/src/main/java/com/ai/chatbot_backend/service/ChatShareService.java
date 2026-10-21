package com.ai.chatbot_backend.service;

import com.ai.chatbot_backend.dto.ChatMessage;
import com.ai.chatbot_backend.dto.SharedMessageResponse;
import com.ai.chatbot_backend.dto.ChatSession;
import com.ai.chatbot_backend.dto.SharedChat;
import com.ai.chatbot_backend.dto.SharedChatInvite;
import com.ai.chatbot_backend.dto.SharedChatResponse;
import com.ai.chatbot_backend.dto.User;
import com.ai.chatbot_backend.exception.AIServiceException;
import com.ai.chatbot_backend.exception.ShareAccessException;
import com.ai.chatbot_backend.repository.ChatMessageRepository;
import com.ai.chatbot_backend.repository.ChatSessionRepository;
import com.ai.chatbot_backend.repository.SharedChatInviteRepository;
import com.ai.chatbot_backend.repository.SharedChatRepository;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class ChatShareService {

    private static final Logger log = LoggerFactory.getLogger(ChatShareService.class);

    private static final int TOKEN_BYTES = 32;
    private static final int MAX_INVITES_PER_CHAT = 50;
    private static final Pattern EMAIL_PATTERN =
            Pattern.compile("^[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$");

    public static final String MODE_INVITED = "INVITED";
    public static final String MODE_LINK = "LINK";

    @Value("${frontend.url:https://twinkleai.vercel.app}")
    private String frontendUrl;

    private final SharedChatRepository sharedChatRepository;
    private final SharedChatInviteRepository sharedChatInviteRepository;
    private final EmailService emailService;
    private final ChatSessionRepository chatSessionRepository;
    private final ChatMessageRepository chatMessageRepository;
    private final ObjectMapper objectMapper;

    private final SecureRandom secureRandom = new SecureRandom();

    @Transactional
    public SharedChat createOrGetShare(Long sessionId, User user, Integer expiresInDays) {
        ChatSession chatSession = chatSessionRepository.findById(sessionId)
                .orElseThrow(() -> new AIServiceException("Session not found"));

        if (!user.getId().equals(chatSession.getUserId())) {
            throw new AIServiceException("You do not have access to this chat");
        }

        // Generate a new independent share link every time the owner clicks Share.
        // Existing links remain valid until revoked/deleted.
        SharedChat sharedChat = new SharedChat();
        sharedChat.setSessionId(sessionId);
        sharedChat.setShareToken(generateUniqueToken());
        sharedChat.setCreatedAt(LocalDateTime.now());
        sharedChat.setRevoked(false);
        sharedChat.setAccessMode(MODE_LINK);
        if (expiresInDays != null && expiresInDays > 0) {
            sharedChat.setExpiresAt(LocalDateTime.now().plusDays(Math.min(expiresInDays, 365)));
        }
        return sharedChatRepository.save(sharedChat);
    }

    private ChatSession requireOwnedSession(Long sessionId, User user) {
        ChatSession chatSession = chatSessionRepository.findById(sessionId)
                .orElseThrow(() -> new AIServiceException("Session not found"));
        if (!user.getId().equals(chatSession.getUserId())) {
            throw new AIServiceException("You do not have access to this chat");
        }
        return chatSession;
    }

    /** Active (not revoked) public links of a chat, newest first. Owner only. */
    @Transactional(readOnly = true)
    public List<SharedChat> listShares(Long sessionId, User user) {
        requireOwnedSession(sessionId, user);
        LocalDateTime now = LocalDateTime.now();
        return sharedChatRepository.findBySessionIdAndRevokedFalseOrderByCreatedAtDesc(sessionId).stream()
                .filter(share -> share.getExpiresAt() == null || share.getExpiresAt().isAfter(now))
                .collect(Collectors.toList());
    }

    /** Turns one public link off. Owner only. */
    @Transactional
    public void revokeShare(Long sessionId, Long shareId, User user) {
        requireOwnedSession(sessionId, user);
        SharedChat sharedChat = sharedChatRepository.findByIdAndSessionId(shareId, sessionId)
                .orElseThrow(() -> new AIServiceException("Link not found"));
        sharedChat.setRevoked(true);
        sharedChatRepository.save(sharedChat);
    }

    // ---------------------------------------------------------------------
    // Share popup: "Only people invited" / "Anyone with the link" + invites
    // ---------------------------------------------------------------------

    /** The newest active link of a chat, or null when the chat was never shared. */
    private SharedChat findActiveLink(Long sessionId) {
        LocalDateTime now = LocalDateTime.now();
        return sharedChatRepository.findBySessionIdAndRevokedFalseOrderByCreatedAtDesc(sessionId).stream()
                .filter(share -> share.getExpiresAt() == null || share.getExpiresAt().isAfter(now))
                .findFirst()
                .orElse(null);
    }

    /** The chat's current link; creates a private ("Only people invited") one on first use. */
    private SharedChat ensureLink(Long sessionId) {
        SharedChat existing = findActiveLink(sessionId);
        if (existing != null) return existing;

        SharedChat sharedChat = new SharedChat();
        sharedChat.setSessionId(sessionId);
        sharedChat.setShareToken(generateUniqueToken());
        sharedChat.setCreatedAt(LocalDateTime.now());
        sharedChat.setRevoked(false);
        sharedChat.setAccessMode(MODE_INVITED);
        return sharedChatRepository.save(sharedChat);
    }

    /** Current sharing state for the popup. Owner only. Does not create anything. */
    @Transactional(readOnly = true)
    public SharingState getSharing(Long sessionId, User user) {
        requireOwnedSession(sessionId, user);
        SharedChat link = findActiveLink(sessionId);
        return new SharingState(
                link == null ? MODE_INVITED : link.getAccessMode(),
                link == null ? null : link.getShareToken(),
                sharedChatInviteRepository.findBySessionIdOrderByCreatedAtAsc(sessionId)
        );
    }

    /** Makes sure the chat has a link (needed for "Copy link"). Owner only. */
    @Transactional
    public SharingState createLink(Long sessionId, User user) {
        requireOwnedSession(sessionId, user);
        ensureLink(sessionId);
        return getSharing(sessionId, user);
    }

    /** Switches between "Only people invited" and "Anyone with the link". Owner only. */
    @Transactional
    public SharingState setAccessMode(Long sessionId, User user, String mode) {
        requireOwnedSession(sessionId, user);
        String normalized = mode == null ? "" : mode.trim().toUpperCase(Locale.ROOT);
        if (!MODE_INVITED.equals(normalized) && !MODE_LINK.equals(normalized)) {
            throw new AIServiceException("Unknown access setting");
        }
        SharedChat link = ensureLink(sessionId);
        link.setAccessMode(normalized);
        sharedChatRepository.save(link);
        return getSharing(sessionId, user);
    }

    /** Adds one person to the invite list and emails them (best effort). Owner only. */
    @Transactional
    public SharingState addInvite(Long sessionId, User user, String rawEmail) {
        ChatSession chatSession = requireOwnedSession(sessionId, user);
        String email = rawEmail == null ? "" : rawEmail.trim().toLowerCase(Locale.ROOT);
        if (email.length() > 254 || !EMAIL_PATTERN.matcher(email).matches()) {
            throw new AIServiceException("Enter a valid email address");
        }
        if (user.getEmail() != null && email.equalsIgnoreCase(user.getEmail())) {
            throw new AIServiceException("You already own this chat");
        }
        if (sharedChatInviteRepository.existsBySessionIdAndEmail(sessionId, email)) {
            throw new AIServiceException("That person is already invited");
        }
        if (sharedChatInviteRepository.findBySessionIdOrderByCreatedAtAsc(sessionId).size() >= MAX_INVITES_PER_CHAT) {
            throw new AIServiceException("You can invite up to " + MAX_INVITES_PER_CHAT + " people to one chat");
        }

        SharedChat link = ensureLink(sessionId);

        SharedChatInvite invite = new SharedChatInvite();
        invite.setSessionId(sessionId);
        invite.setEmail(email);
        invite.setCreatedAt(LocalDateTime.now());
        sharedChatInviteRepository.save(invite);

        try {
            String base = frontendUrl == null ? "" : frontendUrl.trim();
            while (base.endsWith("/")) base = base.substring(0, base.length() - 1);
            emailService.sendChatInviteEmail(
                    email,
                    user.getUsername(),
                    chatSession.getSessionName(),
                    base + "/shared/" + link.getShareToken()
            );
        } catch (Exception e) {
            // The invite itself is saved; the person can still open the link after signing in.
            log.warn("Could not email the chat invite to {}: {}", email, e.getMessage());
        }
        return getSharing(sessionId, user);
    }

    /** Removes one person from the invite list. Owner only. */
    @Transactional
    public SharingState removeInvite(Long sessionId, Long inviteId, User user) {
        requireOwnedSession(sessionId, user);
        SharedChatInvite invite = sharedChatInviteRepository.findByIdAndSessionId(inviteId, sessionId)
                .orElseThrow(() -> new AIServiceException("Invite not found"));
        sharedChatInviteRepository.delete(invite);
        return getSharing(sessionId, user);
    }

    /** What the popup needs to draw itself. */
    public record SharingState(String accessMode, String shareToken, List<SharedChatInvite> invites) {}

    @Transactional(readOnly = true)
    public SharedChatResponse getSharedChat(String token, User viewer) {
        if (token == null || token.isBlank()) {
            throw new AIServiceException("Invalid share link");
        }

        SharedChat sharedChat = sharedChatRepository
                .findByShareTokenAndRevokedFalse(token)
                .orElseThrow(() -> new AIServiceException("Shared chat not found or no longer available"));

        if (sharedChat.getExpiresAt() != null && sharedChat.getExpiresAt().isBefore(LocalDateTime.now())) {
            throw new AIServiceException("Shared chat not found or no longer available");
        }

        ChatSession session = chatSessionRepository.findById(sharedChat.getSessionId())
                .orElseThrow(() -> new AIServiceException("Shared chat not found"));

        // "Only people invited": the viewer must be signed in as the owner or an invited email.
        if (MODE_INVITED.equals(sharedChat.getAccessMode())) {
            if (viewer == null) {
                throw new ShareAccessException(401, "This chat is private. Sign in with the email address that was invited to open it.");
            }
            boolean isOwner = viewer.getId() != null && viewer.getId().equals(session.getUserId());
            boolean isInvited = viewer.getEmail() != null
                    && sharedChatInviteRepository.existsBySessionIdAndEmail(session.getId(), viewer.getEmail().trim().toLowerCase(Locale.ROOT));
            if (!isOwner && !isInvited) {
                throw new ShareAccessException(403, "You don\u2019t have access to this chat. Ask the owner to invite " + viewer.getEmail() + ".");
            }
        }

        List<ChatMessage> messages = chatMessageRepository
                .findBySessionIdOrderByTimestampAsc(session.getId());

        List<SharedMessageResponse> messageResponses = messages.stream()
                .map(this::toSharedMessage)
                .collect(Collectors.toList());

        return new SharedChatResponse(
                session.getId(),
                session.getSessionName(),
                session.getCreatedAt(),
                session.getUpdatedAt(),
                messageResponses
        );
    }


    private SharedMessageResponse toSharedMessage(ChatMessage message) {
        return new SharedMessageResponse(
                message.getId(),
                message.getSessionId(),
                message.getRole(),
                message.getContent(),
                message.getTimestamp(),
                parseAttachments(message.getAttachmentData())
        );
    }

    private List<String> parseAttachments(String attachmentData) {
        if (attachmentData == null || attachmentData.isBlank()) {
            return List.of();
        }

        try {
            return objectMapper.readValue(attachmentData, new TypeReference<List<String>>() {});
        } catch (Exception ignored) {
            return List.of();
        }
    }

    @Transactional
    public void deleteSharesForSession(Long sessionId) {
        sharedChatInviteRepository.deleteBySessionId(sessionId);
        sharedChatRepository.deleteBySessionId(sessionId);
    }

    private String generateUniqueToken() {
        String token;
        do {
            byte[] bytes = new byte[TOKEN_BYTES];
            secureRandom.nextBytes(bytes);
            token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        } while (sharedChatRepository.findByShareTokenAndRevokedFalse(token).isPresent());

        return token;
    }
}
