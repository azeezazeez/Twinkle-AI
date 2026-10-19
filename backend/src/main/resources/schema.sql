CREATE TABLE IF NOT EXISTS public.rag_documents (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT NOT NULL,
    name        TEXT NOT NULL,
    mime_type   TEXT NOT NULL DEFAULT 'application/octet-stream',
    byte_size   BIGINT NOT NULL DEFAULT 0,
    status      VARCHAR(20) NOT NULL DEFAULT 'PROCESSING',
    chunk_count INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT rag_documents_status_check
        CHECK (status IN ('PROCESSING', 'READY', 'FAILED'))
);

CREATE TABLE IF NOT EXISTS public.rag_chunks (
    id          BIGSERIAL PRIMARY KEY,
    document_id BIGINT NOT NULL REFERENCES public.rag_documents(id) ON DELETE CASCADE,
    user_id     BIGINT NOT NULL,
    chunk_index INTEGER NOT NULL,
    content     TEXT NOT NULL,
    embedding   JSONB NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT rag_chunks_document_chunk_unique UNIQUE (document_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_rag_documents_user_created
    ON public.rag_documents (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_rag_documents_user_status
    ON public.rag_documents (user_id, status);

CREATE INDEX IF NOT EXISTS idx_rag_chunks_user_document
    ON public.rag_chunks (user_id, document_id);
