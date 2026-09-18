/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface User {
  id: string;
  name: string;
  email: string;
  username: string;
  avatarUrl?: string;
  authProvider?: 'LOCAL' | 'GOOGLE' | 'APPLE';
  createdAt?: string;
}

export interface Session {
  id: number;
  userId: string;          // present on server records; used for filtering
  sessionName: string;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: number | string;
  sessionId: number;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  attachments?: string[];
}

// Matches exactly what the server stores and returns for uploaded files
export interface UploadedFile {
  id: number;
  filename: string;        // server field: req.file.filename (disk name)
  originalName: string;    // server field: req.file.originalname
  mimetype: string;        // server field: req.file.mimetype
  size: number;
  path: string;            // server field: `/uploads/${filename}`
  isImage: boolean;        // server field: mimetype.startsWith("image/")
  uploadDate: string;      // server field: new Date().toISOString()
  userId: string;          // server field: req.user.id
}
