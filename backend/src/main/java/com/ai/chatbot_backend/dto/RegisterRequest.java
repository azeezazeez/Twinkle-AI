package com.ai.chatbot_backend.dto;

import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;

import java.io.Serializable;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class RegisterRequest implements Serializable {

    private static final long serialVersionUID = 1L;

    private String username;
    private String email;
    private String password;
}
