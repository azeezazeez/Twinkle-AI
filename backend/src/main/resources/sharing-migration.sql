-- Run once on an existing database (schema.sql is only for fresh installs: it drops tables).
-- Adds "Only people invited" / "Anyone with the link" sharing.

ALTER TABLE public.shared_chats
    ADD COLUMN IF NOT EXISTS access_mode VARCHAR(16) NOT NULL DEFAULT 'LINK';

CREATE TABLE IF NOT EXISTS public.shared_chat_invites (
    id          BIGSERIAL    PRIMARY KEY,
    session_id  BIGINT       NOT NULL REFERENCES public.chat_sessions (id) ON DELETE CASCADE,
    email       VARCHAR(255) NOT NULL,
    created_at  TIMESTAMP    NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_shared_chat_invite UNIQUE (session_id, email)
);
CREATE INDEX IF NOT EXISTS idx_shared_chat_invite_session ON public.shared_chat_invites (session_id);
