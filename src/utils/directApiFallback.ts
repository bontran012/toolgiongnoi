// directApiFallback.ts - Provides client-side execution when running on static hosts like Netlify
import { KeyItem, ProviderType, ModelOption, VoiceOption } from '../types';

const LOCAL_STORAGE_KEYS = 'genmax_saved_keys';

export interface LocalKeyData {
  key: string;
  name: string;
  balance: number;
  email: string;
  source?: 'elevenlabs' | 'genmax' | 'openspeaker';
  tier?: string;
  limit?: number;
  used?: number;
  status?: string;
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

export async function fetchDirectBalance(
  apiKey: string,
  preferredSource?: 'elevenlabs' | 'genmax'
): Promise<{
  balance: number;
  email: string;
  source?: 'elevenlabs' | 'genmax';
  tier?: string;
  limit?: number;
  used?: number;
  status?: string;
  errorMessage?: string;
}> {
  let lastErrorMessage = '';

  // 1. Try Backend Proxy endpoint first (avoids CORS restrictions)
  try {
    const checkRes = await fetch('/api/keys/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: apiKey.trim(), source: preferredSource }),
      signal: AbortSignal.timeout(7000),
    });
    if (checkRes.ok) {
      const data = await checkRes.json();
      if (data.balance !== -1) {
        return {
          balance: data.balance,
          email: data.email || '',
          source: data.source,
          tier: data.tier,
          limit: data.limit,
          used: data.used,
          status: data.status,
        };
      }
      if (data.errorMessage) {
        lastErrorMessage = data.errorMessage;
      }
    }
  } catch {}

  // 2. Direct browser check fallback
  const tryElevenLabsDirect = async () => {
    try {
      // Step 2a: Try /v1/user
      const userRes = await fetch('https://api.elevenlabs.io/v1/user', {
        headers: { 'xi-api-key': apiKey.trim() },
        signal: AbortSignal.timeout(6000),
      });
      if (userRes.ok) {
        const uData = await userRes.json();
        const sub = uData.subscription || {};
        const limit = typeof sub.character_limit === 'number' ? sub.character_limit : 0;
        const used = typeof sub.character_count === 'number' ? sub.character_count : 0;
        const remaining = Math.max(0, limit - used);
        return {
          balance: remaining,
          email: uData.email || uData.first_name || '',
          source: 'elevenlabs' as const,
          tier: sub.tier || 'Active',
          limit,
          used,
          status: sub.status || 'active',
        };
      } else {
        try {
          const errData = await userRes.json();
          const detail = errData.detail || errData;
          if (detail?.status === 'api_key_id_used_as_api_key' || detail?.message?.includes('API key ID used as API key')) {
            lastErrorMessage = "Bạn đang copy nhầm 'API Key ID' thay vì 'API Key Secret'. ElevenLabs quy định API Key gọi TTS/Credit phải bắt đầu bằng 'sk_...'. Hãy vào https://elevenlabs.io/app/settings/api-keys tạo hoặc rotate key mới để lấy mã 'sk_...'!";
          } else if (detail?.message) {
            lastErrorMessage = `ElevenLabs: ${detail.message}`;
          }
        } catch {}
      }

      // Step 2b: Try /v1/user/subscription
      const subRes = await fetch('https://api.elevenlabs.io/v1/user/subscription', {
        headers: { 'xi-api-key': apiKey.trim() },
        signal: AbortSignal.timeout(6000),
      });
      if (subRes.ok) {
        const subData = await subRes.json();
        const limit = typeof subData.character_limit === 'number' ? subData.character_limit : 0;
        const used = typeof subData.character_count === 'number' ? subData.character_count : 0;
        const remaining = Math.max(0, limit - used);
        return {
          balance: remaining,
          email: '',
          source: 'elevenlabs' as const,
          tier: subData.tier || 'Active',
          limit,
          used,
          status: subData.status || 'active',
        };
      }
    } catch (e: any) {
      if (!lastErrorMessage) lastErrorMessage = e.message || 'Lỗi kiểm tra ElevenLabs';
    }
    return null;
  };

