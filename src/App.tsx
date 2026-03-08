
import React, { useState, useEffect, useRef } from 'react';
import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer, 
  Tooltip as RechartsTooltip, 
  Legend 
} from 'recharts';
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
  ChevronLeft,
  Plus,
  Eye,
  EyeOff,
  X,
  Pencil,
  Check,
  FileText,
  Share2,
  Loader2,
  Camera,
  User as UserIcon,
  ExternalLink,
  ShieldCheck,
  ArrowRightLeft,
  Languages,
  Menu,
  Trash,
  RotateCcw,
  LayoutGrid,
  Fingerprint
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  getFirebaseAuth, 
  loginWithGoogle, 
  logout, 
  getFirebaseDb, 
  isFirebaseConfigured,
  getSecondaryAuthAndDb,
  closeSecondaryApp
} from './lib/firebase';
import { onAuthStateChanged, updateProfile } from 'firebase/auth';
import { FirebaseApp } from 'firebase/app';
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  onSnapshot, 
  deleteDoc, 
  doc, 
  updateDoc,
  setDoc,
  serverTimestamp,
  getDocs,
  orderBy,
  writeBatch,
  Firestore,
  getDoc
} from 'firebase/firestore';
import { User, Folder, FileData } from './types';
import { translations } from './translations';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Settings, Info } from 'lucide-react';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const App: React.FC = () => {
  const [authUser, setAuthUser] = React.useState<User | null>(null);
  const [customProfile, setCustomProfile] = React.useState<{displayName?: string, photoURL?: string} | null>(null);
  
  const user = React.useMemo(() => {
    if (!authUser) return null;
    return {
      ...authUser,
      displayName: customProfile?.displayName || authUser.displayName,
      photoURL: customProfile?.photoURL || authUser.photoURL
    };
  }, [authUser, customProfile]);

  const [loading, setLoading] = useState(true);
  const [showRulesGuide, setShowRulesGuide] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [language, setLanguage] = useState<'bn' | 'en'>(() => {
    const saved = localStorage.getItem('app_language');
    return (saved as 'bn' | 'en') || 'bn';
  });

  useEffect(() => {
    localStorage.setItem('app_language', language);
  }, [language]);

  const t = (key: keyof typeof translations['bn'], params?: Record<string, string>) => {
    let text = (translations[language][key] || translations['en'][key] || key) as string;
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        text = text.replace(`{${k}}`, v);
      });
    }
    return text;
  };

  const toggleLanguage = () => {
    setLanguage(prev => prev === 'bn' ? 'en' : 'bn');
  };

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
  const [showDeleteFolder, setShowDeleteFolder] = useState<Folder | null>(null);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState(false);
  const [showForgot, setShowForgot] = useState<Folder | null>(null);
  const [recoveryStep, setRecoveryStep] = useState<'send' | 'verify' | 'reset'>('send');
  const [generatedCode, setGeneratedCode] = useState('');
  const [userInputCode, setUserInputCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [configStatus, setConfigStatus] = useState<{ emailConfigured: boolean; user: string | null } | null>(null);

  useEffect(() => {
    if (showForgot) {
      fetch('/api/config-status')
        .then(res => res.json())
        .then(data => setConfigStatus(data))
        .catch(err => console.error('Error fetching config status:', err));
    }
  }, [showForgot]);
  const [showPreview, setShowPreview] = useState<FileData | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [showRecycleBin, setShowRecycleBin] = useState(false);
  const [showStorageAnalysis, setShowStorageAnalysis] = useState(false);
  const [biometricEnabledFolders, setBiometricEnabledFolders] = useState<string[]>(() => {
    const saved = localStorage.getItem('biometric_folders');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem('biometric_folders', JSON.stringify(biometricEnabledFolders));
  }, [biometricEnabledFolders]);

  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  const handleBiometricUnlock = async (folder: Folder) => {
    try {
      if (!isMobile) {
        alert("This feature is only available on mobile devices.");
        return;
      }

      if (!window.PublicKeyCredential) {
        alert(t('biometricNotSupported'));
        return;
      }

      const isAvailable = await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
      if (!isAvailable) {
        alert(t('biometricNotSupported'));
        return;
      }

      setIsPreviewLoading(true);
      
      // Real WebAuthn trigger to force system biometric prompt
      const challenge = new Uint8Array(32);
      window.crypto.getRandomValues(challenge);
      
      const userId = new Uint8Array(16);
      window.crypto.getRandomValues(userId);

      try {
        // Using 'create' as a way to trigger the biometric prompt for verification
        // in a serverless environment. This forces the OS to show the fingerprint/face prompt.
        await navigator.credentials.create({
          publicKey: {
            challenge,
            rp: { name: "Secure Doc Vault" },
            user: {
              id: userId,
              name: user?.email || "user",
              displayName: user?.displayName || "User"
            },
            pubKeyCredParams: [{ alg: -7, type: "public-key" }],
            authenticatorSelection: {
              authenticatorAttachment: "platform",
              userVerification: "required"
            },
            timeout: 60000
          }
        });

        setUnlockedFolderIds(prev => [...prev, folder.id]);
        setShowUnlock(null);
        setUnlockPassword('');
        setError('');
        setIsPreviewLoading(false);
      } catch (e) {
        console.error("Native biometric failed:", e);
        // If user cancels, don't show error, just stop loading
        setIsPreviewLoading(false);
      }
    } catch (err) {
      console.error("Biometric error:", err);
      setError(t('biometricError'));
      setIsPreviewLoading(false);
    }
  };

  const toggleBiometricForFolder = async (folderId: string) => {
    const isEnabling = !biometricEnabledFolders.includes(folderId);
    
    if (isEnabling) {
      try {
        if (!isMobile) {
          alert("This feature is only available on mobile devices.");
          return;
        }

        if (!window.PublicKeyCredential) {
          alert(t('biometricNotSupported'));
          return;
        }
        
        const isAvailable = await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
        if (!isAvailable) {
          alert(t('biometricNotSupported'));
          return;
        }

        setIsPreviewLoading(true);
        
        const challenge = new Uint8Array(32);
        window.crypto.getRandomValues(challenge);
        const userId = new Uint8Array(16);
        window.crypto.getRandomValues(userId);

        // Trigger native prompt for registration
        await navigator.credentials.create({
          publicKey: {
            challenge,
            rp: { name: "Secure Doc Vault" },
            user: {
              id: userId,
              name: user?.email || "user",
              displayName: user?.displayName || "User"
            },
            pubKeyCredParams: [{ alg: -7, type: "public-key" }],
            authenticatorSelection: {
              authenticatorAttachment: "platform",
              userVerification: "required"
            }
          }
        });

        setIsPreviewLoading(false);
        setBiometricEnabledFolders(prev => [...prev, folderId]);
      } catch (err) {
        console.error("Error enabling biometrics:", err);
        setIsPreviewLoading(false);
      }
    } else {
      setBiometricEnabledFolders(prev => prev.filter(id => id !== folderId));
    }
  };

  const deletedFiles = files.filter(f => f.isDeleted);
  const deletedFolders = folders.filter(f => f.isDeleted);

  const parseSizeToBytes = (sizeStr: string): number => {
    if (!sizeStr) return 0;
    const parts = sizeStr.split(' ');
    if (parts.length < 2) return 0;
    const value = parseFloat(parts[0]);
    const unit = parts[1].toUpperCase();
    if (isNaN(value)) return 0;
    switch (unit) {
      case 'GB': return value * 1024 * 1024 * 1024;
      case 'MB': return value * 1024 * 1024;
      case 'KB': return value * 1024;
      default: return value;
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const storageStats = React.useMemo(() => {
    const activeFiles = files.filter(f => !f.isDeleted);
    let photoSize = 0;
    let pdfSize = 0;
    let otherSize = 0;

    activeFiles.forEach(file => {
      const bytes = parseSizeToBytes(file.size);
      if (file.type.includes('image')) {
        photoSize += bytes;
      } else if (file.type.includes('pdf')) {
        pdfSize += bytes;
      } else {
        otherSize += bytes;
      }
    });

    const totalUsed = photoSize + pdfSize + otherSize;
    const totalLimit = 15 * 1024 * 1024 * 1024; // 15 GB Limit
    
    return {
      photoSize,
      pdfSize,
      otherSize,
      totalUsed,
      totalLimit,
      percentUsed: (totalUsed / totalLimit) * 100
    };
  }, [files]);

  const chartData = [
    { name: t('photos'), value: storageStats.photoSize, color: '#6366f1' },
    { name: t('pdfs'), value: storageStats.pdfSize, color: '#f43f5e' },
    { name: t('others'), value: storageStats.otherSize, color: '#94a3b8' },
    { name: t('free'), value: Math.max(0, storageStats.totalLimit - storageStats.totalUsed), color: '#f1f5f9' }
  ];

  useEffect(() => {
    if (showPreview && showPreview.type.includes('pdf')) {
      try {
        const base64Parts = showPreview.dataUrl.split(',');
        if (base64Parts.length < 2) return;
        
        const base64Data = base64Parts[1];
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        setPdfUrl(url);

        return () => {
          URL.revokeObjectURL(url);
          setPdfUrl(null);
        };
      } catch (err) {
        console.error("PDF Blob conversion error:", err);
      }
    } else {
      setPdfUrl(null);
    }
  }, [showPreview]);

  const [showLockFolder, setShowLockFolder] = useState<Folder | null>(null);
  const [editingFileId, setEditingFileId] = useState<string | null>(null);
  const [editingFileName, setEditingFileName] = useState('');
  const [movingFile, setMovingFile] = useState<FileData | null>(null);
  const [activeFolderMenuId, setActiveFolderMenuId] = useState<string | null>(null);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState('');
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [showProfileEdit, setShowProfileEdit] = useState(false);
  const [showRemoteLogin, setShowRemoteLogin] = useState(false);
  const [showRemoteSettings, setShowRemoteSettings] = useState(false);
  const [remoteEmail, setRemoteEmail] = useState('');
  const [remotePassword, setRemotePassword] = useState('');
  const [remoteAccessKeyInput, setRemoteAccessKeyInput] = useState('');
  const [showRemoteAccessKeyInput, setShowRemoteAccessKeyInput] = useState(false);
  const [remoteAccessKey, setRemoteAccessKey] = useState('');
  const [showRemoteAccessKey, setShowRemoteAccessKey] = useState(false);
  const [isRemoteLoggingIn, setIsRemoteLoggingIn] = useState(false);
  const [isSavingRemoteKey, setIsSavingRemoteKey] = useState(false);
  const [remoteAccess, setRemoteAccess] = useState<{
    isActive: boolean;
    user: User | null;
    db: Firestore | null;
    app: FirebaseApp | null;
  }>({
    isActive: false,
    user: null,
    db: null,
    app: null
  });
  const [newDisplayName, setNewDisplayName] = useState('');
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  
  // Form States
  const [newFolderName, setNewFolderName] = useState('');
  const [folderPassword, setFolderPassword] = useState('');
  const [unlockPassword, setUnlockPassword] = useState('');
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [error, setError] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const profilePhotoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    localStorage.setItem('is_demo_mode', isDemoMode.toString());
    if (activeFolderId) {
      localStorage.setItem('active_folder_id', activeFolderId);
    } else {
      localStorage.removeItem('active_folder_id');
    }

    if (isDemoMode) {
      setAuthUser({
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
          setAuthUser({
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName,
            photoURL: firebaseUser.photoURL,
          });
        } else {
          setAuthUser(null);
        }
        setLoading(false);
      });
    } catch (err) {
      console.error(err);
      setLoading(false);
    }

    return () => unsubscribe?.();
  }, [isDemoMode, activeFolderId]);

  // Sync user profile to make it searchable for remote access
  useEffect(() => {
    if (authUser && !isDemoMode) {
      const db = getFirebaseDb();
      const docRef = doc(db, 'userProfiles', authUser.uid);
      // Only sync email and lastSeen automatically to avoid overwriting custom displayName/photoURL
      setDoc(docRef, {
        email: authUser.email?.toLowerCase(),
        lastSeen: serverTimestamp()
      }, { merge: true }).catch(err => console.warn("Profile sync error:", err));
    }
  }, [authUser?.uid, isDemoMode]);

  useEffect(() => {
    if (isDemoMode && !remoteAccess.isActive) {
      localStorage.setItem('demo_folders', JSON.stringify(folders));
      localStorage.setItem('demo_files', JSON.stringify(files));
    } else if (isDemoMode && remoteAccess.isActive) {
      // Save to remote mock storage
      const remoteUserId = remoteAccess.user?.uid;
      localStorage.setItem(`demo_folders_${remoteUserId}`, JSON.stringify(folders));
      localStorage.setItem(`demo_files_${remoteUserId}`, JSON.stringify(files));
    }
  }, [folders, files, isDemoMode, remoteAccess.isActive, remoteAccess.user?.uid]);

  useEffect(() => {
    if (!authUser || isDemoMode) {
      setCustomProfile(null);
      return;
    }

    const db = getFirebaseDb();
    const docRef = doc(db, 'userProfiles', authUser.uid);
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setCustomProfile(data);
        if (data.remoteAccessKey) {
          setRemoteAccessKey(data.remoteAccessKey);
        }
      }
      setPermissionError(null);
    }, (error) => {
      if (error.code === 'permission-denied') {
        setPermissionError(t('permissionError'));
      } else {
        console.error("Firestore Profile Error:", error);
      }
    });

    return () => unsubscribe();
  }, [authUser?.uid, isDemoMode]);

  useEffect(() => {
    if (!user) return;
    
    // In demo mode, we only run this if remote access is active (to simulate fetching remote data)
    if (isDemoMode && !remoteAccess.isActive) return;

    let unsubscribeFolders: () => void;
    let unsubscribeFiles: () => void;

    try {
      if (!isDemoMode && !isFirebaseConfigured) return;
      
      // If in demo mode and remote access is active, we use localStorage to simulate remote data
      if (isDemoMode && remoteAccess.isActive) {
        const remoteUserId = remoteAccess.user?.uid;
        const loadRemoteData = () => {
          const savedFolders = localStorage.getItem(`demo_folders_${remoteUserId}`);
          const savedFiles = localStorage.getItem(`demo_files_${remoteUserId}`);
          
          // If no remote data exists, create some sample data for the demo
          if (!savedFolders) {
            const sampleFolders: Folder[] = [
              { id: 'remote_f1', name: 'Shared Documents', userId: remoteUserId!, createdAt: Date.now(), icon: '📁', isLocked: false, parentId: null }
            ];
            setFolders(sampleFolders);
            localStorage.setItem(`demo_folders_${remoteUserId}`, JSON.stringify(sampleFolders));
          } else {
            setFolders(JSON.parse(savedFolders));
          }

          if (!savedFiles) {
            setFiles([]);
          } else {
            setFiles(JSON.parse(savedFiles));
          }
        };

        loadRemoteData();
        // Simulate a "listener" by polling or just loading once for demo
        const interval = setInterval(loadRemoteData, 2000);
        return () => clearInterval(interval);
      }

      const currentDb = remoteAccess.isActive && remoteAccess.db ? remoteAccess.db : getFirebaseDb();
      const currentUserId = remoteAccess.isActive && remoteAccess.user ? remoteAccess.user.uid : user.uid;

      const foldersQuery = query(collection(currentDb, 'folders'), where('userId', '==', currentUserId));
      unsubscribeFolders = onSnapshot(foldersQuery, (snapshot) => {
        const folderList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Folder));
        setFolders(folderList.sort((a, b) => b.createdAt - a.createdAt));
        setPermissionError(null);
      }, (error) => {
        if (error.code === 'permission-denied') {
          setPermissionError(t('permissionError'));
        }
        console.error("Folders Snapshot Error:", error);
      });

      const filesQuery = query(collection(currentDb, 'files'), where('userId', '==', currentUserId));
      unsubscribeFiles = onSnapshot(filesQuery, (snapshot) => {
        const fileList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FileData));
        setPermissionError(null);
        
        // Preserve locally loaded dataUrl if it's not 'CHUNKED'
        setFiles(prev => {
          return fileList.map(newFile => {
            const existingFile = prev.find(f => f.id === newFile.id);
            if (existingFile && existingFile.dataUrl !== 'CHUNKED' && newFile.dataUrl === 'CHUNKED') {
              return { ...newFile, dataUrl: existingFile.dataUrl };
            }
            return newFile;
          });
        });
      }, (error) => {
        if (error.code === 'permission-denied') {
          setPermissionError(t('permissionError'));
        }
        console.error("Files Snapshot Error:", error);
      });
    } catch (err) {
      console.error(err);
    }

    return () => {
      unsubscribeFolders?.();
      unsubscribeFiles?.();
    };
  }, [user, isDemoMode, remoteAccess.isActive, remoteAccess.user?.uid, remoteAccess.db]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newDisplayName.trim()) return;

    setIsUpdatingProfile(true);
    try {
      if (isDemoMode) {
        setAuthUser({ ...user, displayName: newDisplayName });
        setShowProfileEdit(false);
        return;
      }

      const db = getFirebaseDb();
      const auth = getFirebaseAuth();
      
      // 1. Update Firestore Profile (Primary source for this app)
      await setDoc(doc(db, 'userProfiles', user.uid), { 
        displayName: newDisplayName 
      }, { merge: true });

      // 2. Update Firebase Auth Profile (For consistency)
      if (auth.currentUser) {
        await updateProfile(auth.currentUser, { displayName: newDisplayName });
      }

      // 3. Update local state for immediate feedback
      if (authUser) {
        setAuthUser({ ...authUser, displayName: newDisplayName });
      }

      setShowProfileEdit(false);
      alert(t('profileUpdated'));
    } catch (err) {
      console.error(err);
      alert(t('loginError'));
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const handleRemoteLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsRemoteLoggingIn(true);

    if (isDemoMode) {
      // Mock remote login for demo mode
      const normalizedEmail = remoteEmail.toLowerCase().trim();
      const inputKey = String(remoteAccessKeyInput || '').trim();

      // For demo, we allow any email but check if they have a "saved" key in localStorage
      // or use a default one: demo@remote.com / 123456
      const savedRemoteKey = localStorage.getItem(`demo_remote_key_${normalizedEmail}`) || (normalizedEmail === 'demo@remote.com' ? '123456' : null);

      if (normalizedEmail === user?.email) {
        setError(t('cannotAccessOwnVault'));
        setIsRemoteLoggingIn(false);
        return;
      }

      if (!savedRemoteKey) {
        setError(t('remoteAccessNotSet') + ' (Demo: demo@remote.com / 123456)');
        setIsRemoteLoggingIn(false);
        return;
      }

      if (savedRemoteKey !== inputKey) {
        setError(t('wrongRemotePassword'));
        setIsRemoteLoggingIn(false);
        return;
      }

      setRemoteAccess({
        isActive: true,
        user: {
          uid: `demo_remote_${normalizedEmail}`,
          email: normalizedEmail,
          displayName: normalizedEmail.split('@')[0],
          photoURL: `https://picsum.photos/seed/${normalizedEmail}/200`
        },
        db: null,
        app: null
      });
      sessionStorage.setItem('remote_session_active', 'true');
      setShowRemoteLogin(false);
      setRemoteEmail('');
      setRemoteAccessKeyInput('');
      setActiveFolderId(null);
      setIsRemoteLoggingIn(false);
      return;
    }

    if (!user) {
      setError(t('loginWithGoogle')); // Or something appropriate
      setIsRemoteLoggingIn(false);
      return;
    }
    try {
      const db = getFirebaseDb();
      
      // Search for user profile by email (normalized)
      const profilesRef = collection(db, 'userProfiles');
      const normalizedEmail = remoteEmail.toLowerCase().trim();
      const q = query(profilesRef, where('email', '==', normalizedEmail));
      const querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) {
        throw new Error(t('noVaultFound'));
      }

      const profileDoc = querySnapshot.docs[0];
      const profileData = profileDoc.data();
      const targetUid = profileDoc.id;

      if (targetUid === user.uid) {
        throw new Error(t('cannotAccessOwnVault'));
      }

      if (!profileData.remoteAccessKey) {
        throw new Error(t('remoteAccessNotSet'));
      }

      const storedKey = String(profileData.remoteAccessKey || '').trim();
      const inputKey = String(remoteAccessKeyInput || '').trim();

      if (storedKey !== inputKey) {
        throw new Error(t('wrongRemotePassword'));
      }

      setRemoteAccess({
        isActive: true,
        user: {
          uid: targetUid,
          email: profileData.email || remoteEmail,
          displayName: profileData.displayName || 'Remote User',
          photoURL: profileData.photoURL || ''
        },
        db: db,
        app: null
      });
      sessionStorage.setItem('remote_session_active', 'true');
      setShowRemoteLogin(false);
      setRemoteEmail('');
      setRemoteAccessKeyInput('');
      setActiveFolderId(null);
    } catch (err: any) {
      if (err.code === 'permission-denied') {
        setError(t('permissionError'));
        setShowRulesGuide(true);
      } else {
        setError(err.message || t('remoteVault')); // Or something appropriate
      }
      console.error(err);
    } finally {
      setIsRemoteLoggingIn(false);
    }
  };

  const handleSaveRemoteKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !remoteAccessKey.trim()) return;
    setIsSavingRemoteKey(true);
    try {
      if (isDemoMode) {
        localStorage.setItem(`demo_remote_key_${user.email?.toLowerCase()}`, remoteAccessKey.trim());
        setRemoteAccessKey(remoteAccessKey.trim());
        setShowRemoteSettings(false);
        alert(t('remoteAccessSet'));
        return;
      }

      const db = getFirebaseDb();
      await setDoc(doc(db, 'userProfiles', user.uid), { 
        remoteAccessKey: String(remoteAccessKey || '').trim(),
        email: user.email?.toLowerCase(),
        displayName: user.displayName,
        photoURL: user.photoURL
      }, { merge: true });
      setShowRemoteSettings(false);
      alert(t('remoteAccessSet'));
    } catch (err) {
      console.error(err);
      alert(t('savePassword')); // Error setting password
    } finally {
      setIsSavingRemoteKey(false);
    }
  };

  const handleExitRemoteAccess = async () => {
    if (remoteAccess.app) {
      await closeSecondaryApp(remoteAccess.app);
    }
    sessionStorage.removeItem('remote_session_active');
    setRemoteAccess({
      isActive: false,
      user: null,
      db: null,
      app: null
    });
    setActiveFolderId(null);
  };

  const handleProfilePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    // Check file size (limit to 700KB for base64 storage in Firestore to stay under 1MB limit)
    if (file.size > 700 * 1024) {
      alert(t('photoSizeError'));
      return;
    }

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result as string;
      setIsUpdatingProfile(true);
      try {
        if (isDemoMode) {
          setAuthUser({ ...user, photoURL: base64 });
          return;
        }

        const db = getFirebaseDb();
        const auth = getFirebaseAuth();

        // 1. Update Firestore Profile
        await setDoc(doc(db, 'userProfiles', user.uid), { 
          photoURL: base64 
        }, { merge: true });

        // 2. Update Firebase Auth Profile
        if (auth.currentUser) {
          await updateProfile(auth.currentUser, { photoURL: base64 });
        }

        // 3. Update local state for immediate feedback
        if (authUser) {
          setAuthUser({ ...authUser, photoURL: base64 });
        }

        alert(t('photoUpdated'));
      } catch (err) {
        console.error(err);
        alert(t('photoUpdated')); // Error updating photo
      } finally {
        setIsUpdatingProfile(false);
      }
    };
    reader.readAsDataURL(file);
  };

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
        isLocked: !!folderPassword,
        parentId: activeFolderId || null
      };
      setFolders([newFolder, ...folders]);
      setNewFolderName('');
      setFolderPassword('');
      setShowAddFolder(false);
      return;
    }

    try {
      const db = remoteAccess.isActive && remoteAccess.db ? remoteAccess.db : getFirebaseDb();
      const currentUserId = remoteAccess.isActive && remoteAccess.user ? remoteAccess.user.uid : user.uid;
      
      await addDoc(collection(db, 'folders'), {
        name: newFolderName,
        userId: currentUserId,
        createdAt: Date.now(),
        icon: '📁',
        password: folderPassword || null,
        isLocked: !!folderPassword,
        parentId: activeFolderId || null
      });
      setNewFolderName('');
      setFolderPassword('');
      setShowAddFolder(false);
    } catch (err: any) {
      console.error(err);
      if (err.code === 'permission-denied') {
        alert(t('permissionError'));
      } else {
        alert(t('create') + ': ' + (err.message || 'Unknown error'));
      }
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const filesToUpload = Array.from(event.target.files || []) as File[];
    if (filesToUpload.length === 0 || !activeFolderId || !user) return;

    // Check sizes first
    for (const file of filesToUpload) {
      if (file.size > 50 * 1024 * 1024) {
        alert(`${file.name}: ${t('fileSizeError')}`);
        return;
      }
    }

    setIsUploading(true);
    
    if (isDemoMode) {
      const newFiles: FileData[] = [];
      
      for (const file of filesToUpload) {
        const base64Data = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.readAsDataURL(file);
        });

        newFiles.push({
          id: Math.random().toString(36).substr(2, 9),
          name: file.name,
          type: file.type,
          size: (file.size / (1024 * 1024)).toFixed(2) + ' MB',
          folderId: activeFolderId,
          userId: user?.uid || 'demo-user',
          uploadDate: new Date().toLocaleDateString('bn-BD'),
          dataUrl: base64Data,
          isChunked: false
        });
      }

      setFiles([...files, ...newFiles]);
      setShowUpload(false);
      setIsUploading(false);
      return;
    }

    try {
      const db = remoteAccess.isActive && remoteAccess.db ? remoteAccess.db : getFirebaseDb();
      const currentUserId = remoteAccess.isActive && remoteAccess.user ? remoteAccess.user.uid : user.uid;

      for (const file of filesToUpload) {
        let fileDocRef: any = null;
        try {
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

          console.log(`Uploading ${file.name} in ${chunks.length} chunks...`);

          // 1. Save metadata to Firestore
          const fileDoc = await addDoc(collection(db, 'files'), {
            name: file.name,
            type: file.type,
            size: (file.size / (1024 * 1024)).toFixed(2) + ' MB',
            folderId: activeFolderId,
            userId: currentUserId,
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
              userId: currentUserId
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
          
          console.log(`File ${file.name} uploaded successfully.`);
        } catch (fileErr: any) {
          console.error(`Upload failed for ${file.name}:`, fileErr);
          // Cleanup: Delete metadata if chunks failed
          if (fileDocRef) {
            try {
              await deleteDoc(fileDocRef);
            } catch (cleanupErr) {
              console.error("Failed to cleanup file metadata:", cleanupErr);
            }
          }
          throw fileErr; // Stop all uploads if one fails
        }
      }

      setShowUpload(false);
    } catch (err: any) {
      console.error("Upload process failed:", err);
      if (err.code === 'permission-denied') {
        alert(t('permissionError'));
      } else {
        alert(t('newFile') + ': ' + (err.message || 'Unknown error'));
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
      setError(t('wrongPassword'));
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
        setAuthError(t('firebaseAuthErrorGoogle'));
      } else if (err.code === 'auth/unauthorized-domain') {
        setAuthError(t('firebaseAuthErrorDomain', { domain: window.location.hostname }));
      } else if (err.code === 'auth/invalid-api-key') {
        setAuthError(t('firebaseAuthErrorApiKey'));
      } else {
        setAuthError(t('firebaseAuthErrorGeneral'));
      }
    }
  };

  const resetDemoData = () => {
    if (confirm(t('confirmDeleteDemo'))) {
      localStorage.removeItem('demo_folders');
      localStorage.removeItem('demo_files');
      setFolders([]);
      setFiles([]);
      setActiveFolderId(null);
      alert(t('demoDataDeleted'));
    }
  };
  const handleTestConnection = async () => {
    setIsTestingConnection(true);
    try {
      const res = await fetch('/api/test-connection', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        alert(t('serverReady'));
        // Refresh status
        const statusRes = await fetch('/api/config-status');
        const statusData = await statusRes.json();
        setConfigStatus(statusData);
      } else {
        alert(t('appPasswordError', { error: data.error }));
      }
    } catch (err: any) {
      alert(t('serverConnectionError'));
    } finally {
      setIsTestingConnection(false);
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
          alert(`${t('verifyCode')}: ${code}\n\n(SMTP not configured)`);
        } else {
          alert(t('emailSent'));
        }
      } else {
        throw new Error(data.details || data.error || 'Failed to send email');
      }
    } catch (err: any) {
      console.error('Error sending recovery email:', err);
      setIsSendingCode(false);
      
      let errorMessage = t('emailError');
      if (err.message.includes('Invalid login')) {
        errorMessage = t('serverNotConfigured');
      } else if (err.message.includes('ETIMEDOUT')) {
        errorMessage = t('emailError'); // Timeout
      }
      
      setError(errorMessage);
      
      // Fallback to simulation for testing if API fails or in demo mode
      if (isDemoMode) {
        setRecoveryStep('verify');
        alert(`${t('verifyCode')}: ${code}`);
      } else {
        alert(`Error: ${err.message}\n\nCode: ${code}`);
        setRecoveryStep('verify');
      }
    }
  };

  const handleVerifyCode = () => {
    if (userInputCode === generatedCode) {
      setRecoveryStep('reset');
      setError('');
    } else {
      setError(t('invalidCode'));
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
      alert(t('passwordChanged'));
    } catch (err) {
      console.error(err);
      alert(t('passwordChanged')); // Error
    }
  };

  const deleteFile = async (id: string) => {
    if (window.confirm(t('confirmDeleteFile'))) {
      setIsDeleting(id);
      try {
        if (isDemoMode) {
          setFiles(files.map(f => f.id === id ? { ...f, isDeleted: true, deletedAt: Date.now() } : f));
          setIsDeleting(null);
          return;
        }
        
        if (!user) throw new Error("User not authenticated");
        
        const db = remoteAccess.isActive && remoteAccess.db ? remoteAccess.db : getFirebaseDb();
        await updateDoc(doc(db, 'files', id), { 
          isDeleted: true, 
          deletedAt: Date.now() 
        });
        
        // Optimistic update
        setFiles(prev => prev.map(f => f.id === id ? { ...f, isDeleted: true, deletedAt: Date.now() } : f));
      } catch (err: any) {
        console.error("Delete file error:", err);
        alert(t('delete') + ': ' + (err.message || 'Unknown error'));
      } finally {
        setIsDeleting(null);
      }
    }
  };

  const restoreItem = async (item: FileData | Folder, type: 'file' | 'folder') => {
    try {
      if (isDemoMode) {
        if (type === 'file') {
          setFiles(files.map(f => f.id === item.id ? { ...f, isDeleted: false, deletedAt: undefined } : f));
        } else {
          setFolders(folders.map(f => f.id === item.id ? { ...f, isDeleted: false, deletedAt: undefined } : f));
        }
        alert(t('itemRestored'));
        return;
      }

      const db = remoteAccess.isActive && remoteAccess.db ? remoteAccess.db : getFirebaseDb();
      const collectionName = type === 'file' ? 'files' : 'folders';
      await updateDoc(doc(db, collectionName, item.id), { 
        isDeleted: false, 
        deletedAt: null 
      });
      alert(t('itemRestored'));
    } catch (err) {
      console.error("Restore error:", err);
      alert(t('moveError'));
    }
  };

  const permanentlyDeleteItem = async (item: FileData | Folder, type: 'file' | 'folder') => {
    if (!window.confirm(t('confirmPermanentDelete'))) return;

    setIsDeleting(item.id);
    try {
      if (isDemoMode) {
        if (type === 'file') {
          setFiles(files.filter(f => f.id !== item.id));
        } else {
          setFolders(folders.filter(f => f.id !== item.id));
          setFiles(files.filter(f => f.folderId !== item.id));
        }
        setIsDeleting(null);
        alert(t('itemDeletedPermanently'));
        return;
      }

      const db = remoteAccess.isActive && remoteAccess.db ? remoteAccess.db : getFirebaseDb();
      
      if (type === 'file') {
        // 1. Delete chunks if any
        const chunksQuery = query(collection(db, 'fileChunks'), where('fileId', '==', item.id));
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
        // 2. Delete file metadata
        await deleteDoc(doc(db, 'files', item.id));
      } else {
        // For folders, we should ideally delete recursively, but for simplicity in recycle bin, 
        // we just delete the folder metadata. The files inside are already marked as deleted 
        // if the folder was deleted normally.
        await deleteDoc(doc(db, 'folders', item.id));
      }
      
      alert(t('itemDeletedPermanently'));
    } catch (err: any) {
      console.error("Permanent delete error:", err);
      alert(t('delete') + ': ' + (err.message || 'Unknown error'));
    } finally {
      setIsDeleting(null);
    }
  };

  const emptyRecycleBin = async () => {
    if (!window.confirm(t('confirmEmptyRecycleBin'))) return;

    const deletedFiles = files.filter(f => f.isDeleted);
    const deletedFolders = folders.filter(f => f.isDeleted);

    for (const file of deletedFiles) {
      await permanentlyDeleteItem(file, 'file');
    }
    for (const folder of deletedFolders) {
      await permanentlyDeleteItem(folder, 'folder');
    }
  };

  const deleteFolder = async (id: string, password?: string) => {
    const folder = folders.find(f => f.id === id);
    if (!folder) return;

    // If folder is locked, require password
    if (folder.password) {
      // If no password provided yet, show the modal
      if (password === undefined) {
        setShowDeleteFolder(folder);
        setDeletePassword('');
        setDeleteError(false);
        return;
      }
      
      // If password provided but incorrect
      if (password !== folder.password) {
        setDeleteError(true);
        return;
      }
    }

    // If we reach here, either folder is not locked OR password is correct
    if (window.confirm(t('confirmDeleteFolder'))) {
      setShowDeleteFolder(null);
      setIsDeleting(id);
      try {
        const db = remoteAccess.isActive && remoteAccess.db ? remoteAccess.db : getFirebaseDb();
        
        // Mark folder as deleted
        if (isDemoMode) {
          setFolders(folders.map(f => f.id === id ? { ...f, isDeleted: true, deletedAt: Date.now() } : f));
          // Also mark all files in this folder as deleted
          setFiles(files.map(f => f.folderId === id ? { ...f, isDeleted: true, deletedAt: Date.now() } : f));
        } else {
          await updateDoc(doc(db, 'folders', id), { isDeleted: true, deletedAt: Date.now() });
          
          // Note: In a real app, you'd want to recursively mark all sub-items as deleted.
          // For this demo, we'll just do the top level folder.
        }

        if (activeFolderId === id) setActiveFolderId(null);
      } catch (err: any) {
        console.error("Delete folder error:", err);
        alert(t('delete') + ': ' + (err.message || 'Unknown error'));
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
      
      // Optimistically update local state to keep dataUrl if it was already loaded
      setFiles(prev => prev.map(f => f.id === id ? { ...f, name: newName } : f));
      
      const db = getFirebaseDb();
      await updateDoc(doc(db, 'files', id), { name: newName });
      setEditingFileId(null);
    } catch (err) {
      console.error(err);
      alert(t('rename')); // Error
      // Revert local state on error if needed, but onSnapshot will eventually sync anyway
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
      alert(t('rename')); // Error
    }
  };

  const moveFile = async (fileId: string, targetFolderId: string) => {
    if (!fileId || !targetFolderId) return;
    
    try {
      if (isDemoMode) {
        setFiles(files.map(f => f.id === fileId ? { ...f, folderId: targetFolderId } : f));
        setMovingFile(null);
        return;
      }
      
      const db = remoteAccess.isActive && remoteAccess.db ? remoteAccess.db : getFirebaseDb();
      await updateDoc(doc(db, 'files', fileId), { folderId: targetFolderId });
      setMovingFile(null);
      alert(t('fileMoved'));
    } catch (err) {
      console.error(err);
      alert(t('moveError'));
    }
  };

  const removeFolderLock = async (folder: Folder) => {
    const pass = window.prompt(t('enterCurrentPassword'));
    if (!pass) return;
    
    if (pass !== folder.password) {
      alert(t('wrongPassword'));
      return;
    }

    try {
      if (isDemoMode) {
        setFolders(folders.map(f => f.id === folder.id ? { ...f, password: '', isLocked: false } : f));
        return;
      }
      const db = remoteAccess.isActive && remoteAccess.db ? remoteAccess.db : getFirebaseDb();
      await updateDoc(doc(db, 'folders', folder.id), { password: '', isLocked: false });
    } catch (err) {
      console.error(err);
      alert(t('deletePasswordError'));
    }
  };

  const handleSetFolderLock = async () => {
    if (!showLockFolder || !folderPassword) return;
    
    try {
      if (isDemoMode) {
        setFolders(folders.map(f => f.id === showLockFolder.id ? { ...f, password: folderPassword, isLocked: true } : f));
        
        // If the locked folder is the active one, clear it to hide contents
        if (activeFolderId === showLockFolder.id) {
          setActiveFolderId(null);
        }
        
        setShowLockFolder(null);
        setFolderPassword('');
        return;
      }
      const db = remoteAccess.isActive && remoteAccess.db ? remoteAccess.db : getFirebaseDb();
      await updateDoc(doc(db, 'folders', showLockFolder.id), { password: folderPassword, isLocked: true });
      
      // If the locked folder is the active one, clear it to hide contents
      if (activeFolderId === showLockFolder.id) {
        setActiveFolderId(null);
      }
      
      setShowLockFolder(null);
      setFolderPassword('');
    } catch (err) {
      console.error(err);
      alert(t('lockError'));
    }
  };

  const downloadFile = async (file: FileData) => {
    let dataUrl = file.dataUrl;

    if (!isDemoMode && file.isChunked && dataUrl === 'CHUNKED') {
      setIsUploading(true); // Reusing uploading state for loading
      try {
        console.log("Attempting to download chunked file. ID:", file.id);
        const db = remoteAccess.isActive && remoteAccess.db ? remoteAccess.db : getFirebaseDb();
        const chunksQuery = query(
          collection(db, 'fileChunks'), 
          where('fileId', '==', file.id)
        );
        const chunksSnapshot = await getDocs(chunksQuery);
        
        if (chunksSnapshot.empty) {
          console.error("No chunks found in Firestore for file ID:", file.id);
          if (!remoteAccess.isActive && window.confirm(t('fileDataNotFoundError'))) {
            await deleteDoc(doc(db, 'files', file.id));
            setFiles(files.filter(f => f.id !== file.id));
          } else if (remoteAccess.isActive) {
            alert(t('fileLoadError'));
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
        alert(t('fileDownloadError'));
        setIsUploading(false);
        return;
      } finally {
        setIsUploading(false);
      }
    }

    if (!dataUrl || dataUrl === 'CHUNKED') {
      alert(t('fileDataNotFound'));
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
      alert(t('downloadStartError'));
    }
  };

  const handlePreview = async (file: FileData) => {
    if (!isDemoMode && file.isChunked && file.dataUrl === 'CHUNKED') {
      setIsPreviewLoading(true);
      try {
        console.log("Attempting to preview chunked file. ID:", file.id);
        const db = remoteAccess.isActive && remoteAccess.db ? remoteAccess.db : getFirebaseDb();
        const chunksQuery = query(
          collection(db, 'fileChunks'), 
          where('fileId', '==', file.id)
        );
        const chunksSnapshot = await getDocs(chunksQuery);
        
        if (chunksSnapshot.empty) {
          console.error("No chunks found in Firestore for preview. File ID:", file.id);
          if (!remoteAccess.isActive && window.confirm(t('previewLoadErrorConfirm'))) {
            await deleteDoc(doc(db, 'files', file.id));
            setFiles(files.filter(f => f.id !== file.id));
          } else if (remoteAccess.isActive) {
            alert(t('previewLoadError'));
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
        alert(t('previewLoadGeneralError'));
      } finally {
        setIsPreviewLoading(false);
      }
    } else {
      if (file.dataUrl === 'CHUNKED') {
        alert(t('fileDataMissing'));
        return;
      }
      setShowPreview(file);
    }
  };

  const [isSharing, setIsSharing] = useState(false);
  const [preparingFileId, setPreparingFileId] = useState<string | null>(null);

  const dataUrlToBlob = (dataUrl: string) => {
    try {
      const arr = dataUrl.split(',');
      const mime = arr[0].match(/:(.*?);/)?.[1];
      const bstr = atob(arr[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
      }
      return new Blob([u8arr], { type: mime });
    } catch (e) {
      console.error("Blob conversion error:", e);
      return null;
    }
  };

  const handleShare = async (file: FileData) => {
    if (isSharing) return;

    // If file is chunked and not yet loaded, we need to prepare it first
    if (!isDemoMode && file.isChunked && file.dataUrl === 'CHUNKED') {
      setPreparingFileId(file.id);
      try {
        const db = remoteAccess.isActive && remoteAccess.db ? remoteAccess.db : getFirebaseDb();
        const chunksQuery = query(
          collection(db, 'fileChunks'), 
          where('fileId', '==', file.id)
        );
        const chunksSnapshot = await getDocs(chunksQuery);
        
        if (chunksSnapshot.empty) {
          alert('এই ফাইলটির ডেটা খুঁজে পাওয়া যায়নি।');
          setPreparingFileId(null);
          return;
        }

        const sortedChunks = chunksSnapshot.docs
          .map(doc => doc.data())
          .sort((a, b) => a.index - b.index);

        let fullBase64 = '';
        sortedChunks.forEach(chunk => {
          fullBase64 += chunk.data;
        });
        
        // Update the file in the state so it's "ready" for the next click
        setFiles(prev => prev.map(f => f.id === file.id ? { ...f, dataUrl: fullBase64 } : f));
        
        // We don't call share here because the user gesture is lost after async fetch.
        // The UI will now show a "Ready" state for this file.
      } catch (err) {
        console.error("Prepare share error:", err);
        alert(t('filePrepareError'));
      } finally {
        setPreparingFileId(null);
      }
      return;
    }

    // If we have the dataUrl, we can share immediately (synchronously)
    setIsSharing(true);
    try {
      const dataUrl = file.dataUrl;
      if (!dataUrl || dataUrl === 'CHUNKED') {
        alert(t('fileNotReadyShare'));
        setIsSharing(false);
        return;
      }

      if (navigator.share) {
        const blob = dataUrlToBlob(dataUrl);
        if (!blob) throw new Error("Blob conversion failed");
        
        // Ensure filename has an extension that matches the type
        // This is critical for navigator.share on many mobile browsers
        let fileName = file.name;
        const extensionMap: Record<string, string> = {
          'image/jpeg': '.jpg',
          'image/png': '.png',
          'image/gif': '.gif',
          'application/pdf': '.pdf',
          'text/plain': '.txt',
        };

        const hasExtension = fileName.includes('.');
        if (!hasExtension && extensionMap[file.type]) {
          fileName += extensionMap[file.type];
        }
        
        const shareFile = new File([blob], fileName, { type: file.type });
        const shareData: ShareData = {
          files: [shareFile],
          title: fileName,
          text: t('shareText') + fileName,
        };

        if (navigator.canShare && navigator.canShare(shareData)) {
          await navigator.share(shareData);
        } else {
          await navigator.share({
            title: file.name,
            text: t('shareText') + file.name,
          });
        }
      } else {
        alert(t('shareNotSupported'));
      }
    } catch (err: any) {
      console.error('Sharing failed:', err);
      if (err.name === 'NotAllowedError' || err.message?.includes('Permission denied')) {
        alert(t('sharePermissionError'));
      } else if (err.name !== 'AbortError' && !err.message?.includes('already completed')) {
        alert(t('shareError'));
      }
    } finally {
      setIsSharing(false);
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
                {t('tryDemoMode')}
              </button>
            </div>
          )}
          
          <button 
            onClick={() => setIsDemoMode(true)}
            className="mt-6 text-sm text-indigo-600 font-bold hover:underline"
          >
            {t('viewDemoWithoutLogin')}
          </button>
          
          <p className="mt-8 text-[11px] text-slate-400 uppercase tracking-widest font-semibold">
            Powered by SecureVault Technology
          </p>
        </motion.div>
      </div>
    );
  }

  const currentFolder = folders.find(f => f.id === activeFolderId);
  const parentFolder = currentFolder?.parentId ? folders.find(f => f.id === currentFolder.parentId) : null;
  const isCurrentFolderLocked = currentFolder?.password && !unlockedFolderIds.includes(currentFolder.id);
  
  const subFolders = activeFolderId 
    ? folders.filter(f => f.parentId === activeFolderId && !f.isDeleted)
    : folders.filter(f => !f.parentId && !f.isDeleted);
  const filteredFiles = files.filter(f => 
    f.folderId === activeFolderId && 
    !f.isDeleted &&
    f.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="h-screen flex flex-col bg-[#f8fafc] overflow-hidden">
      {/* Remote Access Modal */}
      <AnimatePresence>
        {showRemoteLogin && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl"
            >
              <div className="flex flex-col items-center text-center mb-8">
                <div className="w-16 h-16 bg-indigo-100 rounded-2xl flex items-center justify-center mb-4">
                  <ExternalLink className="w-8 h-8 text-indigo-600" />
                </div>
                <h3 className="text-2xl font-bold text-slate-900">{t('remoteVaultAccess')}</h3>
                <p className="text-slate-500 mt-2">{t('remoteVaultAccessDesc')}</p>
              </div>

              <form onSubmit={handleRemoteLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">{t('gmailId')}</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input 
                      type="email" 
                      required
                      placeholder="example@gmail.com"
                      value={remoteEmail}
                      onChange={(e) => setRemoteEmail(e.target.value)}
                      className="w-full pl-12 pr-4 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-500 outline-none transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">{t('remoteAccessPassword')}</label>
                  <div className="relative">
                    <ShieldCheck className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input 
                      type={showRemoteAccessKeyInput ? "text" : "password"} 
                      required
                      placeholder={t('enterOwnerPassword')}
                      value={remoteAccessKeyInput}
                      onChange={(e) => setRemoteAccessKeyInput(e.target.value)}
                      className="w-full pl-12 pr-12 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-500 outline-none transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowRemoteAccessKeyInput(!showRemoteAccessKeyInput)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showRemoteAccessKeyInput ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="p-4 bg-rose-50 text-rose-600 rounded-2xl text-sm flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <p>{error}</p>
                  </div>
                )}

                <div className="flex justify-end">
                  <button 
                    type="button"
                    onClick={() => alert(t('forgotRemotePasswordAlert'))}
                    className="text-xs text-indigo-600 font-bold hover:underline"
                  >
                    {t('forgotPassword')}
                  </button>
                </div>

                <button 
                  type="submit"
                  disabled={isRemoteLoggingIn}
                  className="w-full py-4 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 flex items-center justify-center gap-2"
                >
                  {isRemoteLoggingIn ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      {t('accessing')}...
                    </>
                  ) : (
                    t('access')
                  )}
                </button>

                <button 
                  type="button"
                  onClick={() => {
                    setShowRemoteLogin(false);
                    setError('');
                    setRemoteEmail('');
                    setRemotePassword('');
                  }}
                  className="w-full py-4 text-slate-400 font-bold hover:text-slate-600 transition-all"
                >
                  {t('cancel')}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Remote Settings Modal */}
      <AnimatePresence>
        {showRemoteSettings && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl"
            >
              <div className="flex flex-col items-center text-center mb-8">
                <div className="w-16 h-16 bg-indigo-100 rounded-2xl flex items-center justify-center mb-4">
                  <ShieldCheck className="w-8 h-8 text-indigo-600" />
                </div>
                <h3 className="text-2xl font-bold text-slate-900">{t('remoteAccessSettings')}</h3>
                <p className="text-slate-500 mt-2">{t('remoteSettingsDescription')}</p>
              </div>

              <form onSubmit={handleSaveRemoteKey} className="space-y-6">
                {remoteAccess.isActive && remoteAccess.user && (
                  <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl mb-4">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center">
                        <UserIcon className="w-5 h-5 text-emerald-600" />
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">{t('currentVault')}</p>
                        <p className="text-sm font-bold text-slate-900">{remoteAccess.user.email}</p>
                      </div>
                    </div>
                    <button 
                      type="button"
                      onClick={handleExitRemoteAccess}
                      className="w-full py-2 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-700 transition-all"
                    >
                      {t('stopRemoteAccess')}
                    </button>
                  </div>
                )}

                {!remoteAccess.isActive && (
                  <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-2xl mb-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
                        <ExternalLink className="w-5 h-5 text-indigo-600" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-900">{t('accessOtherVault')}</p>
                        <p className="text-[10px] text-slate-500">{t('accessOtherVaultDesc')}</p>
                      </div>
                    </div>
                    <button 
                      type="button"
                      onClick={() => {
                        setShowRemoteSettings(false);
                        setShowRemoteLogin(true);
                      }}
                      className="w-full py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 transition-all"
                    >
                      {t('remoteVaultAccess')}
                    </button>
                  </div>
                )}

                <div className="h-px bg-slate-100 my-4" />

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">{t('remoteAccessPassword')}</label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input 
                      type={showRemoteAccessKey ? "text" : "password"} 
                      required
                      placeholder={t('enterNewPassword')}
                      value={remoteAccessKey}
                      onChange={(e) => setRemoteAccessKey(e.target.value)}
                      className="w-full pl-12 pr-12 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-500 outline-none transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowRemoteAccessKey(!showRemoteAccessKey)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showRemoteAccessKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="p-4 bg-indigo-50 rounded-2xl">
                  <p className="text-[11px] text-indigo-600 leading-relaxed">
                    <span className="font-bold">{t('securityTip')}:</span> {t('securityTipDesc')}
                  </p>
                </div>

                <button 
                  type="submit"
                  disabled={isSavingRemoteKey}
                  className="w-full py-4 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 flex items-center justify-center gap-2"
                >
                  {isSavingRemoteKey ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      {t('saving')}...
                    </>
                  ) : (
                    t('savePassword')
                  )}
                </button>

                <button 
                  type="button"
                  onClick={() => setShowRemoteSettings(false)}
                  className="w-full py-4 text-slate-400 font-bold hover:text-slate-600 transition-all"
                >
                  {t('cancel')}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Permission Error Banner */}
      <AnimatePresence>
        {permissionError && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-red-600 text-white text-center py-2 text-sm font-medium sticky top-0 z-[100] overflow-hidden"
          >
            <div className="max-w-4xl mx-auto px-4 flex items-center justify-center gap-2">
              <AlertCircle size={16} />
              <span>{permissionError}</span>
              <button 
                onClick={() => setShowRulesGuide(true)}
                className="ml-4 underline hover:no-underline font-bold"
              >
                {t('howToFix')}
              </button>
              <button 
                onClick={() => setPermissionError(null)}
                className="ml-4 opacity-70 hover:opacity-100"
              >
                {t('close')}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Firestore Rules Guide Modal */}
      <AnimatePresence>
        {showRulesGuide && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl p-8 max-w-2xl w-full shadow-2xl max-h-[90vh] overflow-y-auto"
            >
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-100 rounded-xl">
                    <Shield className="w-6 h-6 text-indigo-600" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900">{t('firestoreRulesTitle')}</h3>
                </div>
                <button onClick={() => setShowRulesGuide(false)} className="p-2 hover:bg-slate-100 rounded-full transition-all">
                  <X className="w-6 h-6 text-slate-400" />
                </button>
              </div>

              <div className="space-y-6">
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl">
                  <p className="text-sm text-amber-800 leading-relaxed">
                    {t('rulesErrorDesc')}
                  </p>
                </div>

                <div className="space-y-3">
                  <h4 className="font-bold text-slate-800">{t('steps')}:</h4>
                  <ol className="list-decimal list-inside text-sm text-slate-600 space-y-2 ml-2">
                    <li>{t('step1')}</li>
                    <li>{t('step2')}</li>
                    <li>{t('step3')}</li>
                    <li>{t('step4')}</li>
                    <li>{t('step5')}</li>
                  </ol>
                </div>

                <div className="relative group">
                  <div className="absolute right-4 top-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={() => {
                        const code = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // ১. ইউজার প্রোফাইল: যে কেউ লগইন থাকলে অন্য ইউজারের রিমোট কী চেক করতে পারবে
    match /userProfiles/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == userId;
    }
    
    // ২. ফোল্ডার: মালিক সব পারবে, অন্য লগইন করা ইউজাররা রিমোটলি পড়তে পারবে
    match /folders/{folderId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null && request.auth.uid == request.resource.data.userId;
      allow update, delete: if request.auth != null && request.auth.uid == resource.data.userId;
    }
    
    // ৩. ফাইল মেটাডেটা: মালিক সব পারবে, অন্য লগইন করা ইউজাররা রিমোটলি পড়তে পারবে
    match /files/{fileId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null && request.auth.uid == request.resource.data.userId;
      allow update, delete: if request.auth != null && request.auth.uid == resource.data.userId;
    }
    
    // ৪. ফাইলের টুকরো (Chunks): ডাউনলোড করার জন্য এটি পড়া প্রয়োজন
    match /fileChunks/{chunkId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null && request.auth.uid == request.resource.data.userId;
      allow delete: if request.auth != null && request.auth.uid == resource.data.userId;
    }
  }
}`;
                        navigator.clipboard.writeText(code);
                        alert(t('rulesCopied'));
                      }}
                      className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-lg shadow-lg"
                    >
                      {t('copyCode')}
                    </button>
                  </div>
                  <pre className="bg-slate-900 text-slate-300 p-6 rounded-2xl text-xs overflow-x-auto font-mono leading-relaxed">
{`rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // ১. ইউজার প্রোফাইল: যে কেউ লগইন থাকলে অন্য ইউজারের রিমোট কী চেক করতে পারবে
    match /userProfiles/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == userId;
    }
    
    // ২. ফোল্ডার: মালিক সব পারবে, অন্য লগইন করা ইউজাররা রিমোটলি পড়তে পারবে
    match /folders/{folderId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null && request.auth.uid == request.resource.data.userId;
      allow update, delete: if request.auth != null && request.auth.uid == resource.data.userId;
    }
    
    // ৩. ফাইল মেটাডেটা: মালিক সব পারবে, অন্য লগইন করা ইউজাররা রিমোটলি পড়তে পারবে
    match /files/{fileId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null && request.auth.uid == request.resource.data.userId;
      allow update, delete: if request.auth != null && request.auth.uid == resource.data.userId;
    }
    
    // ৪. ফাইলের টুকরো (Chunks): ডাউনলোড করার জন্য এটি পড়া প্রয়োজন
    match /fileChunks/{chunkId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null && request.auth.uid == request.resource.data.userId;
      allow delete: if request.auth != null && request.auth.uid == resource.data.userId;
    }
  }
}`}
                  </pre>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden h-full relative">
      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {showMobileSidebar && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowMobileSidebar(false)}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-40 md:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 w-72 md:w-80 bg-slate-900 text-white flex flex-col border-r border-slate-800 h-full overflow-hidden transition-transform duration-300 md:relative md:translate-x-0",
        showMobileSidebar ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      )}>
          <div className="p-6 pb-0">
            <div className="flex items-center justify-between mb-10 relative">
              <div 
                className="flex items-center gap-3 cursor-pointer hover:bg-slate-800/50 p-1 rounded-2xl transition-all"
                onClick={() => setShowUserMenu(!showUserMenu)}
              >
                <img 
                  src={user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || 'User')}&background=6366f1&color=fff`} 
                  alt="" 
                  className="w-11 h-11 rounded-full border-2 border-indigo-500/30 shadow-lg shadow-indigo-500/10" 
                />
                <div className="overflow-hidden">
                  <p className="text-sm font-bold truncate text-white">{user.displayName}</p>
                </div>
              </div>
              
              {showUserMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
                  <div className="absolute left-0 top-full mt-2 w-56 bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl z-50 py-2 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="px-4 py-2 border-b border-slate-700/50 mb-1">
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">{t('account')}</p>
                      <p className="text-xs text-slate-300 truncate">{user.email}</p>
                    </div>
                    
                    <button 
                      onClick={() => {
                        setNewDisplayName(user.displayName || '');
                        setShowProfileEdit(true);
                        setShowUserMenu(false);
                      }} 
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-300 hover:bg-slate-700 transition-colors"
                    >
                      <Pencil className="w-4 h-4" />
                      {t('changeName')}
                    </button>

                    <button 
                      onClick={() => {
                        profilePhotoRef.current?.click();
                        setShowUserMenu(false);
                      }} 
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-300 hover:bg-slate-700 transition-colors"
                    >
                      <Camera className="w-4 h-4" />
                      {t('changePhoto')}
                    </button>

                    <button 
                      onClick={() => {
                        setShowRemoteSettings(true);
                        setShowUserMenu(false);
                      }} 
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-300 hover:bg-slate-700 transition-colors"
                    >
                      <ShieldCheck className="w-4 h-4" />
                      {t('remoteSettings')}
                    </button>

                    <button 
                      onClick={() => {
                        setShowRecycleBin(true);
                        setShowStorageAnalysis(false);
                        setActiveFolderId(null);
                        setShowUserMenu(false);
                      }} 
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors",
                        showRecycleBin 
                          ? 'bg-rose-500/20 text-rose-400' 
                          : 'text-slate-300 hover:bg-slate-700'
                      )}
                    >
                      <Trash2 className="w-4 h-4" />
                      <div className="flex-1 flex items-center justify-between">
                        <span>{t('recycleBin')}</span>
                        {deletedFiles.length + deletedFolders.length > 0 && (
                          <span className="bg-rose-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                            {deletedFiles.length + deletedFolders.length}
                          </span>
                        )}
                      </div>
                    </button>

                    <button 
                      onClick={() => {
                        setShowStorageAnalysis(true);
                        setShowRecycleBin(false);
                        setActiveFolderId(null);
                        setShowUserMenu(false);
                      }} 
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors",
                        showStorageAnalysis 
                          ? 'bg-indigo-500/20 text-indigo-400' 
                          : 'text-slate-300 hover:bg-slate-700'
                      )}
                    >
                      <LayoutGrid className="w-4 h-4" />
                      <span>{t('storageAnalysis')}</span>
                    </button>

                    <div className="h-px bg-slate-700/50 my-1" />

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
                        setShowUserMenu(false);
                      }} 
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm text-rose-400 hover:bg-rose-500/10 transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      {t('logout')}
                    </button>
                  </div>
                </>
              )}

              <div className="flex items-center gap-2">
                <button
                  onClick={toggleLanguage}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold rounded-lg uppercase tracking-wider transition-all border border-slate-700"
                >
                  <Languages className="w-3.5 h-3.5" />
                  {language === 'bn' ? 'English' : 'বাংলা'}
                </button>
                {isDemoMode && (
                  <span className="px-2 py-1 bg-amber-500/20 text-amber-500 text-[10px] font-bold rounded uppercase tracking-wider">Demo</span>
                )}
              </div>
            </div>

            {remoteAccess.isActive && (
              <div className="mb-6 bg-indigo-600/20 border border-indigo-500/30 rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-300">{t('remoteVault')}</span>
                  </div>
                  <button 
                    onClick={handleExitRemoteAccess}
                    className="text-[10px] bg-indigo-500 hover:bg-indigo-400 px-2 py-0.5 rounded transition-colors"
                  >
                    {t('close')}
                  </button>
                </div>
                <p className="text-xs text-slate-300 truncate font-medium">{remoteAccess.user?.email}</p>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-6 pt-0 space-y-6 custom-scrollbar">
          <div>
            <div className="flex items-center justify-between mb-4">
              <p className="text-[11px] uppercase text-slate-500 font-bold tracking-wider">{t('yourFolders')}</p>
              {!remoteAccess.isActive && (
                <button 
                  onClick={() => setShowAddFolder(true)}
                  className="p-1 hover:bg-slate-800 rounded-md text-indigo-400 hover:text-indigo-300 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </button>
              )}
            </div>
            
            <div className="space-y-1">
              <button
                onClick={() => {
                  setActiveFolderId(null);
                  setShowRecycleBin(false);
                  setShowStorageAnalysis(false);
                  setShowMobileSidebar(false);
                }}
                className={cn(
                  "w-full flex items-center gap-3 p-3 rounded-xl transition-all duration-200",
                  activeFolderId === null && !showRecycleBin && !showStorageAnalysis
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20' 
                    : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
                )}
              >
                <div className="w-5 h-5 flex items-center justify-center">
                  <ChevronLeft className={cn("w-4 h-4", activeFolderId === null && !showRecycleBin && !showStorageAnalysis ? "text-white" : "text-indigo-500")} />
                </div>
                <span className="text-sm font-medium">{t('allFiles')}</span>
              </button>

              {folders.filter(f => !f.parentId).length === 0 && (
                <p className="text-xs text-slate-500 italic px-2">{t('noFolders')}</p>
              )}
              {folders.filter(f => !f.parentId).map((folder, index) => {
                const isLocked = folder.isLocked && !unlockedFolderIds.includes(folder.id);
                return (
                  <div key={`sidebar-folder-${folder.id}-${index}`} className="group relative flex items-center gap-1">
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
                              setShowRecycleBin(false);
                              setShowStorageAnalysis(false);
                            }
                            setShowMobileSidebar(false);
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
                            {biometricEnabledFolders.includes(folder.id) && (
                              <div className="absolute -bottom-1 -right-1 bg-emerald-500 rounded-full p-0.5 shadow-sm">
                                <Fingerprint className="w-2 h-2 text-white" />
                              </div>
                            )}
                          </div>
                          <span className="text-sm font-medium truncate">{folder.name}</span>
                        </button>
                        
                        {!remoteAccess.isActive && (
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
                                    <Pencil className="w-3.5 h-3.5" /> {t('rename')}
                                  </button>
                                  
                                  {folder.password ? (
                                    <button 
                                      onClick={() => {
                                        removeFolderLock(folder);
                                        setActiveFolderMenuId(null);
                                      }}
                                      className="w-full flex items-center gap-2 px-4 py-2.5 text-xs text-amber-400 hover:bg-slate-700 transition-colors"
                                    >
                                      <Unlock className="w-3.5 h-3.5" /> {t('removeLock')}
                                    </button>
                                  ) : (
                                    <button 
                                      onClick={() => {
                                        setShowLockFolder(folder);
                                        setActiveFolderMenuId(null);
                                      }}
                                      className="w-full flex items-center gap-2 px-4 py-2.5 text-xs text-indigo-400 hover:bg-slate-700 transition-colors"
                                    >
                                      <Lock className="w-3.5 h-3.5" /> {t('lock')}
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
                                    {t('delete')}
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        )}
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
                  {t('demoModeDesc')}
                </p>
              </div>
              <button 
                onClick={resetDemoData}
                className="w-full py-2 px-3 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 text-[10px] font-bold rounded-xl transition-all flex items-center justify-center gap-2"
              >
                <Trash2 className="w-3 h-3" />
                {t('resetDemoData')}
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Header */}
        <header className="bg-white border-b border-slate-200 p-4 md:px-10 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-1 max-w-md">
            <button 
              onClick={() => setShowMobileSidebar(true)}
              className="p-2 hover:bg-slate-100 rounded-xl text-slate-500 md:hidden"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input 
                type="text" 
                placeholder={t('searchFiles')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-100 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 transition-all"
              />
            </div>
          </div>
          
          {activeFolderId && !remoteAccess.isActive && (
            <button
              onClick={() => setShowUpload(true)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 md:px-6 py-2.5 rounded-xl flex items-center justify-center gap-2 text-sm font-bold transition-all shadow-lg shadow-indigo-100 shrink-0"
            >
              <FilePlus className="w-4 h-4" />
              <span className="hidden sm:inline">{t('newFile')}</span>
            </button>
          )}
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 md:p-10 custom-scrollbar">
          {showStorageAnalysis ? (
            <div className="animate-in fade-in duration-500 max-w-4xl mx-auto">
              <div className="flex flex-col mb-10">
                <div className="flex items-center gap-2 text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">
                  <span>{t('storageAnalysis')}</span>
                </div>
                <h2 className="text-3xl font-bold text-slate-900 tracking-tight">{t('storageUsage')}</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
                <div className="md:col-span-2 bg-white p-8 rounded-[32px] shadow-sm border border-slate-200 flex flex-col">
                  <div className="flex items-center justify-between mb-8">
                    <h3 className="text-lg font-bold text-slate-800">{t('fileTypeDistribution')}</h3>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-indigo-500"></div>
                      <span className="text-xs text-slate-500 font-medium">{t('photos')}</span>
                      <div className="w-3 h-3 rounded-full bg-rose-500 ml-2"></div>
                      <span className="text-xs text-slate-500 font-medium">{t('pdfs')}</span>
                    </div>
                  </div>
                  
                  <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={chartData.filter(d => d.name !== t('free'))}
                          cx="50%"
                          cy="50%"
                          innerRadius={80}
                          outerRadius={120}
                          paddingAngle={8}
                          dataKey="value"
                        >
                          {chartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <RechartsTooltip 
                          formatter={(value: number) => formatBytes(value)}
                          contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="bg-white p-6 rounded-[32px] shadow-sm border border-slate-200">
                    <p className="text-[10px] uppercase text-slate-400 font-bold tracking-widest mb-2">{t('totalStorage')}</p>
                    <p className="text-2xl font-bold text-slate-900">{formatBytes(storageStats.totalLimit)}</p>
                    <div className="mt-4 w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div 
                        className="bg-indigo-600 h-full transition-all duration-1000" 
                        style={{ width: `${storageStats.percentUsed}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-slate-500 mt-2 font-medium">
                      {formatBytes(storageStats.totalUsed)} {t('used')} • {storageStats.percentUsed.toFixed(1)}%
                    </p>
                  </div>

                  <div className="bg-white p-6 rounded-[32px] shadow-sm border border-slate-200 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-indigo-50 rounded-xl flex items-center justify-center">
                          <ImageIcon className="w-4 h-4 text-indigo-500" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-800">{t('photos')}</p>
                          <p className="text-[10px] text-slate-400 font-medium">{files.filter(f => f.type.includes('image') && !f.isDeleted).length} {t('files')}</p>
                        </div>
                      </div>
                      <p className="text-sm font-bold text-slate-700">{formatBytes(storageStats.photoSize)}</p>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-rose-50 rounded-xl flex items-center justify-center">
                          <FileText className="w-4 h-4 text-rose-500" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-800">{t('pdfs')}</p>
                          <p className="text-[10px] text-slate-400 font-medium">{files.filter(f => f.type.includes('pdf') && !f.isDeleted).length} {t('files')}</p>
                        </div>
                      </div>
                      <p className="text-sm font-bold text-slate-700">{formatBytes(storageStats.pdfSize)}</p>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-slate-50 rounded-xl flex items-center justify-center">
                          <FileIcon className="w-4 h-4 text-slate-400" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-800">{t('others')}</p>
                          <p className="text-[10px] text-slate-400 font-medium">{files.filter(f => !f.type.includes('image') && !f.type.includes('pdf') && !f.isDeleted).length} {t('files')}</p>
                        </div>
                      </div>
                      <p className="text-sm font-bold text-slate-700">{formatBytes(storageStats.otherSize)}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : showRecycleBin ? (
            <div className="animate-in fade-in duration-500">
              <div className="flex items-center justify-between mb-8">
                <div className="flex flex-col">
                  <div className="flex items-center gap-2 text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">
                    <span>{t('recycleBin')}</span>
                  </div>
                  <h2 className="text-2xl font-bold text-slate-900 tracking-tight">{t('recycleBin')}</h2>
                </div>
                {deletedFiles.length + deletedFolders.length > 0 && (
                  <button 
                    onClick={emptyRecycleBin}
                    className="px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold rounded-xl shadow-lg shadow-rose-100 transition-all flex items-center gap-2"
                  >
                    <Trash className="w-4 h-4" />
                    {t('emptyRecycleBin')}
                  </button>
                )}
              </div>

              {deletedFiles.length === 0 && deletedFolders.length === 0 ? (
                <div className="bg-white border-2 border-dashed border-slate-200 rounded-[32px] p-20 text-center">
                  <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Trash2 className="w-8 h-8 text-slate-300" />
                  </div>
                  <p className="text-slate-400 font-medium">{t('recycleBinEmpty')}</p>
                </div>
              ) : (
                <div className="space-y-8">
                  {deletedFolders.length > 0 && (
                    <div>
                      <p className="text-[10px] uppercase text-slate-400 font-bold tracking-widest mb-4">{t('folders')}</p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                        {deletedFolders.map((folder, index) => (
                          <div
                            key={`recycle-folder-${folder.id}-${index}`}
                            className="flex flex-col items-center p-4 bg-white rounded-2xl border border-slate-200 hover:border-rose-200 hover:shadow-md transition-all group relative"
                          >
                            <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                              <button
                                onClick={() => restoreItem(folder, 'folder')}
                                className="p-1.5 text-slate-300 hover:text-emerald-500 hover:bg-emerald-50 rounded-lg"
                                title={t('restore')}
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => permanentlyDeleteItem(folder, 'folder')}
                                className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg"
                                title={t('deletePermanently')}
                              >
                                <Trash className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            <div className="mb-2">
                              <FolderIcon className="w-10 h-10 text-rose-300" />
                            </div>
                            <span className="text-xs font-bold text-slate-700 truncate w-full text-center">{folder.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {deletedFiles.length > 0 && (
                    <div>
                      <p className="text-[10px] uppercase text-slate-400 font-bold tracking-widest mb-4">{t('files')}</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {deletedFiles.map((file, index) => (
                          <div 
                            key={`recycle-file-${file.id}-${index}`} 
                            className="group bg-white p-5 rounded-3xl shadow-sm border border-slate-200 hover:shadow-xl hover:border-rose-100 transition-all relative overflow-hidden"
                          >
                            <div className="flex items-start justify-between mb-4">
                              <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center">
                                {file.type.includes('image') ? (
                                  <ImageIcon className="w-6 h-6 text-rose-300" />
                                ) : file.type.includes('pdf') ? (
                                  <FileText className="w-6 h-6 text-rose-300" />
                                ) : (
                                  <FileIcon className="w-6 h-6 text-rose-300" />
                                )}
                              </div>
                              <div className="flex items-center gap-1">
                                <button 
                                  onClick={() => restoreItem(file, 'file')}
                                  className="p-1.5 text-slate-300 hover:text-emerald-500 hover:bg-emerald-50 transition-all rounded-lg"
                                  title={t('restore')}
                                >
                                  <RotateCcw className="w-4 h-4" />
                                </button>
                                <button 
                                  onClick={() => permanentlyDeleteItem(file, 'file')}
                                  className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-all rounded-lg"
                                  title={t('deletePermanently')}
                                >
                                  <Trash className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                            <h3 className="font-bold text-slate-800 truncate text-sm mb-1">{file.name}</h3>
                            <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">
                              {file.size} • {new Date(file.deletedAt || 0).toLocaleDateString()}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : isCurrentFolderLocked ? (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <div className="w-24 h-24 bg-slate-100 rounded-full flex items-center justify-center mb-6">
                <Lock className="w-12 h-12 text-amber-500" />
              </div>
              <h2 className="text-2xl font-bold text-slate-800 mb-2 tracking-tight">
                {t('folderLocked')}
              </h2>
              <p className="text-slate-500 max-w-sm">
                {t('unlockToView')}
              </p>
              <button 
                onClick={() => setShowUnlock(currentFolder)}
                className="mt-6 px-8 py-3 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
              >
                {t('unlock')}
              </button>
            </div>
          ) : (
            <div className="animate-in fade-in duration-500">
              <div className="flex items-center gap-4 mb-8">
                {activeFolderId && (
                  <button 
                    onClick={() => setActiveFolderId(currentFolder?.parentId || null)}
                    className="p-2 bg-white rounded-xl shadow-sm border border-slate-200 text-slate-600 hover:text-indigo-600 hover:border-indigo-100 transition-all"
                    title={t('back')}
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                )}
                <div className="flex flex-col">
                  <div className="flex items-center gap-2 text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">
                    {parentFolder && (
                      <>
                        <span className="cursor-pointer hover:text-indigo-500" onClick={() => setActiveFolderId(parentFolder.id)}>{parentFolder.name}</span>
                        <ChevronRight className="w-3 h-3" />
                      </>
                    )}
                    <span>{currentFolder?.name || t('allFiles')}</span>
                  </div>
                  <h2 className="text-2xl font-bold text-slate-900 tracking-tight">{currentFolder?.name || t('allFiles')}</h2>
                </div>
                <span className="px-3 py-1 bg-slate-200 text-slate-600 rounded-full text-[10px] font-bold uppercase tracking-wider">
                  {filteredFiles.length} {t('files')}
                </span>
              </div>

              {/* Subfolders Section */}
              {subFolders.length > 0 && (
                <div className="mb-8">
                  <p className="text-[10px] uppercase text-slate-400 font-bold tracking-widest mb-4">{t('subfolders')}</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                    {subFolders.map((folder, index) => {
                      const isLocked = folder.isLocked && !unlockedFolderIds.includes(folder.id);
                      const isEditing = editingFolderId === folder.id;

                      if (isEditing) {
                        return (
                          <div key={`main-folder-edit-${folder.id}-${index}`} className="flex flex-col items-center p-4 bg-white rounded-2xl border-2 border-indigo-500 shadow-lg transition-all">
                            <div className="mb-2">
                              <FolderIcon className="w-10 h-10 text-indigo-500" />
                            </div>
                            <input 
                              autoFocus
                              className="w-full bg-slate-50 text-slate-800 text-xs font-bold px-2 py-1 rounded border border-slate-200 outline-none focus:border-indigo-500 text-center"
                              value={editingFolderName}
                              onChange={(e) => setEditingFolderName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') renameFolder(folder.id, editingFolderName);
                                if (e.key === 'Escape') setEditingFolderId(null);
                              }}
                              onBlur={() => renameFolder(folder.id, editingFolderName)}
                            />
                            <div className="flex gap-2 mt-2">
                              <button onClick={() => renameFolder(folder.id, editingFolderName)} className="text-emerald-500 p-1 hover:bg-emerald-50 rounded transition-colors">
                                <Check className="w-4 h-4" />
                              </button>
                              <button onClick={() => setEditingFolderId(null)} className="text-rose-500 p-1 hover:bg-rose-50 rounded transition-colors">
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={`main-folder-${folder.id}-${index}`}
                          onClick={() => {
                            if (isLocked) {
                              setShowUnlock(folder);
                            } else {
                              setActiveFolderId(folder.id);
                            }
                          }}
                          className="flex flex-col items-center p-4 bg-white rounded-2xl border border-slate-200 hover:border-indigo-200 hover:shadow-md transition-all group relative cursor-pointer"
                        >
                          {!remoteAccess.isActive && (
                            <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingFolderId(folder.id);
                                  setEditingFolderName(folder.name);
                                }}
                                className="p-1.5 text-slate-300 hover:text-indigo-500 hover:bg-indigo-50 rounded-lg"
                                title={t('rename')}
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteFolder(folder.id);
                                }}
                                className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg"
                                title={t('delete')}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                          <div className="relative mb-2">
                            <FolderIcon className="w-10 h-10 text-indigo-400 group-hover:text-indigo-500 transition-colors" />
                            {folder.password && (
                              <div className="absolute -top-1 -right-1 bg-white rounded-full p-1 shadow-sm border border-slate-100">
                                {isLocked ? <Lock className="w-2.5 h-2.5 text-amber-600" /> : <Unlock className="w-2.5 h-2.5 text-emerald-600" />}
                              </div>
                            )}
                          </div>
                          <span className="text-xs font-bold text-slate-700 truncate w-full text-center">{folder.name}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {filteredFiles.length === 0 && subFolders.length === 0 ? (
                <div className="bg-white border-2 border-dashed border-slate-200 rounded-[32px] p-20 text-center">
                  <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <FileIcon className="w-8 h-8 text-slate-300" />
                  </div>
                  <p className="text-slate-400 font-medium">{t('noFiles')}</p>
                  <button 
                    onClick={() => setShowUpload(true)}
                    className="mt-4 text-indigo-600 font-bold text-sm hover:underline"
                  >
                    {t('uploadFirst')}
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {filteredFiles.map((file, index) => (
                    <motion.div 
                      layout
                      key={`main-file-${file.id}-${index}`} 
                      className="group bg-white p-5 rounded-3xl shadow-sm border border-slate-200 hover:shadow-xl hover:border-indigo-100 transition-all relative overflow-hidden"
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div 
                          className={cn(
                            "w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center transition-all",
                            (file.type.includes('image') || file.type.includes('pdf')) && "cursor-pointer hover:bg-indigo-50 hover:scale-105"
                          )}
                          onClick={() => (file.type.includes('image') || file.type.includes('pdf')) && handlePreview(file)}
                        >
                          {file.type.includes('image') ? (
                            <ImageIcon className="w-6 h-6 text-indigo-500" />
                          ) : file.type.includes('pdf') ? (
                            <FileText className="w-6 h-6 text-rose-500" />
                          ) : (
                            <FileIcon className="w-6 h-6 text-slate-400" />
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          {(file.type.includes('image') || file.type.includes('pdf')) && (
                            <button 
                              onClick={() => handlePreview(file)}
                              className="p-1.5 text-slate-300 hover:text-indigo-500 hover:bg-indigo-50 transition-all rounded-lg"
                              title={t('preview')}
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          )}
                          {!remoteAccess.isActive && (
                            <button 
                              onClick={() => setMovingFile(file)}
                              className="p-1.5 text-slate-300 hover:text-indigo-500 hover:bg-indigo-50 transition-all rounded-lg"
                              title={t('move')}
                            >
                              <ArrowRightLeft className="w-4 h-4" />
                            </button>
                          )}
                          <button 
                            onClick={() => handleShare(file)}
                            className={cn(
                              "p-1.5 transition-all rounded-lg",
                              preparingFileId === file.id 
                                ? "text-indigo-500 bg-indigo-50" 
                                : file.dataUrl !== 'CHUNKED' 
                                  ? "text-emerald-500 bg-emerald-50" 
                                  : "text-slate-300 hover:text-blue-500 hover:bg-blue-50"
                            )}
                            title={file.dataUrl !== 'CHUNKED' ? t('share') : t('preparing')}
                          >
                            {preparingFileId === file.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : file.dataUrl !== 'CHUNKED' ? (
                              <Share2 className="w-4 h-4 fill-emerald-500/20" />
                            ) : (
                              <Share2 className="w-4 h-4" />
                            )}
                          </button>
                          {!remoteAccess.isActive && (
                            <>
                              <button 
                                onClick={() => {
                                  setEditingFileId(file.id);
                                  setEditingFileName(file.name);
                                }}
                                className="p-1.5 text-slate-300 hover:text-indigo-500 hover:bg-indigo-50 transition-all rounded-lg"
                                title={t('rename')}
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
                            </>
                          )}
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

                      <div className="mt-auto pt-2">
                        <button 
                          onClick={() => downloadFile(file)}
                          className="w-full bg-slate-900 text-white py-2.5 rounded-xl text-xs font-bold hover:bg-indigo-600 transition-all flex items-center justify-center gap-2"
                        >
                          <Download className="w-3.5 h-3.5" />
                          {t('download')}
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
    </div>

      <input 
        type="file" 
        ref={profilePhotoRef} 
        className="hidden" 
        accept="image/*" 
        onChange={handleProfilePhotoChange} 
      />

      {/* Profile Edit Modal */}
      <AnimatePresence>
        {showProfileEdit && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              onClick={() => setShowProfileEdit(false)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-[32px] shadow-2xl overflow-hidden"
            >
              <div className="p-8">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-bold text-slate-900 tracking-tight">{t('editProfile')}</h2>
                  <button onClick={() => setShowProfileEdit(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                    <X className="w-6 h-6 text-slate-400" />
                  </button>
                </div>

                <form onSubmit={handleUpdateProfile} className="space-y-6">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">{t('yourName')}</label>
                    <div className="relative">
                      <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                      <input 
                        type="text"
                        value={newDisplayName}
                        onChange={(e) => setNewDisplayName(e.target.value)}
                        placeholder={t('yourName')}
                        className="w-full pl-12 pr-4 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-500 focus:ring-0 outline-none transition-all font-medium"
                        autoFocus
                      />
                    </div>
                  </div>

                  {isMobile && (
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                      <div className="flex items-center gap-3 mb-2">
                        <Fingerprint className="w-5 h-5 text-indigo-600" />
                        <h4 className="text-sm font-bold text-slate-800">{t('biometricUnlock')}</h4>
                      </div>
                      <p className="text-[10px] text-slate-500 leading-relaxed">
                        {t('biometricUnlockDesc')}
                      </p>
                    </div>
                  )}

                  <div className="flex gap-3 pt-2">
                    <button 
                      type="button"
                      onClick={() => setShowProfileEdit(false)}
                      className="flex-1 py-4 px-6 bg-slate-100 text-slate-600 font-bold rounded-2xl hover:bg-slate-200 transition-all"
                    >
                      {t('cancel')}
                    </button>
                    <button 
                      type="submit"
                      disabled={isUpdatingProfile || !newDisplayName.trim()}
                      className="flex-1 py-4 px-6 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {isUpdatingProfile ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
                      {t('save')}
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Move File Modal */}
      <AnimatePresence>
        {movingFile && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              onClick={() => setMovingFile(null)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-[32px] shadow-2xl overflow-hidden"
            >
              <div className="p-8">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-2xl font-bold text-slate-900 tracking-tight">{t('move')}</h2>
                    <p className="text-sm text-slate-500 mt-1">"{movingFile.name}" {t('moveFileDesc')}</p>
                  </div>
                  <button onClick={() => setMovingFile(null)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                    <X className="w-6 h-6 text-slate-400" />
                  </button>
                </div>

                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                  {folders.length === 0 ? (
                    <div className="text-center py-8 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                      <p className="text-sm text-slate-500">{t('noFolders')}</p>
                    </div>
                  ) : (
                    folders.map((folder, index) => (
                      <button
                        key={`move-folder-${folder.id}-${index}`}
                        onClick={() => moveFile(movingFile.id, folder.id)}
                        disabled={folder.id === movingFile.folderId}
                        className={cn(
                          "w-full flex items-center gap-4 p-4 rounded-2xl transition-all border-2 text-left",
                          folder.id === movingFile.folderId
                            ? "bg-slate-50 border-slate-100 opacity-50 cursor-not-allowed"
                            : "bg-white border-transparent hover:border-indigo-500 hover:bg-indigo-50/30"
                        )}
                      >
                        <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-xl">
                          {folder.icon || '📁'}
                        </div>
                        <div className="flex-1 overflow-hidden">
                          <p className="font-bold text-slate-800 truncate">{folder.name}</p>
                          <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">
                            {folder.id === movingFile.folderId ? t('currentFolder') : t('moveToHere')}
                          </p>
                        </div>
                        {folder.isLocked && <Lock className="w-4 h-4 text-amber-500" />}
                      </button>
                    ))
                  )}
                </div>

                <div className="mt-8">
                  <button 
                    onClick={() => setMovingFile(null)}
                    className="w-full py-4 bg-slate-100 text-slate-600 font-bold rounded-2xl hover:bg-slate-200 transition-all"
                  >
                    {t('cancel')}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
              <h3 className="text-xl font-bold text-slate-900 mb-2">{t('newFolder')}</h3>
              {activeFolderId && (
                <p className="text-xs text-slate-500 mb-6 flex items-center gap-1">
                  <FolderIcon className="w-3 h-3" />
                  {t('subfolders')} {t('in')} <span className="font-bold text-indigo-600">{currentFolder?.name}</span>
                </p>
              )}
              {!activeFolderId && <div className="mb-6" />}
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-400 mb-2 tracking-widest">{t('folderName')}</label>
                  <input 
                    type="text" 
                    placeholder={t('folderName')}
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-500 outline-none transition-all"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-400 mb-2 tracking-widest">{t('password')} ({t('optional')})</label>
                  <div className="relative">
                    <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input 
                      type="password" 
                      placeholder={t('password')}
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
                  {t('cancel')}
                </button>
                <button 
                  onClick={handleAddFolder}
                  className="flex-1 py-3 bg-indigo-600 text-white font-bold text-sm rounded-2xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
                >
                  {t('create')}
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
                <h3 className="text-xl font-bold text-slate-900">{t('lockFolder')}</h3>
              </div>
              
              <p className="text-sm text-slate-500 mb-6 font-medium">"{showLockFolder.name}" {t('lockFolderDesc')}</p>
              
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase text-slate-400 font-bold tracking-wider ml-1">{t('password')}</label>
                  <input 
                    type="password" 
                    placeholder={t('password')}
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
                    {t('cancel')}
                  </button>
                  <button 
                    onClick={handleSetFolderLock}
                    disabled={!folderPassword}
                    className="flex-1 py-3 bg-indigo-600 text-white font-bold text-sm rounded-2xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 disabled:opacity-50"
                  >
                    {t('lock')}
                  </button>
                </div>

                {isMobile && (
                  <button
                    onClick={() => toggleBiometricForFolder(showLockFolder.id)}
                    className={cn(
                      "w-full mt-4 flex items-center justify-center gap-2 p-3 rounded-2xl border-2 transition-all text-xs font-bold",
                      biometricEnabledFolders.includes(showLockFolder.id)
                        ? "bg-emerald-50 border-emerald-200 text-emerald-600"
                        : "bg-slate-50 border-slate-100 text-slate-500 hover:border-indigo-200"
                    )}
                  >
                    <Fingerprint className="w-4 h-4" />
                    {biometricEnabledFolders.includes(showLockFolder.id) ? t('biometricEnabled') : t('enableBiometric')}
                  </button>
                )}
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
                <h3 className="text-xl font-bold text-slate-900">{t('uploadFile')}</h3>
              </div>
              
              <div className="space-y-6">
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-200 rounded-3xl p-10 text-center hover:bg-slate-50 cursor-pointer transition-all group"
                >
                  <input type="file" className="hidden" ref={fileInputRef} onChange={handleFileUpload} multiple />
                  <div className="w-12 h-12 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                    <Plus className="w-6 h-6 text-indigo-600" />
                  </div>
                  <p className="text-sm font-bold text-slate-700">{t('clickToUpload')}</p>
                  <p className="text-xs text-slate-400 mt-1">{t('dragAndDrop')}</p>
                </div>

                <button 
                  onClick={() => setShowUpload(false)}
                  className="w-full py-3 text-slate-400 font-bold text-sm hover:text-slate-600 transition-all"
                >
                  {t('close')}
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Delete Folder Password Modal */}
        <AnimatePresence>
          {showDeleteFolder && (
            <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-white w-full max-w-sm p-8 rounded-[32px] shadow-2xl text-center"
              >
                <div className="w-16 h-16 bg-rose-50 rounded-3xl flex items-center justify-center mx-auto mb-6">
                  <Trash2 className="w-8 h-8 text-rose-600" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">{t('delete')} "{showDeleteFolder.name}"</h3>
                <p className="text-sm text-slate-500 mb-8">{t('enterPasswordToDelete')}</p>
                
                <input 
                  type="password" 
                  placeholder={t('password')}
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl mb-4 text-center tracking-widest focus:border-indigo-500 outline-none transition-all"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && deleteFolder(showDeleteFolder.id, deletePassword)}
                />
                
                {deleteError && <p className="text-rose-500 text-xs mb-4 flex items-center justify-center gap-1"><AlertCircle className="w-3 h-3" /> {t('wrongPassword')}</p>}
                
                <div className="flex gap-3">
                  <button 
                    onClick={() => setShowDeleteFolder(null)}
                    className="flex-1 py-4 bg-slate-100 text-slate-600 font-bold rounded-2xl hover:bg-slate-200 transition-all"
                  >
                    {t('cancel')}
                  </button>
                  <button 
                    onClick={() => deleteFolder(showDeleteFolder.id, deletePassword)}
                    className="flex-1 py-4 bg-rose-600 text-white font-bold rounded-2xl hover:bg-rose-700 transition-all shadow-lg shadow-rose-100"
                  >
                    {t('delete')}
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

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
              <h3 className="text-xl font-bold text-slate-900 mb-2">{t('unlockFolder')}</h3>
              <p className="text-sm text-slate-500 mb-8">"{showUnlock.name}" {t('unlockFolderDesc')}</p>
              
              <input 
                type="password" 
                placeholder={t('password')}
                value={unlockPassword}
                onChange={(e) => setUnlockPassword(e.target.value)}
                className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl mb-4 text-center tracking-widest focus:border-indigo-500 outline-none transition-all"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
              />
              
              {error && <p className="text-rose-500 text-xs mb-4 flex items-center justify-center gap-1"><AlertCircle className="w-3 h-3" /> {error}</p>}
              
              {isMobile && biometricEnabledFolders.includes(showUnlock.id) && (
                <button
                  onClick={() => handleBiometricUnlock(showUnlock)}
                  disabled={isPreviewLoading}
                  className="w-full mb-4 flex items-center justify-center gap-2 p-4 bg-emerald-50 border-2 border-emerald-100 text-emerald-600 rounded-2xl font-bold hover:bg-emerald-100 transition-all disabled:opacity-50"
                >
                  {isPreviewLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Fingerprint className="w-5 h-5" />
                  )}
                  {t('useBiometrics')}
                </button>
              )}
              
              <button 
                onClick={handleUnlock}
                className="w-full py-4 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 mb-4"
              >
                {t('unlock')}
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
                {t('forgotPassword')}
              </button>
              
              <button 
                onClick={() => setShowUnlock(null)}
                className="block w-full mt-6 text-slate-400 text-sm font-medium"
              >
                {t('cancel')}
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
                  <h3 className="text-xl font-bold text-slate-900 mb-2">{t('forgotPassword')}</h3>
                  <p className="text-sm text-slate-500 mb-8">{t('recoveryDesc')}</p>
                  
                  <div className="p-4 bg-slate-50 rounded-2xl mb-8 text-left">
                    <p className="text-[10px] text-slate-400 uppercase font-bold mb-1">{t('yourEmail')}</p>
                    <p className="text-sm font-bold text-slate-700">{user.email}</p>
                  </div>

                  {configStatus && (
                    <div className="mb-6">
                      <div className={`p-3 rounded-xl text-xs flex items-center justify-between gap-2 ${configStatus.emailConfigured ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${configStatus.emailConfigured ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                          {configStatus.emailConfigured ? (
                            <span>{t('emailConfigured')} ({configStatus.user})</span>
                          ) : (
                            <span>{t('emailNotConfigured')}</span>
                          )}
                        </div>
                        
                        <button 
                          onClick={handleTestConnection}
                          disabled={isTestingConnection}
                          className="px-2 py-1 bg-white/50 hover:bg-white rounded-lg border border-current font-bold transition-all disabled:opacity-50"
                        >
                          {isTestingConnection ? t('checking') : t('test')}
                        </button>
                      </div>
                      
                      {!configStatus.emailConfigured && (
                        <p className="mt-2 text-[10px] text-rose-500 font-medium text-left">
                          * {t('emailConfigWarning')}
                        </p>
                      )}
                    </div>
                  )}
                  
                  <button 
                    onClick={handleRecovery}
                    disabled={isSendingCode}
                    className="w-full py-4 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 mb-4 flex items-center justify-center gap-2"
                  >
                    {isSendingCode ? (
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      t('sendCode')
                    )}
                  </button>
                </>
              )}

              {recoveryStep === 'verify' && (
                <>
                  <div className="w-16 h-16 bg-amber-50 rounded-3xl flex items-center justify-center mx-auto mb-6">
                    <Key className="w-8 h-8 text-amber-600" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">{t('verify')}</h3>
                  <p className="text-sm text-slate-500 mb-8">{t('verifyCodeDesc')}</p>
                  
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
                    {t('verify')}
                  </button>
                </>
              )}

              {recoveryStep === 'reset' && (
                <>
                  <div className="w-16 h-16 bg-emerald-50 rounded-3xl flex items-center justify-center mx-auto mb-6">
                    <Lock className="w-8 h-8 text-emerald-600" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">{t('resetPassword')}</h3>
                  <p className="text-sm text-slate-500 mb-8">{t('resetPasswordDesc')}</p>
                  
                  <input 
                    type="password" 
                    placeholder={t('password')}
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
                    {t('save')}
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
                {t('cancel')}
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
              
              <div className="bg-white p-2 rounded-3xl shadow-2xl overflow-hidden flex items-center justify-center w-full min-h-[50vh]">
                {showPreview.type.includes('image') ? (
                  <img 
                    src={showPreview.dataUrl} 
                    alt={showPreview.name} 
                    className="max-w-full max-h-[70vh] object-contain rounded-2xl"
                    referrerPolicy="no-referrer"
                  />
                ) : showPreview.type.includes('pdf') ? (
                  <iframe 
                    src={pdfUrl || showPreview.dataUrl} 
                    title={showPreview.name}
                    className="w-full h-[70vh] rounded-2xl border-none"
                  />
                ) : (
                  <div className="p-10 text-center">
                    <FileIcon className="w-20 h-20 text-slate-200 mx-auto mb-4" />
                    <p className="text-slate-500">{t('noPreview')}</p>
                  </div>
                )}
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
                    {t('download')}
                  </button>
                  <button 
                    onClick={() => setShowPreview(null)}
                    className="px-8 py-3 bg-white/10 text-white font-bold rounded-2xl hover:bg-white/20 transition-all"
                  >
                    {t('close')}
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
            {isPreviewLoading ? t('loadingPreview') : t('processing')}
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
