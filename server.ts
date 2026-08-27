import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

const KEYS_FILE = path.join(process.cwd(), "api_keys.json");
const OUTPUTS_DIR = path.join(process.cwd(), "outputs");
if (!fs.existsSync(OUTPUTS_DIR)) {
  fs.mkdirSync(OUTPUTS_DIR, { recursive: true });
}

// Serve generated outputs and saved voices
app.use("/outputs", express.static(OUTPUTS_DIR));
const SAVED_VOICES_DIR = path.join(process.cwd(), "saved_voices");
if (fs.existsSync(SAVED_VOICES_DIR)) {
  app.use("/saved_voices", express.static(SAVED_VOICES_DIR));
}

interface KeyInfo {
  name: string;
  balance: number;
  email: string;
}

function loadKeys(): Record<string, KeyInfo> {
  try {
    if (fs.existsSync(KEYS_FILE)) {
      const raw = fs.readFileSync(KEYS_FILE, "utf-8");
      const data = JSON.parse(raw);
      const formatted: Record<string, KeyInfo> = {};
      for (const [k, v] of Object.entries(data)) {
        if (typeof v === "string") {
          formatted[k] = { name: v, balance: -1, email: "" };
        } else {
          formatted[k] = v as KeyInfo;
        }
      }
      return formatted;
    }
  } catch (err) {
    console.error("Error loading keys:", err);
  }
  return {};
}

function saveKeys(keys: Record<string, KeyInfo>) {
  try {
    fs.writeFileSync(KEYS_FILE, JSON.stringify(keys, null, 2), "utf-8");
  } catch (err) {
    console.error("Error saving keys:", err);
  }
}

async function fetchBalanceFromApi(apiKey: string): Promise<{ balance: number; email: string }> {
  try {
    const res = await fetch("https://api.genmax.io/v1/auth/me", {
      headers: { "xi-api-key": apiKey },
      signal: AbortSignal.timeout(6000),
    });
    if (res.ok) {
      const data = await res.json();
      return {
        balance: data.credit_balance ?? data.balance ?? 0,
        email: data.email || "",
      };
    }
  } catch (err) {
    // Network or timeout
  }
  return { balance: -1, email: "" };
}

async function refreshAllBalancesBg() {
  const keys = loadKeys();
  let updated = false;
  for (const k of Object.keys(keys)) {
    const { balance, email } = await fetchBalanceFromApi(k);
    if (balance !== -1) {
      keys[k].balance = balance;
      if (email) keys[k].email = email;
      updated = true;
    }
  }
  if (updated) {
    saveKeys(keys);
  }
}

// Initial background refresh
refreshAllBalancesBg().catch(() => {});

// --- API Endpoints ---

// Get all keys
app.get("/api/keys", (req, res) => {
  const keys = loadKeys();
  const list = Object.entries(keys).map(([k, v]) => ({
    key: k,
    name: v.name || "Key",
    balance: v.balance ?? -1,
    email: v.email || "",
    label: `[${v.balance !== -1 ? v.balance.toLocaleString() : "?"} Cr] ${v.name || "Key"} (${k.slice(0, 8)}...)`,
  }));
  res.json({ keys: list, raw: keys });
});

// Add / Update key
app.post("/api/keys", async (req, res) => {
  const { apiKey, name } = req.body;
  if (!apiKey || !apiKey.trim() || !name || !name.trim()) {
    return res.status(400).json({ error: "Vui lòng nhập đủ Mã API Key và Tên gợi nhớ!" });
  }

  const k = apiKey.trim();
  const keyName = name.trim();
  const keys = loadKeys();

  keys[k] = { name: keyName, balance: -1, email: "" };
  saveKeys(keys);

  // Check balance immediately
  const { balance, email } = await fetchBalanceFromApi(k);
  if (balance !== -1) {
    keys[k].balance = balance;
    keys[k].email = email;
    saveKeys(keys);
  }

  res.json({
    success: true,
    message: "Lưu Key thành công!",
    key: {
      key: k,
      name: keys[k].name,
      balance: keys[k].balance,
      email: keys[k].email,
      label: `[${keys[k].balance !== -1 ? keys[k].balance.toLocaleString() : "?"} Cr] ${keys[k].name} (${k.slice(0, 8)}...)`,
    },
  });
});

