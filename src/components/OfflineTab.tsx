import React, { useState, useEffect } from 'react';
import { Laptop, Play, Square, Sparkles, AlertCircle, Globe, Search, Volume2 } from 'lucide-react';
import { GeneratedAudioItem } from '../types';
import { AudioPlayer } from './AudioPlayer';
import { SavedVoiceProfile, saveVoiceProfile } from '../utils/voiceProfileStorage';

interface OfflineTabProps {
  onAudioGenerated: (item: GeneratedAudioItem) => void;
}

export const OfflineTab: React.FC<OfflineTabProps> = ({ onAudioGenerated }) => {
  const [browserVoices, setBrowserVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceUri, setSelectedVoiceUri] = useState<string>('');
  const [langFilter, setLangFilter] = useState<'all' | 'vi' | 'en'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [rate, setRate] = useState<number>(1.0);
  const [text, setText] = useState<string>(
    'Chào mừng bạn đến với công cụ chuyển văn bản thành giọng nói Tiếng Việt và Đa Ngôn Ngữ hoàn toàn miễn phí!'
  );
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [currentAudioUrl, setCurrentAudioUrl] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSavedAsModel, setIsSavedAsModel] = useState<boolean>(false);

  // Handle Save Offline result as Voice Model
  const handleSaveResultAsVoiceModel = async () => {
    if (!currentAudioUrl) return;
    try {
      const res = await fetch(currentAudioUrl);
      const blob = await res.blob();
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      const selected = browserVoices.find((v) => v.voiceURI === selectedVoiceUri);
      const voiceName = `Offline (${selected?.name || 'Local'}) - ${new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`;

      const newProfile: SavedVoiceProfile = {
        id: `voice_off_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        name: voiceName,
        createdAt: Date.now(),
        fileName: `${voiceName}.mp3`,
        fileSizeFormatted: `${Math.round(base64.length / 1024)} KB`,
        duration: 5,
        isVideo: false,
        base64,
        refText: text.trim().slice(0, 150),
      };

      await saveVoiceProfile(newProfile);
      setIsSavedAsModel(true);
      setStatusMessage(`Đã lưu âm thanh vào Kho Giọng Mẫu ("${voiceName}")!`);
    } catch (err: any) {
      setErrorMessage('Lỗi khi lưu giọng mẫu: ' + (err.message || 'Lỗi IndexedDB'));
    }
  };

  // Load all available system voices (Vietnamese, English, Multilingual)
  useEffect(() => {
    const loadVoices = () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        const voices = window.speechSynthesis.getVoices();
        setBrowserVoices(voices);

        if (voices.length > 0) {
          // Default to Vietnamese if exists, otherwise first voice
          const vnVoice = voices.find((v) => v.lang.toLowerCase().includes('vi'));
          if (vnVoice) {
            setSelectedVoiceUri(vnVoice.voiceURI);
          } else {
            setSelectedVoiceUri(voices[0].voiceURI);
          }
        }
      }
    };

    loadVoices();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, []);

  const handleStop = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      setStatusMessage('Đã dừng phát.');
    }
  };

  const handleSpeak = async () => {
    const inputText = text.trim();
    if (!inputText) {
      setErrorMessage('Vui lòng nhập nội dung văn bản cần đọc!');
      return;
    }

    setErrorMessage(null);
    setStatusMessage(null);

    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setErrorMessage('Trình duyệt của bạn không hỗ trợ Web Speech API.');
      return;
    }

    window.speechSynthesis.cancel();
    setIsSpeaking(true);
    setStatusMessage('Đang phát giọng đọc qua loa...');

    const utterance = new SpeechSynthesisUtterance(inputText);
    utterance.rate = rate;

    const selected = browserVoices.find((v) => v.voiceURI === selectedVoiceUri);
    if (selected) {
      utterance.voice = selected;
    }

    utterance.onend = () => {
      setIsSpeaking(false);
      setStatusMessage('Đã đọc xong toàn bộ văn bản!');
    };

    utterance.onerror = (e) => {
      console.warn('SpeechSynthesis error:', e);
      setIsSpeaking(false);
      setStatusMessage('Đã dừng phát âm thanh.');
    };

    window.speechSynthesis.speak(utterance);

    // Stream link
    const targetLang = selected?.lang?.toLowerCase().includes('vi') ? 'vi' : 'en';
    const encText = encodeURIComponent(inputText);
    const audioStream = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encText}&tl=${targetLang}&client=tw-ob`;
    setCurrentAudioUrl(audioStream);

    const voiceName = selected ? `${selected.name} (${selected.lang})` : 'Giọng Thiết Bị';
    onAudioGenerated({
      id: `local_${Date.now()}`,
      title: inputText.slice(0, 40) + (inputText.length > 40 ? '...' : ''),
      text: inputText,
      audioUrl: audioStream,
      provider: `Offline (${voiceName})`,
      createdAt: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      cost: 0,
    });
  };

  // Filter voices by language and search query
  const filteredVoices = browserVoices.filter((v) => {
    const lang = v.lang.toLowerCase();
    const name = v.name.toLowerCase();
    const matchesLang =
      langFilter === 'all' ||
      (langFilter === 'vi' && lang.includes('vi')) ||
      (langFilter === 'en' && lang.includes('en'));

    const matchesSearch =
      !searchQuery.trim() ||
      name.includes(searchQuery.toLowerCase()) ||
      lang.includes(searchQuery.toLowerCase());

    return matchesLang && matchesSearch;
  });

  const vnCount = browserVoices.filter((v) => v.lang.toLowerCase().includes('vi')).length;
  const enCount = browserVoices.filter((v) => v.lang.toLowerCase().includes('en')).length;

  return (
    <div className="space-y-6">
      {/* Overview Banner */}
      <div className="bg-gradient-to-r from-emerald-900/30 via-teal-900/20 to-slate-900/40 border border-emerald-500/20 rounded-2xl p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Laptop className="w-4 h-4 text-emerald-400" />
              <h2 className="text-base font-bold text-slate-100">
                Chế Độ Phát Giọng Nói Thiết Bị (Local Speech)
              </h2>
            </div>
            <p className="text-xs text-slate-400">
              Tổng hợp giọng đọc trực tiếp trên trình duyệt & hệ điều hành (Tiếng Việt, Tiếng Anh và đa ngôn ngữ) — 0 credit, phát ngay tức thì.
            </p>
          </div>

          <div className="px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 rounded-xl text-xs font-semibold flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Miễn Phí 100% ({browserVoices.length} giọng)</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Config & Voice List */}
        <div className="lg:col-span-5 space-y-5">
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-emerald-400" />
                <span>Danh Sách Giọng Có Sẵn</span>
              </h3>
              <span className="text-[11px] text-slate-500 font-mono">
                {filteredVoices.length}/{browserVoices.length} giọng
              </span>
            </div>

            {/* Language Tabs */}
            <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-950 border border-slate-800 rounded-xl text-xs font-semibold">
              <button
                type="button"
                onClick={() => setLangFilter('all')}
                className={`py-1.5 rounded-lg transition text-center ${
                  langFilter === 'all'
                    ? 'bg-slate-800 text-slate-100 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Tất cả ({browserVoices.length})
              </button>
              <button
                type="button"
                onClick={() => setLangFilter('vi')}
                className={`py-1.5 rounded-lg transition text-center ${
                  langFilter === 'vi'
                    ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                🇻🇳 Tiếng Việt ({vnCount})
              </button>
              <button
                type="button"
                onClick={() => setLangFilter('en')}
                className={`py-1.5 rounded-lg transition text-center ${
                  langFilter === 'en'
                    ? 'bg-blue-950/60 text-blue-300 border border-blue-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                🇺🇸 Tiếng Anh ({enCount})
              </button>
            </div>

            {/* Search Box */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm tên giọng hoặc mã ngôn ngữ..."
                className="w-full pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500"
              />
            </div>

            {/* Voice Dropdown */}
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Chọn Giọng Đọc
              </label>
              <select
                value={selectedVoiceUri}
                onChange={(e) => setSelectedVoiceUri(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              >
                {filteredVoices.map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>
                    {v.name} — [{v.lang}] {v.default ? '★ Mặc định' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Speed Slider */}
            <div className="pt-3 border-t border-slate-800/80 space-y-3">
              <div>
                <div className="flex justify-between text-xs text-slate-400 mb-1">
                  <span>Tốc độ đọc (Speed)</span>
                  <span className="font-mono text-emerald-400">{rate}x</span>
                </div>
                <input
                  type="range"
                  min={0.5}
                  max={2.0}
                  step={0.1}
                  value={rate}
                  onChange={(e) => setRate(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                />
              </div>
            </div>

            <div className="p-3 bg-slate-950 border border-slate-800/80 rounded-xl text-[11px] text-slate-400 leading-relaxed">
              💡 <span className="text-slate-300 font-semibold">Cần giọng AI Studio cảm xúc cao (ElevenLabs, MiniMax)?</span> Hãy chuyển sang tab <span className="text-cyan-400 font-medium">Online (GenMax)</span> để sử dụng kho giọng AI trực tuyến.
            </div>
          </div>
        </div>

        {/* Right Column: Input & Playback */}
        <div className="lg:col-span-7 space-y-5">
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              ✍️ Nhập Văn Bản Cần Đọc
            </h3>

            <textarea
              rows={7}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Nhập văn bản cần đọc (hỗ trợ Tiếng Việt, Tiếng Anh...)..."
              className="w-full p-4 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500 resize-y leading-relaxed"
            />

            {errorMessage && (
              <div className="p-3 bg-red-950/40 border border-red-500/30 rounded-xl text-xs text-red-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {statusMessage && (
              <div className="p-3 bg-emerald-950/30 border border-emerald-500/20 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span>{statusMessage}</span>
              </div>
            )}

            {/* Buttons */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleSpeak}
                disabled={isSpeaking}
                className="flex-1 py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-sm rounded-xl shadow-lg shadow-emerald-500/20 transition flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>{isSpeaking ? 'Đang Đọc Văn Bản...' : '🔊 Bắt Đầu Đọc'}</span>
              </button>

              {isSpeaking && (
                <button
                  type="button"
                  onClick={handleStop}
                  className="px-4 py-3.5 bg-red-600 hover:bg-red-500 text-white font-semibold text-sm rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Square className="w-4 h-4 fill-current" />
                  <span>Dừng</span>
                </button>
              )}
            </div>
          </div>

          {/* Player */}
          {currentAudioUrl && (
            <AudioPlayer
              src={currentAudioUrl}
              title="Âm thanh Offline (Giọng Máy)"
              onSaveAsVoiceModel={handleSaveResultAsVoiceModel}
              isSavedAsModel={isSavedAsModel}
            />
          )}
        </div>
      </div>
    </div>
  );
};
