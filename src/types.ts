
export interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

export interface Folder {
  id: string;
  name: string;
  userId: string;
  createdAt: number;
  icon?: string;
  password?: string;
  isLocked: boolean;
  parentId?: string | null;
  isDeleted?: boolean;
  deletedAt?: number;
}

export interface FileData {
  id: string;
  name: string;
  type: string;
  size: string;
  folderId: string;
  userId: string;
  uploadDate: string;
  dataUrl: string; // Base64 representation or "CHUNKED"
  thumbnailUrl?: string;
  thumbnailName?: string;
  isThumbnailChunked?: boolean;
  thumbnailChunkCount?: number;
  isChunked?: boolean;
  chunkCount?: number;
  isDeleted?: boolean;
  deletedAt?: number;
}
