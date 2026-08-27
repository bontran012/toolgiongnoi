import React, { useState } from 'react';
import {
  Bookmark,
  BookmarkPlus,
  Trash2,
  Play,
  Pause,
  Check,
  Music,
  Video,
  Clock,
  Sparkles,
  Volume2,
} from 'lucide-react';
import { SavedVoiceProfile } from '../utils/voiceProfileStorage';

interface VoiceProfileManagerProps {
  savedVoices: SavedVoiceProfile[];
  currentVoiceId: string | null;
  onSelectVoice: (voice: SavedVoiceProfile) => void;
  onSaveCurrentVoice: (name: string) => Promise<void>;
  onDeleteVoice: (id: string) => Promise<void>;
  canSaveCurrent: boolean;
  isSaving: boolean;
}

export const VoiceProfileManager: React.FC<VoiceProfileManagerProps> = ({
  savedVoices,
  currentVoiceId,
  onSelectVoice,
  onSaveCurrentVoice,
  onDeleteVoice,
  canSaveCurrent,
  isSaving,
}) => {
  const [showSaveModal, setShowSaveModal] = useState<boolean>(false);
  const [newVoiceName, setNewVoiceName] = useState<string>('');
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);

  const handlePlayVoice = (voice: SavedVoiceProfile, e: React.MouseEvent) => {
    e.stopPropagation();

    if (playingVoiceId === voice.id && audioElement) {
      audioElement.pause();
      setPlayingVoiceId(null);
      return;
    }

    if (audioElement) {
      audioElement.pause();
    }

    // Play base64 audio
    const audio = new Audio(voice.base64);
    audio.onended = () => setPlayingVoiceId(null);
    audio.onerror = () => setPlayingVoiceId(null);
    audio.play();
    setAudioElement(audio);
    setPlayingVoiceId(voice.id);
  };

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleConfirmSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVoiceName.trim()) return;
    await onSaveCurrentVoice(newVoiceName.trim());
    setNewVoiceName('');
    setShowSaveModal(false);
  };

  const handleConfirmDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await onDeleteVoice(id);
      setConfirmDeleteId(null);
    } catch (err) {
      console.error('Lỗi khi xóa:', err);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Bookmark className="w-3.5 h-3.5 text-purple-400" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
            Kho Giọng Đã Lưu ({savedVoices.length})
          </span>
        </div>

        {canSaveCurrent && (
          <button
            type="button"
            onClick={() => {
              setNewVoiceName(`Giọng ${savedVoices.length + 1}`);
              setShowSaveModal(true);
            }}
            disabled={isSaving}
            className="px-2.5 py-1 bg-purple-600/30 hover:bg-purple-600/50 border border-purple-500/40 text-purple-300 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition shadow-sm cursor-pointer"
            title="Lưu file âm thanh/video mẫu hiện tại vào kho để lần sau dùng lại không cần tải lên"
          >
            <BookmarkPlus className="w-3.5 h-3.5 text-purple-400" />
            <span>Lưu Giọng Này</span>
          </button>
        )}
      </div>

      {/* Save Modal */}
      {showSaveModal && (
        <div className="p-3 bg-purple-950/70 border border-purple-500/50 rounded-xl space-y-2.5 animate-fadeIn">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-purple-200 flex items-center gap-1">
              <BookmarkPlus className="w-3.5 h-3.5 text-purple-400" />
              Đặt tên để lưu giọng mẫu vào máy
            </span>
            <button
              type="button"
              onClick={() => setShowSaveModal(false)}
              className="text-slate-400 hover:text-slate-200 text-xs px-1"
            >
              ✕
            </button>
          </div>
          <form onSubmit={handleConfirmSave} className="flex gap-2">
            <input
              type="text"
              value={newVoiceName}
              onChange={(e) => setNewVoiceName(e.target.value)}
              placeholder="VD: Giọng MC Nam Miền Nam, Giọng Review Phim..."
              autoFocus
              className="flex-1 px-3 py-1.5 bg-slate-950 border border-purple-500/40 rounded-lg text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-purple-400"
            />
            <button
              type="submit"
              disabled={isSaving || !newVoiceName.trim()}
              className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-1 shrink-0 transition"
            >
              <Check className="w-3 h-3" />
              <span>Lưu</span>
            </button>
          </form>
          <p className="text-[10px] text-slate-400">
            Giọng mẫu và phụ đề đi kèm sẽ được lưu vĩnh viễn trong bộ nhớ máy của bạn.
          </p>
        </div>
      )}

      {/* List of Saved Voices */}
      {savedVoices.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
          {savedVoices.map((voice) => {
            const isSelected = currentVoiceId === voice.id;
            const isPlaying = playingVoiceId === voice.id;

            return (
              <div
                key={voice.id}
                onClick={() => onSelectVoice(voice)}
                className={`p-2.5 rounded-xl border transition cursor-pointer flex items-center justify-between gap-2 text-left group ${
                  isSelected
                    ? 'bg-purple-950/80 border-purple-500 ring-1 ring-purple-500/50 shadow-md shadow-purple-950/40'
                    : 'bg-slate-950/80 hover:bg-slate-900 border-slate-800/80 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={(e) => handlePlayVoice(voice, e)}
                    className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition ${
                      isPlaying
                        ? 'bg-purple-600 text-white animate-pulse'
                        : isSelected
                        ? 'bg-purple-900/60 text-purple-300 hover:bg-purple-700'
                        : 'bg-slate-800 text-slate-400 hover:text-slate-200 group-hover:bg-slate-700'
                    }`}
                    title={isPlaying ? 'Tạm dừng' : 'Nghe thử giọng mẫu'}
                  >
                    {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-current ml-0.5" />}
                  </button>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-xs font-semibold truncate ${isSelected ? 'text-purple-200 font-bold' : 'text-slate-200'}`}>
                        {voice.name}
                      </span>
                      {isSelected && (
                        <span className="shrink-0 px-1.5 py-0.2 bg-purple-500 text-white rounded text-[9px] font-bold">
                          Đang chọn
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-0.5 truncate">
                      <span className="flex items-center gap-0.5">
                        {voice.isVideo ? <Video className="w-2.5 h-2.5 text-blue-400" /> : <Music className="w-2.5 h-2.5 text-purple-400" />}
                        {voice.duration ? `${Math.round(voice.duration)}s` : voice.fileSizeFormatted}
                      </span>
                      {voice.refText && (
                        <span className="truncate max-w-[120px] text-slate-400 italic">
                          "{voice.refText}"
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {confirmDeleteId === voice.id ? (
                  <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={(e) => handleConfirmDelete(voice.id, e)}
                      className="px-2 py-1 bg-red-600 hover:bg-red-500 text-white rounded-md text-[10px] font-bold transition shadow-sm"
                      title="Xác nhận xóa vĩnh viễn"
                    >
                      Xóa luôn
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDeleteId(null);
                      }}
                      className="px-1.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md text-[10px] transition"
                    >
                      Hủy
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDeleteId(voice.id);
                    }}
                    className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/20 rounded-lg transition shrink-0 cursor-pointer"
                    title="Xóa giọng này khỏi kho lưu"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="p-3 rounded-xl border border-slate-800/80 bg-slate-950/40 text-center">
          <p className="text-[11px] text-slate-400">
            💡 Bạn chưa lưu giọng mẫu nào. Hãy tải lên 1 video/audio và bấm <b>"Lưu Giọng Này"</b> để tái sử dụng ngay trong các lần sau!
          </p>
        </div>
      )}
    </div>
  );
};
