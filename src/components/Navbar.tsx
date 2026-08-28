import React from 'react';
import { Mic, Key, History, Sparkles, Cpu, Cloud, Laptop } from 'lucide-react';
import { KeyItem } from '../types';

interface NavbarProps {
  activeTab: 'online' | 'offline' | 'colab';
  setActiveTab: (tab: 'online' | 'offline' | 'colab') => void;
  keys: KeyItem[];
  selectedKey: string;
  onOpenKeyManager: () => void;
  onToggleHistory: () => void;
  historyCount: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  keys,
  selectedKey,
  onOpenKeyManager,
  onToggleHistory,
  historyCount,
}) => {
  const currentKeyItem = keys.find((k) => k.key === selectedKey);

  return (
    <header className="sticky top-0 z-40 bg-slate-950/80 border-b border-slate-800/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          {/* Logo */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white shadow-lg shadow-blue-500/25">
              <Mic className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-base sm:text-lg text-slate-100 tracking-tight">
                  Tool Giọng Nói
                </span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-full">
                  PRO
                </span>
              </div>
              <p className="text-[11px] text-slate-400 hidden sm:block">
                Studio Lồng Tiếng & Chuyển Văn Bản Thành Giọng Nói AI
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex items-center space-x-1 bg-slate-900/90 p-1 rounded-xl border border-slate-800/80">
            <button
              id="tab-online"
              onClick={() => setActiveTab('online')}
              className={`flex items-center gap-2 px-3 sm:px-4 py-1.5 rounded-lg text-xs font-medium transition ${
                activeTab === 'online'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Cloud className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Online (ElevenLabs/GenMax)</span>
              <span className="sm:hidden">Online</span>
            </button>

            <button
              id="tab-offline"
              onClick={() => setActiveTab('offline')}
              className={`flex items-center gap-2 px-3 sm:px-4 py-1.5 rounded-lg text-xs font-medium transition ${
                activeTab === 'offline'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Laptop className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Offline (Local)</span>
              <span className="sm:hidden">Local</span>
            </button>

            <button
              id="tab-colab"
              onClick={() => setActiveTab('colab')}
              className={`flex items-center gap-2 px-3 sm:px-4 py-1.5 rounded-lg text-xs font-medium transition ${
                activeTab === 'colab'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Colab GPU</span>
              <span className="sm:hidden">Colab</span>
            </button>
          </nav>

          {/* Right Actions */}
          <div className="flex items-center space-x-2">
            {/* Key Manager pill */}
            <button
              id="btn-open-key-manager"
              onClick={onOpenKeyManager}
              className="flex items-center space-x-2 px-3 py-1.5 bg-slate-900 hover:bg-slate-800/90 border border-slate-800 rounded-xl text-xs text-slate-300 transition group"
              title="Quản lý API Key ElevenLabs / GenMax"
            >
              <Key className="w-3.5 h-3.5 text-blue-400 group-hover:scale-110 transition-transform" />
              <div className="text-left hidden md:block">
                <div className="flex items-center gap-1 font-semibold leading-tight text-slate-200 truncate max-w-[140px]">
                  <span className="truncate">{currentKeyItem?.name || 'Chưa chọn Key'}</span>
                  {currentKeyItem?.source && (
                    <span className="text-[9px] px-1 py-0.2 rounded bg-slate-800 text-slate-400">
                      {currentKeyItem.source === 'elevenlabs' ? 'EL' : 'GM'}
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                  {currentKeyItem && currentKeyItem.balance !== -1 ? (
                    <span>{currentKeyItem.balance.toLocaleString()} Cre</span>
                  ) : keys.length > 0 ? (
                    <span>Có API Key</span>
                  ) : (
                    <span>Thêm Key</span>
                  )}
                </div>
              </div>
            </button>

            {/* History Toggle */}
            <button
              id="btn-toggle-history"
              onClick={onToggleHistory}
              className="relative p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-slate-300 transition"
              title="Lịch sử tạo âm thanh"
            >
              <History className="w-4 h-4 text-slate-400" />
              {historyCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {historyCount > 9 ? '9+' : historyCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