  const tryGenMaxDirect = async () => {
    try {
      const res = await fetch('https://api.genmax.io/v1/auth/me', {
        headers: { 'xi-api-key': apiKey.trim() },
        signal: AbortSignal.timeout(6000),
      });
      if (res.ok) {
        const data = await res.json();
        return {
          balance: data.credit_balance ?? data.balance ?? 0,
          email: data.email || '',
          source: 'genmax' as const,
          tier: 'GenMax',
          limit: 0,
          used: 0,
          status: 'active',
        };
      } else {
        try {
          const errData = await res.json();
          if (errData.error && !lastErrorMessage) {
            lastErrorMessage = `GenMax: ${errData.error}`;
          }
        } catch {}
      }
    } catch (err: any) {
      if (!lastErrorMessage) lastErrorMessage = err.message || 'Lỗi kiểm tra GenMax';
    }
    return null;
  };

  if (preferredSource === 'elevenlabs') {
    const elRes = await tryElevenLabsDirect();
    if (elRes) return elRes;
    const gmRes = await tryGenMaxDirect();
    if (gmRes) return gmRes;
  } else if (preferredSource === 'genmax') {
    const gmRes = await tryGenMaxDirect();
    if (gmRes) return gmRes;
    const elRes = await tryElevenLabsDirect();
    if (elRes) return elRes;
  } else {
    const elRes = await tryElevenLabsDirect();
    if (elRes) return elRes;
    const gmRes = await tryGenMaxDirect();
    if (gmRes) return gmRes;
  }

  return {
    balance: -1,
    email: '',
    source: preferredSource || 'genmax',
    errorMessage: lastErrorMessage || 'Không thể xác thực API Key với ElevenLabs hoặc GenMax.',
  };
}

