-- =============================================================================
--  Twinkle AI  -  clean PostgreSQL schema
-- =============================================================================
--  WARNING: this script DROPS every table below and recreates it empty.
--  All existing users, chats and documents are deleted. Run it once on Neon
--  (SQL Editor) to start fresh. Column names match the Java entities exactly,
--  so no backend code changes are needed.
--
--  Table map
--    users                 one row per account
--    otps                  one-time codes for email verification / password reset
--    chat_sessions         one row per conversation, owned by a user
--    chat_messages         one row per message inside a conversation
--    shared_chats          share links for a conversation (+ access mode)
--    shared_chat_invites   people invited to a shared conversation
--    user_memories         facts the assistant remembers about a user
--    user_memory_settings  per-user on/off switch for memory
--    rag_documents         knowledge-base files uploaded by a user
--    rag_chunks            text chunks + embeddings of a knowledge-base file
-- =============================================================================

DROP TABLE IF EXISTS public.rag_chunks            CASCADE;
DROP TABLE IF EXISTS public.rag_documents         CASCADE;
DROP TABLE IF EXISTS public.shared_chat_invites   CASCADE;
DROP TABLE IF EXISTS public.shared_chats          CASCADE;
DROP TABLE IF EXISTS public.chat_messages         CASCADE;
DROP TABLE IF EXISTS public.chat_sessions         CASCADE;
DROP TABLE IF EXISTS public.user_memory_settings  CASCADE;
DROP TABLE IF EXISTS public.user_memories         CASCADE;
DROP TABLE IF EXISTS public.otps                  CASCADE;
DROP TABLE IF EXISTS public.users                 CASCADE;

-- -----------------------------------------------------------------------------
-- 1. users
-- -----------------------------------------------------------------------------
CREATE TABLE public.users (
    id             BIGSERIAL    PRIMARY KEY,
    username       VARCHAR(255) NOT NULL,
    email          VARCHAR(255) NOT NULL,
    password       VARCHAR(255) NOT NULL,            -- BCrypt hash, never plain text
    full_name      VARCHAR(100),
    avatar_url     VARCHAR(1024),
    auth_provider  VARCHAR(20)  NOT NULL DEFAULT 'LOCAL',
    is_verified    BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at     TIMESTAMP    NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_users_username UNIQUE (username),
    CONSTRAINT uq_users_email    UNIQUE (email),
    CONSTRAINT ck_users_provider CHECK (auth_provider IN ('LOCAL', 'GOOGLE'))
);
COMMENT ON TABLE  public.users               IS 'Registered accounts.';
COMMENT ON COLUMN public.users.password      IS 'BCrypt hash. Social-login accounts store a random hash.';
COMMENT ON COLUMN public.users.auth_provider IS 'LOCAL = email + password, GOOGLE = Google OAuth.';
COMMENT ON COLUMN public.users.is_verified   IS 'TRUE once the email address was confirmed with an OTP.';

