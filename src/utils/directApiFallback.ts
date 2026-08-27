// directApiFallback.ts - Provides client-side execution when running on static hosts like Netlify
import { KeyItem, ProviderType, ModelOption, VoiceOption } from '../types';

const LOCAL_STORAGE_KEYS = 'genmax_saved_keys';

export interface LocalKeyData {
  key: string;
  name: string;
  balance: number;
  email: string;
}

export function getLocalKeys(): LocalKeyData[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEYS);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveLocalKeys(keys: LocalKeyData[]) {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEYS, JSON.stringify(keys));
  } catch (e) {
    console.warn('Failed to save keys to localStorage:', e);
  }
}

export async function checkColabHealth(colabUrl: string): Promise<{
  alive: boolean;
  responseTimeMs?: number;
  message: string;
}> {
  if (!colabUrl || !colabUrl.trim()) {
    return { alive: false, message: 'Chưa có link Colab' };
  }

  // 1. Try Backend Proxy first
  try {
    const res = await fetch('/api/colab/ping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ colabUrl: colabUrl.trim() }),
      signal: AbortSignal.timeout(6000),
    });
    if (res.ok) {
      const data = await res.json();
      return data;
    }
  } catch {}

  // 2. Direct browser check (CORS mode: 'no-cors' ping check)
  let cleanUrl = colabUrl.trim().replace(/\/$/, '');
  if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
    cleanUrl = `https://${cleanUrl}`;
  }

  const startTime = Date.now();
  try {
    await fetch(cleanUrl, {
      method: 'GET',
      mode: 'no-cors',
      signal: AbortSignal.timeout(5000),
    });
    const responseTime = Date.now() - startTime;
    return {
      alive: true,
      responseTimeMs: responseTime,
      message: `Colab phản hồi tốt (${responseTime}ms)`,
    };
  } catch (e: any) {
    return {
      alive: false,
      message: 'Không thể kết nối đến Colab (Đã hết hạn hoặc chưa chạy Colab)',
    };
  }
}

export async function fetchDirectBalance(apiKey: string): Promise<{ balance: number; email: string }> {
  try {
    const res = await fetch('https://api.genmax.io/v1/auth/me', {
      headers: { 'xi-api-key': apiKey },
      signal: AbortSignal.timeout(6000),
    });
    if (res.ok) {
      const data = await res.json();
      return {
        balance: data.credit_balance ?? data.balance ?? 0,
        email: data.email || '',
      };
    }
  } catch (e) {
    console.warn('Direct balance fetch failed (CORS or network):', e);
  }
  return { balance: -1, email: '' };
}