// Batch add / import keys
app.post("/api/keys/batch", async (req, res) => {
  const { rawText } = req.body;
  if (!rawText || !rawText.trim()) {
    return res.status(400).json({ error: "Vui lòng dán danh sách API Key!" });
  }

  const lines = rawText.split("\n").map((l: string) => l.trim()).filter(Boolean);
  const keys = loadKeys();
  let addedCount = 0;
  const newKeysList: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let apiKey = line;
    let keyName = `Key ${Object.keys(keys).length + 1}`;

    if (line.includes("|")) {
      const parts = line.split("|");
      apiKey = parts[0].trim();
      keyName = parts.slice(1).join("|").trim() || keyName;
    } else if (line.includes(",")) {
      const parts = line.split(",");
      apiKey = parts[0].trim();
      keyName = parts.slice(1).join(",").trim() || keyName;
    }

    if (apiKey && apiKey.length > 10) {
      keys[apiKey] = {
        name: keyName,
        balance: -1,
        email: "",
      };
      newKeysList.push(apiKey);
      addedCount++;
    }
  }

  saveKeys(keys);

  // Background check balance for newly added keys
  (async () => {
    for (const k of newKeysList) {
      const { balance, email } = await fetchBalanceFromApi(k);
      const currentKeys = loadKeys();
      if (currentKeys[k]) {
        if (balance !== -1) currentKeys[k].balance = balance;
        if (email) currentKeys[k].email = email;
        saveKeys(currentKeys);
      }
    }
  })().catch(() => {});

  res.json({
    success: true,
    message: `Đã thêm thành công ${addedCount} API Key vào hệ thống!`,
    addedCount,
  });
});

// Delete key
app.delete("/api/keys/:key", (req, res) => {
  const { key } = req.params;
  const keys = loadKeys();
  if (keys[key]) {
    delete keys[key];
    saveKeys(keys);
  }
  res.json({ success: true });
});

// Refresh all balances
app.post("/api/keys/refresh", async (req, res) => {
  await refreshAllBalancesBg();
  const keys = loadKeys();
  res.json({ success: true, keys });
});