-- -----------------------------------------------------------------------------
-- 2. otps
-- -----------------------------------------------------------------------------
CREATE TABLE public.otps (
    id           BIGSERIAL    PRIMARY KEY,
    email        VARCHAR(255) NOT NULL,
    otp_code     VARCHAR(255) NOT NULL,
    expiry_time  TIMESTAMP    NOT NULL,
    verified     BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMP    NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_otps_email_created ON public.otps (email, created_at DESC);
CREATE INDEX idx_otps_expiry        ON public.otps (expiry_time);
COMMENT ON TABLE public.otps IS 'Short-lived one-time passcodes. Expired rows are safe to delete.';

-- -----------------------------------------------------------------------------
-- 3. chat_sessions
-- -----------------------------------------------------------------------------
CREATE TABLE public.chat_sessions (
    id            BIGSERIAL    PRIMARY KEY,
    public_id     VARCHAR(36)  NOT NULL,             -- UUID used in URLs
    user_id       BIGINT       NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
    session_name  VARCHAR(255) NOT NULL DEFAULT 'New chat',
    created_at    TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMP    NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_chat_sessions_public_id UNIQUE (public_id)
);
CREATE INDEX idx_chat_sessions_user_updated ON public.chat_sessions (user_id, updated_at DESC);
COMMENT ON TABLE  public.chat_sessions           IS 'A conversation owned by one user.';
COMMENT ON COLUMN public.chat_sessions.public_id IS 'Random UUID exposed to the browser instead of the numeric id.';

-- -----------------------------------------------------------------------------
-- 4. chat_messages
-- -----------------------------------------------------------------------------
CREATE TABLE public.chat_messages (
    id               BIGSERIAL    PRIMARY KEY,
    session_id       BIGINT       NOT NULL REFERENCES public.chat_sessions (id) ON DELETE CASCADE,
    role             VARCHAR(255) NOT NULL,          -- user | assistant | system
    content          TEXT         NOT NULL,
    attachment_data  TEXT,                           -- JSON array of data-URL attachments
    token_count      BIGINT,                         -- estimated tokens, set on assistant rows
    "timestamp"      TIMESTAMP    NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_chat_messages_session_time ON public.chat_messages (session_id, "timestamp");
COMMENT ON TABLE  public.chat_messages                 IS 'Messages of a conversation, oldest first.';
COMMENT ON COLUMN public.chat_messages.role            IS 'Author: user, assistant or system.';
COMMENT ON COLUMN public.chat_messages.attachment_data IS 'JSON array of files/images (data URLs) sent with the message.';
COMMENT ON COLUMN public.chat_messages.token_count     IS 'Estimated tokens for the turn; feeds profile usage statistics.';

-- -----------------------------------------------------------------------------
-- 5. shared_chats
-- -----------------------------------------------------------------------------
CREATE TABLE public.shared_chats (
    id          BIGSERIAL    PRIMARY KEY,
    session_id  BIGINT       NOT NULL REFERENCES public.chat_sessions (id) ON DELETE CASCADE,
    share_token VARCHAR(128) NOT NULL,
    created_at  TIMESTAMP    NOT NULL DEFAULT NOW(),
    expires_at  TIMESTAMP,                           -- NULL = never expires
    revoked     BOOLEAN      NOT NULL DEFAULT FALSE,
    access_mode VARCHAR(16)  NOT NULL DEFAULT 'LINK',  -- 'INVITED' (only invited people) or 'LINK' (anyone with the link)

    CONSTRAINT uq_shared_chats_token UNIQUE (share_token)
);
CREATE INDEX idx_shared_chat_session ON public.shared_chats (session_id);
COMMENT ON TABLE public.shared_chats IS 'Read-only links to a conversation.';

CREATE TABLE public.shared_chat_invites (
    id          BIGSERIAL    PRIMARY KEY,
    session_id  BIGINT       NOT NULL REFERENCES public.chat_sessions (id) ON DELETE CASCADE,
    email       VARCHAR(255) NOT NULL,
    created_at  TIMESTAMP    NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_shared_chat_invite UNIQUE (session_id, email)
);
CREATE INDEX idx_shared_chat_invite_session ON public.shared_chat_invites (session_id);

-- -----------------------------------------------------------------------------
-- 6. user_memories
-- -----------------------------------------------------------------------------
CREATE TABLE public.user_memories (
    id          BIGSERIAL    PRIMARY KEY,
    user_id     BIGINT       NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
    content     VARCHAR(300) NOT NULL,
    created_at  TIMESTAMP    NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_user_memories_user ON public.user_memories (user_id);
COMMENT ON TABLE public.user_memories IS 'Short facts the assistant remembers about a user.';

-- -----------------------------------------------------------------------------
-- 7. user_memory_settings
-- -----------------------------------------------------------------------------
CREATE TABLE public.user_memory_settings (
    user_id  BIGINT  PRIMARY KEY REFERENCES public.users (id) ON DELETE CASCADE,
    enabled  BOOLEAN NOT NULL DEFAULT TRUE
);
COMMENT ON TABLE public.user_memory_settings IS 'One row per user: is memory switched on?';

-- -----------------------------------------------------------------------------
-- 8. rag_documents
-- -----------------------------------------------------------------------------
CREATE TABLE public.rag_documents (
    id           BIGSERIAL    PRIMARY KEY,
    user_id      BIGINT       NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
    name         TEXT         NOT NULL,
    mime_type    TEXT         NOT NULL DEFAULT 'application/octet-stream',
    byte_size    BIGINT       NOT NULL DEFAULT 0,
    status       VARCHAR(20)  NOT NULL DEFAULT 'PROCESSING',
    chunk_count  INTEGER      NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT ck_rag_documents_status CHECK (status IN ('PROCESSING', 'READY', 'FAILED'))
);
CREATE INDEX idx_rag_documents_user_created ON public.rag_documents (user_id, created_at DESC);
CREATE INDEX idx_rag_documents_user_status  ON public.rag_documents (user_id, status);
COMMENT ON TABLE public.rag_documents IS 'Knowledge-base files. status: PROCESSING, READY or FAILED.';

-- -----------------------------------------------------------------------------
-- 9. rag_chunks
-- -----------------------------------------------------------------------------
CREATE TABLE public.rag_chunks (
    id           BIGSERIAL    PRIMARY KEY,
    document_id  BIGINT       NOT NULL REFERENCES public.rag_documents (id) ON DELETE CASCADE,
    user_id      BIGINT       NOT NULL REFERENCES public.users (id)         ON DELETE CASCADE,
    chunk_index  INTEGER      NOT NULL,
    content      TEXT         NOT NULL,
    embedding    JSONB        NOT NULL,              -- vector as a JSON array of floats
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_rag_chunks_document_chunk UNIQUE (document_id, chunk_index)
);
CREATE INDEX idx_rag_chunks_user_document ON public.rag_chunks (user_id, document_id);
COMMENT ON TABLE public.rag_chunks IS 'Searchable text chunks of a document with their embeddings.';
