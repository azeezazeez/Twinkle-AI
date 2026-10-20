package com.ai.chatbot_backend.dto;

import jakarta.persistence.*;

@Entity
@Table(name = "user_memory_settings")
public class UserMemorySetting {

    @Id
    @Column(name = "user_id")
    private Long userId;

    @Column(name = "enabled", nullable = false)
    private boolean enabled = true;

    public UserMemorySetting() {}

    public UserMemorySetting(Long userId, boolean enabled) {
        this.userId = userId;
        this.enabled = enabled;
    }

    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }
    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
}
