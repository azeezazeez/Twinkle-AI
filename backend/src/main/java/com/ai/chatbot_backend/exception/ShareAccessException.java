package com.ai.chatbot_backend.exception;

public class ShareAccessException extends RuntimeException {


    private final int status;

    public ShareAccessException(int status, String message) {
        super(message);
        this.status = status;
    }

    public int getStatus() {
        return status;
    }
}
