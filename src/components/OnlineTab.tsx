import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Sparkles,
  RefreshCw,
  Sliders,
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Zap,
  Info,
  CheckCircle,
  AlertCircle,
  FileText,
  HelpCircle,
  Square,
  ExternalLink,
  ArrowRightLeft,
  Search,
  Filter,
  SlidersHorizontal,
  Wand2,
  Scissors,
  Clock,
  Radio,
} from 'lucide-react';
import { KeyItem, ProviderType, VoiceOption, ModelOption, VoiceSettings, GeneratedAudioItem } from '../types';
import { AudioPlayer } from './AudioPlayer';
import {
  fetchDirectGenMaxData,
  generateDirectGenMaxTts,
  generateDirectElevenLabsTts,
  fetchDirectBalance,
  getLocalKeys,
  saveLocalKeys,
} from '../utils/directApiFallback';
import { SavedVoiceProfile, saveVoiceProfile } from '../utils/voiceProfileStorage';

interface OnlineTabProps {
  keys: KeyItem[];
  selectedKey: string;
  onSelectKey: (key: string) => void;
  onOpenKeyManager: () => void;
  onAudioGenerated: (item: GeneratedAudioItem) => void;
  onKeysUpdated?: () => void;
}

const SAMPLE_TEXTS = [
  {
    title: 'Biểu cảm v3 [Tags]',
    text: 'Chào bạn nhé! [whispers] Suỵt, điều thú vị này chỉ riêng chúng mình biết thôi. [laughs] Đùa chút thôi, chúc bạn một ngày ngập tràn năng lượng! [excited] Cùng khám phá ngay bây giờ nào!',
  },
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
  onKeysUpdated,
}) => {
  const [provider, setProvider] = useState<ProviderType>('ElevenLabs');
  const [models, setModels] = useState<ModelOption[]>([]);
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [selectedVoice, setSelectedVoice] = useState<string>('');

  const [text, setText] = useState<string>('');
  const [voiceSearchQuery, setVoiceSearchQuery] = useState<string>('');
  const [voiceFilterCategory, setVoiceFilterCategory] = useState<'all' | 'clone' | 'female' | 'male' | 'pro'>('all');
  const [previewingVoiceId, setPreviewingVoiceId] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  const [settings, setSettings] = useState<VoiceSettings>({
    stability: 0.5,
    similarityBoost: 0.75,
    style: 0.0,
    speed: 1.0,
    pitch: 0,
    volume: 1.0,
    useSpeakerBoost: true,
    outputFormat: 'mp3_44100_128',
    latency: 0,
  });

  const [isLoadingVoices, setIsLoadingVoices] = useState<boolean>(false);
  const [isCheckingBalance, setIsCheckingBalance] = useState<boolean>(false);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [progressMsg, setProgressMsg] = useState<string>('');
  const [currentAudioUrl, setCurrentAudioUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSavedAsModel, setIsSavedAsModel] = useState<boolean>(false);

  // Custom Model ID input support
  const [isCustomModel, setIsCustomModel] = useState<boolean>(false);
  const [customModelInput, setCustomModelInput] = useState<string>('');

  // AbortController for cancel
  const abortControllerRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Audio Tags for Eleven v3
  const AUDIO_TAGS_V3 = [
    { tag: '[whispers]', label: 'Thì thầm', desc: 'Hạ giọng thì thầm bí mật' },
    { tag: '[laughs]', label: 'Cười', desc: 'Bật cười tự nhiên' },
    { tag: '[sighs]', label: 'Thở dài', desc: 'Thở dài cảm xúc' },
    { tag: '[excited]', label: 'Hào hứng', desc: 'Giọng phấn khởi, sôi nổi' },
    { tag: '[giggles]', label: 'Khúc khích', desc: 'Cười khúc khích nhỏ nhẹ' },
    { tag: '[screaming]', label: 'Hét lớn', desc: 'Hét kịch tính, cảm xúc mạnh' },
    { tag: '[curious]', label: 'Tò mò', desc: 'Ngữ điệu thắc mắc, hỏi han' },
    { tag: '[pause]', label: 'Nghỉ 1 nhịp', desc: 'Dừng nghỉ ngắt câu' },
  ];

  const handleInsertTag = (tagText: string) => {
    const el = textareaRef.current;
    if (!el) {
      setText((prev) => (prev ? prev + ' ' + tagText + ' ' : tagText + ' '));
      return;
    }
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const currentVal = el.value;
    const insertStr = (start > 0 && currentVal[start - 1] !== ' ' ? ' ' : '') + tagText + ' ';
    const newVal = currentVal.substring(0, start) + insertStr + currentVal.substring(end);
    setText(newVal);
    setTimeout(() => {
      el.focus();
      const newPos = start + insertStr.length;
      el.setSelectionRange(newPos, newPos);
    }, 50);
  };

  // Voice preview player handler
  const handlePreviewVoice = (v: VoiceOption) => {
    if (!v.previewUrl) return;

    if (previewingVoiceId === v.id) {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current = null;
      }
      setPreviewingVoiceId(null);
      return;
    }

    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
    }

    const audio = new Audio(v.previewUrl);
    previewAudioRef.current = audio;
    setPreviewingVoiceId(v.id);

    audio.play().catch((e) => {
      console.warn("Could not play voice preview:", e);
      setPreviewingVoiceId(null);
    });

    audio.onended = () => {
      setPreviewingVoiceId(null);
      previewAudioRef.current = null;
    };
    audio.onerror = () => {
      setPreviewingVoiceId(null);
      previewAudioRef.current = null;
    };
  };

  // Filtered voice list by search query and category
  const filteredVoices = useMemo(() => {
    return voices.filter((v) => {
      // 1. Search Query
      if (voiceSearchQuery.trim()) {
        const q = voiceSearchQuery.toLowerCase().trim();
        const matchName = (v.name || '').toLowerCase().includes(q);
        const matchTag = (v.tag || '').toLowerCase().includes(q);
        const matchDesc = (v.description || '').toLowerCase().includes(q);
        const matchCategory = (v.category || '').toLowerCase().includes(q);
        const matchId = (v.id || '').toLowerCase().includes(q);
        if (!matchName && !matchTag && !matchDesc && !matchCategory && !matchId) return false;
      }
      // 2. Category Filter
      if (voiceFilterCategory === 'clone') {
        return v.isCloned || (v.category && ['cloned', 'instant', 'professional'].includes(v.category.toLowerCase())) || v.name.includes('⭐');
      }
      if (voiceFilterCategory === 'female') {
        return v.gender === 'Nữ' || v.name.toLowerCase().includes('nữ') || v.name.toLowerCase().includes('female') || (v.tag || '').toLowerCase().includes('nữ');
      }
      if (voiceFilterCategory === 'male') {
        return v.gender === 'Nam' || v.name.toLowerCase().includes('nam') || v.name.toLowerCase().includes('male') || (v.tag || '').toLowerCase().includes('nam');
      }
      if (voiceFilterCategory === 'pro') {
        return (v.category && ['generated', 'professional', 'premade'].includes(v.category.toLowerCase())) || (!v.isCloned && !v.name.includes('⭐'));
      }
      return true;
    });
  }, [voices, voiceSearchQuery, voiceFilterCategory]);

  const selectedVoiceObj = voices.find((v) => v.id === selectedVoice) || (voices.length > 0 ? voices[0] : null);

  // Text helpers
  const handleNormalizeNumbers = () => {
    if (!text.trim()) return;
    let t = text;
    // Normalize currencies & percent
    t = t.replace(/\$(\d+(?:\.\d+)?)/g, '$1 đô la');
    t = t.replace(/(\d+)\s*%/g, '$1 phần trăm');
    t = t.replace(/(\d+)\s*k(?=\s|$|[,\.])/gi, '$1 nghìn');
    t = t.replace(/(\d+)\s*tr(?=\s|$|[,\.])/gi, '$1 triệu');
    t = t.replace(/(\d+)\s*km\/h/gi, '$1 ki-lô-mét trên giờ');
    t = t.replace(/(\d+)\s*kg/gi, '$1 ki-lô-gam');
    setText(t);
  };

  const handleCleanWhitespace = () => {
    if (!text) return;
    const cleaned = text
      .split('\n')
      .map((line) => line.trim().replace(/\s+/g, ' '))
      .filter((line, i, arr) => line !== '' || (i > 0 && arr[i - 1] !== ''))
      .join('\n');
    setText(cleaned);
  };

  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const estimatedSeconds = Math.max(1, Math.round(wordCount / (2.8 * (settings.speed || 1.0))));

  // Smart auto-switching by Cre balance
  const [autoSwitchByBalance, setAutoSwitchByBalance] = useState<boolean>(() => {
    const saved = localStorage.getItem('tts_auto_switch_balance');
    return saved !== null ? saved === 'true' : true;
  });

  const toggleAutoSwitch = () => {
    setAutoSwitchByBalance((prev) => {
      const next = !prev;
      localStorage.setItem('tts_auto_switch_balance', String(next));
      return next;
    });
  };

  const currentKeyItem = keys.find((k) => k.key === selectedKey) || (keys.length > 0 ? keys[0] : null);

  const cost = text.trim().length;
  const isBalanceKnown = Boolean(currentKeyItem && currentKeyItem.balance !== undefined && currentKeyItem.balance !== -1);
  const isCurrentKeyInsufficient = Boolean(isBalanceKnown && currentKeyItem && currentKeyItem.balance < cost && cost > 0);

  // Suggested best candidate key if current key has insufficient balance
  const candidateKeysWithSufficientBalance = keys.filter(
    (k) => k.key !== selectedKey && (k.balance === -1 || k.balance >= cost)
  );
  candidateKeysWithSufficientBalance.sort((a, b) => {
    const targetSource = provider === 'ElevenLabs_Official' ? 'elevenlabs' : undefined;
    if (targetSource) {
      const aMatch = a.source === targetSource ? 1 : 0;
      const bMatch = b.source === targetSource ? 1 : 0;
      if (aMatch !== bMatch) return bMatch - aMatch;
    }
    return (b.balance ?? -1) - (a.balance ?? -1);
  });
  const suggestedBestKey = candidateKeysWithSufficientBalance.length > 0 ? candidateKeysWithSufficientBalance[0] : null;
  const maxBalanceAmongAllKeys = keys.length > 0 ? Math.max(...keys.map((k) => k.balance ?? -1)) : -1;

  const handleSwitchProvider = (newProv: ProviderType) => {
    setProvider(newProv);

    // Auto switch key to matching type if possible
    if (newProv === 'ElevenLabs_Official') {
      const match = keys.find((k) => k.source === 'elevenlabs');
      if (match && match.key !== selectedKey) {
        onSelectKey(match.key);
      }
    } else {
      const match = keys.find((k) => k.source === 'genmax' || !k.source);
      if (match && match.key !== selectedKey) {
        onSelectKey(match.key);
      }
    }
  };

  // Quick check balance for the active key
  const handleQuickCheckBalance = async (keyToCheck?: string) => {
    const targetKey = (keyToCheck || selectedKey)?.trim();
    if (!targetKey) return;

    setIsCheckingBalance(true);
    try {
      let balResult: any = null;

      // 1. Try server check endpoint
      try {
        const res = await fetch('/api/keys/check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apiKey: targetKey }),
        });
        if (res.ok) {
          balResult = await res.json();
        }
      } catch {}

      // 2. Fallback to direct client API check
      if (!balResult || balResult.balance === -1) {
        balResult = await fetchDirectBalance(targetKey, currentKeyItem?.source);
      }

      if (balResult && balResult.balance !== -1) {
        const locals = getLocalKeys();
        const target = locals.find((x) => x.key === targetKey);
        if (target) {
          target.balance = balResult.balance;
          if (balResult.limit !== undefined) target.limit = balResult.limit;
          if (balResult.used !== undefined) target.used = balResult.used;
          if (balResult.tier) target.tier = balResult.tier;
          if (balResult.email) target.email = balResult.email;
          if (balResult.source) target.source = balResult.source;
          saveLocalKeys(locals);
        }
        onKeysUpdated?.();
        setSuccessMessage(`Đã cập nhật số dư: ${balResult.balance.toLocaleString()} Cre (${balResult.tier || 'Hoạt động'})`);
      } else {
        setErrorMessage(
          `Không thể đọc số dư Cre cho Key này (${balResult?.error || 'Lỗi kiểm tra'}). Vui lòng kiểm tra lại Key!`
        );
      }
    } catch (err: any) {
      setErrorMessage('Lỗi khi kiểm tra số dư: ' + (err.message || 'Lỗi mạng'));
    } finally {
      setIsCheckingBalance(false);
    }
  };

  // Fetch models and voices when key or provider changes
  const fetchVoicesAndModels = async (keyToUse?: string, provToUse?: ProviderType) => {
    const k = keyToUse || selectedKey;
    const p = provToUse || provider;
    if (!k) return;

    setIsLoadingVoices(true);
    setErrorMessage(null);

    let loaded = false;
    try {
      const endpoint = p === 'ElevenLabs_Official' ? '/api/elevenlabs/data' : '/api/genmax/data';
      const res = await fetch(`${endpoint}?apiKey=${encodeURIComponent(k)}&provider=${p}`);
      if (res.ok) {
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const data = await res.json();
          if (data.models && data.models.length > 0) {
            setModels(data.models);
            setSelectedModel((prev) => (prev && data.models.some((m: any) => m.id === prev) ? prev : data.models[0].id));
          }
          if (data.voices && data.voices.length > 0) {
            setVoices(data.voices);
            setSelectedVoice((prev) => (prev && data.voices.some((v: any) => v.id === prev) ? prev : data.voices[0].id));
          }

          // Record & sync Cre balance if provided by connection response
          if (data.balance !== undefined && data.balance !== -1) {
            const locals = getLocalKeys();
            const target = locals.find((x) => x.key === k);
            if (target) {
              target.balance = data.balance;
              if (data.limit !== undefined) target.limit = data.limit;
              if (data.used !== undefined) target.used = data.used;
              if (data.tier) target.tier = data.tier;
              if (data.email) target.email = data.email;
              if (data.source) target.source = data.source;
              saveLocalKeys(locals);
            }
            onKeysUpdated?.();
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
        if (directData.models.length > 0) {
          setSelectedModel((prev) => (prev && directData.models.some((m: any) => m.id === prev) ? prev : directData.models[0].id));
        }
        if (directData.voices.length > 0) {
          setSelectedVoice((prev) => (prev && directData.voices.some((v: any) => v.id === prev) ? prev : directData.voices[0].id));
        }
        if (directData.balance !== undefined && directData.balance !== -1) {
          onKeysUpdated?.();
        }
      } catch (err: any) {
        console.warn('Fetch voices fallback:', err);
      }
    }

    setIsLoadingVoices(false);
  };

  useEffect(() => {
    if (selectedKey) {
      fetchVoicesAndModels(selectedKey, provider);
      // Auto check balance if currently untested
      const keyObj = keys.find((item) => item.key === selectedKey);
      if (keyObj && keyObj.balance === -1) {
        handleQuickCheckBalance(selectedKey);
      }
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
    const isElevenOfficial = provider === 'ElevenLabs_Official';
    const textCost = text.trim().length;

    // Smart Proactive Auto-Switch Key based on balance vs consumption:
    let keyToUse = selectedKey;
    if (autoSwitchByBalance && isCurrentKeyInsufficient && suggestedBestKey) {
      keyToUse = suggestedBestKey.key;
      onSelectKey(suggestedBestKey.key);
      setProgressMsg(
        `⚡ Tự động chuyển từ "${currentKeyItem?.name}" (${currentKeyItem?.balance} Cre) sang "${suggestedBestKey.name}" (${suggestedBestKey.balance === -1 ? 'Chưa kiểm tra' : `${suggestedBestKey.balance.toLocaleString()} Cre`}) do cần ${textCost} Cre...`
      );
    } else {
      setProgressMsg(
        isElevenOfficial ? 'Đang kết nối tới máy chủ ElevenLabs API...' : 'Đang kết nối tới máy chủ GenMax AI...'
      );
    }

    let audioUrlResult = '';
    let costResult = text.length;
    let taskIdResult = `tts_${Date.now()}`;

    // 1. Try Backend API if available
    try {
      const endpoint = isElevenOfficial ? '/api/elevenlabs/tts' : '/api/genmax/tts';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text.trim(),
          selectedKey: keyToUse,
          provider,
          voiceId: selectedVoice,
          modelId: selectedModel,
          stability: settings.stability,
          similarityBoost: settings.similarityBoost,
          style: settings.style,
          speed: settings.speed,
          pitch: settings.pitch,
          volume: settings.volume ?? 1.0,
          useSpeakerBoost: settings.useSpeakerBoost ?? true,
          outputFormat: settings.outputFormat || 'mp3_44100_128',
          latency: settings.latency || 0,
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

          // Immediately reflect remaining Cre balance
          if (data.remainingBalance !== undefined && data.remainingBalance !== -1) {
            const kUsed = data.usedKey || keyToUse;
            const locals = getLocalKeys();
            const target = locals.find((x) => x.key === kUsed);
            if (target) {
              target.balance = data.remainingBalance;
              if (typeof target.used === 'number') target.used += costResult;
              saveLocalKeys(locals);
            }
          }
          onKeysUpdated?.();

          if (data.wasRotated) {
            setSuccessMessage(
              data.switchReason ||
              `Tạo giọng thành công! (Hệ thống đã tự động chuyển sang "${data.usedKeyName || 'Key tiếp theo'}" phù hợp với số dư Cre).`
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
    if (!audioUrlResult && keyToUse && !controller.signal.aborted) {
      try {
        if (isElevenOfficial) {
          setProgressMsg('Đang gửi yêu cầu trực tiếp tới API ElevenLabs (kèm tự động đổi Key)...');
          const directRes = await generateDirectElevenLabsTts({
            text: text.trim(),
            apiKey: keyToUse,
            voiceId: selectedVoice,
            modelId: selectedModel,
            stability: settings.stability,
            similarityBoost: settings.similarityBoost,
            style: settings.style,
            speed: settings.speed,
            useSpeakerBoost: settings.useSpeakerBoost ?? true,
            outputFormat: settings.outputFormat || 'mp3_44100_128',
            latency: settings.latency || 0,
            signal: controller.signal,
          });
          audioUrlResult = directRes.audioUrl;
          costResult = directRes.cost;
          taskIdResult = `eleven_${Date.now()}`;
          if (directRes.usedKey && directRes.usedKey !== selectedKey) {
            onSelectKey(directRes.usedKey);
          }
          onKeysUpdated?.();

          if (directRes.wasRotated) {
            setSuccessMessage(
              directRes.switchReason ||
              `Tạo giọng thành công! (Tự động chuyển sang "${directRes.usedKeyName || 'Key tiếp theo'}" phù hợp với số dư Cre).`
            );
          }
        } else {
          setProgressMsg('Đang gửi yêu cầu trực tiếp tới máy chủ GenMax (kèm tự động đổi Key)...');
          const directRes = await generateDirectGenMaxTts({
            text: text.trim(),
            apiKey: keyToUse,
            provider,
            voiceId: selectedVoice,
            modelId: selectedModel,
            stability: settings.stability,
            similarityBoost: settings.similarityBoost,
            style: settings.style,
            speed: settings.speed,
            pitch: settings.pitch,
            volume: settings.volume ?? 1.0,
            useSpeakerBoost: settings.useSpeakerBoost ?? true,
            signal: controller.signal,
          });
          audioUrlResult = directRes.audioUrl;
          costResult = directRes.cost;
          taskIdResult = directRes.taskId || taskIdResult;
          if (directRes.usedKey && directRes.usedKey !== selectedKey) {
            onSelectKey(directRes.usedKey);
          }
          onKeysUpdated?.();

          if (directRes.wasRotated) {
            setSuccessMessage(
              directRes.switchReason ||
              `Tạo giọng thành công! (Tự động chuyển sang "${directRes.usedKeyName || 'Key tiếp theo'}" phù hợp với số dư Cre).`
            );
          }
        }
      } catch (directErr: any) {
        if (directErr.name === 'AbortError' || controller.signal.aborted) {
          setIsGenerating(false);
          return;
        }
        setErrorMessage(directErr.message || (isElevenOfficial ? 'Lỗi kết nối ElevenLabs' : 'Lỗi kết nối GenMax'));
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
        const unit = isElevenOfficial ? 'ký tự' : 'credits';
        setSuccessMessage(`Tạo âm thanh thành công! Tiêu hao: ${costResult.toLocaleString()} ${unit}.`);
      }

      const vItem = voices.find((v) => v.id === selectedVoice);
      const newItem: GeneratedAudioItem = {
        id: taskIdResult,
        title: text.slice(0, 40) + (text.length > 40 ? '...' : ''),
        text: text.trim(),
        audioUrl: audioUrlResult,
        provider: `${provider === 'ElevenLabs_Official' ? 'ElevenLabs (Official)' : provider} (${vItem?.name || 'Voice'})`,
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
      <div className="bg-gradient-to-r from-blue-900/30 via-indigo-900/20 to-purple-900/30 border border-blue-500/20 rounded-2xl p-5 relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="w-4 h-4 text-purple-400" />
              <h2 className="text-base font-bold text-slate-100">
                Chế Độ Online (ElevenLabs Official & GenMax AI)
              </h2>
            </div>
            <p className="text-xs text-slate-400">
              Hỗ trợ cả API ElevenLabs chính thức (đầy đủ giọng Clone riêng) lẫn hệ thống GenMax Proxy tiết kiệm chi phí.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {currentKeyItem && (
              <div className="px-3 py-1.5 bg-slate-900/90 border border-slate-700/60 rounded-xl text-xs flex items-center gap-2 shadow-inner">
                <span className="text-slate-400">Số dư:</span>
                <span className="font-bold text-emerald-400">
                  {currentKeyItem.balance !== -1
                    ? `${currentKeyItem.balance.toLocaleString()} Cre`
                    : 'Chưa kiểm tra'}
                </span>
                {currentKeyItem.tier && (
                  <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-purple-300 font-mono">
                    {currentKeyItem.tier}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => handleQuickCheckBalance()}
                  disabled={isCheckingBalance}
                  className="text-slate-400 hover:text-emerald-400 p-0.5 transition cursor-pointer"
                  title="Kiểm tra lại số dư Cre"
                >
                  <RefreshCw className={`w-3 h-3 ${isCheckingBalance ? 'animate-spin text-emerald-400' : ''}`} />
                </button>
              </div>
            )}
            <button
              onClick={onOpenKeyManager}
              className="px-3 py-1.5 bg-blue-600/80 hover:bg-blue-600 text-white rounded-xl text-xs font-medium transition cursor-pointer"
            >
              Quản lý Key
            </button>
          </div>
        </div>
      </div>

      {/* Notice when ElevenLabs Official is active but no ElevenLabs key is present */}
      {provider === 'ElevenLabs_Official' && !keys.some((k) => k.source === 'elevenlabs') && (
        <div className="p-3.5 bg-purple-950/40 border border-purple-500/30 rounded-xl flex items-center justify-between gap-3 text-xs text-purple-200">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-400 shrink-0" />
            <span>
              Bạn đang chọn <b>ElevenLabs Chính Thức</b>. Hãy lấy API Key tại{' '}
              <a
                href="https://elevenlabs.io/app/api"
                target="_blank"
                rel="noreferrer"
                className="text-blue-400 font-semibold underline inline-flex items-center gap-1"
              >
                elevenlabs.io/app/api <ExternalLink className="w-3 h-3" />
              </a>{' '}
              và thêm vào Quản Lý Key để tải danh sách toàn bộ Giọng Clone của bạn.
            </span>
          </div>
          <button
            onClick={onOpenKeyManager}
            className="px-2.5 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-semibold shrink-0 cursor-pointer"
          >
            Thêm Key Ngay
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Settings & Configuration (5 cols) */}
        <div className="lg:col-span-5 space-y-5">
          {/* 1. API Key Selector */}
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <span>🔑 1. Chọn API Key</span>
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleQuickCheckBalance()}
                  disabled={isCheckingBalance || !selectedKey}
                  className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer transition"
                  title="Kiểm tra số dư Cre của Key này"
                >
                  <RefreshCw className={`w-3 h-3 ${isCheckingBalance ? 'animate-spin' : ''}`} />
                  <span>{isCheckingBalance ? 'Đang kiểm tra...' : 'Kiểm tra Cre'}</span>
                </button>
                <button
                  onClick={() => fetchVoicesAndModels()}
                  disabled={isLoadingVoices}
                  className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 cursor-pointer transition"
                  title="Tải lại danh sách giọng"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingVoices ? 'animate-spin' : ''}`} />
                  <span>Làm mới giọng</span>
                </button>
              </div>
            </div>

            {keys.length === 0 ? (
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-300 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Chưa có API Key nào!</p>
                  <p className="text-[11px] text-amber-400/80 mt-0.5">
                    Bấm "Quản lý Key" để thêm mã API Key của bạn từ ElevenLabs hoặc GenMax.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-2.5">
                <select
                  id="select-api-key"
                  value={selectedKey}
                  onChange={(e) => onSelectKey(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-blue-500 font-mono"
                >
                  {keys.map((k) => (
                    <option key={k.key} value={k.key}>
                      {k.label || k.name}
                    </option>
                  ))}
                </select>

                {currentKeyItem && (
                  <div className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-xl text-xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-400">Nguồn:</span>
                        <span
                          className={`font-semibold px-1.5 py-0.5 rounded text-[11px] ${
                            currentKeyItem.source === 'elevenlabs'
                              ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                              : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                          }`}
                        >
                          {currentKeyItem.source === 'elevenlabs' ? 'ElevenLabs Official' : 'GenMax Proxy'}
                        </span>
                        {currentKeyItem.tier && (
                          <span className="text-[10px] text-slate-400">({currentKeyItem.tier})</span>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        <span className="text-slate-400">Số dư:</span>
                        <span className="font-bold text-emerald-400 text-sm">
                          {currentKeyItem.balance !== -1
                            ? `${currentKeyItem.balance.toLocaleString()} Cre`
                            : 'Chưa kiểm tra'}
                        </span>
                      </div>
                    </div>

                    {currentKeyItem.limit !== undefined && currentKeyItem.limit > 0 && (
                      <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-900">
                        <span>
                          Đã dùng: <b className="text-slate-400">{(currentKeyItem.used || 0).toLocaleString()}</b>
                        </span>
                        <span>
                          Hạn mức: <b className="text-slate-400">{currentKeyItem.limit.toLocaleString()}</b>
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Auto Switch Key by Balance Setting */}
                <div className="p-2.5 bg-slate-950/70 border border-slate-800/80 rounded-xl flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-1.5 text-slate-300">
                    <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <div>
                      <span className="font-semibold text-slate-200 block text-[11px]">Tự chuyển Key theo số dư Cre</span>
                      <span className="text-[10px] text-slate-500 block">Ưu tiên Key có Cre ≥ chi phí tạo giọng</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={toggleAutoSwitch}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition flex items-center gap-1 cursor-pointer shrink-0 ${
                      autoSwitchByBalance
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                        : 'bg-slate-800 text-slate-400 border border-slate-700'
                    }`}
                    title="Bật/Tắt chế độ tự động chọn Key phù hợp với số dư và lượng tiêu hao"
                  >
                    <ArrowRightLeft className="w-3 h-3" />
                    <span>{autoSwitchByBalance ? 'Đang BẬT' : 'Đang TẮT'}</span>
                  </button>
                </div>
              </div>
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
              <div className="space-y-2">
                {/* ElevenLabs Official */}
                <button
                  type="button"
                  onClick={() => handleSwitchProvider('ElevenLabs_Official')}
                  className={`w-full p-2.5 rounded-xl text-left border transition flex items-center justify-between cursor-pointer ${
                    provider === 'ElevenLabs_Official'
                      ? 'bg-purple-950/30 border-purple-500 text-purple-200 shadow-sm'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div>
                    <div className="text-xs font-bold flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                      <span>ElevenLabs Chính Thức</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      api.elevenlabs.io • Đầy đủ Giọng Clone & Đa ngôn ngữ v2
                    </p>
                  </div>
                  <span className="text-[10px] bg-purple-500/20 text-purple-300 border border-purple-500/30 px-1.5 py-0.5 rounded font-mono">
                    Official
                  </span>
                </button>

                {/* GenMax ElevenLabs & MiniMax */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleSwitchProvider('ElevenLabs')}
                    className={`py-2 px-3 rounded-xl text-xs font-semibold border transition text-center cursor-pointer ${
                      provider === 'ElevenLabs'
                        ? 'bg-blue-600/20 border-blue-500 text-blue-300 shadow-sm'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <span>GenMax (ElevenLabs)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSwitchProvider('MiniMax')}
                    className={`py-2 px-3 rounded-xl text-xs font-semibold border transition text-center cursor-pointer ${
                      provider === 'MiniMax'
                        ? 'bg-blue-600/20 border-blue-500 text-blue-300 shadow-sm'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <span>GenMax (MiniMax)</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Model Select */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <label className="text-xs text-slate-400">Mô Hình AI (Model)</label>
                  {selectedModel.toLowerCase().includes('v3') && (
                    <span className="text-[10px] bg-purple-500/20 text-purple-300 border border-purple-500/30 px-1.5 py-0.5 rounded font-semibold flex items-center gap-1">
                      <Sparkles className="w-2.5 h-2.5" /> v3 Flagship
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const next = !isCustomModel;
                      setIsCustomModel(next);
                      if (next) {
                        setCustomModelInput(selectedModel || 'eleven_v3');
                      }
                    }}
                    className="text-[11px] text-blue-400 hover:text-blue-300 cursor-pointer transition"
                  >
                    {isCustomModel ? 'Chọn danh sách' : 'Tự nhập ID'}
                  </button>
                  {isLoadingVoices && (
                    <span className="text-[11px] text-blue-400 flex items-center gap-1">
                      <RefreshCw className="w-3 h-3 animate-spin" /> Đang tải...
                    </span>
                  )}
                </div>
              </div>

              {!isCustomModel ? (
                <select
                  id="select-model"
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  disabled={isLoadingVoices}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                >
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="space-y-1.5">
                  <input
                    type="text"
                    value={customModelInput}
                    onChange={(e) => {
                      setCustomModelInput(e.target.value);
                      setSelectedModel(e.target.value);
                    }}
                    placeholder="Nhập mã Model (VD: eleven_v3, eleven_multilingual_v2...)"
                    className="w-full px-3 py-2 bg-slate-950 border border-blue-500/60 rounded-xl text-xs text-slate-100 font-mono focus:outline-none focus:border-blue-400"
                  />
                  <div className="flex flex-wrap items-center gap-1 text-[10px]">
                    <span className="text-slate-500">Gợi ý nhanh:</span>
                    {['eleven_v3', 'eleven_multilingual_v2', 'eleven_turbo_v2_5', 'eleven_flash_v2_5'].map((id) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => {
                          setCustomModelInput(id);
                          setSelectedModel(id);
                        }}
                        className={`px-1.5 py-0.5 rounded border font-mono transition cursor-pointer ${
                          selectedModel === id
                            ? 'bg-blue-600 text-white border-blue-500'
                            : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-slate-500'
                        }`}
                      >
                        {id}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* v3 Informational helper */}
              {selectedModel.toLowerCase().includes('v3') && (
                <div className="mt-1.5 p-2 bg-purple-950/30 border border-purple-500/25 rounded-lg text-[11px] text-purple-300/90 flex items-start gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-purple-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-purple-200">Mô hình Eleven v3:</span> Biểu cảm diễn đạt chân thực đỉnh cao, hỗ trợ nhận diện trực tiếp các thẻ cảm xúc kịch bản (audio tags như <code className="text-purple-300 bg-purple-900/50 px-1 py-0.5 rounded">[whispers]</code>, <code className="text-purple-300 bg-purple-900/50 px-1 py-0.5 rounded">[laughs]</code>, <code className="text-purple-300 bg-purple-900/50 px-1 py-0.5 rounded">[sighs]</code>, <code className="text-purple-300 bg-purple-900/50 px-1 py-0.5 rounded">[excited]</code>).
                  </div>
                </div>
              )}
            </div>

            {/* Voice Select with Filters & Sample Preview */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs text-slate-400 font-medium flex items-center gap-1.5">
                  <span>Giọng Đọc</span>
                  <span className="text-[10px] text-slate-500 font-normal">
                    ({filteredVoices.length}/{voices.length} giọng)
                  </span>
                </label>
                {selectedVoiceObj?.previewUrl && (
                  <button
                    type="button"
                    onClick={() => handlePreviewVoice(selectedVoiceObj)}
                    className={`text-[11px] px-2 py-0.5 rounded-lg border flex items-center gap-1 transition cursor-pointer ${
                      previewingVoiceId === selectedVoiceObj.id
                        ? 'bg-purple-600 text-white border-purple-500 animate-pulse'
                        : 'bg-slate-800 text-purple-300 border-purple-500/30 hover:bg-slate-700'
                    }`}
                    title="Nghe thử mẫu giọng này"
                  >
                    {previewingVoiceId === selectedVoiceObj.id ? (
                      <>
                        <Pause className="w-3 h-3" />
                        <span>Đang phát thử...</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3 h-3" />
                        <span>Nghe thử mẫu</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              {/* Category Filter Chips */}
              <div className="flex flex-wrap items-center gap-1">
                {[
                  { id: 'all', label: 'Tất cả' },
                  { id: 'clone', label: '⭐ Giọng Clone' },
                  { id: 'female', label: 'Nữ' },
                  { id: 'male', label: 'Nam' },
                  { id: 'pro', label: 'Hệ thống / Chuẩn' },
                ].map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setVoiceFilterCategory(cat.id as any)}
                    className={`px-2 py-0.5 rounded-md text-[10px] font-medium border transition cursor-pointer ${
                      voiceFilterCategory === cat.id
                        ? 'bg-blue-600/30 text-blue-300 border-blue-500/50'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              {/* Search Voice Input */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={voiceSearchQuery}
                  onChange={(e) => setVoiceSearchQuery(e.target.value)}
                  placeholder="Tìm kiếm giọng đọc theo tên, phong cách, giới tính..."
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500"
                />
                {voiceSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setVoiceSearchQuery('')}
                    className="text-slate-500 hover:text-slate-300 absolute right-2.5 top-1/2 -translate-y-1/2 text-xs cursor-pointer"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Voice Select Dropdown */}
              <select
                id="select-voice"
                value={selectedVoice}
                onChange={(e) => setSelectedVoice(e.target.value)}
                disabled={isLoadingVoices}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-blue-500"
              >
                {filteredVoices.length === 0 ? (
                  <option value="">Không tìm thấy giọng phù hợp bộ lọc</option>
                ) : (
                  filteredVoices.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))
                )}
              </select>

              {/* Active Voice Information Tag */}
              {selectedVoiceObj && (
                <div className="px-2.5 py-1.5 bg-slate-950/60 border border-slate-800/80 rounded-lg text-[11px] text-slate-400 flex items-center justify-between gap-2">
                  <div className="truncate">
                    <span className="text-slate-500">Mã giọng: </span>
                    <span className="font-mono text-slate-300">{selectedVoiceObj.id}</span>
                  </div>
                  {selectedVoiceObj.tag && (
                    <span className="px-1.5 py-0.2 rounded bg-slate-800 text-[10px] text-blue-300 shrink-0">
                      {selectedVoiceObj.tag}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Emotion & Audio Parameter sliders */}
            <div className="pt-3 border-t border-slate-800/80 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
                  <Sliders className="w-3.5 h-3.5 text-blue-400" />
                  <span>Tham Số Giọng & Âm Thanh</span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setSettings({
                      stability: 0.5,
                      similarityBoost: 0.75,
                      style: 0.0,
                      speed: 1.0,
                      pitch: 0,
                      volume: 1.0,
                      useSpeakerBoost: true,
                      outputFormat: 'mp3_44100_128',
                      latency: 0,
                    })
                  }
                  className="text-[10px] text-slate-500 hover:text-slate-300 flex items-center gap-1 cursor-pointer transition"
                  title="Đặt lại thông số mặc định"
                >
                  <RotateCcw className="w-2.5 h-2.5" />
                  <span>Mặc định</span>
                </button>
              </div>

              {provider === 'ElevenLabs' || provider === 'ElevenLabs_Official' ? (
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
                    <div className="flex justify-between text-[10px] text-slate-600 mt-0.5">
                      <span>Cảm xúc tự nhiên</span>
                      <span>Ổn định chuẩn xác</span>
                    </div>
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
                      <span>Cường độ biểu cảm (Style Exaggeration)</span>
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

                  {/* Speaker Boost & Format Controls */}
                  <div className="grid grid-cols-1 gap-2 pt-1 border-t border-slate-900">
                    <label className="flex items-center justify-between p-2 bg-slate-950/70 border border-slate-800/80 rounded-xl cursor-pointer hover:border-slate-700 transition">
                      <div className="text-xs">
                        <span className="text-slate-200 font-medium block">Khuyếch đại & Làm rõ người nói</span>
                        <span className="text-[10px] text-slate-500 block">Speaker Boost: Tăng độ nét & âm vực giọng gốc</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={settings.useSpeakerBoost ?? true}
                        onChange={(e) => setSettings({ ...settings, useSpeakerBoost: e.target.checked })}
                        className="w-4 h-4 rounded border-slate-700 text-blue-600 focus:ring-blue-500 bg-slate-900 cursor-pointer accent-blue-500"
                      />
                    </label>
                  </div>

                  {/* Output Audio Format */}
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Định Dạng Âm Thanh (Output Format)</label>
                    <select
                      value={settings.outputFormat || 'mp3_44100_128'}
                      onChange={(e) => setSettings({ ...settings, outputFormat: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                    >
                      <option value="mp3_44100_128">MP3 128 kbps (Chuẩn - Tải nhanh)</option>
                      <option value="mp3_44100_192">MP3 192 kbps (Studio HQ - Chất lượng cao)</option>
                      <option value="pcm_44100">WAV 44.1kHz (Lossless - Không nén)</option>
                      <option value="pcm_24000">WAV 24kHz (WAV nhẹ)</option>
                    </select>
                  </div>
                </>
              ) : (
                <>
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

                  <div>
                    <div className="flex justify-between text-xs text-slate-400 mb-1">
                      <span>Âm lượng (Volume)</span>
                      <span className="font-mono text-blue-400">{settings.volume ?? 1.0}x</span>
                    </div>
                    <input
                      type="range"
                      min={0.1}
                      max={2.0}
                      step={0.1}
                      value={settings.volume ?? 1.0}
                      onChange={(e) => setSettings({ ...settings, volume: parseFloat(e.target.value) })}
                      className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                  </div>
                </>
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
                  step={0.05}
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

            {/* Audio Tags Toolbar for Model v3 */}
            {selectedModel.toLowerCase().includes('v3') && (
              <div className="p-2.5 bg-gradient-to-r from-purple-950/40 to-slate-900/60 border border-purple-500/30 rounded-xl space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-purple-300 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                    Thẻ cảm xúc ngữ điệu (Eleven v3 Audio Tags):
                  </span>
                  <span className="text-[11px] text-purple-400/80">Click để chèn vào vị trí con trỏ</span>
                </div>
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {AUDIO_TAGS_V3.map((item) => (
                    <button
                      key={item.tag}
                      type="button"
                      onClick={() => handleInsertTag(item.tag)}
                      title={`${item.tag} - ${item.desc}`}
                      className="px-2 py-1 bg-purple-950/60 hover:bg-purple-900/80 border border-purple-500/30 hover:border-purple-400/50 rounded-lg text-purple-200 font-mono text-[11px] flex items-center gap-1 transition cursor-pointer active:scale-95"
                    >
                      <span className="font-semibold">{item.tag}</span>
                      <span className="text-[10px] text-purple-300/70 font-sans font-normal">({item.label})</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Quick Text Formatting Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-1.5 text-xs py-1 border-y border-slate-800/80">
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-slate-500 text-[11px] mr-1 flex items-center gap-1">
                  <Wand2 className="w-3 h-3 text-blue-400" /> Công cụ nhanh:
                </span>
                <button
                  type="button"
                  onClick={handleNormalizeNumbers}
                  className="px-2 py-0.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-md text-[11px] text-slate-300 transition cursor-pointer"
                  title="Chuyển đổi ký hiệu như $100 -> 100 đô la, 50% -> 50 phần trăm để AI đọc chuẩn"
                >
                  Chuẩn hóa số & đơn vị
                </button>
                <button
                  type="button"
                  onClick={handleCleanWhitespace}
                  className="px-2 py-0.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-md text-[11px] text-slate-300 transition cursor-pointer"
                  title="Xoá bỏ khoảng trắng và dòng trống dư thừa"
                >
                  <Scissors className="w-2.5 h-2.5 inline mr-1" />
                  Dọn khoảng trắng
                </button>
                <button
                  type="button"
                  onClick={() => handleInsertTag('[pause]')}
                  className="px-2 py-0.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-md text-[11px] text-slate-300 transition cursor-pointer"
                  title="Chèn điểm dừng nghỉ ngắt câu"
                >
                  + Chèn nghỉ [pause]
                </button>
              </div>

              {text.trim() && (
                <button
                  type="button"
                  onClick={() => setText('')}
                  className="text-[11px] text-slate-500 hover:text-rose-400 cursor-pointer transition"
                >
                  Xoá văn bản
                </button>
              )}
            </div>

            {/* Textarea */}
            <div className="relative">
              <textarea
                ref={textareaRef}
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
              <div className="flex items-center gap-3 text-slate-400">
                <div className="flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5" />
                  <span>Ký tự: <b className="text-slate-200 font-mono">{text.length}</b></span>
                </div>
                <div className="flex items-center gap-1.5 text-slate-500">
                  <span>Từ: <b className="text-slate-300 font-mono">{wordCount}</b></span>
                </div>
                <div className="flex items-center gap-1.5 text-slate-400">
                  <Clock className="w-3.5 h-3.5 text-blue-400" />
                  <span>Thời lượng ước tính: <b className="text-blue-300 font-mono">~{estimatedSeconds}s</b></span>
                </div>
              </div>

              <div className="flex items-center gap-1.5 text-amber-400 font-medium">
                <Zap className="w-3.5 h-3.5 fill-amber-400" />
                <span>
                  Ước tính tiêu hao:{' '}
                  <b className="font-mono text-amber-300">
                    {estimatedCredits.toLocaleString()} {provider === 'ElevenLabs_Official' ? 'Ký tự' : 'Credits'}
                  </b>
                </span>
              </div>
            </div>

            {/* Live Smart Balance Routing Feedback */}
            {cost > 0 && currentKeyItem && (
              <div>
                {isCurrentKeyInsufficient ? (
                  suggestedBestKey ? (
                    <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-start gap-2.5">
                        <Zap className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                        <div>
                          <div className="font-semibold text-amber-300 flex items-center gap-1.5">
                            <span>⚡ Tự chuyển Key phù hợp: Cần {cost} Cre</span>
                          </div>
                          <p className="text-amber-200/80 text-[11px] mt-0.5 leading-relaxed">
                            Key đang chọn (<span className="text-white font-medium">{currentKeyItem.name}</span>) chỉ còn{' '}
                            <b className="text-rose-400 font-mono">{currentKeyItem.balance} Cre</b>.
                            {autoSwitchByBalance ? (
                              <>
                                {' '}Hệ thống sẽ <b>tự động chuyển sang</b> "{suggestedBestKey.name}" ({suggestedBestKey.balance === -1 ? 'Chưa kiểm tra' : `${suggestedBestKey.balance.toLocaleString()} Cre`}) khi tạo giọng!
                              </>
                            ) : (
                              <>
                                {' '}Key hiện tại không đủ Cre. Khuyến nghị bạn chuyển sang "{suggestedBestKey.name}".
                              </>
                            )}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onSelectKey(suggestedBestKey.key)}
                        className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg shrink-0 transition cursor-pointer self-start sm:self-center shadow-sm"
                      >
                        Chuyển sang {suggestedBestKey.name}
                      </button>
                    </div>
                  ) : (
                    <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs flex items-start gap-2.5 text-red-300">
                      <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold text-red-200">Cảnh báo: Không có Key nào đủ {cost} Cre!</p>
                        <p className="text-[11px] text-red-300/80 mt-0.5">
                          Key có số dư cao nhất hiện có {maxBalanceAmongAllKeys > 0 ? `${maxBalanceAmongAllKeys.toLocaleString()} Cre` : '0 Cre'}. Vui lòng rút ngắn văn bản hoặc bổ sung API Key mới.
                        </p>
                      </div>
                    </div>
                  )
                ) : isBalanceKnown ? (
                  <div className="px-3 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-300 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                      <span>
                        Key đang chọn đủ số dư: <b className="text-emerald-200 font-mono">{currentKeyItem.balance.toLocaleString()} Cre</b> (Cần {cost} Cre)
                      </span>
                    </div>
                    <span className="text-[11px] text-emerald-400/80">Sẵn sàng tạo giọng</span>
                  </div>
                ) : null}
              </div>
            )}

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
