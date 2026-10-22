-- Runs automatically at every startup (see application.properties). Safe to re-run: every statement is idempotent.
-- schema.sql is only for fresh installs because it drops tables.
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

-- Library (RAG) tables. Created here so chat attachments can always be added to the Library,
-- even on a database that was set up before these tables existed.
CREATE TABLE IF NOT EXISTS public.rag_documents (
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
CREATE INDEX IF NOT EXISTS idx_rag_documents_user_created ON public.rag_documents (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rag_documents_user_status  ON public.rag_documents (user_id, status);

CREATE TABLE IF NOT EXISTS public.rag_chunks (
    id           BIGSERIAL    PRIMARY KEY,
    document_id  BIGINT       NOT NULL REFERENCES public.rag_documents (id) ON DELETE CASCADE,
    user_id      BIGINT       NOT NULL REFERENCES public.users (id)         ON DELETE CASCADE,
    chunk_index  INTEGER      NOT NULL,
    content      TEXT         NOT NULL,
    embedding    JSONB        NOT NULL,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_rag_chunks_document_chunk UNIQUE (document_id, chunk_index)
);
CREATE INDEX IF NOT EXISTS idx_rag_chunks_user_document ON public.rag_chunks (user_id, document_id);
