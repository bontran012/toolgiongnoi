import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  RefreshCw,
  Sliders,
  Play,
  RotateCcw,
  Volume2,
  Zap,
  Info,
  CheckCircle,
  AlertCircle,
  FileText,
  HelpCircle,
  Square,
} from 'lucide-react';
import { KeyItem, ProviderType, VoiceOption, ModelOption, VoiceSettings, GeneratedAudioItem } from '../types';
import { AudioPlayer } from './AudioPlayer';
import { fetchDirectGenMaxData, generateDirectGenMaxTts } from '../utils/directApiFallback';
import { SavedVoiceProfile, saveVoiceProfile } from '../utils/voiceProfileStorage';

interface OnlineTabProps {
  keys: KeyItem[];
  selectedKey: string;
  onSelectKey: (key: string) => void;
  onOpenKeyManager: () => void;
  onAudioGenerated: (item: GeneratedAudioItem) => void;
}

const SAMPLE_TEXTS = [
  {
    title: 'Lời chào AI',
    text: 'Xin chào quý vị và các bạn! Chào mừng mọi người đã quay trở lại với kênh của chúng tôi. Hãy bấm like và đăng ký theo dõi nhé.',
  },
  {
    title: 'Bản tin ngắn',
    text: 'Hôm nay, thị trường công nghệ chứng kiến bước đột phá mới của trí tuệ nhân tạo thế hệ tiếp theo, mang lại trải nghiệm âm thanh cực kỳ tự nhiên.',
  },
  {
    title: 'Kể chuyện truyền cảm',
    text: 'Đêm đã về khuya, không gian bỗng trở nên tĩnh lặng. Những vì sao lấp lánh như đang thì thầm kể lại những câu chuyện từ ngàn xưa.',
  },
  {
    title: 'Review sản phẩm',
    text: 'Chiếc tai nghe này sở hữu chất âm chi tiết, dải bass sâu và khả năng chống ồn chủ động vượt trội trong phân khúc giá.',
  },
];