export async function fetchDirectGenMaxData(
  apiKey: string,
  provider: ProviderType
): Promise<{ models: ModelOption[]; voices: VoiceOption[] }> {
  const providerKey = provider === 'MiniMax' ? 'minimax' : 'elevenlabs';
  const headers = { 'xi-api-key': apiKey };

  let models: ModelOption[] = [];
  let voices: VoiceOption[] = [];

  // Try direct fetch models
  try {
    const res = await fetch(`https://api.genmax.io/v1/models?provider=${providerKey}`, {
      headers,
      signal: AbortSignal.timeout(6000),
    });
    if (res.ok) {
      const data = await res.json();
      models = (Array.isArray(data) ? data : []).map((m: any) => ({
        id: m.model_id || m.id,
        name: m.name || m.model_id || m.id,
      }));
    }
  } catch {
    // ignore
  }

  if (models.length === 0) {
    models =
      providerKey === 'elevenlabs'
        ? [
            { id: 'eleven_turbo_v2_5', name: 'Eleven Turbo v2.5 (Nhanh & Tự Nhiên)' },
            { id: 'eleven_multilingual_v2', name: 'Eleven Multilingual v2 (Đa Ngôn Ngữ Chuẩn)' },
            { id: 'eleven_monolingual_v1', name: 'Eleven Monolingual v1' },
          ]
        : [
            { id: 'speech-2.8-turbo', name: 'MiniMax Speech 2.8 Turbo' },
            { id: 'speech-2.5', name: 'MiniMax Speech 2.5' },
          ];
  }

  // Try direct fetch voices
  if (providerKey === 'elevenlabs') {
    try {
      const res = await fetch('https://api.genmax.io/v1/default-voices?page_size=100', {
        headers,
        signal: AbortSignal.timeout(6000),
      });
      if (res.ok) {
        const data = await res.json();
        const rawVoices = data.voices || [];
        voices = rawVoices.map((v: any) => ({
          id: v.voice_id || v.id,
          name: `${v.name || 'Voice'} (${v.accent || v.category || 'Tiếng Việt / Quốc Tế'})`,
          tag: v.category || v.accent || 'Default',
          previewUrl: v.preview_url,
        }));
      }
    } catch {
      // ignore
    }

    if (voices.length === 0) {
      voices = [
        { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam (Nam - Giọng Đọc Chuẩn Sâu Lắng)', tag: 'Nam' },
        { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel (Nữ - Truyền Cảm, Nhẹ Nhàng)', tag: 'Nữ' },
        { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni (Nam - Trầm Ấm, Tin Tức)', tag: 'Nam' },
        { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella (Nữ - Ngọt Ngào, Trẻ Trung)', tag: 'Nữ' },
        { id: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi (Nữ - Tươi Vui, Kể Chuyện)', tag: 'Nữ' },
        { id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold (Nam - Mạnh Mẽ, Lôi Cuốn)', tag: 'Nam' },
      ];
    }
  } else {
    // MiniMax voices
    voices = [
      { id: 'male-qn-qingse', name: 'Thanh Niên Trẻ (Nam - Hiện Đại)', tag: 'Nam' },
      { id: 'female-shaonv', name: 'Thiếu Nữ (Nữ - Dễ Thương)', tag: 'Nữ' },
      { id: 'male-qn-jingying', name: 'Doanh Nhân (Nam - Trưởng Thành)', tag: 'Nam' },
      { id: 'female-yujie', name: 'Nữ Doanh Nhân (Nữ - Quyến Rũ)', tag: 'Nữ' },
      { id: 'presenter_male', name: 'MC Nam (Nam - Truyền Hình)', tag: 'Nam' },
      { id: 'presenter_female', name: 'MC Nữ (Nữ - Truyền Hình)', tag: 'Nữ' },
    ];
  }

  return { models, voices };
}

export async function generateDirectGenMaxTts(params: {
  text: string;
  apiKey: string;
  provider: ProviderType;
  voiceId: string;
  modelId: string;
  stability?: number;
  similarityBoost?: number;
  style?: number;
  speed?: number;
  signal?: AbortSignal;
}): Promise<{ audioUrl: string; cost: number; taskId?: string; usedKey?: string; usedKeyName?: string; wasRotated?: boolean }> {
  const { text, apiKey, provider, voiceId, modelId, stability, similarityBoost, style, speed, signal } = params;
  const providerKey = provider === 'MiniMax' ? 'minimax' : 'elevenlabs';
  const url = `https://api.genmax.io/v1/text-to-speech/${voiceId}?provider=${providerKey}`;

  const payloadBase: any = {
    text: text.trim(),
    model_id: modelId || (provider === 'MiniMax' ? 'speech-2.8-turbo' : 'eleven_turbo_v2_5'),
    provider: providerKey,
    language_code: provider === 'MiniMax' ? 'Vietnamese' : 'vi',
    voice_settings: {
      stability: stability ?? 0.5,
      similarity_boost: similarityBoost ?? 0.75,
      style: style ?? 0.0,
      speed: speed ?? 1.0,
    },
  };

  // Build candidate keys from localStorage
  const savedLocals = getLocalKeys();
  const candidateKeys: Array<{ key: string; name: string }> = [];
  
  if (apiKey) {
    const existing = savedLocals.find((l) => l.key === apiKey);
    candidateKeys.push({ key: apiKey, name: existing?.name || 'Key đang chọn' });
  }

  for (const l of savedLocals) {
    if (l.key !== apiKey) {
      candidateKeys.push({ key: l.key, name: l.name });
    }
  }

  if (candidateKeys.length === 0) {
    throw new Error('Chưa có API Key nào được cài đặt. Vui lòng thêm Key trong Quản Lý Key!');
  }

  let lastErrorMsg = '';

  for (const item of candidateKeys) {
    const currentKey = item.key;
    const currentKeyName = item.name;
    const headers = {
      'Content-Type': 'application/json',
      'xi-api-key': currentKey,
    };

    if (signal?.aborted) {
      throw new DOMException('User aborted', 'AbortError');
    }

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payloadBase),
        signal,
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        const lowerErr = errText.toLowerCase();

        // Check if error is due to insufficient credits or invalid key
        const isCreditOrAuthError =
          res.status === 401 ||
          res.status === 402 ||
          res.status === 429 ||
          lowerErr.includes('insufficient credits') ||
          lowerErr.includes('credits') ||
          lowerErr.includes('balance') ||
          lowerErr.includes('unauthorized') ||
          lowerErr.includes('invalid');

        if (isCreditOrAuthError || (res.status === 400 && lowerErr.includes('credit'))) {
          // Zero out balance locally
          const updatedLocals = getLocalKeys();
          const target = updatedLocals.find((k) => k.key === currentKey);
          if (target) {
            target.balance = 0;
            saveLocalKeys(updatedLocals);
          }
          console.warn(`[Direct Auto-Rotate] Key "${currentKeyName}" hết credits (${errText}). Đang xoay sang Key tiếp theo...`);
          lastErrorMsg = `Key "${currentKeyName}": ${errText || 'Hết credits'}`;
          continue; // ROTATE TO NEXT KEY!
        }

        lastErrorMsg = `Key "${currentKeyName}": ${errText || res.statusText}`;
        continue;
      }

      const initData = await res.json();
      const taskId = initData.id || initData.task_id;
      const cost = text.length;

      if (!taskId) {
        const directAudio = initData.audio_url || initData.result?.audio_url;
        if (directAudio) {
          return {
            audioUrl: directAudio,
            cost,
            usedKey: currentKey,
            usedKeyName: currentKeyName,
            wasRotated: currentKey !== apiKey,
          };
        }
        lastErrorMsg = 'Không nhận được Task ID từ GenMax';
        continue;
      }

      // Polling
      let completedAudio = '';
      for (let i = 0; i < 40; i++) {
        if (signal?.aborted) {
          throw new DOMException('User aborted', 'AbortError');
        }
        await new Promise((r) => setTimeout(r, 2000));
        if (signal?.aborted) {
          throw new DOMException('User aborted', 'AbortError');
        }
        try {
          const pollRes = await fetch(`https://api.genmax.io/v1/history/${taskId}`, { headers, signal });
          if (pollRes.ok) {
            const pollData = await pollRes.json();
            if (pollData.status === 'completed') {
              completedAudio = pollData.result?.audio_url || pollData.audio_url;
              if (completedAudio) break;
            } else if (pollData.status === 'failed') {
              lastErrorMsg = pollData.error || 'Tạo giọng thất bại từ GenMax';
              break;
            }
          }
        } catch (e: any) {
          if (e.name === 'AbortError' || signal?.aborted) throw e;
          if (e.message?.includes('thất bại')) throw e;
        }
      }

      if (completedAudio) {
        return {
          audioUrl: completedAudio,
          cost,
          taskId,
          usedKey: currentKey,
          usedKeyName: currentKeyName,
          wasRotated: currentKey !== apiKey,
        };
      }
    } catch (tryErr: any) {
      if (tryErr.name === 'AbortError' || signal?.aborted) throw tryErr;
      lastErrorMsg = tryErr.message;
      continue;
    }
  }

  throw new Error(
    `Tất cả (${candidateKeys.length}) API Key đều không thể tạo âm thanh hoặc đã hết credits. Chi tiết: ${lastErrorMsg}`
  );
}

export async function predictColabDirect(params: {
  colabUrl: string;
  refAudioBase64: string;
  refText: string;
  genText: string;
  speed?: number;
  nfeStep?: number;
  cfgStrength?: number;
  signal?: AbortSignal;
}): Promise<string> {
  const { colabUrl, refAudioBase64, refText, genText, speed = 1.0, nfeStep = 64, cfgStrength = 2.0, signal } = params;

  let cleanUrl = colabUrl.trim().replace(/\/$/, '');
  if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
    cleanUrl = `https://${cleanUrl}`;
  }

  // 1. Upload audio file if needed
  let uploadedFilePath = '';
  try {
    let mimeType = 'audio/wav';
    let rawBase64 = refAudioBase64;
    if (refAudioBase64.includes(';base64,')) {
      const parts = refAudioBase64.split(';base64,');
      mimeType = parts[0].replace('data:', '');
      rawBase64 = parts[1];
    }
    const byteCharacters = atob(rawBase64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: mimeType });

    const formData = new FormData();
    formData.append('files', blob, 'reference_voice.wav');

    let uploadRes = await fetch(`${cleanUrl}/gradio_api/upload`, {
      method: 'POST',
      body: formData,
      signal,
    }).catch(() => null);

    if (!uploadRes || !uploadRes.ok) {
      uploadRes = await fetch(`${cleanUrl}/upload`, {
        method: 'POST',
        body: formData,
        signal,
      }).catch(() => null);
    }

    if (uploadRes && uploadRes.ok) {
      const uploadJson = await uploadRes.json();
      uploadedFilePath = Array.isArray(uploadJson) ? uploadJson[0] : uploadJson;
    }
  } catch (e) {
    console.warn('Direct upload error, will pass raw base64:', e);
  }

  const audioPayload = uploadedFilePath ? { path: uploadedFilePath, orig_name: 'reference_voice.wav' } : refAudioBase64;

  const dataPayload = [
    audioPayload,
    refText || '',
    genText,
    false,
    false,
    '',
    speed,
    nfeStep,
    cfgStrength,
  ];

  // Try Gradio 4/5 REST prediction endpoint
  const predictUrls = [
    `${cleanUrl}/gradio_api/call/predict`,
    `${cleanUrl}/gradio_api/call/tts`,
    `${cleanUrl}/api/predict`,
    `${cleanUrl}/run/predict`,
  ];

  let lastError = '';
  for (const pUrl of predictUrls) {
    try {
      const res = await fetch(pUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: dataPayload }),
        signal,
      });

      if (res.ok) {
        const json = await res.json();
        let resultAudio = '';
        if (json.event_id) {
          // Gradio 4/5 event stream
          const streamRes = await fetch(`${pUrl}/${json.event_id}`, { signal });
          if (streamRes.ok) {
            const streamText = await streamRes.text();
            const lines = streamText.split('\n');
            for (const line of lines) {
              if (line.startsWith('data:')) {
                try {
                  const evData = JSON.parse(line.replace('data:', '').trim());
                  if (Array.isArray(evData) && evData.length > 0) {
                    const item = evData[0];
                    resultAudio = typeof item === 'string' ? item : item?.url || item?.name || item?.path || '';
                  }
                } catch {}
              }
            }
          }
        } else if (json.data && Array.isArray(json.data) && json.data.length > 0) {
          const item = json.data[0];
          resultAudio = typeof item === 'string' ? item : item?.url || item?.name || item?.path || '';
        } else if (typeof json.result === 'string') {
          resultAudio = json.result;
        }

        if (resultAudio) {
          if (!resultAudio.startsWith('http') && !resultAudio.startsWith('data:')) {
            return resultAudio.startsWith('/file=')
              ? `${cleanUrl}${resultAudio}`
              : `${cleanUrl}/file=${resultAudio.replace(/^\//, '')}`;
          }
          return resultAudio;
        }
      }
    } catch (e: any) {
      lastError = e.message;
    }
  }

  throw new Error(lastError || 'Không thể nhận kết quả âm thanh từ Colab Gradio.');
}