// Fetch GenMax Models & Voices
app.get("/api/genmax/data", async (req, res) => {
  const { apiKey, provider } = req.query as { apiKey?: string; provider?: string };
  if (!apiKey) {
    return res.status(400).json({ error: "Vui lòng chọn hoặc nhập API Key!" });
  }

  const headers = { "xi-api-key": apiKey };
  const providerKey = provider === "MiniMax" ? "minimax" : "elevenlabs";

  try {
    // 1. Fetch Models
    let models: Array<{ id: string; name: string }> = [];
    try {
      const resModels = await fetch(`https://api.genmax.io/v1/models?provider=${providerKey}`, {
        headers,
        signal: AbortSignal.timeout(8000),
      });
      if (resModels.ok) {
        const modelsData = await resModels.json();
        models = (Array.isArray(modelsData) ? modelsData : []).map((m: any) => ({
          id: m.model_id || m.id,
          name: m.name || m.model_id || m.id,
        }));
      }
    } catch (e) {
      console.warn("Failed to fetch models from API:", e);
    }

    if (models.length === 0) {
      models =
        providerKey === "elevenlabs"
          ? [
              { id: "eleven_turbo_v2_5", name: "Eleven Turbo v2.5 (Nhanh & Tự Nhiên)" },
              { id: "eleven_multilingual_v2", name: "Eleven Multilingual v2 (Đa Ngôn Ngữ Chuẩn)" },
              { id: "eleven_monolingual_v1", name: "Eleven Monolingual v1" },
            ]
          : [
              { id: "speech-2.8-turbo", name: "MiniMax Speech 2.8 Turbo" },
              { id: "speech-2.5", name: "MiniMax Speech 2.5" },
            ];
    }

    // 2. Fetch Voices
    let voices: Array<{ id: string; name: string; tag?: string; previewUrl?: string }> = [];

    if (providerKey === "elevenlabs") {
      try {
        const resVoices = await fetch("https://api.genmax.io/v1/default-voices?page_size=100", {
          headers,
          signal: AbortSignal.timeout(8000),
        });
        if (resVoices.ok) {
          const vData = await resVoices.json();
          const rawVoices = vData.voices || [];
          voices = rawVoices.map((v: any) => ({
            id: v.voice_id || v.id,
            name: `${v.name || "Voice"} (${v.accent || v.category || "Tiếng Việt / Quốc Tế"})`,
            tag: v.category || v.accent || "Default",
            previewUrl: v.preview_url,
          }));
        }
      } catch (e) {
        console.warn("Failed to fetch ElevenLabs voices:", e);
      }

      // Default fallback voices for ElevenLabs
      const hasAdam = voices.some((v) => v.name.toLowerCase().includes("adam"));
      if (!hasAdam) {
        voices.unshift({
          id: "pNInz6obpgDQGcFmaJgB",
          name: "Adam (Nam - Giọng Đọc Chuẩn Sâu Lắng)",
          tag: "Nam - Chuẩn",
        });
      }
      if (!voices.some((v) => v.name.toLowerCase().includes("rachel"))) {
        voices.unshift({
          id: "21m00Tcm4TlvDq8ikWAM",
          name: "Rachel (Nữ - Truyền Cảm, Nhẹ Nhàng)",
          tag: "Nữ - Chuẩn",
        });
      }
    } else {
      // MiniMax voices
      try {
        const resVoices = await fetch("https://api.genmax.io/v1/minimax/system-voices?page_size=100", {
          headers,
          signal: AbortSignal.timeout(8000),
        });
        if (resVoices.ok) {
          const vData = await resVoices.json();
          const rawVoices = vData.voice_list || [];
          voices = rawVoices.map((v: any) => ({
            id: v.uniq_id || v.voice_id || v.id,
            name: `${v.voice_name || "Voice"} (${(v.tag_list || []).join(", ") || "Hệ Thống"})`,
            tag: (v.tag_list || []).join(", "),
          }));
        }
      } catch (e) {
        console.warn("Failed to fetch MiniMax voices:", e);
      }

      if (voices.length === 0) {
        voices = [
          { id: "male-qn-qingse", name: "Thanh Niên Trẻ (Nam - Truyền Cảm)", tag: "Nam Trẻ" },
          { id: "female-shaonv", name: "Thiếu Nữ (Nữ - Ngọt Ngào)", tag: "Nữ Trẻ" },
          { id: "presenter_male", name: "Phát Thanh Viên (Nam - Tin Tức)", tag: "Phát Thanh" },
          { id: "presenter_female", name: "Phát Thanh Viên (Nữ - Tin Tức)", tag: "Phát Thanh" },
        ];
      }
    }

    return res.json({ models, voices });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Lỗi khi lấy dữ liệu từ GenMax" });
  }
});

