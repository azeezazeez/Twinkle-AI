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
  publicId?: string;
  userId: string;         
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


export interface UploadedFile {
  id: number;
  filename: string;        
  originalName: string;   
  mimetype: string;        
  size: number;
  path: string;            
  isImage: boolean;       
  uploadDate: string;      
  userId: string;         
}


export interface SharedChatResponse {
  sessionId: number;
  sessionName: string;
  createdAt: string;
  updatedAt: string;
  messages: Message[];
}
