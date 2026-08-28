import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { OnlineTab } from './components/OnlineTab';
import { OfflineTab } from './components/OfflineTab';
import { ColabTab } from './components/ColabTab';
import { KeyManagerModal } from './components/KeyManagerModal';
import { HistoryDrawer } from './components/HistoryDrawer';
import { KeyItem, GeneratedAudioItem } from './types';
import { getLocalKeys } from './utils/directApiFallback';

export function App() {
  const [activeTab, setActiveTab] = useState<'online' | 'offline' | 'colab'>('online');
  const [keys, setKeys] = useState<KeyItem[]>([]);
  const [selectedKey, setSelectedKey] = useState<string>('');
  const [isKeyManagerOpen, setIsKeyManagerOpen] = useState<boolean>(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState<boolean>(false);
  const [history, setHistory] = useState<GeneratedAudioItem[]>(() => {
    try {
      const saved = localStorage.getItem('tts_history');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const loadKeys = async () => {
    try {
      const res = await fetch('/api/keys');
      if (res.ok) {
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const data = await res.json();
          if (Array.isArray(data.keys)) {
            setKeys(data.keys);
            if (data.keys.length > 0 && !selectedKey) {
              setSelectedKey(data.keys[0].key);
            }
            return;
          }
        }
      }
    } catch (err) {
      console.warn('Backend /api/keys not available, using client storage:', err);
    }

    // Fallback to local storage (e.g. on Netlify / Static hosting)
    const local = getLocalKeys();
    const formatted: KeyItem[] = local.map((k) => {
      const isEleven = k.source === 'elevenlabs';
      const tag = isEleven ? '🌟 [ElevenLabs]' : '⚡ [GenMax]';
      return {
        key: k.key,
        name: k.name,
        balance: k.balance,
        email: k.email,
        source: k.source,
        tier: k.tier,
        limit: k.limit,
        used: k.used,
        status: k.status,
        label: `${tag} [${k.balance !== -1 ? k.balance.toLocaleString() : 'Kiểm tra'} Cre] ${k.name} (${k.key.slice(0, 8)}...)`,
      };
    });
    setKeys(formatted);
    if (formatted.length > 0 && !selectedKey) {
      setSelectedKey(formatted[0].key);
    }
  };

  useEffect(() => {
    loadKeys();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('tts_history', JSON.stringify(history));
    } catch (err) {
      console.warn('Failed to save history to localStorage:', err);
    }
  }, [history]);

  const handleAudioGenerated = (item: GeneratedAudioItem) => {
    setHistory((prev) => [item, ...prev]);
  };

  const handleClearHistory = () => {
    if (confirm('Bạn có chắc chắn muốn xóa toàn bộ lịch sử tạo âm thanh?')) {
      setHistory([]);
    }
  };

  const handleDeleteHistoryItem = (id: string) => {
    setHistory((prev) => prev.filter((item) => item.id !== id));
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Navbar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        keys={keys}
        selectedKey={selectedKey}
        onOpenKeyManager={() => setIsKeyManagerOpen(true)}
        onToggleHistory={() => setIsHistoryOpen(!isHistoryOpen)}
        historyCount={history.length}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'online' && (
          <OnlineTab
            keys={keys}
            selectedKey={selectedKey}
            onSelectKey={setSelectedKey}
            onOpenKeyManager={() => setIsKeyManagerOpen(true)}
            onAudioGenerated={handleAudioGenerated}
            onKeysUpdated={loadKeys}
          />
        )}

        {activeTab === 'offline' && (
          <OfflineTab onAudioGenerated={handleAudioGenerated} />
        )}

        {activeTab === 'colab' && (
          <ColabTab onAudioGenerated={handleAudioGenerated} />
        )}
      </main>

      {/* Modals & Drawers */}
      <KeyManagerModal
        isOpen={isKeyManagerOpen}
        onClose={() => setIsKeyManagerOpen(false)}
        keys={keys}
        selectedKey={selectedKey}
        onSelectKey={setSelectedKey}
        onKeysUpdated={loadKeys}
      />

      <HistoryDrawer
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        history={history}
        onPlayItem={(url) => {
          // Play preview
          const audio = new Audio(url);
          audio.play().catch(console.warn);
        }}
        onClearHistory={handleClearHistory}
        onDeleteItem={handleDeleteHistoryItem}
      />

      {/* Footer */}
      <footer className="py-4 border-t border-slate-900 text-center text-xs text-slate-500">
        Tool Giọng Nói Chuyên Nghiệp • GenMax, ElevenLabs, MiniMax & Edge TTS Studio
      </footer>
    </div>
  );
}

export default App;
