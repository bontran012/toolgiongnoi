import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Cpu,
  Upload,
  Video,
  Mic,
  Square,
  Sparkles,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  ExternalLink,
  SlidersHorizontal,
  Flame,
  Gauge,
  Activity,
  Zap,
} from 'lucide-react';
import { GeneratedAudioItem } from '../types';
import { AudioPlayer } from './AudioPlayer';
import { SampleMediaPreview } from './SampleMediaPreview';
import { VoiceProfileManager } from './VoiceProfileManager';
import { extractMediaData } from '../utils/audioUtils';
import { predictColabDirect, checkColabHealth } from '../utils/directApiFallback';
import {
  SavedVoiceProfile,
  getAllSavedVoices,
  saveVoiceProfile,
  deleteVoiceProfile,
} from '../utils/voiceProfileStorage';

interface ColabTabProps {
  onAudioGenerated: (item: GeneratedAudioItem) => void;
}

export const ColabTab: React.FC<ColabTabProps> = ({ onAudioGenerated }) => {
  const [colabUrl, setColabUrl] = useState<string>(() => {
    try {
      return localStorage.getItem('colab_saved_url') || '';
    } catch {
      return '';
    }
  });

  // Colab connection status state: 'idle' | 'checking' | 'online' | 'offline'
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'checking' | 'online' | 'offline'>('idle');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [lastPingTime, setLastPingTime] = useState<number | null>(null);

  // Automatically persist colabUrl to localStorage whenever it changes
  useEffect(() => {
    try {
      if (colabUrl) {
        localStorage.setItem('colab_saved_url', colabUrl.trim());
      }
    } catch (e) {
      console.warn('Cannot save Colab URL to localStorage:', e);
    }
  }, [colabUrl]);

  // Health check function
  const handleCheckStatus = useCallback(async (urlToCheck?: string) => {
    const target = (urlToCheck !== undefined ? urlToCheck : colabUrl).trim();
    if (!target) {
      setConnectionStatus('idle');
      setStatusMessage('');
      return;
    }

    setConnectionStatus('checking');
    setStatusMessage('Đang kiểm tra kết nối tới Colab...');
    try {
      const res = await checkColabHealth(target);
      if (res.alive) {
        setConnectionStatus('online');
        setStatusMessage(res.message || (res.responseTimeMs ? `Online (${res.responseTimeMs}ms)` : 'Đang hoạt động'));
        setLastPingTime(res.responseTimeMs || null);
      } else {
        setConnectionStatus('offline');
        setStatusMessage(res.message || 'Không thể kết nối (Session đã hết hạn)');
        setLastPingTime(null);
      }
    } catch (err: any) {
      setConnectionStatus('offline');
      setStatusMessage('Không kết nối được: ' + (err.message || 'Lỗi mạng'));
      setLastPingTime(null);
    }
  }, [colabUrl]);

  // Auto check on mount if URL exists
  useEffect(() => {
    if (colabUrl.trim()) {
      handleCheckStatus(colabUrl);
    }
  }, []);

  // Media reference state
  const [mediaData, setMediaData] = useState<{
    previewUrl: string;
    base64: string;
    duration: number;
    isVideo: boolean;
    fileName: string;
    fileSizeFormatted: string;
  } | null>(null);

  const [isProcessingMedia, setIsProcessingMedia] = useState<boolean>(false);
  const [mediaError, setMediaError] = useState<string | null>(null);

  // Saved Voices (Profiles) from IndexedDB
  const [savedVoices, setSavedVoices] = useState<SavedVoiceProfile[]>([]);
  const [selectedSavedVoiceId, setSelectedSavedVoiceId] = useState<string | null>(null);
  const [isSavingVoice, setIsSavingVoice] = useState<boolean>(false);
  const [isSavedResultAsModel, setIsSavedResultAsModel] = useState<boolean>(false);

  // AbortController for canceling ongoing generation
  const abortControllerRef = useRef<AbortController | null>(null);

  // Modal to view / copy Colab Python Script
  const [showCodeModal, setShowCodeModal] = useState<boolean>(false);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);

  // Load saved voices on mount
  const loadSavedVoiceProfiles = async () => {
    try {
      const list = await getAllSavedVoices();
      setSavedVoices(list);
    } catch (e) {
      console.warn('Lỗi đọc giọng đã lưu:', e);
    }
  };

  useEffect(() => {
    loadSavedVoiceProfiles();
  }, []);

  // Handle saving current media data as a named voice profile
  const handleSaveCurrentVoice = async (name: string) => {
    if (!mediaData?.base64) return;
    setIsSavingVoice(true);
    try {
      const newProfile: SavedVoiceProfile = {
        id: `voice_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        name,
        createdAt: Date.now(),
        fileName: mediaData.fileName,
        fileSizeFormatted: mediaData.fileSizeFormatted,
        duration: mediaData.duration,
        isVideo: mediaData.isVideo,
        base64: mediaData.base64,
        refText: refText.trim(),
      };

      await saveVoiceProfile(newProfile);
      await loadSavedVoiceProfiles();
      setSelectedSavedVoiceId(newProfile.id);
      setSuccess(`Đã lưu giọng "${name}" vào bộ nhớ thành công!`);
    } catch (err: any) {
      console.error('Lỗi khi lưu giọng:', err);
      setError('Không thể lưu giọng mẫu: ' + (err.message || 'Lỗi IndexedDB'));
    } finally {
      setIsSavingVoice(false);
    }
  };

  // Handle selecting a saved voice
  const handleSelectSavedVoice = (voice: SavedVoiceProfile) => {
    setSelectedSavedVoiceId(voice.id);
    setMediaData({
      previewUrl: voice.base64, // base64 string works as src in audio/video
      base64: voice.base64,
      duration: voice.duration,
      isVideo: voice.isVideo,
      fileName: voice.fileName || `${voice.name}.wav`,
      fileSizeFormatted: voice.fileSizeFormatted || 'Saved',
    });
    if (voice.refText) {
      setRefText(voice.refText);
    }
  };

  // Handle deleting a saved voice
  const handleDeleteSavedVoice = async (id: string) => {
    try {
      await deleteVoiceProfile(id);
      if (selectedSavedVoiceId === id) {
        setSelectedSavedVoiceId(null);
      }
      await loadSavedVoiceProfiles();
    } catch (err: any) {
      console.error('Lỗi xóa giọng:', err);
    }
  };

  // Recording State
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordSeconds, setRecordSeconds] = useState<number>(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<any>(null);

  const [refText, setRefText] = useState<string>('');
  const [genText, setGenText] = useState<string>('');
  const [speed, setSpeed] = useState<number>(1.0);
  const [nfeStep, setNfeStep] = useState<number>(64);
  const [cfgStrength, setCfgStrength] = useState<number>(2.0);
  const [showAdvanced, setShowAdvanced] = useState<boolean>(true);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [resultAudioUrl, setResultAudioUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  // Process selected or dropped file
  const handleProcessFile = async (file: File) => {
    setIsProcessingMedia(true);
    setMediaError(null);
    setSelectedSavedVoiceId(null);

    try {
      const data = await extractMediaData(file);
      setMediaData(data);
    } catch (err: any) {
      console.error('Lỗi nạp tệp media:', err);
      setMediaError('Không thể nạp tệp này. Hãy thử định dạng khác (MP3, MP4, WAV, MOV, WEBM).');
    } finally {
      setIsProcessingMedia(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleProcessFile(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleProcessFile(file);
    }
  };

  // Load preset sample voice for instant testing
  const handleLoadPresetSample = async (url: string, fileName: string, defaultText: string) => {
    setIsProcessingMedia(true);
    setMediaError(null);
    setSelectedSavedVoiceId(null);
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const file = new File([blob], fileName, { type: blob.type || 'audio/mp3' });
      const data = await extractMediaData(file);
      setMediaData(data);
      if (defaultText && !refText) {
        setRefText(defaultText);
      }
    } catch (err: any) {
      console.error('Lỗi nạp mẫu:', err);
      setMediaError('Không thể nạp mẫu âm thanh: ' + (err.message || 'Lỗi mạng'));
    } finally {
      setIsProcessingMedia(false);
    }
  };

  // Direct Microphone Recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const recordedFile = new File([audioBlob], `recording_${Date.now()}.webm`, {
          type: 'audio/webm',
        });
        await handleProcessFile(recordedFile);
        stream.getTracks().forEach((t) => t.stop());
      };

      recorder.start();
      setIsRecording(true);
      setRecordSeconds(0);

      timerIntervalRef.current = setInterval(() => {
        setRecordSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      setMediaError('Không thể truy cập Microphone: ' + (err.message || 'Hãy cấp quyền cho trình duyệt'));
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    }
  };

  const handleClearMedia = () => {
    if (mediaData?.previewUrl) {
      URL.revokeObjectURL(mediaData.previewUrl);
    }
    setMediaData(null);
    setMediaError(null);
  };

  // Handle saving the generated result audio as a new voice model profile
  const handleSaveResultAsVoiceModel = async () => {
    if (!resultAudioUrl || !genText) return;
    setIsSavingVoice(true);
    try {
      // Fetch audio to convert to base64
      let base64 = '';
      let duration = 0;
      try {
        const res = await fetch(resultAudioUrl);
        const blob = await res.blob();
        base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });

        // Get audio duration
        const tempAudio = new Audio(resultAudioUrl);
        await new Promise<void>((resolve) => {
          tempAudio.onloadedmetadata = () => {
            duration = tempAudio.duration || 0;
            resolve();
          };
          tempAudio.onerror = () => resolve();
        });
      } catch (e) {
        console.warn('Lỗi đọc audio kết quả thành base64:', e);
      }

      if (!base64) {
        throw new Error('Không thể chuyển đổi âm thanh kết quả để lưu');
      }

      const voiceName = `Giọng Mẫu Tạo Lúc ${new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`;
      const newProfile: SavedVoiceProfile = {
        id: `voice_gen_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        name: voiceName,
        createdAt: Date.now(),
        fileName: `${voiceName}.wav`,
        fileSizeFormatted: `${Math.round(base64.length / 1024)} KB`,
        duration: duration || 5,
        isVideo: false,
        base64,
        refText: genText.trim().slice(0, 150),
      };

      await saveVoiceProfile(newProfile);
      await loadSavedVoiceProfiles();
      setIsSavedResultAsModel(true);
      setSuccess(`Đã lưu tệp âm thanh vừa tạo vào Kho Giọng Mẫu ("${voiceName}")!`);
    } catch (err: any) {
      console.error('Lỗi khi lưu kết quả làm mẫu:', err);
      setError('Lỗi khi lưu mẫu giọng: ' + (err.message || 'IndexedDB error'));
    } finally {
      setIsSavingVoice(false);
    }
  };

  // Handle canceling ongoing generation
  const handleCancelGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoading(false);
    setError('Đã hủy tiến trình sinh giọng theo yêu cầu của bạn.');
  };

  const handleGenerate = async () => {
    if (!colabUrl.trim()) {
      setError('Vui lòng nhập đường link Google Colab (VD: https://xxxx.gradio.live)!');
      return;
    }
    if (!genText.trim()) {
      setError('Vui lòng nhập văn bản cần đọc!');
      return;
    }
    if (!mediaData?.base64) {
      setError('Vui lòng tải lên file Video / Audio mẫu hoặc ghi âm giọng đọc tham chiếu!');
      return;
    }

    // Initialize AbortController
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsLoading(true);
    setError(null);
    setSuccess(null);
    setIsSavedResultAsModel(false);

    let audioUrl = '';

    // 1. Try Backend Proxy first
    try {
      const res = await fetch('/api/colab/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          colabUrl: colabUrl.trim(),
          refAudioBase64: mediaData.base64,
          refText: refText.trim(),
          genText: genText.trim(),
          speed,
          nfeStep,
          cfgStrength,
        }),
        signal: controller.signal,
      });

      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        const data = await res.json();
        if (typeof data.result === 'string') {
          audioUrl = data.result;
        } else if (Array.isArray(data.result) && data.result.length > 0) {
          const item = data.result[0];
          audioUrl = typeof item === 'string' ? item : item?.name || item?.url || item?.path || '';
        } else if (data.result?.data && Array.isArray(data.result.data) && data.result.data.length > 0) {
          const item = data.result.data[0];
          audioUrl = typeof item === 'string' ? item : item?.name || item?.url || item?.path || '';
        } else if (data.result && typeof data.result === 'object') {
          audioUrl = data.result.url || data.result.name || data.result.path || '';
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError' || controller.signal.aborted) {
        setIsLoading(false);
        return;
      }
      // Backend not running (e.g. on Netlify static hosting)
    }

    // 2. Direct browser fallback if backend did not return audio
    if (!audioUrl && !controller.signal.aborted) {
      try {
        audioUrl = await predictColabDirect({
          colabUrl: colabUrl.trim(),
          refAudioBase64: mediaData.base64,
          refText: refText.trim(),
          genText: genText.trim(),
          speed,
          nfeStep,
          cfgStrength,
          signal: controller.signal,
        });
      } catch (directErr: any) {
        if (directErr.name === 'AbortError' || controller.signal.aborted) {
          setIsLoading(false);
          return;
        }
        setError(directErr.message || 'Lỗi kết nối Colab. Hãy kiểm tra đường link .gradio.live!');
        setIsLoading(false);
        return;
      }
    }

    if (controller.signal.aborted) {
      setIsLoading(false);
      return;
    }

    try {
      if (audioUrl) {
        // Resolve relative URL if from Gradio
        if (!audioUrl.startsWith('http') && !audioUrl.startsWith('data:') && !audioUrl.startsWith('/outputs')) {
          const cleanHost = colabUrl.trim().replace(/\/$/, '');
          audioUrl = audioUrl.startsWith('/file=')
            ? `${cleanHost}${audioUrl}`
            : audioUrl.startsWith('/')
            ? `${cleanHost}/file=${audioUrl}`
            : `${cleanHost}/file=${audioUrl}`;
        }

        setResultAudioUrl(audioUrl);
        setSuccess('Sinh giọng bằng GPU Colab thành công!');
        onAudioGenerated({
          id: `colab_${Date.now()}`,
          title: genText.slice(0, 40) + '...',
          text: genText,
          audioUrl,
          provider: 'Colab GPU (Voice Clone)',
          createdAt: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
          cost: 0,
        });
      } else {
        throw new Error('Colab đã phản hồi nhưng không tìm thấy tệp audio kết quả.');
      }
    } catch (err: any) {
      setError(err.message || 'Lỗi khi xử lý âm thanh');
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-purple-900/30 via-indigo-900/20 to-slate-900/40 border border-purple-500/20 rounded-2xl p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Cpu className="w-4 h-4 text-purple-400" />
              <h2 className="text-base font-bold text-slate-100">
                Colab GPU (Voice Cloning từ Video & Audio Mẫu)
              </h2>
            </div>
            <p className="text-xs text-slate-400">
              Hỗ trợ tải trực tiếp tệp <b>Video (MP4, MKV, MOV, WEBM)</b> hoặc <b>Audio (MP3, WAV, M4A)</b>. Hệ thống tự động phân tích và trích xuất âm thanh chất lượng cao để AI nhân bản giọng đọc.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowCodeModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-purple-300 rounded-xl text-xs font-semibold transition cursor-pointer shadow-sm"
            >
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              <span>Lấy Code Python Colab</span>
            </button>

            <a
              href="https://colab.research.google.com"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-600/80 hover:bg-purple-600 text-white rounded-xl text-xs font-semibold transition"
            >
              <span>Mở Google Colab</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>

      {/* Guide Steps */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 bg-slate-900/50 border border-slate-800 rounded-xl">
          <div className="text-xs font-bold text-purple-400 mb-1">1. Chạy Colab GPU</div>
          <p className="text-xs text-slate-400">
            Mở file Colab của bạn, chọn menu <b>Runtime → Run all</b> để khởi động mô hình AI F5-TTS / CosyVoice.
          </p>
        </div>
        <div className="p-4 bg-slate-900/50 border border-slate-800 rounded-xl">
          <div className="text-xs font-bold text-purple-400 mb-1">2. Lấy link .gradio.live</div>
          <p className="text-xs text-slate-400">
            Cuộn xuống cuối cell đang chạy, sao chép đường link công khai có đuôi <b>.gradio.live</b>.
          </p>
        </div>
        <div className="p-4 bg-slate-900/50 border border-slate-800 rounded-xl">
          <div className="text-xs font-bold text-purple-400 mb-1">3. Tải Video/Audio & Nhân Bản</div>
          <p className="text-xs text-slate-400">
            Tải lên video mẫu (5-15s), nhập văn bản phụ đề và bấm <b>Sinh giọng</b> để nhận file đọc hoàn chỉnh.
          </p>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Settings & Media Input */}
        <div className="lg:col-span-5 space-y-5">
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              🔗 1. Cấu Hình Link Colab
            </h3>

            <div>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <label className="block text-xs text-slate-400">Đường Link Colab (.gradio.live)</label>
                  {connectionStatus === 'online' && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Online {lastPingTime ? `(${lastPingTime}ms)` : ''}
                    </span>
                  )}
                  {connectionStatus === 'offline' && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-rose-500/10 border border-rose-500/30 text-rose-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                      Offline / Đã tắt
                    </span>
                  )}
                  {connectionStatus === 'checking' && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-amber-500/10 border border-amber-500/30 text-amber-400">
                      <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                      Đang kiểm tra...
                    </span>
                  )}
                </div>

                {colabUrl && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleCheckStatus()}
                      disabled={connectionStatus === 'checking'}
                      className="text-[10px] text-purple-400 hover:text-purple-300 font-medium flex items-center gap-1 transition"
                      title="Kiểm tra xem link Colab này còn hoạt động không"
                    >
                      <Activity className={`w-3 h-3 ${connectionStatus === 'checking' ? 'animate-spin' : ''}`} />
                      <span>Kiểm tra</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setColabUrl('');
                        setConnectionStatus('idle');
                        setStatusMessage('');
                        localStorage.removeItem('colab_saved_url');
                      }}
                      className="text-[10px] text-slate-500 hover:text-red-400 transition underline"
                    >
                      Xóa
                    </button>
                  </div>
                )}
              </div>

              <div className="relative">
                <input
                  type="text"
                  value={colabUrl}
                  onChange={(e) => {
                    setColabUrl(e.target.value);
                    if (connectionStatus !== 'idle') setConnectionStatus('idle');
                  }}
                  onBlur={() => {
                    if (colabUrl.trim()) handleCheckStatus();
                  }}
                  placeholder="https://xxxx.gradio.live"
                  className={`w-full pl-3 pr-24 py-2 bg-slate-950 border rounded-xl text-xs text-slate-200 placeholder-slate-600 focus:outline-none font-mono transition ${
                    connectionStatus === 'online'
                      ? 'border-emerald-500/50 focus:border-emerald-500'
                      : connectionStatus === 'offline'
                      ? 'border-rose-500/50 focus:border-rose-500'
                      : 'border-slate-800 focus:border-purple-500'
                  }`}
                />

                <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleCheckStatus()}
                    disabled={!colabUrl.trim() || connectionStatus === 'checking'}
                    className="px-2 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 rounded-lg text-[10px] font-medium flex items-center gap-1 transition shadow-sm"
                  >
                    <Activity className={`w-2.5 h-2.5 text-purple-400 ${connectionStatus === 'checking' ? 'animate-spin' : ''}`} />
                    <span>Ping</span>
                  </button>
                </div>
              </div>

              {/* Status Banner / Hint */}
              {connectionStatus === 'offline' && (
                <div className="mt-2 p-2.5 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-start justify-between gap-2 text-rose-300">
                  <div className="flex items-start gap-1.5 text-xs">
                    <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold text-[11px]">Link Colab không phản hồi hoặc đã tắt!</div>
                      <div className="text-[10px] text-rose-400/80 mt-0.5">
                        Google Colab sẽ tự ngắt sau khi để lâu. Bạn hãy mở lại Colab và bấm <b>Runtime → Run all</b> để lấy link mới.
                      </div>
                    </div>
                  </div>
                  <a
                    href="https://colab.research.google.com"
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 px-2 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-[10px] font-semibold flex items-center gap-1 transition shadow-sm"
                  >
                    <span>Mở Colab</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </div>
              )}

              {connectionStatus === 'online' && (
                <div className="mt-2 p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-1.5 text-emerald-300 text-xs">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span className="text-[11px] font-medium">
                    Link Colab hoạt động tốt — Sẵn sàng sinh giọng nhân bản!
                  </span>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-800/80 space-y-3">
              {/* Voice Profile Manager: Saved Voices Kho Giọng Mẫu */}
              <VoiceProfileManager
                savedVoices={savedVoices}
                currentVoiceId={selectedSavedVoiceId}
                onSelectVoice={handleSelectSavedVoice}
                onSaveCurrentVoice={handleSaveCurrentVoice}
                onDeleteVoice={handleDeleteSavedVoice}
                canSaveCurrent={!!mediaData?.base64 && !selectedSavedVoiceId}
                isSaving={isSavingVoice}
              />

              <div className="flex items-center justify-between pt-2 border-t border-slate-800/60">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  🎬 2. Tải Mẫu Mới Hoặc Ghi Âm
                </h3>
                {mediaData && (
                  <button
                    type="button"
                    onClick={handleClearMedia}
                    className="text-[11px] text-slate-400 hover:text-red-400 underline transition cursor-pointer"
                  >
                    Đổi giọng khác
                  </button>
                )}
              </div>

              {/* Upload Box with Drag & Drop */}
              {!mediaData && (
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  className={`relative flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-xl cursor-pointer transition ${
                    isDragging
                      ? 'border-purple-400 bg-purple-500/10'
                      : 'border-slate-800 hover:border-purple-500/50 bg-slate-950/60'
                  }`}
                >
                  <input
                    type="file"
                    id="media-upload-input"
                    accept="audio/*,video/*,.mp4,.mkv,.avi,.mov,.wmv,.flv,.webm,.m4v,.mp3,.wav,.ogg,.m4a,.aac,.flac"
                    onChange={handleFileChange}
                    className="hidden"
                  />

                  <label
                    htmlFor="media-upload-input"
                    className="cursor-pointer flex flex-col items-center text-center w-full"
                  >
                    <div className="w-12 h-12 rounded-full bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mb-2.5">
                      <Upload className="w-6 h-6 text-purple-400" />
                    </div>

                    <span className="text-xs text-slate-200 font-semibold">
                      Tải lên Video (MP4, MOV...) hoặc Audio (MP3, WAV...)
                    </span>

                    <span className="text-[10px] text-slate-500 mt-1">
                      Kéo thả hoặc bấm để chọn tệp từ máy tính
                    </span>
                  </label>

                  {/* Microphone Recording & Quick Samples */}
                  <div className="mt-4 pt-3 border-t border-slate-800/80 w-full flex flex-col items-center gap-2.5">
                    {!isRecording ? (
                      <button
                        type="button"
                        onClick={startRecording}
                        className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium flex items-center gap-1.5 transition shadow-sm"
                      >
                        <Mic className="w-3.5 h-3.5 text-red-400" />
                        <span>Hoặc Thu Âm Trực Tiếp</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={stopRecording}
                        className="px-3.5 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 animate-pulse transition shadow-lg"
                      >
                        <Square className="w-3.5 h-3.5 fill-current" />
                        <span>Dừng Ghi Âm ({recordSeconds}s)</span>
                      </button>
                    )}

                    {/* Quick Preset Samples */}
                    <div className="w-full flex items-center justify-center gap-2 pt-1">
                      <span className="text-[10px] text-slate-500">Thử nhanh:</span>
                      <button
                        type="button"
                        onClick={() =>
                          handleLoadPresetSample(
                            '/saved_voices/adam.mp3',
                            'adam_sample.mp3',
                            'Xin chào, đây là giọng đọc mẫu nhân bản bằng công nghệ trí tuệ nhân tạo.'
                          )
                        }
                        className="px-2.5 py-1 bg-purple-950/60 hover:bg-purple-900 border border-purple-800/50 text-purple-300 rounded-md text-[11px] font-medium transition flex items-center gap-1"
                      >
                        <Sparkles className="w-3 h-3 text-purple-400" />
                        <span>Giọng Adam (MP3)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleLoadPresetSample(
                            '/outputs/colab_output.wav',
                            'colab_sample.wav',
                            'Xin chào các bạn, tôi là trợ lý thuyết minh giọng đọc tiếng Việt.'
                          )
                        }
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-md text-[11px] font-medium transition"
                      >
                        <span>Giọng Mẫu 2 (WAV)</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Processing Progress */}
              {isProcessingMedia && (
                <div className="p-3 bg-purple-900/20 border border-purple-500/30 rounded-xl text-xs text-purple-300 flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-purple-400" />
                  <span>Đang tải và xử lý âm thanh mẫu...</span>
                </div>
              )}

              {/* Media Error */}
              {mediaError && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                  <span>{mediaError}</span>
                </div>
              )}

              {/* Custom Interactive Player Preview */}
              {mediaData && !isProcessingMedia && (
                <SampleMediaPreview
                  previewUrl={mediaData.previewUrl}
                  isVideo={mediaData.isVideo}
                  fileName={mediaData.fileName}
                  fileSize={mediaData.fileSizeFormatted}
                  duration={mediaData.duration}
                  onClear={handleClearMedia}
                />
              )}

              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Phụ đề mẫu (Nội dung câu nói trong Video / Audio)
                </label>
                <textarea
                  rows={3}
                  value={refText}
                  onChange={(e) => setRefText(e.target.value)}
                  placeholder="Gõ chính xác từng chữ mà người trong video/audio mẫu đang nói (giúp AI nhận diện đúng âm tiết và ngữ điệu)..."
                  className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right: Text To Generate & Action */}
        <div className="lg:col-span-7 space-y-5">
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                📝 3. Nội Dung Cần Nhân Bản Giọng Đọc
              </h3>
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="text-[11px] text-purple-400 hover:text-purple-300 flex items-center gap-1 font-medium cursor-pointer transition"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>{showAdvanced ? 'Ẩn thông số nâng cao' : 'Hiện thông số biểu cảm & chất lượng'}</span>
              </button>
            </div>

            <textarea
              rows={6}
              value={genText}
              onChange={(e) => setGenText(e.target.value)}
              placeholder="Nhập đoạn văn bản bạn muốn đọc bằng giọng nhân bản... Dùng thêm dấu phẩy (,), dấu chấm than (!), dấu ba chấm (...) để tăng độ nhấn nhá biểu cảm!"
              className="w-full p-4 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-purple-500 resize-y leading-relaxed"
            />

            {/* Quick Presets for Expression */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-purple-400" />
                Cấu hình nhanh:
              </span>
              <button
                type="button"
                onClick={() => {
                  setSpeed(1.0);
                  setCfgStrength(2.0);
                  setNfeStep(64);
                }}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-medium border transition cursor-pointer ${
                  cfgStrength === 2.0 && nfeStep === 64 && speed === 1.0
                    ? 'bg-purple-900/40 border-purple-500 text-purple-300'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                ⭐ Chuẩn Cân Bằng (Mặc định)
              </button>
              <button
                type="button"
                onClick={() => {
                  setSpeed(1.0);
                  setCfgStrength(2.8);
                  setNfeStep(64);
                }}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-medium border transition cursor-pointer ${
                  cfgStrength === 2.8 && nfeStep === 64
                    ? 'bg-purple-900/40 border-purple-500 text-purple-300'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                🔥 Tăng Nhấn Nhá & Biểu Cảm
              </button>
              <button
                type="button"
                onClick={() => {
                  setSpeed(0.85);
                  setCfgStrength(2.4);
                  setNfeStep(64);
                }}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-medium border transition cursor-pointer ${
                  speed === 0.85 && cfgStrength === 2.4
                    ? 'bg-purple-900/40 border-purple-500 text-purple-300'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                📖 Kể Chuyện / Trầm Ấm
              </button>
            </div>

            {/* Advanced Controls Area */}
            {showAdvanced && (
              <div className="bg-slate-950/90 p-4 rounded-xl border border-slate-800 space-y-4">
                {/* 1. Speed Slider */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-slate-300">⚡ Tốc độ đọc (Speed):</span>
                      <span className="text-[10px] text-slate-500">(0.8x: từ tốn | 1.0x: tự nhiên | 1.2x: nhanh)</span>
                    </div>
                    <span className="text-xs font-bold text-purple-400 font-mono bg-purple-950/60 px-2 py-0.5 rounded border border-purple-800/40">
                      {speed.toFixed(2)}x
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.3}
                    max={2.0}
                    step={0.05}
                    value={speed}
                    onChange={(e) => setSpeed(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
                  />
                </div>

                {/* 2. CFG Strength Slider (Expressiveness & Voice Adherence) */}
                <div className="space-y-1.5 pt-2 border-t border-slate-900">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Flame className="w-3.5 h-3.5 text-amber-400" />
                      <span className="text-xs font-semibold text-slate-300">Độ biểu cảm & Bám giọng (CFG):</span>
                      <span className="text-[10px] text-amber-400/80">(2.0: Chuẩn | 2.5 - 3.0: Nhấn nhá mạnh)</span>
                    </div>
                    <span className="text-xs font-bold text-amber-400 font-mono bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800/40">
                      {cfgStrength.toFixed(1)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1.0}
                    max={3.5}
                    step={0.1}
                    value={cfgStrength}
                    onChange={(e) => setCfgStrength(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                  />
                  <p className="text-[10px] text-slate-500">
                    Kéo cao để AI bắt chước sâu sắc ngữ điệu, luyến láy, cao độ và tiếng thở từ audio mẫu.
                  </p>
                </div>

                {/* 3. NFE Steps Slider (Quality & Denoising) */}
                <div className="space-y-1.5 pt-2 border-t border-slate-900">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Gauge className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-xs font-semibold text-slate-300">Số bước khử nhiễu (NFE Steps):</span>
                      <span className="text-[10px] text-emerald-400/80">(64: Âm sắc mượt, tròn vành rõ chữ)</span>
                    </div>
                    <span className="text-xs font-bold text-emerald-400 font-mono bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/40">
                      {nfeStep} steps
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={16}
                      max={128}
                      step={8}
                      value={nfeStep}
                      onChange={(e) => setNfeStep(parseInt(e.target.value, 10))}
                      className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                    <span>16 (Nhanh)</span>
                    <span className="text-emerald-400 font-bold">64 (Khuyên dùng ⭐)</span>
                    <span>128 (Tối đa)</span>
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-300 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-400" />
                <span>{error}</span>
              </div>
            )}

            {success && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-300 flex items-start gap-2">
                <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-emerald-400" />
                <span>{success}</span>
              </div>
            )}

            {isLoading ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled
                  className="flex-1 py-3.5 bg-purple-950/80 border border-purple-500/50 text-purple-200 font-bold text-sm rounded-xl transition flex items-center justify-center gap-2"
                >
                  <RefreshCw className="w-4 h-4 animate-spin text-purple-400" />
                  <span>Đang sinh giọng trên GPU Colab ({nfeStep} steps)...</span>
                </button>

                <button
                  type="button"
                  onClick={handleCancelGeneration}
                  className="px-5 py-3.5 bg-rose-600 hover:bg-rose-500 active:scale-95 text-white font-bold text-sm rounded-xl shadow-lg shadow-rose-600/30 transition flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                  title="Dừng ngay tiến trình sinh giọng hiện tại"
                >
                  <Square className="w-4 h-4 fill-current" />
                  <span>Dừng Lại</span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={!genText.trim() || isProcessingMedia || !mediaData}
                onClick={handleGenerate}
                className="w-full py-3.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 text-white font-bold text-sm rounded-xl shadow-lg shadow-purple-500/25 transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                <span>⚡ Sinh Giọng Nhân Bản (HQ - {nfeStep} Steps)</span>
              </button>
            )}
          </div>

          {resultAudioUrl && (
            <AudioPlayer
              src={resultAudioUrl}
              title="Kết Quả Âm Thanh Từ Colab GPU"
              onSaveAsVoiceModel={handleSaveResultAsVoiceModel}
              isSavedAsModel={isSavedResultAsModel}
            />
          )}
        </div>
      </div>

      {/* Modal Code Python Colab */}
      {showCodeModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <div className="flex items-center gap-2">
                <Cpu className="w-5 h-5 text-purple-400" />
                <div>
                  <h3 className="text-sm font-bold text-slate-100">
                    Mã Nguồn Python F5-TTS 1000h Chạy Trên Google Colab
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Bao gồm cả Giao diện Gradio Trực quan trên Colab và Cổng API kết nối với Web Tool.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCodeModal(false)}
                className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition"
              >
                ✕
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1 bg-slate-950 font-mono text-xs text-slate-300">
              <pre className="whitespace-pre-wrap">{PYTHON_COLAB_SCRIPT}</pre>
            </div>

            <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between">
              <span className="text-xs text-slate-400">
                Chạy trên Google Colab với cấu hình <b>Runtime → T4 GPU</b>.
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(PYTHON_COLAB_SCRIPT);
                    setCopiedCode(true);
                    setTimeout(() => setCopiedCode(false), 2500);
                  }}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs rounded-xl transition flex items-center gap-1.5 shadow-lg shadow-purple-600/30"
                >
                  {copiedCode ? <CheckCircle className="w-4 h-4 text-white" /> : <Sparkles className="w-4 h-4" />}
                  <span>{copiedCode ? 'Đã Sao Chép Mã!' : 'Sao Chép Mã Colab'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowCodeModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const PYTHON_COLAB_SCRIPT = `# ============================================================
# 🇻🇳 F5-TTS VIETNAMESE 1000H (HYNT ViVoice) - BẢN ĐẦY ĐỦ GIAO DIỆN & API
# ============================================================

import os
import sys
import subprocess
import shutil
import tempfile
import unicodedata
import re
import time
import base64
from pathlib import Path
import torch

if not torch.cuda.is_available():
    raise RuntimeError("❌ Không có GPU. Vào menu Runtime > Change runtime type > Chọn T4 GPU.")

print("GPU :", torch.cuda.get_device_name(0))

# [1/6] Cài đặt dependencies
print("\\n[1/6] Installing dependencies...")
packages = [
    "gradio==4.44.1",
    "fastapi",
    "uvicorn",
    "huggingface_hub",
    "cached_path",
    "soundfile",
    "accelerate",
    "ema-pytorch",
    "einx",
    "einops",
    "hydra-core",
    "jieba",
    "pypinyin",
    "librosa",
    "pydub",
    "safetensors",
    "torchdiffeq",
    "tqdm",
    "transformers",
    "vocos",
    "x-transformers"
]

subprocess.run([sys.executable, "-m", "pip", "install", "-q"] + packages, check=True)
print("✅ Cài đặt xong!")

# [2/6] Tải F5-TTS Vietnamese Space
print("\\n[2/6] Loading HYNT source...")
from huggingface_hub import snapshot_download
SPACE_REPO = "hynt/F5-TTS-Vietnamese-100h"
SPACE_DIR = snapshot_download(repo_id=SPACE_REPO, repo_type="space")

if SPACE_DIR in sys.path:
    sys.path.remove(SPACE_DIR)
sys.path.insert(0, SPACE_DIR)

for name in list(sys.modules.keys()):
    if name == "f5_tts" or name.startswith("f5_tts."):
        del sys.modules[name]

from f5_tts.model import DiT
from f5_tts.infer.utils_infer import (
    load_vocoder,
    load_model,
    infer_process,
    preprocess_ref_audio_text
)
print("✅ Nạp mã nguồn xong!")

# [3/6] Tải ViVoice 1000h
print("\\n[3/6] Loading ViVoice 1000h...")
MODEL_REPO = "hynt/F5-TTS-Vietnamese-ViVoice"
MODEL_DIR = "/content/HYNT-Vietnamese-1000h"
os.makedirs(MODEL_DIR, exist_ok=True)

from huggingface_hub import hf_hub_download
MODEL_PATH = hf_hub_download(repo_id=MODEL_REPO, filename="model_last.pt", local_dir=MODEL_DIR)
VOCAB_PATH = hf_hub_download(repo_id=MODEL_REPO, filename="config.json", local_dir=MODEL_DIR)

# [4/6] Load Model vào GPU
print("\\n[4/6] Loading Model into GPU...")
vocoder = load_vocoder()
model = load_model(
    DiT,
    dict(dim=1024, depth=22, heads=16, ff_mult=2, text_dim=512, conv_layers=4),
    ckpt_path=MODEL_PATH,
    vocab_file=VOCAB_PATH
)
model = model.to("cuda")
model.eval()
print("✅ MODEL READY ON CUDA!")

# [5/6] Chuẩn hóa Tiếng Việt (Tránh nuốt chữ / mất chữ)
def normalize_vietnamese(text):
    if not text:
        return ""
    text = unicodedata.normalize("NFC", str(text)).strip()
    text = " " + text + " "
    text = text.replace(" . . ", " . ").replace(" .. ", " . ")
    text = text.replace(" , , ", " , ").replace(" ,, ", " , ")
    text = text.replace('"', "")
    text = " ".join(text.split())
    return text.lower()

import soundfile as sf
import gradio as gr
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

def generate_tts(ref_audio, ref_text, gen_text, speed=1.0, nfe_step=64, cfg_strength=2.0):
    if not ref_audio:
        raise gr.Error("Vui lòng tải lên hoặc ghi âm giọng mẫu!")
    if not gen_text:
        raise gr.Error("Vui lòng nhập văn bản cần đọc!")

    ref_text = normalize_vietnamese(ref_text)
    gen_text = normalize_vietnamese(gen_text)

    # Tiền xử lý audio mẫu
    ref_audio_final, _ = preprocess_ref_audio_text(ref_audio, "")

    with torch.inference_mode():
        final_wave, final_sr, _ = infer_process(
            ref_audio_final,
            ref_text,
            gen_text,
            model,
            vocoder,
            speed=float(speed),
            nfe_step=int(nfe_step),
            cfg_strength=float(cfg_strength)
        )

    output_file = tempfile.NamedTemporaryFile(suffix=".wav", delete=False).name
    sf.write(output_file, final_wave, final_sr)
    return output_file

# [6/6] Khởi tạo Giao diện Gradio + Cổng FastAPI /api/generate
custom_app = FastAPI()
custom_app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@custom_app.post("/api/generate")
async def api_generate(req: Request):
    try:
        body = await req.json()
        audio_b64 = body.get("audio_base64", "")
        ref_t = body.get("ref_text", "")
        gen_t = body.get("gen_text", "")
        spd = float(body.get("speed", 1.0))
        nfe = int(body.get("nfe_step", 64))
        cfg = float(body.get("cfg_strength", 2.0))

        clean_b64 = re.sub(r"^data:audio/\\w+;base64,", "", audio_b64)
        raw_audio = base64.b64decode(clean_b64)
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tf:
            tf.write(raw_audio)
            ref_audio_path = tf.name

        out_wav = generate_tts(ref_audio_path, ref_t, gen_t, speed=spd, nfe_step=nfe, cfg_strength=cfg)
        with open(out_wav, "rb") as f:
            out_b64 = base64.b64encode(f.read()).decode("utf-8")
        return JSONResponse({"audio_base64": f"data:audio/wav;base64,{out_b64}"})
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

with gr.Blocks(title="🇻🇳 F5-TTS Vietnamese 1000h - Voice Clone") as demo:
    gr.Markdown("# 🇻🇳 F5-TTS Vietnamese 1000h (ViVoice) - Giao Diện Trực Tiếp")
    gr.Markdown("Nhân bản giọng nói Tiếng Việt chỉ từ 3-10s audio mẫu. Hỗ trợ chạy trực tiếp trên Colab hoặc dán link vào Web Tool.")
    with gr.Row():
        with gr.Column():
            ref_audio_input = gr.Audio(label="Audio Mẫu (3 - 10s)", type="filepath")
            ref_text_input = gr.Textbox(label="Phụ đề mẫu (Lời nói trong audio)", placeholder="Gõ đúng lời thoại mẫu để AI học ngữ điệu...")
            gen_text_input = gr.Textbox(label="Văn bản cần AI đọc", lines=4, placeholder="Nhập văn bản tiếng Việt cần nhân bản giọng...")
            with gr.Row():
                speed_input = gr.Slider(minimum=0.5, maximum=2.0, value=1.0, step=0.05, label="Tốc độ (Speed)")
                nfe_input = gr.Slider(minimum=16, maximum=128, value=64, step=8, label="NFE Steps (64 chuẩn)")
                cfg_input = gr.Slider(minimum=1.0, maximum=3.5, value=2.0, step=0.1, label="CFG (Độ bám giọng)")
            btn = gr.Button("⚡ Bắt Đầu Sinh Giọng", variant="primary")
        with gr.Column():
            output_audio = gr.Audio(label="Kết Quả Âm Thanh", type="filepath")

    btn.click(
        fn=generate_tts,
        inputs=[ref_audio_input, ref_text_input, gen_text_input, speed_input, nfe_input, cfg_input],
        outputs=output_audio,
        api_name="predict"
    )

app = gr.mount_gradio_app(custom_app, demo, path="/")
demo.queue(max_size=20)
demo.launch(share=True, show_error=True, app_kwargs={"app": app})
`;