// Run TTS via GenMax with Automatic Multi-Key Rotation
app.post("/api/genmax/tts", async (req, res) => {
  const {
    text,
    selectedKey,
    provider,
    voiceId,
    modelId,
    stability = 0.5,
    similarityBoost = 0.75,
    style = 0,
    speed = 1.0,
    pitch = 0,
  } = req.body;

  if (!text || !text.trim()) {
    return res.status(400).json({ error: "Vui lòng nhập văn bản cần đọc!" });
  }
  if (!voiceId) {
    return res.status(400).json({ error: "Vui lòng chọn giọng đọc hợp lệ!" });
  }

  const cost = text.trim().length;
  const keysDict = loadKeys();
  const allKeys = Object.keys(keysDict);

  if (allKeys.length === 0) {
    return res.status(400).json({
      error: `Chưa có API Key nào được lưu. Cần ít nhất ${cost} credits. Vui lòng mở menu Quản Lý API Key để thêm key!`,
    });
  }

  // Build candidate keys list with prioritized rotation order
  const candidateKeys: string[] = [];
  
  // 1. If user selected a key and it is in keysDict, try it first
  if (selectedKey && keysDict[selectedKey]) {
    candidateKeys.push(selectedKey);
  }

  // 2. Add keys with known sufficient balance or unknown (-1)
  const remainingKeys = allKeys.filter((k) => k !== selectedKey);
  remainingKeys.sort((a, b) => {
    const balA = keysDict[a]?.balance ?? -1;
    const balB = keysDict[b]?.balance ?? -1;
    // Prioritize higher balance first
    return balB - balA;
  });

  for (const k of remainingKeys) {
    candidateKeys.push(k);
  }

  const url = `https://api.genmax.io/v1/text-to-speech/${voiceId}`;
  const payloadBase: any = {
    text: text.trim(),
    model_id: modelId || (provider === "MiniMax" ? "speech-2.8-turbo" : "eleven_turbo_v2_5"),
  };

  if (provider === "MiniMax") {
    payloadBase.provider = "minimax";
    payloadBase.language_code = "Vietnamese";
    payloadBase.voice_settings = {
      speed: Number(speed) || 1.0,
      pitch: Number(pitch) || 0,
      vol: 1.0,
    };
  } else {
    payloadBase.provider = "elevenlabs";
    payloadBase.language_code = "vi";
    payloadBase.voice_settings = {
      stability: Number(stability) || 0.5,
      similarity_boost: Number(similarityBoost) || 0.75,
      style: Number(style) || 0.0,
      use_speaker_boost: true,
      speed: Number(speed) || 1.0,
    };
  }

  let lastErrorText = "";
  let workingKey = "";
  let workingKeyName = "";
  let completedAudioUrl = "";
  let taskId = "";
  let wasRotated = false;
  let attemptsCount = 0;

  // Try candidate keys sequentially until one succeeds
  for (const currentKey of candidateKeys) {
    attemptsCount++;
    const keyInfo = keysDict[currentKey];
    const keyName = keyInfo?.name || `Key (${currentKey.slice(0, 8)}...)`;

    const headers = {
      "Content-Type": "application/json",
      "xi-api-key": currentKey,
    };

    const currentPayload = { ...payloadBase };

    try {
      console.log(`[TTS] Đang thử Key: "${keyName}" (${currentKey.slice(0, 8)}...) - Số dư ghi nhận: ${keyInfo?.balance ?? 'Chưa rõ'} Cr`);

      let ttsRes = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(currentPayload),
        signal: AbortSignal.timeout(20000),
      });

      if (!ttsRes.ok) {
        const errText = await ttsRes.text().catch(() => "");
        const lowerErr = errText.toLowerCase();

        // Check if error is due to insufficient credits or expired/invalid key
        const isCreditOrAuthError =
          ttsRes.status === 401 ||
          ttsRes.status === 402 ||
          ttsRes.status === 429 ||
          lowerErr.includes("insufficient credits") ||
          lowerErr.includes("credits") ||
          lowerErr.includes("balance") ||
          lowerErr.includes("credit_balance") ||
          lowerErr.includes("unauthorized") ||
          lowerErr.includes("invalid key");

        if (isCreditOrAuthError || (ttsRes.status === 400 && lowerErr.includes("credit"))) {
          // Zero out balance in cache so future requests know it's empty
          const kMap = loadKeys();
          if (kMap[currentKey]) {
            kMap[currentKey].balance = 0;
            saveKeys(kMap);
          }
          console.warn(`[Auto-Rotate] Key "${keyName}" bị lỗi số dư (${errText}). Tự động chuyển sang Key tiếp theo...`);
          lastErrorText = `Key "${keyName}": ${errText || "Không đủ credits"}`;
          continue; // ROTATE TO NEXT KEY!
        }

        // Try language fallback if needed
        if (ttsRes.status === 400 && lowerErr.includes("not supported")) {
          currentPayload.language_code = "en";
          ttsRes = await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify(currentPayload),
            signal: AbortSignal.timeout(20000),
          });
        }

        if (!ttsRes.ok) {
          const finalErr = await ttsRes.text().catch(() => "");
          console.warn(`[TTS Attempt Failed] Key "${keyName}": ${finalErr}`);
          lastErrorText = `Key "${keyName}": ${finalErr || ttsRes.statusText}`;
          continue; // Try next key
        }
      }

      // Success initiating TTS
      const initData = await ttsRes.json();
      taskId = initData.id || initData.task_id;

      if (!taskId) {
        const directAudio = initData.audio_url || initData.result?.audio_url;
        if (directAudio) {
          completedAudioUrl = directAudio;
          workingKey = currentKey;
          workingKeyName = keyName;
          wasRotated = currentKey !== selectedKey;
          break;
        }
        lastErrorText = "Không nhận được Task ID từ GenMax";
        continue;
      }

      // Polling task history
      let pollSucceeded = false;
      for (let i = 0; i < 45; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        try {
          const pollRes = await fetch(`https://api.genmax.io/v1/history/${taskId}`, {
            headers,
            signal: AbortSignal.timeout(8000),
          });
          if (pollRes.ok) {
            const pollData = await pollRes.json();
            if (pollData.status === "completed") {
              completedAudioUrl = pollData.result?.audio_url || pollData.audio_url;
              pollSucceeded = true;
              break;
            } else if (pollData.status === "failed") {
              lastErrorText = pollData.error || "Lỗi xử lý giọng";
              break;
            }
          }
        } catch (pollErr) {
          console.warn("Polling error:", pollErr);
        }
      }

      if (pollSucceeded && completedAudioUrl) {
        workingKey = currentKey;
        workingKeyName = keyName;
        wasRotated = currentKey !== selectedKey;
        break; // Successfully generated audio!
      }
    } catch (tryErr: any) {
      console.warn(`[TTS] Lỗi khi xử lý với key "${keyName}":`, tryErr.message);
      lastErrorText = tryErr.message || "Lỗi kết nối";
      continue;
    }
  }

  if (!completedAudioUrl || !workingKey) {
    return res.status(400).json({
      error: `Tất cả ${candidateKeys.length} API Key trong hệ thống đều không thể tạo được âm thanh (Cần ${cost} credits). Chi tiết lỗi gần nhất: ${lastErrorText}. Vui lòng nạp hoặc thêm API Key mới!`,
      totalAttempted: candidateKeys.length,
      lastError: lastErrorText,
    });
  }

  // Download & cache audio file locally
  const filename = `genmax_${provider?.toLowerCase() || "tts"}_${Date.now()}.mp3`;
  const filepath = path.join(OUTPUTS_DIR, filename);

  try {
    const audioFetch = await fetch(completedAudioUrl);
    if (audioFetch.ok) {
      const buffer = await audioFetch.arrayBuffer();
      fs.writeFileSync(filepath, Buffer.from(buffer));
    }
  } catch (saveErr) {
    console.warn("Could not cache audio locally, will use direct URL:", saveErr);
  }

  // Background refresh balance for the working key
  setTimeout(() => {
    fetchBalanceFromApi(workingKey).then(({ balance, email }) => {
      const kMap = loadKeys();
      if (kMap[workingKey]) {
        if (balance !== -1) kMap[workingKey].balance = balance;
        if (email) kMap[workingKey].email = email;
        saveKeys(kMap);
      }
    });
  }, 1000);

  const localUrl = fs.existsSync(filepath) ? `/outputs/${filename}` : completedAudioUrl;

  return res.json({
    success: true,
    audioUrl: localUrl,
    directUrl: completedAudioUrl,
    usedKey: workingKey,
    usedKeyName: workingKeyName,
    wasRotated,
    attemptsCount,
    cost,
    taskId,
  });
});

