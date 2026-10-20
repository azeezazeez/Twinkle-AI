package com.ai.chatbot_backend.repository;

import com.ai.chatbot_backend.dto.UserMemory;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

@Repository
public interface UserMemoryRepository extends JpaRepository<UserMemory, Long> {

    List<UserMemory> findByUserIdOrderByCreatedAtDescIdDesc(Long userId);

    Optional<UserMemory> findByIdAndUserId(Long id, Long userId);

    long countByUserId(Long userId);

    @Modifying
    @Transactional
    @Query("DELETE FROM UserMemory m WHERE m.userId = :userId")
    void deleteByUserId(@Param("userId") Long userId);
}
