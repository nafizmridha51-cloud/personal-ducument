
import React, { useState, useEffect, useRef } from 'react';
import { 
  FolderPlus, 
  FilePlus, 
  Lock, 
  Unlock, 
  Trash2, 
  Download, 
  LogOut, 
  Search, 
  MoreVertical, 
  Folder as FolderIcon,
  File as FileIcon,
  Image as ImageIcon,
  Shield,
  Key,
  Mail,
  AlertCircle,
  ChevronRight,
  Plus,
  Eye,
  X,
  Pencil,
  Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getFirebaseAuth, loginWithGoogle, logout, getFirebaseDb, isFirebaseConfigured } from './lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  onSnapshot, 
  deleteDoc, 
  doc, 
  updateDoc,
  serverTimestamp,
  getDocs,
  orderBy,
  writeBatch
} from 'firebase/firestore';
import { User, Folder, FileData } from './types';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Settings, ExternalLink, Info } from 'lucide-react';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [folders, setFolders] = useState<Folder[]>(() => {
    const saved = localStorage.getItem('demo_folders');
    return saved ? JSON.parse(saved) : [];
  });
  const [files, setFiles] = useState<FileData[]>(() => {
    const saved = localStorage.getItem('demo_files');
    return saved ? JSON.parse(saved) : [];
  });
  const [activeFolderId, setActiveFolderId] = useState<string | null>(() => {
    return localStorage.getItem('active_folder_id');
  });
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDemoMode, setIsDemoMode] = useState(() => {
    return localStorage.getItem('is_demo_mode') === 'true';
  });
  const [unlockedFolderIds, setUnlockedFolderIds] = useState<string[]>([]);
  
  // Modals
  const [showAddFolder, setShowAddFolder] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [showUnlock, setShowUnlock] = useState<Folder | null>(null);
  const [showForgot, setShowForgot] = useState<Folder | null>(null);
  const [recoveryStep, setRecoveryStep] = useState<'send' | 'verify' | 'reset'>('send');
  const [generatedCode, setGeneratedCode] = useState('');
  const [userInputCode, setUserInputCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [showPreview, setShowPreview] = useState<FileData | null>(null);
  const [showLockFolder, setShowLockFolder] = useState<Folder | null>(null);
  const [editingFileId, setEditingFileId] = useState<string | null>(null);
  const [editingFileName, setEditingFileName] = useState('');
  const [activeFolderMenuId, setActiveFolderMenuId] = useState<string | null>(null);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState('');
  
  // Form States
  const [newFolderName, setNewFolderName] = useState('');
  const [folderPassword, setFolderPassword] = useState('');
  const [unlockPassword, setUnlockPassword] = useState('');
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [error, setError] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    localStorage.setItem('is_demo_mode', isDemoMode.toString());
    if (activeFolderId) {
      localStorage.setItem('active_folder_id', activeFolderId);
    } else {
      localStorage.removeItem('active_folder_id');
    }

    if (isDemoMode) {
      setUser({
        uid: 'demo_user',
        email: 'demo@example.com',
        displayName: 'Demo User',
        photoURL: 'https://picsum.photos/seed/demo/200'
      });
      setLoading(false);
      return;
    }

    let unsubscribe: () => void;
    try {
      if (!isFirebaseConfigured) {
        setLoading(false);
        return;
      }
      const auth = getFirebaseAuth();
      unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
        if (firebaseUser) {
          setUser({
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName,
            photoURL: firebaseUser.photoURL,
          });
        } else {
          setUser(null);
        }
        setLoading(false);
      });
    } catch (err) {
      console.error(err);
      setLoading(false);
    }

    return () => unsubscribe?.();
  }, [isDemoMode, activeFolderId]);

  useEffect(() => {
    if (isDemoMode) {
      localStorage.setItem('demo_folders', JSON.stringify(folders));
      localStorage.setItem('demo_files', JSON.stringify(files));
    }
  }, [folders, files, isDemoMode]);

  useEffect(() => {
    if (!user || isDemoMode) return;

    let unsubscribeFolders: () => void;
    let unsubscribeFiles: () => void;

    try {
      if (!isFirebaseConfigured) return;
      const db = getFirebaseDb();
      const foldersQuery = query(collection(db, 'folders'), where('userId', '==', user.uid));
      unsubscribeFolders = onSnapshot(foldersQuery, (snapshot) => {
        const folderList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Folder));
        setFolders(folderList.sort((a, b) => b.createdAt - a.createdAt));
      });

      const filesQuery = query(collection(db, 'files'), where('userId', '==', user.uid));
      unsubscribeFiles = onSnapshot(filesQuery, (snapshot) => {
        const fileList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FileData));
        setFiles(fileList);
      });
    } catch (err) {
      console.error(err);
    }

    return () => {
      unsubscribeFolders?.();
      unsubscribeFiles?.();
    };
  }, [user, isDemoMode]);

  const handleAddFolder = async () => {
    if (!newFolderName.trim() || !user) return;
    
    if (isDemoMode) {
      const newFolder: Folder = {
        id: Math.random().toString(36).substr(2, 9),
        name: newFolderName,
        userId: user.uid,
        createdAt: Date.now(),
        icon: '📁',
        password: folderPassword || undefined,
        isLocked: !!folderPassword
      };
      setFolders([newFolder, ...folders]);
      setNewFolderName('');
      setFolderPassword('');
      setShowAddFolder(false);
      return;
    }

    try {
      const db = getFirebaseDb();
      await addDoc(collection(db, 'folders'), {
        name: newFolderName,
        userId: user.uid,
        createdAt: Date.now(),
        icon: '📁',
        password: folderPassword || null,
        isLocked: !!folderPassword
      });
      setNewFolderName('');
      setFolderPassword('');
      setShowAddFolder(false);
    } catch (err: any) {
      console.error(err);
      if (err.code === 'permission-denied') {
        alert('ফায়ারবেস পারমিশন এরর! অনুগ্রহ করে ফায়ারবেস কনসোলে Firestore Rules চেক করুন।');
      } else {
        alert('ফোল্ডার সেভ করতে সমস্যা হয়েছে: ' + (err.message || 'Unknown error'));
      }
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !activeFolderId || !user) return;

    if (file.size > 50 * 1024 * 1024) {
      alert('ফাইলের সাইজ অনেক বড়! অনুগ্রহ করে ৫০ মেগাবাইট (50 MB) এর নিচের ফাইল আপলোড করুন।');
      return;
    }

    setIsUploading(true);
    
    if (isDemoMode) {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64Data = e.target?.result as string;
        const newFile: FileData = {
          id: Math.random().toString(36).substr(2, 9),
          name: file.name,
          type: file.type,
          size: (file.size / (1024 * 1024)).toFixed(2) + ' MB',
          folderId: activeFolderId,
          userId: user?.uid || 'demo-user',
          uploadDate: new Date().toLocaleDateString('bn-BD'),
          dataUrl: base64Data,
          isChunked: false
        };
        setFiles([...files, newFile]);
        setShowUpload(false);
        setIsUploading(false);
      };
      reader.readAsDataURL(file);
      return;
    }

    let fileDocRef: any = null;
    try {
      const db = getFirebaseDb();
      
      // Read file as base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      
      const fullBase64 = await base64Promise;
      
      // Chunk size: 700KB (to stay safe within 1MB Firestore limit)
      const CHUNK_SIZE = 700 * 1024;
      const chunks: string[] = [];
      for (let i = 0; i < fullBase64.length; i += CHUNK_SIZE) {
        chunks.push(fullBase64.substring(i, i + CHUNK_SIZE));
      }

      console.log(`Uploading file in ${chunks.length} chunks...`);

      // 1. Save metadata to Firestore
      const fileDoc = await addDoc(collection(db, 'files'), {
        name: file.name,
        type: file.type,
        size: (file.size / (1024 * 1024)).toFixed(2) + ' MB',
        folderId: activeFolderId,
        userId: user.uid,
        uploadDate: new Date().toLocaleDateString('bn-BD'),
        dataUrl: 'CHUNKED',
        isChunked: true,
        chunkCount: chunks.length,
        createdAt: serverTimestamp()
      });
      
      fileDocRef = fileDoc;

      // 2. Save chunks to Firestore
      let currentBatch = writeBatch(db);
      let count = 0;
      
      for (let i = 0; i < chunks.length; i++) {
        const chunkRef = doc(collection(db, 'fileChunks'));
        currentBatch.set(chunkRef, {
          fileId: fileDoc.id,
          index: i,
          data: chunks[i],
          userId: user.uid
        });
        count++;
        
        if (count === 400) {
          await currentBatch.commit();
          currentBatch = writeBatch(db);
          count = 0;
        }
      }
      
      if (count > 0) {
        await currentBatch.commit();
      }
      
      console.log("File and chunks uploaded successfully.");
      setShowUpload(false);
    } catch (err: any) {
      console.error("Upload failed:", err);
      
      // Cleanup: Delete metadata if chunks failed
      if (fileDocRef) {
        try {
          const db = getFirebaseDb();
          await deleteDoc(fileDocRef);
          console.log("Cleaned up file metadata after failed chunk upload.");
        } catch (cleanupErr) {
          console.error("Failed to cleanup file metadata:", cleanupErr);
        }
      }

      if (err.code === 'permission-denied') {
        alert('ফায়ারবেস পারমিশন এরর! অনুগ্রহ করে ফায়ারবেস কনসোলে Firestore Rules চেক করুন।');
      } else {
        alert('ফাইল আপলোড করতে সমস্যা হয়েছে: ' + (err.message || 'Unknown error'));
      }
    } finally {
      setIsUploading(false);
    }
  };

  const handleUnlock = async () => {
    if (!showUnlock) return;
    if (unlockPassword === showUnlock.password) {
      setUnlockedFolderIds([...unlockedFolderIds, showUnlock.id]);
      setActiveFolderId(showUnlock.id);
      setShowUnlock(null);
      setUnlockPassword('');
      setError('');
    } else {
      setError('ভুল পাসওয়ার্ড! আবার চেষ্টা করুন।');
    }
  };

  const [authError, setAuthError] = useState<string | null>(null);

  const handleGoogleLogin = async () => {
    setAuthError(null);
    try {
      await loginWithGoogle();
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/configuration-not-found') {
        setAuthError('ফায়ারবেস কনসোলে গুগল লগইন (Google Sign-in) চালু করা নেই। অনুগ্রহ করে Authentication > Sign-in method এ গিয়ে এটি চালু করুন।');
      } else if (err.code === 'auth/unauthorized-domain') {
        setAuthError(`এই ডোমেইনটি (${window.location.hostname}) ফায়ারবেসে অনুমোদিত নয়। অনুগ্রহ করে ফায়ারবেস কনসোলে Authentication > Settings > Authorized domains এ গিয়ে এই ডোমেইনটি যোগ করুন।`);
      } else if (err.code === 'auth/invalid-api-key') {
        setAuthError('আপনার এপিআই কি (API Key) সঠিক নয়। অনুগ্রহ করে পুনরায় চেক করুন।');
      } else {
        setAuthError('লগইন করতে সমস্যা হচ্ছে। অনুগ্রহ করে আবার চেষ্টা করুন।');
      }
    }
  };

  const resetDemoData = () => {
    if (confirm('আপনি কি সব ডেমো ডেটা মুছে ফেলতে চান?')) {
      localStorage.removeItem('demo_folders');
      localStorage.removeItem('demo_files');
      setFolders([]);
      setFiles([]);
      setActiveFolderId(null);
      alert('ডেমো ডেটা সফলভাবে মুছে ফেলা হয়েছে।');
    }
  };
  const handleRecovery = async () => {
    if (!showForgot || !user || !user.email) return;
    
    setIsSendingCode(true);
    setError('');
    
    // Generate a 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    setGeneratedCode(code);

    try {
      const response = await fetch('/api/send-verification-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, code }),
      });

      const data = await response.json();

      if (data.success) {
        setIsSendingCode(false);
        setRecoveryStep('verify');
        if (data.simulated) {
          alert(`আপনার ভেরিফিকেশন কোডটি হলো: ${code}\n(SMTP কনফিগার করা নেই, তাই ইমেইল পাঠানো সম্ভব হয়নি)`);
        } else {
          alert(`একটি ভেরিফিকেশন কোড আপনার ইমেইল (${user.email}) এ পাঠানো হয়েছে।`);
        }
      } else {
        throw new Error(data.error || 'Failed to send email');
      }
    } catch (err) {
      console.error('Error sending recovery email:', err);
      setIsSendingCode(false);
      setError('ইমেইল পাঠাতে সমস্যা হয়েছে। অনুগ্রহ করে পরে চেষ্টা করুন।');
      // Fallback to simulation for testing if API fails
      setRecoveryStep('verify');
      alert(`আপনার ভেরিফিকেশন কোডটি হলো: ${code}\n(সার্ভার ত্রুটি, তাই সিমুলেশন মোডে দেখানো হচ্ছে)`);
    }
  };

  const handleVerifyCode = () => {
    if (userInputCode === generatedCode) {
      setRecoveryStep('reset');
      setError('');
    } else {
      setError('ভুল ভেরিফিকেশন কোড!');
    }
  };

  const handleResetPassword = async () => {
    if (!showForgot || !newPassword) return;
    
    try {
      if (isDemoMode) {
        setFolders(folders.map(f => f.id === showForgot.id ? { ...f, password: newPassword, isLocked: true } : f));
      } else {
        const db = getFirebaseDb();
        await updateDoc(doc(db, 'folders', showForgot.id), { 
          password: newPassword,
          isLocked: true 
        });
      }
      
      setShowForgot(null);
      setRecoveryStep('send');
      setNewPassword('');
      setUserInputCode('');
      setGeneratedCode('');
      alert('পাসওয়ার্ড সফলভাবে পরিবর্তন করা হয়েছে।');
    } catch (err) {
      console.error(err);
      alert('পাসওয়ার্ড পরিবর্তন করতে সমস্যা হয়েছে।');
    }
  };

  const deleteFile = async (id: string) => {
    if (window.confirm('আপনি কি এই নথিটি মুছে ফেলতে চান?')) {
      setIsDeleting(id);
      try {
        if (isDemoMode) {
          setFiles(files.filter(f => f.id !== id));
          setIsDeleting(null);
          return;
        }
        
        if (!user) throw new Error("User not authenticated");
        
        const db = getFirebaseDb();
        console.log("Deleting file:", id);
        
        // 1. Delete chunks if any
        const chunksQuery = query(
          collection(db, 'fileChunks'), 
          where('fileId', '==', id),
          where('userId', '==', user.uid)
        );
        const chunksSnapshot = await getDocs(chunksQuery);
        
        console.log(`Found ${chunksSnapshot.size} chunks to delete for file ${id}`);
        
        if (!chunksSnapshot.empty) {
          let batch = writeBatch(db);
          let count = 0;
          for (const chunkDoc of chunksSnapshot.docs) {
            batch.delete(chunkDoc.ref);
            count++;
            if (count === 400) {
              await batch.commit();
              batch = writeBatch(db);
              count = 0;
            }
          }
          if (count > 0) await batch.commit();
        }

        // 2. Delete file metadata
        await deleteDoc(doc(db, 'files', id));
        console.log("File metadata deleted successfully");
        
        // Optimistic update
        setFiles(prev => prev.filter(f => f.id !== id));
      } catch (err: any) {
        console.error("Delete file error:", err);
        alert('ফাইলটি মুছতে সমস্যা হয়েছে: ' + (err.message || 'Unknown error'));
      } finally {
        setIsDeleting(null);
      }
    }
  };

  const deleteFolder = async (id: string) => {
    if (window.confirm('এই ফোল্ডারটি মুছলে এর ভেতরের সব ফাইলও মুছে যাবে। আপনি কি নিশ্চিত?')) {
      setIsDeleting(id);
      try {
        setUnlockedFolderIds(unlockedFolderIds.filter(fid => fid !== id));
        if (isDemoMode) {
          setFiles(files.filter(f => f.folderId !== id));
          setFolders(folders.filter(f => f.id !== id));
          if (activeFolderId === id) setActiveFolderId(null);
          setIsDeleting(null);
          return;
        }
        
        if (!user) throw new Error("User not authenticated");
        
        const db = getFirebaseDb();
        const folderFiles = files.filter(f => f.folderId === id);
        console.log(`Deleting folder ${id} with ${folderFiles.length} files`);
        
        // Delete all files and their chunks
        for (const file of folderFiles) {
          // Delete chunks
          const chunksQuery = query(
            collection(db, 'fileChunks'), 
            where('fileId', '==', file.id),
            where('userId', '==', user.uid)
          );
          const chunksSnapshot = await getDocs(chunksQuery);
          
          if (!chunksSnapshot.empty) {
            let batch = writeBatch(db);
            let count = 0;
            for (const chunkDoc of chunksSnapshot.docs) {
              batch.delete(chunkDoc.ref);
              count++;
              if (count === 400) {
                await batch.commit();
                batch = writeBatch(db);
                count = 0;
              }
            }
            if (count > 0) await batch.commit();
          }

          // Delete metadata
          await deleteDoc(doc(db, 'files', file.id));
        }
        
        // Then delete the folder
        await deleteDoc(doc(db, 'folders', id));
        console.log("Folder and its contents deleted successfully");
        
        if (activeFolderId === id) setActiveFolderId(null);
        
        // Optimistic update
        setFolders(prev => prev.filter(f => f.id !== id));
        setFiles(prev => prev.filter(f => f.folderId !== id));
      } catch (err: any) {
        console.error("Delete folder error:", err);
        alert('ফোল্ডারটি মুছতে সমস্যা হয়েছে: ' + (err.message || 'Unknown error'));
      } finally {
        setIsDeleting(null);
      }
    }
  };

  const renameFile = async (id: string, newName: string) => {
    if (!newName.trim()) return;
    try {
      if (isDemoMode) {
        setFiles(files.map(f => f.id === id ? { ...f, name: newName } : f));
        setEditingFileId(null);
        return;
      }
      const db = getFirebaseDb();
      await updateDoc(doc(db, 'files', id), { name: newName });
      setEditingFileId(null);
    } catch (err) {
      console.error(err);
      alert('নাম পরিবর্তন করতে সমস্যা হয়েছে।');
    }
  };

  const renameFolder = async (id: string, newName: string) => {
    if (!newName.trim()) return;
    try {
      if (isDemoMode) {
        setFolders(folders.map(f => f.id === id ? { ...f, name: newName } : f));
        setEditingFolderId(null);
        return;
      }
      const db = getFirebaseDb();
      await updateDoc(doc(db, 'folders', id), { name: newName });
      setEditingFolderId(null);
    } catch (err) {
      console.error(err);
      alert('ফোল্ডারের নাম পরিবর্তন করতে সমস্যা হয়েছে।');
    }
  };

  const removeFolderLock = async (folder: Folder) => {
    const pass = window.prompt('পাসওয়ার্ডটি মুছতে বর্তমান পাসওয়ার্ডটি দিন:');
    if (!pass) return;
    
    if (pass !== folder.password) {
      alert('ভুল পাসওয়ার্ড!');
      return;
    }

    try {
      if (isDemoMode) {
        setFolders(folders.map(f => f.id === folder.id ? { ...f, password: '', isLocked: false } : f));
        return;
      }
      const db = getFirebaseDb();
      await updateDoc(doc(db, 'folders', folder.id), { password: '', isLocked: false });
    } catch (err) {
      console.error(err);
      alert('পাসওয়ার্ড মুছতে সমস্যা হয়েছে।');
    }
  };

  const handleSetFolderLock = async () => {
    if (!showLockFolder || !folderPassword) return;
    
    try {
      if (isDemoMode) {
        setFolders(folders.map(f => f.id === showLockFolder.id ? { ...f, password: folderPassword, isLocked: true } : f));
        setShowLockFolder(null);
        setFolderPassword('');
        return;
      }
      const db = getFirebaseDb();
      await updateDoc(doc(db, 'folders', showLockFolder.id), { password: folderPassword, isLocked: true });
      setShowLockFolder(null);
      setFolderPassword('');
    } catch (err) {
      console.error(err);
      alert('লক করতে সমস্যা হয়েছে।');
    }
  };

  const downloadFile = async (file: FileData) => {
    let dataUrl = file.dataUrl;

    if (!isDemoMode && file.isChunked && dataUrl === 'CHUNKED') {
      setIsUploading(true); // Reusing uploading state for loading
      try {
        console.log("Attempting to download chunked file. ID:", file.id);
        const db = getFirebaseDb();
        const chunksQuery = query(
          collection(db, 'fileChunks'), 
          where('fileId', '==', file.id),
          where('userId', '==', user.uid)
        );
        const chunksSnapshot = await getDocs(chunksQuery);
        
        if (chunksSnapshot.empty) {
          console.error("No chunks found in Firestore for file ID:", file.id);
          if (window.confirm('এই ফাইলটির কোনো ডেটা খুঁজে পাওয়া যায়নি। সম্ভবত এটি সঠিকভাবে আপলোড হয়নি। আপনি কি এই অকেজো ফাইলটি তালিকা থেকে মুছে ফেলতে চান?')) {
            await deleteDoc(doc(db, 'files', file.id));
            setFiles(files.filter(f => f.id !== file.id));
          }
          setIsUploading(false);
          return;
        }

        console.log(`Found ${chunksSnapshot.size} chunks for file ${file.id}`);

        // Sort chunks in memory to avoid Firebase Index requirement
        const sortedChunks = chunksSnapshot.docs
          .map(doc => doc.data())
          .sort((a, b) => a.index - b.index);

        let fullBase64 = '';
        sortedChunks.forEach(chunk => {
          fullBase64 += chunk.data;
        });
        dataUrl = fullBase64;
        console.log("File reconstructed successfully. Total length:", dataUrl.length);
      } catch (err: any) {
        console.error("Download error details:", err);
        alert('ফাইলটি ডাউনলোড করতে সমস্যা হয়েছে। সম্ভবত ফাইলটি সঠিকভাবে আপলোড হয়নি বা ডেটাবেস থেকে মুছে গেছে।');
        setIsUploading(false);
        return;
      } finally {
        setIsUploading(false);
      }
    }

    if (!dataUrl || dataUrl === 'CHUNKED') {
      alert('ফাইলের ডেটা পাওয়া যায়নি।');
      return;
    }

    try {
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error("Link trigger error:", err);
      alert('ডাউনলোড শুরু করতে সমস্যা হয়েছে।');
    }
  };

  const handlePreview = async (file: FileData) => {
    if (!isDemoMode && file.isChunked && file.dataUrl === 'CHUNKED') {
      setIsPreviewLoading(true);
      try {
        console.log("Attempting to preview chunked file. ID:", file.id);
        const db = getFirebaseDb();
        const chunksQuery = query(
          collection(db, 'fileChunks'), 
          where('fileId', '==', file.id),
          where('userId', '==', user.uid)
        );
        const chunksSnapshot = await getDocs(chunksQuery);
        
        if (chunksSnapshot.empty) {
          console.error("No chunks found in Firestore for preview. File ID:", file.id);
          if (window.confirm('এই ফাইলটির প্রিভিউ লোড করা যাচ্ছে না কারণ এর কোনো ডেটা খুঁজে পাওয়া যায়নি। আপনি কি এই অকেজো ফাইলটি তালিকা থেকে মুছে ফেলতে চান?')) {
            await deleteDoc(doc(db, 'files', file.id));
            setFiles(files.filter(f => f.id !== file.id));
          }
          setIsPreviewLoading(false);
          return;
        }

        console.log(`Found ${chunksSnapshot.size} chunks for preview of file ${file.id}`);

        // Sort chunks in memory
        const sortedChunks = chunksSnapshot.docs
          .map(doc => doc.data())
          .sort((a, b) => a.index - b.index);

        let fullBase64 = '';
        sortedChunks.forEach(chunk => {
          fullBase64 += chunk.data;
        });
        
        // Update the file object with the fetched dataUrl for the preview
        setShowPreview({ ...file, dataUrl: fullBase64 });
        console.log("Preview reconstructed successfully. Total length:", fullBase64.length);
      } catch (err: any) {
        console.error("Preview error details:", err);
        alert('প্রিভিউ লোড করতে সমস্যা হয়েছে। সম্ভবত ফাইলটি সঠিকভাবে আপলোড হয়নি।');
      } finally {
        setIsPreviewLoading(false);
      }
    } else {
      if (file.dataUrl === 'CHUNKED') {
        alert('এই ফাইলটির ডেটা পাওয়া যাচ্ছে না।');
        return;
      }
      setShowPreview(file);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!user && !isFirebaseConfigured && !isDemoMode) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#f5f5f4] p-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-2xl w-full bg-white p-10 rounded-[40px] shadow-2xl border border-black/5"
        >
          <div className="flex flex-col md:flex-row gap-10">
            <div className="flex-1">
              <div className="w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center mb-6">
                <Settings className="text-amber-600 w-8 h-8 animate-spin-slow" />
              </div>
              <h1 className="text-3xl font-bold text-slate-900 mb-4 tracking-tight">কনফিগারেশন প্রয়োজন</h1>
              <p className="text-slate-500 mb-6 leading-relaxed">
                অ্যাপটি ক্লাউডে ডেটা সেভ করার জন্য ফায়ারবেস (Firebase) ব্যবহার করে। আপনি এখনো এপিআই কি (API Key) সেট করেননি।
              </p>
              
              <div className="space-y-4 mb-8">
                <div className="flex items-start gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="w-6 h-6 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">১</div>
                  <p className="text-sm text-slate-600">ফায়ারবেস কনসোল থেকে আপনার প্রজেক্টের এপিআই কি সংগ্রহ করুন।</p>
                </div>
                <div className="flex items-start gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="w-6 h-6 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">২</div>
                  <p className="text-sm text-slate-600">প্ল্যাটফর্মের এনভায়রনমেন্ট ভেরিয়েবল সেকশনে গিয়ে মানগুলো বসান।</p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-4">
                <button
                  onClick={() => setIsDemoMode(true)}
                  className="flex-1 bg-slate-900 text-white font-bold py-4 rounded-2xl hover:bg-slate-800 transition-all flex items-center justify-center gap-2"
                >
                  ডেমো মোড ট্রাই করুন
                  <ChevronRight className="w-4 h-4" />
                </button>
                <a 
                  href="https://console.firebase.google.com/" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex-1 bg-white border-2 border-slate-200 text-slate-700 font-bold py-4 rounded-2xl hover:bg-slate-50 transition-all flex items-center justify-center gap-2"
                >
                  ফায়ারবেস কনসোল
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            </div>
            
            <div className="hidden md:block w-px bg-slate-100"></div>
            
            <div className="md:w-48 flex flex-col justify-center">
              <p className="text-[10px] uppercase font-bold text-slate-400 mb-4 tracking-widest">প্রয়োজনীয় ভেরিয়েবল:</p>
              <ul className="space-y-2">
                {['API_KEY', 'AUTH_DOMAIN', 'PROJECT_ID', 'STORAGE_BUCKET', 'APP_ID'].map(v => (
                  <li key={v} className="text-[10px] font-mono bg-slate-100 p-2 rounded-lg text-slate-500">VITE_FIREBASE_{v}</li>
                ))}
              </ul>
            </div>
          </div>
        </motion.div>
        
        <style>{`
          @keyframes spin-slow {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
          .animate-spin-slow {
            animation: spin-slow 8s linear infinite;
          }
        `}</style>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#f5f5f4] p-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-white p-10 rounded-[32px] shadow-xl border border-black/5 text-center"
        >
          <div className="w-20 h-20 bg-indigo-600 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-lg shadow-indigo-200">
            <Shield className="text-white w-10 h-10" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-4 tracking-tight">সুরক্ষিত নথি ভল্ট</h1>
          <p className="text-slate-500 mb-10 leading-relaxed">আপনার গুরুত্বপূর্ণ নথিপত্র নিরাপদে সংরক্ষণ করুন। প্রতিটি ফাইলের জন্য আলাদা পাসওয়ার্ড এবং জিমেইল লগইন সুবিধা।</p>
          
          <button
            onClick={handleGoogleLogin}
            className="w-full flex items-center justify-center gap-4 bg-white border-2 border-slate-200 hover:border-indigo-500 hover:bg-slate-50 text-slate-700 font-bold py-4 rounded-2xl transition-all duration-300 group mb-4"
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-6 h-6" />
            জিমেইল দিয়ে লগইন করুন
          </button>

          {authError && (
            <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl mb-6 text-left">
              <div className="flex items-start gap-2 text-rose-600 mb-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <p className="text-xs font-bold">লগইন এরর</p>
              </div>
              <p className="text-[11px] text-rose-500 leading-relaxed">{authError}</p>
              <button 
                onClick={() => setIsDemoMode(true)}
                className="mt-3 text-[10px] text-indigo-600 font-bold hover:underline"
              >
                এরর এড়িয়ে ডেমো মোড ব্যবহার করুন →
              </button>
            </div>
          )}
          
          <button 
            onClick={() => setIsDemoMode(true)}
            className="mt-6 text-sm text-indigo-600 font-bold hover:underline"
          >
            লগইন ছাড়াই ডেমো দেখুন
          </button>
          
          <p className="mt-8 text-[11px] text-slate-400 uppercase tracking-widest font-semibold">
            Powered by SecureVault Technology
          </p>
        </motion.div>
      </div>
    );
  }

  const currentFolder = folders.find(f => f.id === activeFolderId);
  const filteredFiles = files.filter(f => 
    f.folderId === activeFolderId && 
    f.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-[#f8fafc]">
      {/* Sidebar */}
      <aside className="w-full md:w-80 bg-slate-900 text-white p-6 flex flex-col border-r border-slate-800">
          <div className="flex items-center justify-between mb-10">
            <div className="flex items-center gap-3">
              <div className="bg-indigo-600 p-2 rounded-xl">
                <Shield className="w-5 h-5" />
              </div>
              <h1 className="text-lg font-bold tracking-tight">নথি ভল্ট</h1>
            </div>
            <div className="flex items-center gap-2">
              {isDemoMode && (
                <span className="px-2 py-1 bg-amber-500/20 text-amber-500 text-[10px] font-bold rounded uppercase tracking-wider">Demo</span>
              )}
              <button 
                onClick={() => {
                  if (isDemoMode) {
                    setIsDemoMode(false);
                  } else {
                    logout();
                  }
                  setUnlockedFolderIds([]);
                  setActiveFolderId(null);
                  setFolders([]);
                  setFiles([]);
                }} 
                className="p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-400 hover:text-white"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>

        <div className="flex-1 overflow-y-auto space-y-6 custom-scrollbar">
          <div>
            <div className="flex items-center justify-between mb-4">
              <p className="text-[11px] uppercase text-slate-500 font-bold tracking-wider">আপনার ফোল্ডার</p>
              <button 
                onClick={() => setShowAddFolder(true)}
                className="p-1 hover:bg-slate-800 rounded-md text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            
            <div className="space-y-1">
              {folders.length === 0 && (
                <p className="text-xs text-slate-500 italic px-2">কোনো ফোল্ডার নেই</p>
              )}
              {folders.map((folder) => {
                const isLocked = folder.isLocked && !unlockedFolderIds.includes(folder.id);
                return (
                  <div key={folder.id} className="group relative flex items-center gap-1">
                    {editingFolderId === folder.id ? (
                      <div className="flex-1 flex items-center gap-2 p-2 bg-slate-800/50 rounded-xl border border-indigo-500/50">
                        <input 
                          autoFocus
                          className="flex-1 bg-transparent text-white text-sm px-1 outline-none"
                          value={editingFolderName}
                          onChange={(e) => setEditingFolderName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') renameFolder(folder.id, editingFolderName);
                            if (e.key === 'Escape') setEditingFolderId(null);
                          }}
                        />
                        <button onClick={() => renameFolder(folder.id, editingFolderName)} className="text-emerald-500 p-1 hover:bg-emerald-500/10 rounded"><Check className="w-4 h-4" /></button>
                        <button onClick={() => setEditingFolderId(null)} className="text-rose-500 p-1 hover:bg-rose-500/10 rounded"><X className="w-4 h-4" /></button>
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => {
                            if (isLocked) {
                              setShowUnlock(folder);
                            } else {
                              setActiveFolderId(folder.id);
                            }
                          }}
                          className={cn(
                            "flex-1 flex items-center gap-3 p-3 rounded-xl transition-all duration-200",
                            activeFolderId === folder.id 
                              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20' 
                              : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
                          )}
                        >
                          <div className="relative">
                            <FolderIcon className={cn("w-5 h-5", activeFolderId === folder.id ? "text-white" : "text-indigo-500")} />
                            {folder.password && (
                              <div className="absolute -top-1 -right-1 bg-white rounded-full p-0.5 shadow-sm">
                                {isLocked ? <Lock className="w-2 h-2 text-amber-600" /> : <Unlock className="w-2 h-2 text-emerald-600" />}
                              </div>
                            )}
                          </div>
                          <span className="text-sm font-medium truncate">{folder.name}</span>
                        </button>
                        
                        <div className="relative">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveFolderMenuId(activeFolderMenuId === folder.id ? null : folder.id);
                            }}
                            className={cn(
                              "p-2 transition-all rounded-lg",
                              activeFolderMenuId === folder.id 
                                ? "text-white bg-slate-800" 
                                : "md:opacity-0 md:group-hover:opacity-100 text-slate-500 hover:text-white hover:bg-slate-800"
                            )}
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>
                          
                          {activeFolderMenuId === folder.id && (
                            <>
                              <div className="fixed inset-0 z-40" onClick={() => setActiveFolderMenuId(null)} />
                              <div className="absolute right-0 top-full mt-1 w-44 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl z-50 py-1 overflow-hidden">
                                <button 
                                  onClick={() => {
                                    setEditingFolderId(folder.id);
                                    setEditingFolderName(folder.name);
                                    setActiveFolderMenuId(null);
                                  }}
                                  className="w-full flex items-center gap-2 px-4 py-2.5 text-xs text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
                                >
                                  <Pencil className="w-3.5 h-3.5" /> নাম পরিবর্তন
                                </button>
                                
                                {folder.password ? (
                                  <button 
                                    onClick={() => {
                                      removeFolderLock(folder);
                                      setActiveFolderMenuId(null);
                                    }}
                                    className="w-full flex items-center gap-2 px-4 py-2.5 text-xs text-amber-400 hover:bg-slate-700 transition-colors"
                                  >
                                    <Unlock className="w-3.5 h-3.5" /> লক মুছুন
                                  </button>
                                ) : (
                                  <button 
                                    onClick={() => {
                                      setShowLockFolder(folder);
                                      setActiveFolderMenuId(null);
                                    }}
                                    className="w-full flex items-center gap-2 px-4 py-2.5 text-xs text-indigo-400 hover:bg-slate-700 transition-colors"
                                  >
                                    <Lock className="w-3.5 h-3.5" /> লক করুন
                                  </button>
                                )}
                                
                                <div className="h-px bg-slate-700/50 my-1" />
                                
                                <button 
                                  onClick={() => {
                                    deleteFolder(folder.id);
                                    setActiveFolderMenuId(null);
                                  }}
                                  disabled={isDeleting === folder.id}
                                  className="w-full flex items-center gap-2 px-4 py-2.5 text-xs text-rose-400 hover:bg-rose-500/10 transition-colors disabled:opacity-50"
                                >
                                  {isDeleting === folder.id ? (
                                    <div className="w-3 h-3 border-2 border-rose-400 border-t-transparent rounded-full animate-spin" />
                                  ) : (
                                    <Trash2 className="w-3.5 h-3.5" />
                                  )}
                                  মুছুন
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="mt-auto pt-6 border-t border-slate-800">
          {isDemoMode && (
            <div className="mb-4 space-y-2">
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-2">
                <Info className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-[10px] text-amber-200/70 leading-tight">
                  আপনি ডেমো মোডে আছেন। ডেটা শুধুমাত্র আপনার ব্রাউজারে সেভ হবে। ক্লাউড সিঙ্ক করতে ফায়ারবেস সেটআপ করুন।
                </p>
              </div>
              <button 
                onClick={resetDemoData}
                className="w-full py-2 px-3 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 text-[10px] font-bold rounded-xl transition-all flex items-center justify-center gap-2"
              >
                <Trash2 className="w-3 h-3" />
                ডেমো ডেটা রিসেট করুন
              </button>
            </div>
          )}
          <div className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-2xl">
            <img src={user.photoURL || ''} alt="" className="w-10 h-10 rounded-full border-2 border-indigo-500/30" />
            <div className="flex-1 overflow-hidden">
              <p className="text-sm font-bold truncate">{user.displayName}</p>
              <p className="text-[10px] text-slate-500 truncate">{user.email}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Header */}
        <header className="bg-white border-b border-slate-200 p-4 md:px-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="ফাইল খুঁজুন..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-100 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 transition-all"
            />
          </div>
          
          {activeFolderId && (
            <button
              onClick={() => setShowUpload(true)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-xl flex items-center justify-center gap-2 text-sm font-bold transition-all shadow-lg shadow-indigo-100"
            >
              <FilePlus className="w-4 h-4" />
              নতুন ফাইল
            </button>
          )}
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 md:p-10 custom-scrollbar">
          {!activeFolderId ? (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <div className="w-24 h-24 bg-slate-100 rounded-full flex items-center justify-center mb-6">
                <FolderIcon className="w-12 h-12 text-slate-300" />
              </div>
              <h2 className="text-2xl font-bold text-slate-800 mb-2 tracking-tight">শুরু করতে একটি ফোল্ডার বেছে নিন</h2>
              <p className="text-slate-500 max-w-sm">বামে থাকা প্যানেল থেকে একটি ফোল্ডার সিলেক্ট করুন অথবা নতুন ফোল্ডার তৈরি করুন।</p>
            </div>
          ) : (
            <div className="animate-in fade-in duration-500">
              <div className="flex items-center gap-3 mb-8">
                <h2 className="text-2xl font-bold text-slate-900 tracking-tight">{currentFolder?.name}</h2>
                <span className="px-3 py-1 bg-slate-200 text-slate-600 rounded-full text-[10px] font-bold uppercase tracking-wider">
                  {filteredFiles.length} টি ফাইল
                </span>
              </div>

              {filteredFiles.length === 0 ? (
                <div className="bg-white border-2 border-dashed border-slate-200 rounded-[32px] p-20 text-center">
                  <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <FileIcon className="w-8 h-8 text-slate-300" />
                  </div>
                  <p className="text-slate-400 font-medium">এই ফোল্ডারে কোনো ফাইল নেই</p>
                  <button 
                    onClick={() => setShowUpload(true)}
                    className="mt-4 text-indigo-600 font-bold text-sm hover:underline"
                  >
                    প্রথম ফাইলটি আপলোড করুন
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {filteredFiles.map((file) => (
                    <motion.div 
                      layout
                      key={file.id} 
                      className="group bg-white p-5 rounded-3xl shadow-sm border border-slate-200 hover:shadow-xl hover:border-indigo-100 transition-all relative overflow-hidden"
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div 
                          className={cn(
                            "w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center transition-all",
                            file.type.includes('image') && "cursor-pointer hover:bg-indigo-50 hover:scale-105"
                          )}
                          onClick={() => file.type.includes('image') && handlePreview(file)}
                        >
                          {file.type.includes('image') ? (
                            <ImageIcon className="w-6 h-6 text-indigo-500" />
                          ) : (
                            <FileIcon className="w-6 h-6 text-slate-400" />
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <button 
                            onClick={() => {
                              setEditingFileId(file.id);
                              setEditingFileName(file.name);
                            }}
                            className="p-1.5 text-slate-300 hover:text-indigo-500 hover:bg-indigo-50 transition-all rounded-lg"
                            title="নাম পরিবর্তন করুন"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => deleteFile(file.id)}
                            disabled={isDeleting === file.id}
                            className={cn(
                              "p-1.5 transition-all rounded-lg",
                              isDeleting === file.id
                                ? "opacity-50 cursor-not-allowed"
                                : "text-slate-300 hover:text-rose-500 hover:bg-rose-50"
                            )}
                          >
                            {isDeleting === file.id ? (
                              <div className="w-4 h-4 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </div>
                      
                      <div className="mb-4">
                        {editingFileId === file.id ? (
                          <div className="flex items-center gap-2">
                            <input 
                              type="text"
                              value={editingFileName}
                              onChange={(e) => setEditingFileName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') renameFile(file.id, editingFileName);
                                if (e.key === 'Escape') setEditingFileId(null);
                              }}
                              className="flex-1 text-sm p-1 border-b-2 border-indigo-500 outline-none bg-indigo-50/50 rounded"
                              autoFocus
                            />
                            <button 
                              onClick={() => renameFile(file.id, editingFileName)}
                              className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => setEditingFileId(null)}
                              className="p-1 text-rose-600 hover:bg-rose-50 rounded"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <h3 
                            className={cn(
                              "font-bold text-slate-800 truncate text-sm transition-colors",
                              file.type.includes('image') && "cursor-pointer hover:text-indigo-600"
                            )} 
                            title={file.name}
                            onClick={() => file.type.includes('image') && handlePreview(file)}
                          >
                            {file.name}
                          </h3>
                        )}
                        <p className="text-[10px] text-slate-400 mt-1 uppercase font-bold tracking-wider">{file.size} • {file.uploadDate}</p>
                      </div>

                      <div className="flex items-center gap-2">
                        {file.type.includes('image') && (
                          <button 
                            onClick={() => handlePreview(file)}
                            className="flex-1 bg-indigo-50 text-indigo-600 py-2.5 rounded-xl text-xs font-bold hover:bg-indigo-100 transition-all flex items-center justify-center gap-2"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            প্রিভিউ
                          </button>
                        )}
                        <button 
                          onClick={() => downloadFile(file)}
                          className="flex-1 bg-slate-900 text-white py-2.5 rounded-xl text-xs font-bold hover:bg-indigo-600 transition-all flex items-center justify-center gap-2"
                        >
                          <Download className="w-3.5 h-3.5" />
                          ডাউনলোড
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Modals */}
      <AnimatePresence>
        {/* Add Folder Modal */}
        {showAddFolder && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-sm p-8 rounded-[32px] shadow-2xl"
            >
              <h3 className="text-xl font-bold text-slate-900 mb-6">নতুন ফোল্ডার তৈরি করুন</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-400 mb-2 tracking-widest">ফোল্ডারের নাম</label>
                  <input 
                    type="text" 
                    placeholder="যেমন: ব্যক্তিগত নথি" 
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-500 outline-none transition-all"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-400 mb-2 tracking-widest">পাসওয়ার্ড (ঐচ্ছিক)</label>
                  <div className="relative">
                    <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input 
                      type="password" 
                      placeholder="পাসওয়ার্ড দিন..." 
                      value={folderPassword}
                      onChange={(e) => setFolderPassword(e.target.value)}
                      className="w-full pl-12 pr-4 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-500 outline-none transition-all"
                    />
                  </div>
                </div>
              </div>
              <div className="flex gap-3 mt-8">
                <button 
                  onClick={() => setShowAddFolder(false)}
                  className="flex-1 py-3 text-slate-500 font-bold text-sm hover:bg-slate-50 rounded-2xl transition-all"
                >
                  বাতিল
                </button>
                <button 
                  onClick={handleAddFolder}
                  className="flex-1 py-3 bg-indigo-600 text-white font-bold text-sm rounded-2xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
                >
                  তৈরি করুন
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Lock Folder Modal */}
        {showLockFolder && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-sm p-8 rounded-[32px] shadow-2xl"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-indigo-50 rounded-2xl">
                  <Lock className="w-6 h-6 text-indigo-600" />
                </div>
                <h3 className="text-xl font-bold text-slate-900">ফোল্ডার লক করুন</h3>
              </div>
              
              <p className="text-sm text-slate-500 mb-6 font-medium">"{showLockFolder.name}" ফোল্ডারটির জন্য একটি পাসওয়ার্ড দিন।</p>
              
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase text-slate-400 font-bold tracking-wider ml-1">পাসওয়ার্ড</label>
                  <input 
                    type="password" 
                    placeholder="পাসওয়ার্ড দিন" 
                    value={folderPassword}
                    onChange={(e) => setFolderPassword(e.target.value)}
                    className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-500 outline-none transition-all text-center tracking-widest"
                    autoFocus
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button 
                    onClick={() => { setShowLockFolder(null); setFolderPassword(''); }}
                    className="flex-1 py-3 text-slate-500 font-bold text-sm hover:bg-slate-50 rounded-2xl transition-all"
                  >
                    বাতিল
                  </button>
                  <button 
                    onClick={handleSetFolderLock}
                    disabled={!folderPassword}
                    className="flex-1 py-3 bg-indigo-600 text-white font-bold text-sm rounded-2xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 disabled:opacity-50"
                  >
                    লক করুন
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {/* Upload Modal */}
        {showUpload && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-md p-8 rounded-[32px] shadow-2xl"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-indigo-50 rounded-2xl">
                  <FilePlus className="w-6 h-6 text-indigo-600" />
                </div>
                <h3 className="text-xl font-bold text-slate-900">ফাইল আপলোড করুন</h3>
              </div>
              
              <div className="space-y-6">
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-200 rounded-3xl p-10 text-center hover:bg-slate-50 cursor-pointer transition-all group"
                >
                  <input type="file" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
                  <div className="w-12 h-12 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                    <Plus className="w-6 h-6 text-indigo-600" />
                  </div>
                  <p className="text-sm font-bold text-slate-700">ফাইল সিলেক্ট করুন</p>
                  <p className="text-xs text-slate-400 mt-1">অথবা এখানে ড্র্যাগ করুন</p>
                </div>

                <button 
                  onClick={() => setShowUpload(false)}
                  className="w-full py-3 text-slate-400 font-bold text-sm hover:text-slate-600 transition-all"
                >
                  বন্ধ করুন
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Unlock Modal */}
        {showUnlock && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-sm p-8 rounded-[32px] shadow-2xl text-center"
            >
              <div className="w-16 h-16 bg-amber-50 rounded-3xl flex items-center justify-center mx-auto mb-6">
                <Lock className="w-8 h-8 text-amber-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">ফোল্ডারটি আনলক করুন</h3>
              <p className="text-sm text-slate-500 mb-8">"{showUnlock.name}" ফোল্ডারটি দেখার জন্য পাসওয়ার্ড দিন।</p>
              
              <input 
                type="password" 
                placeholder="পাসওয়ার্ড" 
                value={unlockPassword}
                onChange={(e) => setUnlockPassword(e.target.value)}
                className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl mb-4 text-center tracking-widest focus:border-indigo-500 outline-none transition-all"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
              />
              
              {error && <p className="text-rose-500 text-xs mb-4 flex items-center justify-center gap-1"><AlertCircle className="w-3 h-3" /> {error}</p>}
              
              <button 
                onClick={handleUnlock}
                className="w-full py-4 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 mb-4"
              >
                আনলক করুন
              </button>
              
              <button 
                onClick={() => { 
                  setShowUnlock(null); 
                  setShowForgot(showUnlock); 
                  setRecoveryStep('send');
                  setError('');
                  setUserInputCode('');
                  setGeneratedCode('');
                  setNewPassword('');
                }}
                className="text-xs text-indigo-600 font-bold hover:underline"
              >
                পাসওয়ার্ড ভুলে গেছেন?
              </button>
              
              <button 
                onClick={() => setShowUnlock(null)}
                className="block w-full mt-6 text-slate-400 text-sm font-medium"
              >
                বাতিল
              </button>
            </motion.div>
          </div>
        )}

        {/* Forgot Password Modal */}
        {showForgot && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-sm p-8 rounded-[32px] shadow-2xl text-center"
            >
              {recoveryStep === 'send' && (
                <>
                  <div className="w-16 h-16 bg-indigo-50 rounded-3xl flex items-center justify-center mx-auto mb-6">
                    <Mail className="w-8 h-8 text-indigo-600" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">পাসওয়ার্ড রিকভারি</h3>
                  <p className="text-sm text-slate-500 mb-8">আপনার জিমেইল ভেরিফিকেশনের মাধ্যমে পাসওয়ার্ড রিসেট করুন।</p>
                  
                  <div className="p-4 bg-slate-50 rounded-2xl mb-8 text-left">
                    <p className="text-[10px] text-slate-400 uppercase font-bold mb-1">আপনার ইমেইল</p>
                    <p className="text-sm font-bold text-slate-700">{user.email}</p>
                  </div>
                  
                  <button 
                    onClick={handleRecovery}
                    disabled={isSendingCode}
                    className="w-full py-4 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 mb-4 flex items-center justify-center gap-2"
                  >
                    {isSendingCode ? (
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      'ভেরিফিকেশন কোড পাঠান'
                    )}
                  </button>
                </>
              )}

              {recoveryStep === 'verify' && (
                <>
                  <div className="w-16 h-16 bg-amber-50 rounded-3xl flex items-center justify-center mx-auto mb-6">
                    <Key className="w-8 h-8 text-amber-600" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">কোড যাচাই করুন</h3>
                  <p className="text-sm text-slate-500 mb-8">আপনার ইমেইলে পাঠানো ৬ ডিজিটের কোডটি দিন।</p>
                  
                  <input 
                    type="text" 
                    maxLength={6}
                    placeholder="০০০০০০" 
                    value={userInputCode}
                    onChange={(e) => setUserInputCode(e.target.value)}
                    className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl mb-4 text-center tracking-[0.5em] font-bold text-xl focus:border-indigo-500 outline-none transition-all"
                    autoFocus
                  />
                  
                  {error && <p className="text-rose-500 text-xs mb-4 flex items-center justify-center gap-1"><AlertCircle className="w-3 h-3" /> {error}</p>}
                  
                  <button 
                    onClick={handleVerifyCode}
                    className="w-full py-4 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 mb-4"
                  >
                    যাচাই করুন
                  </button>
                </>
              )}

              {recoveryStep === 'reset' && (
                <>
                  <div className="w-16 h-16 bg-emerald-50 rounded-3xl flex items-center justify-center mx-auto mb-6">
                    <Lock className="w-8 h-8 text-emerald-600" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">নতুন পাসওয়ার্ড</h3>
                  <p className="text-sm text-slate-500 mb-8">ফোল্ডারটির জন্য একটি নতুন পাসওয়ার্ড সেট করুন।</p>
                  
                  <input 
                    type="password" 
                    placeholder="নতুন পাসওয়ার্ড" 
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl mb-6 text-center tracking-widest focus:border-indigo-500 outline-none transition-all"
                    autoFocus
                  />
                  
                  <button 
                    onClick={handleResetPassword}
                    disabled={!newPassword}
                    className="w-full py-4 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 mb-4"
                  >
                    পাসওয়ার্ড সেট করুন
                  </button>
                </>
              )}
              
              <button 
                onClick={() => {
                  setShowForgot(null);
                  setRecoveryStep('send');
                  setError('');
                }}
                className="block w-full text-slate-400 text-sm font-medium"
              >
                বাতিল
              </button>
            </motion.div>
          </div>
        )}
        {/* Preview Modal */}
        {showPreview && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative max-w-5xl w-full max-h-[90vh] flex flex-col items-center"
            >
              <button 
                onClick={() => setShowPreview(null)}
                className="absolute -top-12 right-0 p-2 text-white/60 hover:text-white transition-all bg-white/10 hover:bg-white/20 rounded-full"
              >
                <X className="w-6 h-6" />
              </button>
              
              <div className="bg-white p-2 rounded-3xl shadow-2xl overflow-hidden flex items-center justify-center">
                <img 
                  src={showPreview.dataUrl} 
                  alt={showPreview.name} 
                  className="max-w-full max-h-[70vh] object-contain rounded-2xl"
                  referrerPolicy="no-referrer"
                />
              </div>
              
              <div className="mt-6 text-center">
                <h3 className="text-xl font-bold text-white mb-1">{showPreview.name}</h3>
                <p className="text-white/40 text-xs uppercase tracking-widest font-bold">{showPreview.size} • {showPreview.uploadDate}</p>
                
                <div className="flex items-center justify-center gap-4 mt-6">
                  <button 
                    onClick={() => downloadFile(showPreview)}
                    className="px-8 py-3 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-700 transition-all flex items-center gap-2 shadow-xl shadow-indigo-900/40"
                  >
                    <Download className="w-4 h-4" />
                    ডাউনলোড করুন
                  </button>
                  <button 
                    onClick={() => setShowPreview(null)}
                    className="px-8 py-3 bg-white/10 text-white font-bold rounded-2xl hover:bg-white/20 transition-all"
                  >
                    বন্ধ করুন
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Persistent Footer/Status */}
      <footer className="fixed bottom-0 right-0 p-4 pointer-events-none z-[100]">
        {(isUploading || isPreviewLoading) && (
          <div className="bg-slate-900 text-white px-4 py-2 rounded-full text-xs shadow-2xl flex items-center gap-2 animate-bounce">
            <span className="w-2 h-2 bg-indigo-500 rounded-full animate-ping"></span>
            {isPreviewLoading ? 'প্রিভিউ লোড হচ্ছে...' : 'প্রসেসিং হচ্ছে...'}
          </div>
        )}
      </footer>

      {/* Global Styles */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(0,0,0,0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(0,0,0,0.2);
        }
      `}</style>
    </div>
  );
};

export default App;