// Colab Ping / Status Health Check endpoint
app.post("/api/colab/ping", async (req, res) => {
  const { colabUrl } = req.body;
  if (!colabUrl) {
    return res.status(400).json({ alive: false, error: "Thiếu link Colab!" });
  }

  let cleanUrl = colabUrl.trim().replace(/\/$/, "");
  if (!cleanUrl.startsWith("http://") && !cleanUrl.startsWith("https://")) {
    cleanUrl = `https://${cleanUrl}`;
  }

  const startTime = Date.now();
  const testEndpoints = [
    `${cleanUrl}/config`,
    `${cleanUrl}/info`,
    `${cleanUrl}/gradio_api/info`,
    `${cleanUrl}/api`,
    `${cleanUrl}/`,
  ];

  for (const testUrl of testEndpoints) {
    try {
      const pingRes = await fetch(testUrl, {
        method: "GET",
        signal: AbortSignal.timeout(4500),
      });

      if (pingRes.status < 500) {
        const responseTime = Date.now() - startTime;
        return res.json({
          alive: true,
          status: pingRes.status,
          responseTimeMs: responseTime,
          message: `Kết nối Colab sẵn sàng (${responseTime}ms)`,
        });
      }
    } catch {
      // Continue next endpoint
    }
  }

  return res.json({
    alive: false,
    message: "Không thể kết nối đến Colab (Đã hết hạn hoặc chưa chạy 'Run all')",
  });
});

