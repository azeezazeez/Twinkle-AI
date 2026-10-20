package com.ai.chatbot_backend.repository;

import com.ai.chatbot_backend.dto.UserMemorySetting;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface UserMemorySettingRepository extends JpaRepository<UserMemorySetting, Long> {
}
