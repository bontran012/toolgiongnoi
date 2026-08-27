import React, { useState } from 'react';
import { X, Play, Download, Trash2, History, Music, BookmarkPlus, Check } from 'lucide-react';
import { GeneratedAudioItem } from '../types';
import { SavedVoiceProfile, saveVoiceProfile } from '../utils/voiceProfileStorage';

interface HistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  history: GeneratedAudioItem[];
  onPlayItem: (audioUrl: string, title: string) => void;
  onClearHistory: () => void;
  onDeleteItem: (id: string) => void;
  onVoiceSaved?: () => void;
}

export const HistoryDrawer: React.FC<HistoryDrawerProps> = ({
  isOpen,
  onClose,
  history,
  onPlayItem,
  onClearHistory,
  onDeleteItem,
  onVoiceSaved,
}) => {
  const [savedIds, setSavedIds] = useState<Record<string, boolean>>({});

  if (!isOpen) return null;

  const handleSaveAsVoiceModel = async (item: GeneratedAudioItem) => {
    try {
      const res = await fetch(item.audioUrl);
      const blob = await res.blob();
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      const voiceName = `Giọng Mẫu (${item.title.slice(0, 20)}) - ${item.createdAt}`;
      const newProfile: SavedVoiceProfile = {
        id: `voice_hist_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        name: voiceName,
        createdAt: Date.now(),
        fileName: `${voiceName}.mp3`,
        fileSizeFormatted: `${Math.round(base64.length / 1024)} KB`,
        duration: 5,
        isVideo: false,
        base64,
        refText: item.text.slice(0, 150),
      };

      await saveVoiceProfile(newProfile);
      setSavedIds((prev) => ({ ...prev, [item.id]: true }));
      if (onVoiceSaved) onVoiceSaved();
    } catch (e) {
      console.warn('Lỗi lưu mẫu từ lịch sử:', e);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900 border-l border-slate-800 w-full max-w-md h-full flex flex-col shadow-2xl animate-slideLeft">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center space-x-2.5">
            <History className="w-5 h-5 text-blue-400" />
            <h3 className="text-sm font-bold text-slate-100">
              Lịch Sử Tạo Giọng ({history.length})
            </h3>
          </div>

          <div className="flex items-center space-x-2">
            {history.length > 0 && (
              <button
                onClick={onClearHistory}
                className="text-[11px] text-slate-400 hover:text-red-400 hover:bg-slate-800 px-2 py-1 rounded transition"
              >
                Xóa tất cả
              </button>
            )}
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {history.length === 0 ? (
            <div className="text-center py-16 text-slate-500 text-xs">
              <Music className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p>Chưa có bản ghi âm nào được tạo.</p>
              <p className="text-[11px] text-slate-600 mt-1">Các file âm thanh bạn tạo sẽ xuất hiện ở đây.</p>
            </div>
          ) : (
            history.map((item) => (
              <div
                key={item.id}
                className="p-3.5 bg-slate-950/70 border border-slate-800/90 hover:border-slate-700 rounded-xl transition space-y-2 group"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-semibold text-slate-200 line-clamp-1">
                      {item.title}
                    </h4>
                    <p className="text-[11px] text-slate-500 line-clamp-2 mt-0.5">
                      {item.text}
                    </p>
                  </div>
                  <button
                    onClick={() => onDeleteItem(item.id)}
                    className="text-slate-500 hover:text-red-400 p-1 hover:bg-red-500/10 rounded transition shrink-0 cursor-pointer"
                    title="Xóa mục này"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-800/60 text-[11px]">
                  <div className="flex items-center gap-2 text-slate-400">
                    <span className="px-1.5 py-0.5 bg-blue-500/10 text-blue-400 rounded text-[10px] font-medium">
                      {item.provider}
                    </span>
                    <span>{item.createdAt}</span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleSaveAsVoiceModel(item)}
                      disabled={savedIds[item.id]}
                      className={`p-1.5 rounded transition ${
                        savedIds[item.id]
                          ? 'text-emerald-400 bg-emerald-500/10'
                          : 'text-purple-400 hover:text-purple-300 hover:bg-purple-500/10'
                      }`}
                      title={savedIds[item.id] ? 'Đã lưu làm giọng mẫu' : 'Lưu làm giọng mẫu vào kho'}
                    >
                      {savedIds[item.id] ? (
                        <Check className="w-3.5 h-3.5" />
                      ) : (
                        <BookmarkPlus className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <button
                      onClick={() => onPlayItem(item.audioUrl, item.title)}
                      className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg flex items-center gap-1 transition text-xs font-medium"
                    >
                      <Play className="w-3 h-3 fill-current" />
                      <span>Nghe</span>
                    </button>
                    <a
                      href={item.audioUrl}
                      download={`voice_${item.id}.mp3`}
                      className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition"
                      title="Tải về"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