// Colab Prediction Proxy (Compatible with F5-TTS, Gradio 4/5 SSE Queue, api_name="tts", and REST)
app.post("/api/colab/predict", async (req, res) => {
  const {
    colabUrl,
    refAudioBase64,
    refText,
    genText,
    speed = 1.0,
    nfeStep = 64,
    cfgStrength = 2.0,
  } = req.body;

  if (!colabUrl || !genText) {
    return res.status(400).json({ error: "Vui lòng nhập đủ URL Colab và nội dung cần tạo!" });
  }

  let cleanUrl = colabUrl.trim().replace(/\/$/, "");
  if (!cleanUrl.startsWith("http://") && !cleanUrl.startsWith("https://")) {
    cleanUrl = `https://${cleanUrl}`;
  }

  // 1. Upload audio to Gradio /upload or /gradio_api/upload if base64 provided
  let uploadedGradioAudio: any = null;
  if (refAudioBase64) {
    try {
      let rawBase64 = refAudioBase64;
      let mimeType = "audio/wav";
      if (refAudioBase64.includes(";base64,")) {
        const parts = refAudioBase64.split(";base64,");
        mimeType = parts[0].replace("data:", "");
        rawBase64 = parts[1];
      }
      const audioBuffer = Buffer.from(rawBase64, "base64");
      const blob = new Blob([audioBuffer], { type: mimeType });
      const formData = new FormData();
      formData.append("files", blob, "reference_voice.wav");

      let uploadRes = await fetch(`${cleanUrl}/gradio_api/upload`, {
        method: "POST",
        body: formData,
        signal: AbortSignal.timeout(15000),
      }).catch(() => null);

      if (!uploadRes || !uploadRes.ok) {
        uploadRes = await fetch(`${cleanUrl}/upload`, {
          method: "POST",
          body: formData,
          signal: AbortSignal.timeout(15000),
        }).catch(() => null);
      }

      if (uploadRes && uploadRes.ok) {
        const uploadJson = await uploadRes.json();
        const serverPath = Array.isArray(uploadJson) ? uploadJson[0] : uploadJson;
        if (serverPath) {
          uploadedGradioAudio = {
            path: serverPath,
            orig_name: "reference_voice.wav",
            mime_type: mimeType,
            meta: { _type: "gradio.FileData" },
          };
        }
      }
    } catch (uploadErr) {
      console.warn("Gradio direct file upload fallback:", uploadErr);
    }
  }

  // Fallback audio formats
  const audioPayloads = [
    uploadedGradioAudio,
    uploadedGradioAudio ? uploadedGradioAudio.path : null,
    refAudioBase64
      ? {
          data: refAudioBase64,
          name: "reference_voice.wav",
          is_file: true,
        }
      : null,
    refAudioBase64 || null,
  ].filter((p) => p !== undefined);

  // Helper to extract audio file path/url from Gradio response
  const extractAudio = (data: any): string => {
    if (!data) return "";
    if (typeof data === "string") return data;
    if (Array.isArray(data)) {
      for (const item of data) {
        const found = extractAudio(item);
        if (found) return found;
      }
    }
    if (typeof data === "object") {
      return data.url || data.path || data.name || data.data || "";
    }
    return "";
  };

  const resolveAudioUrl = (raw: string): string => {
    if (!raw) return "";
    if (raw.startsWith("http://") || raw.startsWith("https://") || raw.startsWith("data:")) {
      return raw;
    }
    if (raw.startsWith("/gradio_api/file=")) return `${cleanUrl}${raw}`;
    if (raw.startsWith("/file=")) return `${cleanUrl}${raw}`;
    if (raw.startsWith("/")) return `${cleanUrl}/gradio_api/file=${raw}`;
    return `${cleanUrl}/gradio_api/file=${raw}`;
  };

  // Helper to listen to Gradio 4/5 SSE Queue
  const readGradioSse = async (sseUrl: string): Promise<string> => {
    const sseRes = await fetch(sseUrl, { signal: AbortSignal.timeout(180000) });
    if (!sseRes.ok || !sseRes.body) {
      throw new Error(`Kết nối SSE thất bại (HTTP ${sseRes.status})`);
    }

    const reader = (sseRes.body as any).getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finalAudio = "";
    let errorMessage = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith("event:")) {
          const eventType = trimmed.slice(6).trim();
          if (eventType === "error") {
            errorMessage = "Gradio báo lỗi xử lý trên Colab.";
          }
        }
        if (trimmed.startsWith("data:")) {
          const jsonStr = trimmed.slice(5).trim();
          if (jsonStr && jsonStr !== "null") {
            try {
              const parsed = JSON.parse(jsonStr);
              if (Array.isArray(parsed)) {
                const found = extractAudio(parsed);
                if (found) finalAudio = found;
              } else if (parsed && typeof parsed === "object") {
                if (parsed.message) errorMessage = parsed.message;
                const found = extractAudio(parsed);
                if (found) finalAudio = found;
              }
            } catch {
              // ignore heartbeat
            }
          }
        }
      }

      if (finalAudio) break;
    }

    if (!finalAudio && errorMessage) {
      throw new Error(errorMessage);
    }
    return finalAudio;
  };

  // Try API endpoints (Prioritize 'tts' from api_name="tts")
  const endpoints = [
    "/gradio_api/call/tts",
    "/call/tts",
    "/gradio_api/call/predict",
    "/call/predict",
    "/run/tts",
    "/api/tts",
    "/run/predict",
    "/api/predict",
  ];

  let lastError = "";
  let generatedAudioUrl = "";

  const parsedSpeed = Number(speed) || 1.0;
  const parsedNfe = Number(nfeStep) || 64;
  const parsedCfg = Number(cfgStrength) || 2.0;

  for (const ep of endpoints) {
    const targetUrl = `${cleanUrl}${ep}`;
    const isCallEndpoint = ep.includes("/call/");

    for (const audioArg of audioPayloads) {
      // Test variants with 6 params (new HQ), 5 params, 4 params (legacy), and 3 params
      const paramVariants = [
        [audioArg, refText || "", genText, parsedSpeed, parsedNfe, parsedCfg],
        [audioArg, refText || "", genText, parsedSpeed, parsedNfe],
        [audioArg, refText || "", genText, parsedSpeed],
        [audioArg, refText || "", genText],
      ];

      for (const params of paramVariants) {
        try {
          const postRes = await fetch(targetUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json, text/event-stream, */*",
            },
            body: JSON.stringify({ data: params, fn_index: 0 }),
            signal: AbortSignal.timeout(90000),
          });

          if (!postRes.ok) {
            const errTxt = await postRes.text().catch(() => "");
            lastError = `Endpoint ${ep} (${postRes.status}): ${errTxt.slice(0, 100)}`;
            continue;
          }

          const contentType = postRes.headers.get("content-type") || "";
          if (!contentType.includes("application/json") && !contentType.includes("text/json")) {
            const rawText = await postRes.text().catch(() => "");
            if (rawText.trim().startsWith("<!doctype") || rawText.trim().startsWith("<html")) {
              lastError = "Link Gradio Colab đã hết hạn hoặc trả về trang HTML chào mừng thay vì API JSON.";
              continue;
            }
          }

          let resJson: any = null;
          try {
            resJson = await postRes.json();
          } catch (jsonErr: any) {
            lastError = `Không thể đọc phản hồi JSON từ Gradio: ${jsonErr.message}`;
            continue;
          }

          // Gradio 4/5 Queue returns event_id
          if (isCallEndpoint && resJson && resJson.event_id) {
            const sseUrl = `${targetUrl}/${resJson.event_id}`;
            const sseAudio = await readGradioSse(sseUrl);
            if (sseAudio) {
              generatedAudioUrl = resolveAudioUrl(sseAudio);
              break;
            }
          }

          // Direct JSON response (Gradio 3 / standard)
          if (resJson) {
            const extracted = extractAudio(resJson.data || resJson.result || resJson);
            if (extracted) {
              generatedAudioUrl = resolveAudioUrl(extracted);
              break;
            }
          }
        } catch (err: any) {
          lastError = err.message || String(err);
        }
      }

      if (generatedAudioUrl) break;
    }

    if (generatedAudioUrl) break;
  }

  if (!generatedAudioUrl) {
    return res.status(502).json({
      error: `Không thể tạo âm thanh từ Colab: ${lastError || "Vui lòng kiểm tra link Colab và đảm bảo cell đang chạy!"}`,
    });
  }

  // Download & cache locally to outputs/ for 100% stable playback
  let finalResultUrl = generatedAudioUrl;
  try {
    if (generatedAudioUrl.startsWith("http://") || generatedAudioUrl.startsWith("https://")) {
      const audioFetch = await fetch(generatedAudioUrl, { signal: AbortSignal.timeout(30000) });
      if (audioFetch.ok) {
        const arrayBuf = await audioFetch.arrayBuffer();
        const filename = `f5tts_colab_${Date.now()}.wav`;
        const filepath = path.join(OUTPUTS_DIR, filename);
        fs.writeFileSync(filepath, Buffer.from(arrayBuf));
        finalResultUrl = `/outputs/${filename}`;
      }
    }
  } catch (cacheErr) {
    console.warn("Could not cache file locally, returning direct URL:", cacheErr);
  }

  return res.json({
    success: true,
    result: finalResultUrl,
    directUrl: generatedAudioUrl,
  });
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

// Vite middleware for development & Static file serving for production
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🎙️ Tool Giọng Nói Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