export async function fetchDirectGenMaxData(
  apiKey: string,
  provider: ProviderType
): Promise<{
  models: ModelOption[];
  voices: VoiceOption[];
  balance?: number;
  limit?: number;
  used?: number;
  tier?: string;
  source?: 'elevenlabs' | 'genmax';
  email?: string;
}> {
  const cleanKey = apiKey.trim();
  const headers = { 'xi-api-key': cleanKey };
  const provType: 'elevenlabs' | 'genmax' = provider === 'ElevenLabs_Official' ? 'elevenlabs' : 'genmax';

  // Fetch balance concurrently
  const balPromise = fetchDirectBalance(cleanKey, provType).catch(() => ({
    balance: -1,
    email: '',
    source: provType,
  }));

  // ElevenLabs Official direct fetch
  if (provider === 'ElevenLabs_Official') {
    let models: ModelOption[] = [];
    let voices: VoiceOption[] = [];

    try {
      const resModels = await fetch('https://api.elevenlabs.io/v1/models', {
        headers,
        signal: AbortSignal.timeout(6000),
      });
      if (resModels.ok) {
        const data = await resModels.json();
        models = (Array.isArray(data) ? data : [])
          .filter((m: any) => m.can_do_text_to_speech !== false)
          .map((m: any) => {
            let customName = m.name || m.model_id;
            if (m.model_id === 'eleven_v3' || m.model_id === 'eleven_multilingual_v3') {
              customName = 'Eleven v3 (🚀 Model Mới Nhất - Siêu Biểu Cảm, Audio Tags [thì thầm, cười...])';
            } else if (m.model_id === 'eleven_multilingual_v2') {
              customName = 'Eleven Multilingual v2 (⭐ Chuẩn Tiếng Việt & Đa Ngôn Ngữ Tốt Nhất)';
            } else if (m.model_id === 'eleven_turbo_v2_5') {
              customName = 'Eleven Turbo v2.5 (Siêu Nhanh, Tự Nhiên & Tiếng Việt)';
            } else if (m.model_id === 'eleven_flash_v2_5') {
              customName = 'Eleven Flash v2.5 (Tốc Độ Cao, Siêu Tiết Kiệm Ký Tự)';
            }
            return { id: m.model_id, name: customName };
          });
      }
    } catch {}

    // Ensure eleven_v3 is available
    if (!models.some((m) => m.id === 'eleven_v3' || m.id === 'eleven_multilingual_v3')) {
      models.unshift({
        id: 'eleven_v3',
        name: 'Eleven v3 (🚀 Model Mới Nhất - Siêu Biểu Cảm, Audio Tags [thì thầm, cười...])',
      });
    }

    if (models.length === 0) {
      models = [
        { id: 'eleven_v3', name: 'Eleven v3 (🚀 Model Mới Nhất - Siêu Biểu Cảm, Audio Tags [thì thầm, cười...])' },
        { id: 'eleven_multilingual_v2', name: 'Eleven Multilingual v2 (⭐ Chuẩn Tiếng Việt & Tự Nhiên)' },
        { id: 'eleven_turbo_v2_5', name: 'Eleven Turbo v2.5 (Siêu Nhanh, Độ Trễ Thấp)' },
        { id: 'eleven_flash_v2_5', name: 'Eleven Flash v2.5 (Tốc Độ Cao, Tiết Kiệm)' },
      ];
    } else {
      models.sort((a, b) => {
        if (a.id === 'eleven_v3') return -1;
        if (b.id === 'eleven_v3') return 1;
        if (a.id === 'eleven_multilingual_v2') return -1;
        if (b.id === 'eleven_multilingual_v2') return 1;
        return 0;
      });
    }

    try {
      const resVoices = await fetch('https://api.elevenlabs.io/v1/voices', {
        headers,
        signal: AbortSignal.timeout(6000),
      });
      if (resVoices.ok) {
        const data = await resVoices.json();
        const rawVoices = data.voices || [];
        voices = rawVoices.map((v: any) => {
          const isCloned = v.category === 'cloned' || v.category === 'professional' || v.category === 'instant';
          const gender = v.labels?.gender ? (v.labels.gender.toLowerCase() === 'female' ? 'Nữ' : 'Nam') : '';
          const accent = v.labels?.accent || '';
          const desc = [gender, accent, v.labels?.description].filter(Boolean).join(' - ') || v.category || 'Hệ Thống';
          return {
            id: v.voice_id,
            name: `${isCloned ? '⭐ ' : ''}${v.name} (${desc})`,
            tag: isCloned ? 'Giọng Clone Của Bạn' : v.category || 'Default',
            previewUrl: v.preview_url,
          };
        });

        voices.sort((a, b) => {
          const aCloned = a.tag?.includes('Clone');
          const bCloned = b.tag?.includes('Clone');
          if (aCloned && !bCloned) return -1;
          if (!aCloned && bCloned) return 1;
          return a.name.localeCompare(b.name);
        });
      }
    } catch {}

    if (voices.length === 0) {
      voices = [
        { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel (Nữ - Truyền Cảm, Nhẹ Nhàng)', tag: 'Nữ' },
        { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam (Nam - Sâu Lắng, Dày Dặn)', tag: 'Nam' },
        { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni (Nam - Tự Nhiên, Trẻ Trung)', tag: 'Nam' },
        { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella (Nữ - Ngọt Ngào, Trong Trẻo)', tag: 'Nữ' },
        { id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh (Nam - Giọng Đọc Trầm Ấm)', tag: 'Nam' },
        { id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold (Nam - Mạnh Mẽ, Quyết Đoán)', tag: 'Nam' },
      ];
    }

    const balInfo = await balPromise;
    if (balInfo && balInfo.balance !== -1) {
      const locals = getLocalKeys();
      const target = locals.find((k) => k.key === cleanKey);
      if (target) {
        target.balance = balInfo.balance;
        if (balInfo.limit !== undefined) target.limit = balInfo.limit;
        if (balInfo.used !== undefined) target.used = balInfo.used;
        if (balInfo.tier) target.tier = balInfo.tier;
        if (balInfo.email) target.email = balInfo.email;
        target.source = 'elevenlabs';
        saveLocalKeys(locals);
      }
    }

    return {
      models,
      voices,
      balance: balInfo?.balance ?? -1,
      limit: balInfo?.limit,
      used: balInfo?.used,
      tier: balInfo?.tier,
      email: balInfo?.email,
      source: 'elevenlabs',
    };
  }

  const providerKey = provider === 'MiniMax' ? 'minimax' : 'elevenlabs';

  let models: ModelOption[] = [];
  let voices: VoiceOption[] = [];

  // Try direct fetch models from GenMax
  try {
    const res = await fetch(`https://api.genmax.io/v1/models?provider=${providerKey}`, {
      headers,
      signal: AbortSignal.timeout(6000),
    });
    if (res.ok) {
      const data = await res.json();
      models = (Array.isArray(data) ? data : []).map((m: any) => {
        const id = m.model_id || m.id;
        let name = m.name || id;
        if (id === 'eleven_v3' || id === 'eleven_multilingual_v3') {
          name = 'Eleven v3 (🚀 Model v3 Mới Nhất - Siêu Biểu Cảm, Audio Tags [thì thầm, cười...])';
        } else if (id === 'eleven_multilingual_v2') {
          name = 'Eleven Multilingual v2 (⭐ Chuẩn Tiếng Việt & Đa Ngôn Ngữ Tốt Nhất)';
        } else if (id === 'eleven_turbo_v2_5') {
          name = 'Eleven Turbo v2.5 (Siêu Nhanh, Tự Nhiên & Tiếng Việt)';
        } else if (id === 'eleven_flash_v2_5') {
          name = 'Eleven Flash v2.5 (Tốc Độ Cao, Siêu Tiết Kiệm Ký Tự)';
        }
        return { id, name };
      });
    }
  } catch {
    // ignore
  }

  if (providerKey === 'elevenlabs') {
    if (!models.some((m) => m.id === 'eleven_v3' || m.id === 'eleven_multilingual_v3')) {
      models.unshift({
        id: 'eleven_v3',
        name: 'Eleven v3 (🚀 Model v3 Mới Nhất - Siêu Biểu Cảm, Audio Tags [thì thầm, cười...])',
      });
    }
    models.sort((a, b) => {
      if (a.id === 'eleven_v3') return -1;
      if (b.id === 'eleven_v3') return 1;
      if (a.id === 'eleven_multilingual_v2') return -1;
      if (b.id === 'eleven_multilingual_v2') return 1;
      if (a.id === 'eleven_turbo_v2_5') return -1;
      if (b.id === 'eleven_turbo_v2_5') return 1;
      return 0;
    });
  }

  if (models.length === 0) {
    models =
      providerKey === 'elevenlabs'
        ? [
            { id: 'eleven_v3', name: 'Eleven v3 (🚀 Model v3 Mới Nhất - Siêu Biểu Cảm, Audio Tags [thì thầm, cười...])' },
            { id: 'eleven_multilingual_v2', name: 'Eleven Multilingual v2 (⭐ Chuẩn Tiếng Việt & Đa Ngôn Ngữ Tốt Nhất)' },
            { id: 'eleven_turbo_v2_5', name: 'Eleven Turbo v2.5 (Siêu Nhanh, Tự Nhiên & Tiếng Việt)' },
            { id: 'eleven_flash_v2_5', name: 'Eleven Flash v2.5 (Tốc Độ Cao, Siêu Tiết Kiệm Ký Tự)' },
            { id: 'eleven_monolingual_v1', name: 'Eleven Monolingual v1' },
          ]
        : [
            { id: 'speech-2.8-turbo', name: 'MiniMax Speech 2.8 Turbo' },
            { id: 'speech-01-turbo', name: 'MiniMax Speech 01 Turbo' },
            { id: 'speech-2.5', name: 'MiniMax Speech 2.5' },
          ];
  }

  // Try direct fetch voices from GenMax
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

  const balInfo = await balPromise;
  if (balInfo && balInfo.balance !== -1) {
    const locals = getLocalKeys();
    const target = locals.find((k) => k.key === cleanKey);
    if (target) {
      target.balance = balInfo.balance;
      if (balInfo.limit !== undefined) target.limit = balInfo.limit;
      if (balInfo.used !== undefined) target.used = balInfo.used;
      if (balInfo.tier) target.tier = balInfo.tier;
      if (balInfo.email) target.email = balInfo.email;
      target.source = 'genmax';
      saveLocalKeys(locals);
    }
  }

  return {
    models,
    voices,
    balance: balInfo?.balance ?? -1,
    limit: balInfo?.limit,
    used: balInfo?.used,
    tier: balInfo?.tier,
    email: balInfo?.email,
    source: 'genmax',
  };
}

/**
 * Smart Key Routing for Direct Client Execution:
 * If selected key has insufficient balance (< requiredCre) and its balance is known,
 * automatically prioritize candidate keys that have balance >= requiredCre!
 */
export function selectDirectSmartCandidates(
  savedLocals: KeyItem[],
  selectedKey: string | undefined,
  requiredCre: number,
  preferredSource?: 'elevenlabs' | 'genmax'
): { candidateKeys: Array<{ key: string; name: string }>; switchedAutomatically: boolean; switchReason?: string } {
  const hasSelected = !!(selectedKey && savedLocals.some((l) => l.key === selectedKey));
  const selectedItem = hasSelected ? savedLocals.find((l) => l.key === selectedKey) : undefined;
  const selectedBal = selectedItem ? selectedItem.balance : -1;
  const isSelectedSufficient = hasSelected && (selectedBal === -1 || selectedBal >= requiredCre);

  const getBal = (k: KeyItem) => k.balance ?? -1;
  const sourceMatches = (k: KeyItem) => {
    if (!preferredSource) return true;
    return !k.source || k.source === preferredSource;
  };

  const sufficientKeys: KeyItem[] = [];
  const unknownKeys: KeyItem[] = [];
  const insufficientKeys: KeyItem[] = [];

  for (const item of savedLocals) {
    const bal = getBal(item);
    if (bal >= requiredCre) {
      sufficientKeys.push(item);
    } else if (bal === -1) {
      unknownKeys.push(item);
    } else {
      insufficientKeys.push(item);
    }
  }

  const sortFn = (a: KeyItem, b: KeyItem) => {
    const srcA = sourceMatches(a) ? 1 : 0;
    const srcB = sourceMatches(b) ? 1 : 0;
    if (srcA !== srcB) return srcB - srcA;
    return getBal(b) - getBal(a);
  };

  sufficientKeys.sort(sortFn);
  unknownKeys.sort(sortFn);
  insufficientKeys.sort(sortFn);

  let orderedItems: KeyItem[] = [];
  let switchedAutomatically = false;
  let switchReason: string | undefined = undefined;

  if (hasSelected && isSelectedSufficient) {
    orderedItems.push(selectedItem!);
    for (const item of sufficientKeys) if (item.key !== selectedKey) orderedItems.push(item);
    for (const item of unknownKeys) if (item.key !== selectedKey) orderedItems.push(item);
    for (const item of insufficientKeys) if (item.key !== selectedKey) orderedItems.push(item);
  } else {
    if (sufficientKeys.length > 0) {
      orderedItems = [...sufficientKeys, ...unknownKeys, ...insufficientKeys];
      if (hasSelected && selectedBal >= 0 && selectedBal < requiredCre) {
        switchedAutomatically = true;
        const best = orderedItems[0];
        switchReason = `Tự động chuyển từ "${selectedItem?.name}" (${selectedBal} Cre) sang "${best.name}" (${best.balance.toLocaleString()} Cre) do yêu cầu ${requiredCre} Cre.`;
      }
    } else if (unknownKeys.length > 0) {
      orderedItems = [...unknownKeys, ...insufficientKeys];
      if (hasSelected && selectedBal >= 0 && selectedBal < requiredCre) {
        switchedAutomatically = true;
        const best = orderedItems[0];
        switchReason = `Tự động chuyển từ "${selectedItem?.name}" (${selectedBal} Cre) sang "${best.name}" (Chưa kiểm tra) do yêu cầu ${requiredCre} Cre.`;
      }
    } else {
      if (hasSelected) orderedItems.push(selectedItem!);
      for (const item of insufficientKeys) if (item.key !== selectedKey) orderedItems.push(item);
    }
  }

  // Deduplicate
  const seen = new Set<string>();
  const candidateKeys: Array<{ key: string; name: string }> = [];
  for (const item of orderedItems) {
    if (!seen.has(item.key)) {
      seen.add(item.key);
      candidateKeys.push({ key: item.key, name: item.name });
    }
  }

  return { candidateKeys, switchedAutomatically, switchReason };
}

export async function generateDirectElevenLabsTts(params: {
  text: string;
  apiKey: string;
  voiceId: string;
  modelId: string;
  stability?: number;
  similarityBoost?: number;
  style?: number;
  speed?: number;
  useSpeakerBoost?: boolean;
  outputFormat?: string;
  latency?: number;
  signal?: AbortSignal;
}): Promise<{ audioUrl: string; cost: number; usedKey?: string; usedKeyName?: string; wasRotated?: boolean; switchReason?: string }> {
  const { text, apiKey, voiceId, modelId, stability, similarityBoost, style, speed, useSpeakerBoost = true, outputFormat = 'mp3_44100_128', latency = 0, signal } = params;

  const savedLocals = getLocalKeys();
  const cost = text.trim().length;

  const smartRouting = selectDirectSmartCandidates(
    savedLocals,
    apiKey,
    cost,
    'elevenlabs'
  );
  const candidateKeys = smartRouting.candidateKeys;
  const switchReason = smartRouting.switchReason;

  if (candidateKeys.length === 0) {
    throw new Error('Chưa có API Key nào được cài đặt. Vui lòng thêm Key ElevenLabs trong Quản Lý Key!');
  }

  let lastErrorMsg = '';

  for (const item of candidateKeys) {
    const currentKey = item.key;
    const currentKeyName = item.name;

    if (signal?.aborted) {
      throw new DOMException('User aborted', 'AbortError');
    }

    try {
      const queryParams = new URLSearchParams({
        output_format: outputFormat || 'mp3_44100_128',
      });
      if (latency && Number(latency) > 0) {
        queryParams.set('optimize_streaming_latency', String(latency));
      }

      const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?${queryParams.toString()}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': currentKey,
          'Accept': outputFormat && outputFormat.startsWith('pcm') ? 'audio/wav' : 'audio/mpeg',
        },
        body: JSON.stringify({
          text: text.trim(),
          model_id: modelId || 'eleven_v3',
          voice_settings: {
            stability: stability ?? 0.5,
            similarity_boost: similarityBoost ?? 0.75,
            style: style ?? 0.0,
            use_speaker_boost: Boolean(useSpeakerBoost),
            speed: speed ?? 1.0,
          },
        }),
        signal,
      });

      if (!res.ok) {
        let errDetail = '';
        try {
          const errJson = await res.json();
          errDetail = errJson.detail?.message || errJson.detail?.status || JSON.stringify(errJson.detail) || '';
        } catch {
          errDetail = await res.text().catch(() => '');
        }

        const lowerErr = errDetail.toLowerCase();
        const isQuotaOrAuth =
          res.status === 401 ||
          res.status === 402 ||
          res.status === 429 ||
          lowerErr.includes('quota_exceeded') ||
          lowerErr.includes('insufficient_credits') ||
          lowerErr.includes('character_limit') ||
          lowerErr.includes('unauthorized') ||
          lowerErr.includes('invalid');

        if (isQuotaOrAuth) {
          const updatedLocals = getLocalKeys();
          const target = updatedLocals.find((k) => k.key === currentKey);
          if (target) {
            target.balance = 0;
            saveLocalKeys(updatedLocals);
          }
          console.warn(`[ElevenLabs Rotate] Key "${currentKeyName}" hết hạn mức (${errDetail}). Đang chuyển sang key tiếp theo...`);
          lastErrorMsg = `Key "${currentKeyName}": ${errDetail || 'Hết hạn mức ký tự'}`;
          continue;
        }

        lastErrorMsg = `Key "${currentKeyName}": ${errDetail || res.statusText}`;
        continue;
      }

      // Success!
      const blob = await res.blob();
      const audioUrl = URL.createObjectURL(blob);
      const cost = text.trim().length;

      // Immediately deduct characters from stored balance
      try {
        const curLocals = getLocalKeys();
        const target = curLocals.find((k) => k.key === currentKey);
        if (target && typeof target.balance === 'number' && target.balance > 0) {
          target.balance = Math.max(0, target.balance - cost);
          if (typeof target.used === 'number') target.used += cost;
          saveLocalKeys(curLocals);
        }
      } catch {}

      // Background refresh to sync with ElevenLabs API
      setTimeout(() => {
        fetchDirectBalance(currentKey, 'elevenlabs').then((bal) => {
          if (bal && bal.balance !== -1) {
            const locs = getLocalKeys();
            const t = locs.find((k) => k.key === currentKey);
            if (t) {
              t.balance = bal.balance;
              if (bal.limit !== undefined) t.limit = bal.limit;
              if (bal.used !== undefined) t.used = bal.used;
              if (bal.tier) t.tier = bal.tier;
              if (bal.email) t.email = bal.email;
              t.source = 'elevenlabs';
              saveLocalKeys(locs);
            }
          }
        });
      }, 1000);

      return {
        audioUrl,
        cost,
        usedKey: currentKey,
        usedKeyName: currentKeyName,
        wasRotated: currentKey !== apiKey || smartRouting.switchedAutomatically,
        switchReason: switchReason || (currentKey !== apiKey ? `Đã tự động xoay sang "${currentKeyName}"` : undefined),
      };
    } catch (tryErr: any) {
      if (tryErr.name === 'AbortError' || signal?.aborted) throw tryErr;
      lastErrorMsg = tryErr.message;
      continue;
    }
  }

  throw new Error(`Tất cả (${candidateKeys.length}) API Key đều không tạo được giọng ElevenLabs. Chi tiết: ${lastErrorMsg}`);
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
  pitch?: number;
  volume?: number;
  useSpeakerBoost?: boolean;
  signal?: AbortSignal;
}): Promise<{ audioUrl: string; cost: number; taskId?: string; usedKey?: string; usedKeyName?: string; wasRotated?: boolean; switchReason?: string }> {
  const { text, apiKey, provider, voiceId, modelId, stability, similarityBoost, style, speed, pitch, volume, useSpeakerBoost = true, signal } = params;
  const providerKey = provider === 'MiniMax' ? 'minimax' : 'elevenlabs';
  const url = `https://api.genmax.io/v1/text-to-speech/${voiceId}?provider=${providerKey}`;

  const payloadBase: any = {
    text: text.trim(),
    model_id: modelId || (provider === 'MiniMax' ? 'speech-2.8-turbo' : 'eleven_v3'),
    provider: providerKey,
    language_code: provider === 'MiniMax' ? 'Vietnamese' : 'vi',
    voice_settings: provider === 'MiniMax'
      ? {
          speed: speed ?? 1.0,
          pitch: pitch ?? 0,
          vol: volume ?? 1.0,
        }
      : {
          stability: stability ?? 0.5,
          similarity_boost: similarityBoost ?? 0.75,
          style: style ?? 0.0,
          use_speaker_boost: Boolean(useSpeakerBoost),
          speed: speed ?? 1.0,
        },
  };

  // Build candidate keys from localStorage with smart balance routing
  const savedLocals = getLocalKeys();
  const cost = text.length;
  const preferredSource = provider === 'ElevenLabs' ? 'elevenlabs' : 'genmax';

  const smartRouting = selectDirectSmartCandidates(
    savedLocals,
    apiKey,
    cost,
    preferredSource
  );
  const candidateKeys = smartRouting.candidateKeys;
  const switchReason = smartRouting.switchReason;

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
          try {
            const curLocals = getLocalKeys();
            const target = curLocals.find((k) => k.key === currentKey);
            if (target && typeof target.balance === 'number' && target.balance > 0) {
              target.balance = Math.max(0, target.balance - cost);
              if (typeof target.used === 'number') target.used += cost;
              saveLocalKeys(curLocals);
            }
          } catch {}

          setTimeout(() => {
            fetchDirectBalance(currentKey, 'genmax').then((bal) => {
              if (bal && bal.balance !== -1) {
                const locs = getLocalKeys();
                const t = locs.find((k) => k.key === currentKey);
                if (t) {
                  t.balance = bal.balance;
                  if (bal.limit !== undefined) t.limit = bal.limit;
                  if (bal.used !== undefined) t.used = bal.used;
                  if (bal.tier) t.tier = bal.tier;
                  if (bal.email) t.email = bal.email;
                  t.source = 'genmax';
                  saveLocalKeys(locs);
                }
              }
            });
          }, 1000);

          return {
            audioUrl: directAudio,
            cost,
            usedKey: currentKey,
            usedKeyName: currentKeyName,
            wasRotated: currentKey !== apiKey || smartRouting.switchedAutomatically,
            switchReason: switchReason || (currentKey !== apiKey ? `Đã tự động xoay sang "${currentKeyName}"` : undefined),
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
        try {
          const curLocals = getLocalKeys();
          const target = curLocals.find((k) => k.key === currentKey);
          if (target && typeof target.balance === 'number' && target.balance > 0) {
            target.balance = Math.max(0, target.balance - cost);
            if (typeof target.used === 'number') target.used += cost;
            saveLocalKeys(curLocals);
          }
        } catch {}

        setTimeout(() => {
          fetchDirectBalance(currentKey, 'genmax').then((bal) => {
            if (bal && bal.balance !== -1) {
              const locs = getLocalKeys();
              const t = locs.find((k) => k.key === currentKey);
              if (t) {
                t.balance = bal.balance;
                if (bal.limit !== undefined) t.limit = bal.limit;
                if (bal.used !== undefined) t.used = bal.used;
                if (bal.tier) t.tier = bal.tier;
                if (bal.email) t.email = bal.email;
                t.source = 'genmax';
                saveLocalKeys(locs);
              }
            }
          });
        }, 1000);

        return {
          audioUrl: completedAudio,
          cost,
          taskId,
          usedKey: currentKey,
          usedKeyName: currentKeyName,
          wasRotated: currentKey !== apiKey || smartRouting.switchedAutomatically,
          switchReason: switchReason || (currentKey !== apiKey ? `Đã tự động xoay sang "${currentKeyName}"` : undefined),
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

  // 0. Direct FastAPI Endpoint /api/generate (For Cloudflare Tunnels & custom FastAPI endpoints)
  try {
    const fastApiRes = await fetch(`${cleanUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        audio_base64: refAudioBase64,
        ref_text: refText || '',
        gen_text: genText,
        speed: Number(speed) || 1.0,
        nfe_step: Number(nfeStep) || 64,
        cfg_strength: Number(cfgStrength) || 2.0,
      }),
      signal,
    });

    if (fastApiRes.ok) {
      const fastApiJson = await fastApiRes.json();
      if (fastApiJson.audio_base64) {
        return fastApiJson.audio_base64.startsWith('data:')
          ? fastApiJson.audio_base64
          : `data:audio/wav;base64,${fastApiJson.audio_base64}`;
      }
      if (fastApiJson.audio_url) {
        const aUrl = fastApiJson.audio_url;
        return aUrl.startsWith('http') ? aUrl : `${cleanUrl}${aUrl.startsWith('/') ? '' : '/'}${aUrl}`;
      }
    }
  } catch (fastErr: any) {
    if (fastErr.name === 'AbortError' || signal?.aborted) throw fastErr;
    console.warn('Direct FastAPI fallback, trying Gradio pipeline:', fastErr);
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
