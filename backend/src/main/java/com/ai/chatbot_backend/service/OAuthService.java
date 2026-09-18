package com.ai.chatbot_backend.service;

import com.ai.chatbot_backend.dto.User;
import com.ai.chatbot_backend.repository.UserRepository;
import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.JWSVerifier;
import com.nimbusds.jose.crypto.RSASSAVerifier;
import com.nimbusds.jose.jwk.JWK;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestTemplate;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.interfaces.RSAPublicKey;
import java.time.Instant;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class OAuthService {

    private final RestTemplate restTemplate;
    private final UserRepository userRepository;

    @Value("${app.frontend-url:https://twinkleai.vercel.app}")
    private String frontendUrl;

    // ========================================================================
    // GOOGLE CONFIGURATION
    // ========================================================================

    @Value("${oauth.google.client-id:}")
    private String googleClientId;

    @Value("${oauth.google.client-secret:}")
    private String googleClientSecret;

    @Value("${oauth.google.redirect-uri:https://twinkle-ai-ype3.onrender.com/api/auth/oauth/google/callback}")
    private String googleRedirectUri;

    // ========================================================================
    // GOOGLE AUTHORIZATION
    // ========================================================================

    /**
     * Creates Google's OAuth authorization URL.
     */
    public String googleAuthorizationUrl(
            String state
    ) {

        require(
                googleClientId,
                "Google OAuth is not configured. Set OAUTH_GOOGLE_CLIENT_ID."
        );

        require(
                googleClientSecret,
                "Google OAuth is not configured. Set OAUTH_GOOGLE_CLIENT_SECRET."
        );

        require(
                googleRedirectUri,
                "Google OAuth redirect URI is missing."
        );

        return "https://accounts.google.com/o/oauth2/v2/auth"
                + "?client_id=" + enc(googleClientId)
                + "&redirect_uri=" + enc(googleRedirectUri)
                + "&response_type=code"
                + "&scope=" + enc("openid email profile")
                + "&state=" + enc(state)
                + "&access_type=offline"
                + "&prompt=select_account"
                + "&include_granted_scopes=true";
    }

    // ========================================================================
    // GOOGLE USER AUTHENTICATION
    // ========================================================================

    /**
     * Exchanges the Google authorization code for tokens,
     * verifies the Google ID token and creates/finds the Twinkle user.
     */
    public User googleUser(
            String code
    ) {

        require(
                googleClientId,
                "Google OAuth is not configured. Set OAUTH_GOOGLE_CLIENT_ID."
        );

        require(
                googleClientSecret,
                "Google OAuth is not configured. Set OAUTH_GOOGLE_CLIENT_SECRET."
        );

        require(
                googleRedirectUri,
                "Google OAuth redirect URI is missing."
        );

        require(
                code,
                "Google authorization code is missing."
        );

        try {

            // ================================================================
            // 1. EXCHANGE AUTHORIZATION CODE
            // ================================================================

            MultiValueMap<String, String> form =
                    new LinkedMultiValueMap<>();

            form.add(
                    "code",
                    code
            );

            form.add(
                    "client_id",
                    googleClientId
            );

            form.add(
                    "client_secret",
                    googleClientSecret
            );

            form.add(
                    "redirect_uri",
                    googleRedirectUri
            );

            form.add(
                    "grant_type",
                    "authorization_code"
            );

            HttpHeaders headers =
                    new HttpHeaders();

            headers.setContentType(
                    MediaType.APPLICATION_FORM_URLENCODED
            );

            ResponseEntity<Map> tokenResponse =
                    restTemplate.exchange(
                            "https://oauth2.googleapis.com/token",
                            HttpMethod.POST,
                            new HttpEntity<>(
                                    form,
                                    headers
                            ),
                            Map.class
                    );

            if (!tokenResponse.getStatusCode().is2xxSuccessful()
                    || tokenResponse.getBody() == null) {

                throw new IllegalStateException(
                        "Google token exchange failed."
                );
            }

            Map<?, ?> token =
                    tokenResponse.getBody();

            String accessToken =
                    stringValue(
                            token.get("access_token")
                    );

            String idToken =
                    stringValue(
                            token.get("id_token")
                    );

            if (accessToken.isBlank()) {

                throw new IllegalStateException(
                        "Google did not return an access token."
                );
            }

            if (idToken.isBlank()) {

                throw new IllegalStateException(
                        "Google did not return an ID token."
                );
            }

            // ================================================================
            // 2. VERIFY GOOGLE ID TOKEN
            // ================================================================

            JWTClaimsSet claims =
                    verifyGoogleIdToken(idToken);

            String googleSubject =
                    claims.getSubject();

            String email =
                    claims.getStringClaim("email");

            String name =
                    claims.getStringClaim("name");

            String picture =
                    claims.getStringClaim("picture");

            Boolean emailVerified =
                    claims.getBooleanClaim(
                            "email_verified"
                    );

            // ================================================================
            // 3. VALIDATE USER INFORMATION
            // ================================================================

            if (googleSubject == null
                    || googleSubject.isBlank()) {

                throw new IllegalStateException(
                        "Google did not return a valid user identifier."
                );
            }

            if (email == null
                    || email.isBlank()) {

                throw new IllegalStateException(
                        "Google did not return an email address."
                );
            }

            if (!Boolean.TRUE.equals(emailVerified)) {

                throw new IllegalStateException(
                        "Google account email is not verified."
                );
            }

            // ================================================================
            // 4. FIND OR CREATE USER
            // ================================================================

            return upsert(
                    email,
                    name == null || name.isBlank()
                            ? email
                            : name,
                    picture,
                    "GOOGLE"
            );

        } catch (Exception e) {

            log.error(
                    "Google OAuth authentication failed",
                    e
            );

            if (e instanceof IllegalStateException) {
                throw (IllegalStateException) e;
            }

            throw new IllegalStateException(
                    "Google sign-in failed. Please try again.",
                    e
            );
        }
    }

    // ========================================================================
    // GOOGLE ID TOKEN VERIFICATION
    // ========================================================================

    /**
     * Cryptographically verifies Google's ID token.
     *
     * Google's public signing keys are retrieved from:
     *
     * https://www.googleapis.com/oauth2/v3/certs
     */
    private JWTClaimsSet verifyGoogleIdToken(
            String idToken
    ) {

        try {

            SignedJWT jwt =
                    SignedJWT.parse(idToken);

            JWSHeader header =
                    jwt.getHeader();

            // ================================================================
            // Validate algorithm
            // ================================================================

            if (!JWSAlgorithm.RS256.equals(
                    header.getAlgorithm()
            )) {

                throw new IllegalStateException(
                        "Google ID token uses an unsupported signing algorithm."
                );
            }

            // ================================================================
            // Get key ID
            // ================================================================

            String keyId =
                    header.getKeyID();

            if (keyId == null
                    || keyId.isBlank()) {

                throw new IllegalStateException(
                        "Google ID token does not contain a key ID."
                );
            }

            // ================================================================
            // Fetch Google's public keys
            // ================================================================

            ResponseEntity<String> keyResponse =
                    restTemplate.exchange(
                            "https://www.googleapis.com/oauth2/v3/certs",
                            HttpMethod.GET,
                            HttpEntity.EMPTY,
                            String.class
                    );

            if (!keyResponse.getStatusCode().is2xxSuccessful()
                    || keyResponse.getBody() == null
                    || keyResponse.getBody().isBlank()) {

                throw new IllegalStateException(
                        "Could not retrieve Google's public signing keys."
                );
            }

            // ================================================================
            // Parse JWKS
            // ================================================================

            JWKSet jwkSet =
                    JWKSet.parse(
                            keyResponse.getBody()
                    );

            JWK jwk =
                    jwkSet.getKeyByKeyId(keyId);

            if (jwk == null) {

                throw new IllegalStateException(
                        "Google signing key was not found."
                );
            }

            // ================================================================
            // Convert JWK to RSA public key
            // ================================================================

            RSAPublicKey publicKey =
                    jwk.toRSAKey()
                            .toRSAPublicKey();

            // ================================================================
            // Verify cryptographic signature
            // ================================================================

            JWSVerifier verifier =
                    new RSASSAVerifier(
                            publicKey
                    );

            if (!jwt.verify(verifier)) {

                throw new IllegalStateException(
                        "Google ID token signature is invalid."
                );
            }

            // ================================================================
            // Extract claims
            // ================================================================

            JWTClaimsSet claims =
                    jwt.getJWTClaimsSet();

            // ================================================================
            // Validate issuer
            // ================================================================

            String issuer =
                    claims.getIssuer();

            if (!"https://accounts.google.com".equals(issuer)
                    && !"accounts.google.com".equals(issuer)) {

                throw new IllegalStateException(
                        "Invalid Google token issuer."
                );
            }

            // ================================================================
            // Validate audience
            // ================================================================

            List<String> audiences =
                    claims.getAudience();

            if (audiences == null
                    || !audiences.contains(
                    googleClientId
            )) {

                throw new IllegalStateException(
                        "Invalid Google token audience."
                );
            }

            // ================================================================
            // Validate expiration
            // ================================================================

            Date expiration =
                    claims.getExpirationTime();

            if (expiration == null
                    || expiration.before(new Date())) {

                throw new IllegalStateException(
                        "Google ID token has expired."
                );
            }

            return claims;

        } catch (Exception e) {

            log.error(
                    "Google ID token verification failed",
                    e
            );

            if (e instanceof IllegalStateException) {
                throw (IllegalStateException) e;
            }

            throw new IllegalStateException(
                    "Google identity verification failed.",
                    e
            );
        }
    }

    // ========================================================================
    // USER UPSERT
    // ========================================================================

    /**
     * Finds an existing user by email or creates a new Google user.
     */
    private User upsert(
            String email,
            String displayName,
            String avatar,
            String provider
    ) {

        // ================================================================
        // Validate email
        // ================================================================

        if (email == null
                || email.isBlank()
                || "null".equalsIgnoreCase(email)) {

            throw new IllegalStateException(
                    "OAuth provider did not return an email address."
            );
        }

        email =
                email.trim()
                        .toLowerCase(
                                Locale.ROOT
                        );

        // ================================================================
        // Find existing user
        // ================================================================

        Optional<User> existing =
                userRepository.findByEmail(email);

        User user =
                existing.orElseGet(
                        User::new
                );

        // ================================================================
        // Create new OAuth user
        // ================================================================

        if (user.getId() == null) {

            user.setEmail(email);

            user.setUsername(
                    uniqueUsername(
                            displayName,
                            email
                    )
            );

            /*
             * OAuth users don't use this password for Google login.
             *
             * IMPORTANT:
             *
             * UUID objects cannot be added directly:
             *
             * UUID.randomUUID() + UUID.randomUUID()
             *
             * Convert them to Strings first.
             */
            user.setPassword(
                    UUID.randomUUID().toString()
                            + UUID.randomUUID().toString()
            );

            user.setVerified(true);
        }

        // ================================================================
        // Set OAuth provider
        // ================================================================

        user.setAuthProvider(provider);

        // ================================================================
        // Set Google avatar
        // ================================================================

        if (avatar != null
                && !avatar.isBlank()) {

            user.setAvatarUrl(avatar);
        }

        return userRepository.save(user);
    }

    // ========================================================================
    // UNIQUE USERNAME
    // ========================================================================

    private String uniqueUsername(
            String name,
            String email
    ) {

        String base;

        if (name == null
                || name.isBlank()) {

            int at =
                    email.indexOf('@');

            base =
                    at > 0
                            ? email.substring(
                            0,
                            at
                    )
                            : "twinkle_user";

        } else {

            base = name;
        }

        // Remove unsupported characters
        base =
                base
                        .replaceAll(
                                "[^A-Za-z0-9._-]",
                                "_"
                        )
                        .replaceAll(
                                "_+",
                                "_"
                        );

        if (base.isBlank()) {
            base = "twinkle_user";
        }

        String candidate =
                base;

        int index =
                1;

        // Prevent username collision
        while (
                userRepository.existsByUsername(
                        candidate
                )
        ) {

            candidate =
                    base
                            + "_"
                            + index++;
        }

        return candidate;
    }

    // ========================================================================
    // HELPERS
    // ========================================================================

    private void require(
            String value,
            String message
    ) {

        if (value == null
                || value.isBlank()) {

            throw new IllegalStateException(
                    message
            );
        }
    }

    private String stringValue(
            Object value
    ) {

        return value == null
                ? ""
                : String.valueOf(value);
    }

    private String enc(
            String value
    ) {

        return URLEncoder.encode(
                value,
                StandardCharsets.UTF_8
        );
    }
}
