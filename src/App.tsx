
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
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getFirebaseAuth, loginWithGoogle, logout, getFirebaseDb, getFirebaseStorage, isFirebaseConfigured } from './lib/firebase';
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
  serverTimestamp 
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
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
  const [showPreview, setShowPreview] = useState<FileData | null>(null);
  
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

    // Increased limit to 50MB as requested
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
          userId: user.uid,
          uploadDate: new Date().toLocaleDateString('bn-BD'),
          dataUrl: base64Data
        };
        setFiles([...files, newFile]);
        setShowUpload(false);
        setIsUploading(false);
      };
      reader.readAsDataURL(file);
      return;
    }

    try {
      const storage = getFirebaseStorage();
      const db = getFirebaseDb();
      
      // 1. Upload to Firebase Storage
      const storageRef = ref(storage, `files/${user.uid}/${Date.now()}_${file.name}`);
      const snapshot = await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(snapshot.ref);

      // 2. Save metadata to Firestore
      await addDoc(collection(db, 'files'), {
        name: file.name,
        type: file.type,
        size: (file.size / (1024 * 1024)).toFixed(2) + ' MB',
        folderId: activeFolderId,
        userId: user.uid,
        uploadDate: new Date().toLocaleDateString('bn-BD'),
        dataUrl: downloadURL, // We use dataUrl field to store the download URL for compatibility
        storagePath: storageRef.fullPath,
        createdAt: serverTimestamp()
      });
      
      setShowUpload(false);
    } catch (err: any) {
      console.error(err);
      if (err.code === 'permission-denied') {
        alert('ফায়ারবেস পারমিশন এরর! অনুগ্রহ করে ফায়ারবেস কনসোলে Storage এবং Firestore Rules চেক করুন।');
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
    if (!showForgot || !user) return;
    alert(`একটি ভেরিফিকেশন কোড আপনার ইমেইল (${user.email}) এ পাঠানো হয়েছে। (সিমুলেশন)`);
    const newPass = prompt('নতুন পাসওয়ার্ড দিন:');
    if (newPass) {
      if (isDemoMode) {
        setFolders(folders.map(f => f.id === showForgot.id ? { ...f, password: newPass, isLocked: true } : f));
        setShowForgot(null);
        alert('পাসওয়ার্ড সফলভাবে পরিবর্তন করা হয়েছে।');
        return;
      }
      const db = getFirebaseDb();
      await updateDoc(doc(db, 'folders', showForgot.id), {
        password: newPass,
        isLocked: true
      });
      setShowForgot(null);
      alert('পাসওয়ার্ড সফলভাবে পরিবর্তন করা হয়েছে।');
    }
  };

  const deleteFile = async (id: string) => {
    if (confirm('আপনি কি এই নথিটি মুছে ফেলতে চান?')) {
      setIsDeleting(id);
      try {
        if (isDemoMode) {
          setFiles(files.filter(f => f.id !== id));
          return;
        }
        const db = getFirebaseDb();
        await deleteDoc(doc(db, 'files', id));
      } catch (err) {
        console.error(err);
        alert('ফাইলটি মুছতে সমস্যা হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।');
      } finally {
        setIsDeleting(null);
      }
    }
  };

  const deleteFolder = async (id: string) => {
    if (confirm('এই ফোল্ডারটি মুছলে এর ভেতরের সব ফাইলও মুছে যাবে। আপনি কি নিশ্চিত?')) {
      setIsDeleting(id);
      try {
        setUnlockedFolderIds(unlockedFolderIds.filter(fid => fid !== id));
        if (isDemoMode) {
          setFiles(files.filter(f => f.folderId !== id));
          setFolders(folders.filter(f => f.id !== id));
          if (activeFolderId === id) setActiveFolderId(null);
          return;
        }
        const db = getFirebaseDb();
        const folderFiles = files.filter(f => f.folderId === id);
        
        // Delete all files in the folder first
        const deletePromises = folderFiles.map(file => deleteDoc(doc(db, 'files', file.id)));
        await Promise.all(deletePromises);
        
        // Then delete the folder
        await deleteDoc(doc(db, 'folders', id));
        
        if (activeFolderId === id) setActiveFolderId(null);
      } catch (err) {
        console.error(err);
        alert('ফোল্ডারটি মুছতে সমস্যা হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।');
      } finally {
        setIsDeleting(null);
      }
    }
  };

  const downloadFile = (file: FileData) => {
    const link = document.createElement('a');
    link.href = file.dataUrl;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
                  <div key={folder.id} className="group flex items-center gap-1">
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
                    <button 
                      onClick={() => deleteFolder(folder.id)}
                      disabled={isDeleting === folder.id}
                      className={cn(
                        "p-2 transition-all rounded-lg",
                        isDeleting === folder.id 
                          ? "opacity-50 cursor-not-allowed" 
                          : "md:opacity-0 md:group-hover:opacity-100 text-slate-500 hover:text-rose-400 hover:bg-rose-400/10"
                      )}
                    >
                      {isDeleting === folder.id ? (
                        <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
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
                          onClick={() => file.type.includes('image') && setShowPreview(file)}
                        >
                          {file.type.includes('image') ? (
                            <ImageIcon className="w-6 h-6 text-indigo-500" />
                          ) : (
                            <FileIcon className="w-6 h-6 text-slate-400" />
                          )}
                        </div>
                        <div className="flex items-center gap-1">
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
                        <h3 
                          className={cn(
                            "font-bold text-slate-800 truncate text-sm transition-colors",
                            file.type.includes('image') && "cursor-pointer hover:text-indigo-600"
                          )} 
                          title={file.name}
                          onClick={() => file.type.includes('image') && setShowPreview(file)}
                        >
                          {file.name}
                        </h3>
                        <p className="text-[10px] text-slate-400 mt-1 uppercase font-bold tracking-wider">{file.size} • {file.uploadDate}</p>
                      </div>

                      <div className="flex items-center gap-2">
                        {file.type.includes('image') && (
                          <button 
                            onClick={() => setShowPreview(file)}
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
                onClick={() => { setShowUnlock(null); setShowForgot(showUnlock); }}
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
                className="w-full py-4 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 mb-4"
              >
                ভেরিফিকেশন কোড পাঠান
              </button>
              
              <button 
                onClick={() => setShowForgot(null)}
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
