
export type Category = 'Personal' | 'Father' | 'Mother';

export interface FileData {
  id: string;
  name: string;
  type: string;
  size: string;
  category: Category;
  uploadDate: string;
  dataUrl: string; // Base64 representation for simulation
}

export interface FolderConfig {
  id: Category;
  label: string;
  description: string;
  icon: string;
  color: string;
}
