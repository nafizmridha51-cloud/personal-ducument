
import React, { useState, useEffect, useRef } from 'react';
import { FOLDERS, FOLDER_PASSWORDS } from './constants.tsx';
import { Category, FileData } from './types';
import { analyzeDocument } from './services/geminiService';

const App: React.FC = () => {
  const [activeCategory, setActiveCategory] = useState<Category | null>(null);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [files, setFiles] = useState<FileData[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load files from local storage on mount
  useEffect(() => {
    const savedFiles = localStorage.getItem('vault_files');
    if (savedFiles) {
      setFiles(JSON.parse(savedFiles));
    }
  }, []);

  // Save files to local storage when changed
  useEffect(() => {
    localStorage.setItem('vault_files', JSON.stringify(files));
  }, [files]);

  const handleFolderClick = (category: Category) => {
    setActiveCategory(category);
    setIsUnlocked(false);
    setPasswordInput('');
    setError('');
  };

  const handleUnlock = () => {
    if (activeCategory && passwordInput === FOLDER_PASSWORDS[activeCategory]) {
      setIsUnlocked(true);
      setError('');
    } else {
      setError('ভুল পাসওয়ার্ড! আবার চেষ্টা করুন।');
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !activeCategory) return;

    setIsUploading(true);
    const reader = new FileReader();
    
    reader.onload = async (e) => {
      const base64Data = e.target?.result as string;
      
      const newFile: FileData = {
        id: Math.random().toString(36).substr(2, 9),
        name: file.name,
        type: file.type,
        size: (file.size / 1024).toFixed(2) + ' KB',
        category: activeCategory,
        uploadDate: new Date().toLocaleDateString('bn-BD'),
        dataUrl: base64Data
      };

      setFiles(prev => [...prev, newFile]);
      setIsUploading(false);
    };

    reader.readAsDataURL(file);
  };

  const deleteFile = (id: string) => {
    if (confirm('আপনি কি এই নথিটি মুছে ফেলতে চান?')) {
      setFiles(prev => prev.filter(f => f.id !== id));
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

  const currentFolderFiles = files.filter(f => f.category === activeCategory);

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="w-full md:w-80 bg-slate-900 text-white p-6 flex flex-col border-r border-slate-700">
        <div className="flex items-center gap-3 mb-10">
          <div className="bg-indigo-600 p-2 rounded-lg text-2xl">🔒</div>
          <h1 className="text-xl font-bold tracking-tight">নথি ভল্ট</h1>
        </div>

        <nav className="space-y-4 flex-1">
          <p className="text-xs uppercase text-slate-500 font-bold mb-2">ফোল্ডার সমূহ</p>
          {FOLDERS.map((folder) => (
            <button
              key={folder.id}
              onClick={() => handleFolderClick(folder.id)}
              className={`w-full flex items-center gap-4 p-4 rounded-xl transition-all duration-200 ${
                activeCategory === folder.id 
                  ? 'bg-slate-800 border-l-4 border-indigo-500 shadow-lg' 
                  : 'hover:bg-slate-800/50'
              }`}
            >
              <span className="text-2xl">{folder.icon}</span>
              <div className="text-left">
                <p className="font-semibold text-sm">{folder.label}</p>
                <p className="text-[10px] text-slate-400 truncate w-32">{folder.description}</p>
              </div>
            </button>
          ))}
        </nav>

        <div className="mt-10 p-4 bg-slate-800 rounded-xl">
          <p className="text-xs text-slate-400 mb-1">সুরক্ষা টিপস:</p>
          <p className="text-[11px] text-slate-300">প্রতিটি ফোল্ডারের জন্য আলাদা পাসওয়ার্ড ব্যবহার করুন। আপনার ডেটা ব্রাউজারে সংরক্ষিত থাকে।</p>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 bg-slate-50 p-4 md:p-10 overflow-y-auto">
        {!activeCategory ? (
          <div className="h-full flex flex-col items-center justify-center text-center">
            <div className="text-7xl mb-6 grayscale opacity-20">📁</div>
            <h2 className="text-2xl font-bold text-slate-400 mb-2">শুরু করতে একটি ফোল্ডার বেছে নিন</h2>
            <p className="text-slate-400 max-w-sm">আপনার ব্যক্তিগত, বাবার অথবা মায়ের নথিপত্র নিরাপদে আপলোড এবং সংরক্ষণ করুন।</p>
          </div>
        ) : !isUnlocked ? (
          <div className="max-w-md mx-auto mt-20 p-8 bg-white rounded-2xl shadow-xl border border-slate-200">
            <div className="text-center mb-6">
              <span className="text-5xl block mb-4">{FOLDERS.find(f => f.id === activeCategory)?.icon}</span>
              <h2 className="text-xl font-bold text-slate-800">{FOLDERS.find(f => f.id === activeCategory)?.label} খুলুন</h2>
              <p className="text-sm text-slate-500 mt-2">এই ফোল্ডারটি পাসওয়ার্ড দ্বারা সুরক্ষিত।</p>
            </div>
            <input
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              placeholder="পাসওয়ার্ড দিন"
              className="w-full p-4 border rounded-xl mb-4 focus:ring-2 focus:ring-indigo-500 outline-none text-center tracking-widest"
              onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
            />
            {error && <p className="text-red-500 text-xs text-center mb-4">{error}</p>}
            <button
              onClick={handleUnlock}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-xl transition-colors shadow-lg shadow-indigo-200"
            >
              ফোল্ডার আনলক করুন
            </button>
            <div className="mt-6 text-center">
              <p className="text-[10px] text-slate-400">ডেমো পাসওয়ার্ড: 
                <span className="font-mono bg-slate-100 px-1 ml-1">{FOLDER_PASSWORDS[activeCategory]}</span>
              </p>
            </div>
          </div>
        ) : (
          <div className="animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-10">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-2xl">{FOLDERS.find(f => f.id === activeCategory)?.icon}</span>
                  <h2 className="text-2xl font-bold text-slate-800">{FOLDERS.find(f => f.id === activeCategory)?.label}</h2>
                </div>
                <p className="text-slate-500 text-sm">মোট ফাইল: {currentFolderFiles.length} টি</p>
              </div>

              <div className="flex gap-2">
                <input
                  type="file"
                  className="hidden"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-indigo-100 disabled:opacity-50"
                >
                  {isUploading ? 'আপলোড হচ্ছে...' : 'নতুন নথি যোগ করুন +'}
                </button>
              </div>
            </div>

            {currentFolderFiles.length === 0 ? (
              <div className="bg-white border-2 border-dashed border-slate-200 rounded-2xl p-20 text-center">
                <p className="text-slate-400">এই ফোল্ডারে এখনো কোনো ফাইল নেই।</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {currentFolderFiles.map((file) => (
                  <div key={file.id} className="group bg-white p-5 rounded-2xl shadow-sm border border-slate-200 hover:shadow-md transition-all relative">
                    <div className="flex items-start gap-4 mb-4">
                      <div className="w-12 h-12 bg-slate-100 rounded-lg flex items-center justify-center text-2xl">
                        {file.type.includes('image') ? '🖼️' : file.type.includes('pdf') ? '📄' : '📁'}
                      </div>
                      <div className="flex-1 overflow-hidden">
                        <h3 className="font-bold text-slate-800 truncate" title={file.name}>{file.name}</h3>
                        <p className="text-[10px] text-slate-400">{file.uploadDate} • {file.size}</p>
                      </div>
                    </div>
                    
                    {file.type.includes('image') && (
                      <div className="mb-4 rounded-lg overflow-hidden h-32 bg-slate-50 border">
                        <img src={file.dataUrl} alt={file.name} className="w-full h-full object-cover" />
                      </div>
                    )}

                    <div className="flex items-center gap-2 border-t pt-4 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => downloadFile(file)}
                        className="flex-1 bg-emerald-50 text-emerald-600 py-2 rounded-lg text-xs font-bold hover:bg-emerald-100 transition-colors"
                      >
                        ডাউনলোড
                      </button>
                      <button 
                        onClick={() => deleteFile(file.id)}
                        className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Persistent Footer/Status */}
      <footer className="fixed bottom-0 right-0 p-4 pointer-events-none">
        {isUploading && (
          <div className="bg-slate-900 text-white px-4 py-2 rounded-full text-xs shadow-2xl flex items-center gap-2 animate-bounce">
            <span className="w-2 h-2 bg-indigo-500 rounded-full animate-ping"></span>
            প্রসেসিং হচ্ছে...
          </div>
        )}
      </footer>
    </div>
  );
};

export default App;