export const OnlineTab: React.FC<OnlineTabProps> = ({
  keys,
  selectedKey,
  onSelectKey,
  onOpenKeyManager,
  onAudioGenerated,
}) => {
  const [provider, setProvider] = useState<ProviderType>('ElevenLabs');
  const [models, setModels] = useState<ModelOption[]>([]);
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [selectedVoice, setSelectedVoice] = useState<string>('');

  const [text, setText] = useState<string>('');
  const [settings, setSettings] = useState<VoiceSettings>({
    stability: 0.5,
    similarityBoost: 0.75,
    style: 0.0,
    speed: 1.0,
    pitch: 0,
  });

  const [isLoadingVoices, setIsLoadingVoices] = useState<boolean>(false);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [progressMsg, setProgressMsg] = useState<string>('');
  const [currentAudioUrl, setCurrentAudioUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSavedAsModel, setIsSavedAsModel] = useState<boolean>(false);

  // AbortController for cancel
  const abortControllerRef = useRef<AbortController | null>(null);

  const currentKeyItem = keys.find((k) => k.key === selectedKey) || (keys.length > 0 ? keys[0] : null);

  // Fetch models and voices when key or provider changes
  const fetchVoicesAndModels = async (keyToUse?: string, provToUse?: ProviderType) => {
    const k = keyToUse || selectedKey;
    const p = provToUse || provider;
    if (!k) return;

    setIsLoadingVoices(true);
    setErrorMessage(null);

    let loaded = false;
    try {
      const res = await fetch(`/api/genmax/data?apiKey=${encodeURIComponent(k)}&provider=${p}`);
      if (res.ok) {
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const data = await res.json();
          if (data.models && data.models.length > 0) {
            setModels(data.models);
            setSelectedModel(data.models[0].id);
          }
          if (data.voices && data.voices.length > 0) {
            setVoices(data.voices);
            setSelectedVoice(data.voices[0].id);
          }
          loaded = true;
        }
      }
    } catch {
      // Backend not available (e.g. on Netlify)
    }

    if (!loaded) {
      try {
        const directData = await fetchDirectGenMaxData(k, p);
        setModels(directData.models);
        setVoices(directData.voices);
        if (directData.models.length > 0) setSelectedModel(directData.models[0].id);
        if (directData.voices.length > 0) setSelectedVoice(directData.voices[0].id);
      } catch (err: any) {
        console.warn('Fetch voices fallback:', err);
      }
    }

    setIsLoadingVoices(false);
  };

  useEffect(() => {
    if (selectedKey) {
      fetchVoicesAndModels(selectedKey, provider);
    }
  }, [selectedKey, provider]);

  // Handle Cancel Generation
  const handleCancelGenerate = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsGenerating(false);
    setProgressMsg('');
    setErrorMessage('Đã dừng tiến trình tạo giọng.');
  };

  // Handle Save Generated Result as Voice Profile
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

      const vItem = voices.find((v) => v.id === selectedVoice);
      const voiceName = `${vItem?.name || provider} - ${new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`;

      const newProfile: SavedVoiceProfile = {
        id: `voice_online_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
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
      setSuccessMessage(`Đã lưu âm thanh này vào Kho Giọng Mẫu ("${voiceName}")! Bạn có thể dùng ngay bên tab Clone Giọng.`);
    } catch (err: any) {
      setErrorMessage('Lỗi khi lưu giọng mẫu: ' + (err.message || 'Lỗi IndexedDB'));
    }
  };

  const handleGenerate = async () => {
    if (!text.trim()) {
      setErrorMessage('Vui lòng nhập văn bản tiếng Việt cần đọc!');
      return;
    }
    if (!selectedVoice) {
      setErrorMessage('Vui lòng chọn giọng đọc hợp lệ!');
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsGenerating(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsSavedAsModel(false);
    setProgressMsg('Đang kết nối tới máy chủ GenMax AI...');

    let audioUrlResult = '';
    let costResult = text.length;
    let taskIdResult = `tts_${Date.now()}`;

    // 1. Try Backend API if available
    try {
      const response = await fetch('/api/genmax/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text.trim(),
          selectedKey,
          provider,
          voiceId: selectedVoice,
          modelId: selectedModel,
          stability: settings.stability,
          similarityBoost: settings.similarityBoost,
          style: settings.style,
          speed: settings.speed,
          pitch: settings.pitch,
        }),
        signal: controller.signal,
      });

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await response.json();
        if (response.ok && data.audioUrl) {
          audioUrlResult = data.audioUrl;
          costResult = data.cost || text.length;
          taskIdResult = data.taskId || taskIdResult;
          if (data.usedKey && data.usedKey !== selectedKey) {
            onSelectKey(data.usedKey);
          }
          if (data.wasRotated) {
            setSuccessMessage(
              `Tạo giọng thành công! (Hệ thống đã tự động xoay sang "${data.usedKeyName || 'Key tiếp theo'}" do Key trước hết credits).`
            );
          }
        } else if (!response.ok && data.error) {
          setErrorMessage(data.error);
          setIsGenerating(false);
          setProgressMsg('');
          return;
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError' || controller.signal.aborted) {
        setIsGenerating(false);
        return;
      }
    }

    // 2. Fallback to direct client API if backend route was not reachable (e.g. Netlify)
    if (!audioUrlResult && selectedKey && !controller.signal.aborted) {
      try {
        setProgressMsg('Đang gửi yêu cầu trực tiếp tới máy chủ GenMax (kèm tự động xoay Key)...');
        const directRes = await generateDirectGenMaxTts({
          text: text.trim(),
          apiKey: selectedKey,
          provider,
          voiceId: selectedVoice,
          modelId: selectedModel,
          stability: settings.stability,
          similarityBoost: settings.similarityBoost,
          style: settings.style,
          speed: settings.speed,
          signal: controller.signal,
        });
        audioUrlResult = directRes.audioUrl;
        costResult = directRes.cost;
        taskIdResult = directRes.taskId || taskIdResult;
        if (directRes.usedKey && directRes.usedKey !== selectedKey) {
          onSelectKey(directRes.usedKey);
        }
        if (directRes.wasRotated) {
          setSuccessMessage(
            `Tạo giọng thành công! (Tự động xoay sang "${directRes.usedKeyName || 'Key tiếp theo'}" do Key trước hết credits).`
          );
        }
      } catch (directErr: any) {
        if (directErr.name === 'AbortError' || controller.signal.aborted) {
          setIsGenerating(false);
          return;
        }
        setErrorMessage(directErr.message || 'Lỗi kết nối GenMax');
        setIsGenerating(false);
        setProgressMsg('');
        return;
      }
    }

    if (controller.signal.aborted) {
      setIsGenerating(false);
      return;
    }

    if (audioUrlResult) {
      setCurrentAudioUrl(audioUrlResult);
      if (!successMessage) {
        setSuccessMessage(`Tạo âm thanh thành công! Tiêu hao: ${costResult} credits.`);
      }

      const vItem = voices.find((v) => v.id === selectedVoice);
      const newItem: GeneratedAudioItem = {
        id: taskIdResult,
        title: text.slice(0, 40) + (text.length > 40 ? '...' : ''),
        text: text.trim(),
        audioUrl: audioUrlResult,
        provider: `${provider} (${vItem?.name || 'Voice'})`,
        createdAt: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        cost: costResult,
      };
      onAudioGenerated(newItem);
    } else if (!errorMessage) {
      setErrorMessage('Không thể tạo âm thanh. Vui lòng kiểm tra lại API Key hoặc số dư.');
    }

    setIsGenerating(false);
    setProgressMsg('');
    abortControllerRef.current = null;
  };

  const estimatedCredits = text.trim().length;

  return (
    <div className="space-y-6">
      {/* Overview Banner */}
      <div className="bg-gradient-to-r from-blue-900/30 via-indigo-900/20 to-slate-900/40 border border-blue-500/20 rounded-2xl p-5 relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="w-4 h-4 text-blue-400" />
              <h2 className="text-base font-bold text-slate-100">
                Chế Độ Online (GenMax API - ElevenLabs & MiniMax)
              </h2>
            </div>
            <p className="text-xs text-slate-400">
              Công nghệ chuyển văn bản thành giọng nói chất lượng phòng thu, ngữ điệu tự nhiên, đa dạng cảm xúc.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {currentKeyItem && (
              <div className="px-3 py-1.5 bg-slate-900/90 border border-slate-700/60 rounded-xl text-xs flex items-center gap-2">
                <span className="text-slate-400">Số dư khả dụng:</span>
                <span className="font-bold text-emerald-400">
                  {currentKeyItem.balance !== -1 ? `${currentKeyItem.balance.toLocaleString()} Credits` : 'Chưa rõ'}
                </span>
              </div>
            )}
            <button
              onClick={onOpenKeyManager}
              className="px-3 py-1.5 bg-blue-600/80 hover:bg-blue-600 text-white rounded-xl text-xs font-medium transition"
            >
              Quản lý Key
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Settings & Configuration (5 cols) */}
        <div className="lg:col-span-5 space-y-5">
          {/* 1. API Key Selector */}
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <span>🔑 1. Chọn API Key</span>
              </h3>
              <button
                onClick={() => fetchVoicesAndModels()}
                disabled={isLoadingVoices}
                className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                title="Làm mới danh sách giọng"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingVoices ? 'animate-spin' : ''}`} />
                <span>Làm mới</span>
              </button>
            </div>

            {keys.length === 0 ? (
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-300 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Chưa có API Key nào!</p>
                  <p className="text-[11px] text-amber-400/80 mt-0.5">
                    Bấm "Quản lý Key" để thêm mã API Key của bạn từ GenMax.
                  </p>
                </div>
              </div>
            ) : (
              <select
                id="select-api-key"
                value={selectedKey}
                onChange={(e) => onSelectKey(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-blue-500"
              >
                {keys.map((k) => (
                  <option key={k.key} value={k.key}>
                    {k.label}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* 2. Voice & Model Configuration */}
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              ⚙️ 2. Cấu Hình Nhà Cung Cấp & Giọng Đọc
            </h3>

            {/* Provider Tabs */}
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Nhà Cung Cấp (Provider)</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setProvider('ElevenLabs')}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold border transition flex items-center justify-center gap-2 ${
                    provider === 'ElevenLabs'
                      ? 'bg-blue-600/20 border-blue-500 text-blue-300 shadow-sm'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span>ElevenLabs</span>
                </button>
                <button
                  type="button"
                  onClick={() => setProvider('MiniMax')}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold border transition flex items-center justify-center gap-2 ${
                    provider === 'MiniMax'
                      ? 'bg-blue-600/20 border-blue-500 text-blue-300 shadow-sm'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span>MiniMax</span>
                </button>
              </div>
            </div>

            {/* Model Select */}
            <div>
              <label className="block text-xs text-slate-400 mb-1">Mô Hình AI (Model)</label>
              <select
                id="select-model"
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-blue-500"
              >
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Voice Select */}
            <div>
              <label className="block text-xs text-slate-400 mb-1">Giọng Đọc (Voice)</label>
              <select
                id="select-voice"
                value={selectedVoice}
                onChange={(e) => setSelectedVoice(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-blue-500"
              >
                {voices.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Emotion & Audio Parameter sliders */}
            <div className="pt-3 border-t border-slate-800/80 space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
                <Sliders className="w-3.5 h-3.5 text-blue-400" />
                <span>Tham Số Cảm Xúc & Ngữ Điệu</span>
              </div>

              {provider === 'ElevenLabs' ? (
                <>
                  <div>
                    <div className="flex justify-between text-xs text-slate-400 mb-1">
                      <span>Sự ổn định (Stability)</span>
                      <span className="font-mono text-blue-400">{settings.stability}</span>
                    </div>
                    <input
                      type="range"
                      min={0.0}
                      max={1.0}
                      step={0.05}
                      value={settings.stability}
                      onChange={(e) => setSettings({ ...settings, stability: parseFloat(e.target.value) })}
                      className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-xs text-slate-400 mb-1">
                      <span>Độ tương đồng (Similarity Boost)</span>
                      <span className="font-mono text-blue-400">{settings.similarityBoost}</span>
                    </div>
                    <input
                      type="range"
                      min={0.0}
                      max={1.0}
                      step={0.05}
                      value={settings.similarityBoost}
                      onChange={(e) => setSettings({ ...settings, similarityBoost: parseFloat(e.target.value) })}
                      className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-xs text-slate-400 mb-1">
                      <span>Cường độ biểu cảm (Style)</span>
                      <span className="font-mono text-blue-400">{settings.style}</span>
                    </div>
                    <input
                      type="range"
                      min={0.0}
                      max={1.0}
                      step={0.05}
                      value={settings.style}
                      onChange={(e) => setSettings({ ...settings, style: parseFloat(e.target.value) })}
                      className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                  </div>
                </>
              ) : (
                <div>
                  <div className="flex justify-between text-xs text-slate-400 mb-1">
                    <span>Độ trầm bổng (Pitch)</span>
                    <span className="font-mono text-blue-400">{settings.pitch}</span>
                  </div>
                  <input
                    type="range"
                    min={-12}
                    max={12}
                    step={1}
                    value={settings.pitch}
                    onChange={(e) => setSettings({ ...settings, pitch: parseInt(e.target.value) })}
                    className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                </div>
              )}

              <div>
                <div className="flex justify-between text-xs text-slate-400 mb-1">
                  <span>Tốc độ đọc (Speed)</span>
                  <span className="font-mono text-blue-400">{settings.speed}x</span>
                </div>
                <input
                  type="range"
                  min={0.5}
                  max={2.0}
                  step={0.1}
                  value={settings.speed}
                  onChange={(e) => setSettings({ ...settings, speed: parseFloat(e.target.value) })}
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Text input, Cost Estimation & Generation (7 cols) */}
        <div className="lg:col-span-7 space-y-5">
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                ✍️ 3. Nội Dung Văn Bản Tiếng Việt
              </h3>

              {/* Sample Templates */}
              <div className="flex items-center gap-1 text-xs">
                <span className="text-slate-500 hidden sm:inline">Mẫu văn bản:</span>
                <div className="flex flex-wrap gap-1">
                  {SAMPLE_TEXTS.map((sample, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setText(sample.text)}
                      className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] rounded transition"
                    >
                      {sample.title}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Textarea */}
            <div className="relative">
              <textarea
                id="input-tts-text"
                rows={8}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Nhập hoặc dán văn bản tiếng Việt cần đọc vào đây... (VD: Xin chào các bạn, chúc mọi người một ngày làm việc hiệu quả và tràn đầy năng lượng!)"
                className="w-full p-4 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500 resize-y leading-relaxed font-normal"
              />
            </div>

            {/* Cost & Character Count Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-slate-950/80 rounded-xl border border-slate-800/80 text-xs">
              <div className="flex items-center gap-2 text-slate-400">
                <FileText className="w-3.5 h-3.5" />
                <span>Số ký tự: <b className="text-slate-200 font-mono">{text.length}</b></span>
              </div>

              <div className="flex items-center gap-1.5 text-amber-400 font-medium">
                <Zap className="w-3.5 h-3.5 fill-amber-400" />
                <span>Ước tính tiêu hao: <b className="font-mono text-amber-300">{estimatedCredits} Credits</b></span>
              </div>
            </div>

            {/* Error / Success feedback */}
            {errorMessage && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-300 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-400" />
                <span>{errorMessage}</span>
              </div>
            )}

            {successMessage && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-300 flex items-start gap-2">
                <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-emerald-400" />
                <span>{successMessage}</span>
              </div>
            )}

            {/* Action Button */}
            {isGenerating ? (
              <div className="flex gap-2">
                <button
                  id="btn-generate-tts"
                  type="button"
                  disabled
                  className="flex-1 py-3.5 bg-blue-950/80 border border-blue-500/50 text-blue-200 font-bold text-sm rounded-xl transition flex items-center justify-center gap-2"
                >
                  <RefreshCw className="w-4 h-4 animate-spin text-blue-400" />
                  <span>{progressMsg || 'Đang tạo âm thanh...'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleCancelGenerate}
                  className="px-5 py-3.5 bg-rose-600 hover:bg-rose-500 active:scale-95 text-white font-bold text-sm rounded-xl shadow-lg shadow-rose-600/30 transition flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                  title="Dừng ngay tiến trình tạo giọng"
                >
                  <Square className="w-4 h-4 fill-current" />
                  <span>Dừng Lại</span>
                </button>
              </div>
            ) : (
              <button
                id="btn-generate-tts"
                type="button"
                disabled={!text.trim()}
                onClick={handleGenerate}
                className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm rounded-xl shadow-lg shadow-blue-500/25 transition transform active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                <span>🚀 TẠO ÂM THANH NGAY</span>
              </button>
            )}
          </div>

          {/* Generated Audio Player Result */}
          {currentAudioUrl && (
            <div className="animate-fadeIn">
              <AudioPlayer
                src={currentAudioUrl}
                title={`Âm thanh ${provider} - ${voices.find((v) => v.id === selectedVoice)?.name || 'Studio'}`}
                onSaveAsVoiceModel={handleSaveResultAsVoiceModel}
                isSavedAsModel={isSavedAsModel}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
