
import React from 'react';
import { Category, FolderConfig } from './types';

export const FOLDERS: FolderConfig[] = [
  {
    id: 'Personal',
    label: 'আমার নথি (Personal)',
    description: 'আমার ব্যক্তিগত সকল ডকুমেন্টস',
    icon: '👤',
    color: 'bg-blue-500',
  },
  {
    id: 'Father',
    label: 'বাবার নথি (Father)',
    description: 'বাবার গুরুত্বপূর্ণ নথিপত্র',
    icon: '👨',
    color: 'bg-emerald-500',
  },
  {
    id: 'Mother',
    label: 'মায়ের নথি (Mother)',
    description: 'মায়ের প্রয়োজনীয় ডকুমেন্টস',
    icon: '👩',
    color: 'bg-rose-500',
  }
];

// In a real app, these would be managed securely. 
// For this demo, we use simple folder-specific passwords.
export const FOLDER_PASSWORDS: Record<Category, string> = {
  'Personal': '1234',
  'Father': 'father786',
  'Mother': 'mother123'
};
