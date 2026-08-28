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
  source?: "elevenlabs" | "genmax";
  tier?: string;
  limit?: number;
  used?: number;
  status?: string;
}

function loadKeys(): Record<string, KeyInfo> {
  try {
    if (fs.existsSync(KEYS_FILE)) {
      const raw = fs.readFileSync(KEYS_FILE, "utf-8");
      const data = JSON.parse(raw);
      const formatted: Record<string, KeyInfo> = {};
      for (const [k, v] of Object.entries(data)) {
        if (typeof v === "string") {
          formatted[k] = { name: v, balance: -1, email: "", source: "genmax" };
        } else {
          const item = v as KeyInfo;
          formatted[k] = {
            ...item,
            source: item.source || (item.name?.toLowerCase().includes("eleven") ? "elevenlabs" : "genmax"),
          };
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

async function fetchBalanceFromApi(
  apiKey: string,
  preferredSource?: "elevenlabs" | "genmax"
): Promise<{
  balance: number;
  email: string;
  source: "elevenlabs" | "genmax";
  tier?: string;
  limit?: number;
  used?: number;
  status?: string;
  errorMessage?: string;
}> {
  let lastErrorMessage = "";

  const tryElevenLabs = async () => {
    try {
      // Step 1: Query ElevenLabs user endpoint (/v1/user) - provides subscription + email + tier
      const userRes = await fetch("https://api.elevenlabs.io/v1/user", {
        headers: { "xi-api-key": apiKey.trim() },
        signal: AbortSignal.timeout(6500),
      });
      
      if (userRes.ok) {
        const uData = await userRes.json();
        const sub = uData.subscription || {};
        const charLimit = typeof sub.character_limit === "number" ? sub.character_limit : 0;
        const charCount = typeof sub.character_count === "number" ? sub.character_count : 0;
        const remaining = Math.max(0, charLimit - charCount);
        return {
          balance: remaining,
          email: uData.email || uData.first_name || "",
          source: "elevenlabs" as const,
          tier: sub.tier || "Active",
          limit: charLimit,
          used: charCount,
          status: sub.status || "active",
        };
      } else {
        try {
          const errData = await userRes.json();
          const detail = errData.detail || errData;
          if (detail?.status === "api_key_id_used_as_api_key" || detail?.message?.includes("API key ID used as API key")) {
            lastErrorMessage = "Bạn đang copy nhầm 'API Key ID' thay vì 'API Key Secret'. ElevenLabs quy định API Key dùng để gọi API phải bắt đầu bằng 'sk_...'. Hãy vào https://elevenlabs.io/app/settings/api-keys tạo hoặc rotate key mới và copy mã bắt đầu bằng sk_!";
          } else if (detail?.message) {
            lastErrorMessage = `ElevenLabs: ${detail.message}`;
          }
        } catch {}
      }

      // Step 2: Fallback to /v1/user/subscription endpoint
      const subRes = await fetch("https://api.elevenlabs.io/v1/user/subscription", {
        headers: { "xi-api-key": apiKey.trim() },
        signal: AbortSignal.timeout(6500),
      });
      if (subRes.ok) {
        const subData = await subRes.json();
        const charLimit = typeof subData.character_limit === "number" ? subData.character_limit : 0;
        const charCount = typeof subData.character_count === "number" ? subData.character_count : 0;
        const remaining = Math.max(0, charLimit - charCount);
        return {
          balance: remaining,
          email: "",
          source: "elevenlabs" as const,
          tier: subData.tier || "Active",
          limit: charLimit,
          used: charCount,
          status: subData.status || "active",
        };
      }
    } catch (e: any) {
      if (!lastErrorMessage) lastErrorMessage = e.message || "Lỗi kết nối ElevenLabs";
    }
    return null;
  };

  const tryGenMax = async () => {
    try {
      const res = await fetch("https://api.genmax.io/v1/auth/me", {
        headers: { "xi-api-key": apiKey.trim() },
        signal: AbortSignal.timeout(6500),
      });
      if (res.ok) {
        const data = await res.json();
        return {
          balance: data.credit_balance ?? data.balance ?? 0,
          email: data.email || "",
          source: "genmax" as const,
          tier: "GenMax",
          limit: 0,
          used: 0,
          status: "active",
        };
      } else {
        try {
          const errData = await res.json();
          if (errData.error) {
            if (!lastErrorMessage) lastErrorMessage = `GenMax: ${errData.error}`;
          }
        } catch {}
      }
    } catch (err: any) {
      if (!lastErrorMessage) lastErrorMessage = err.message || "Lỗi kết nối GenMax";
    }
    return null;
  };

  // Cross-fallback logic:
  if (preferredSource === "elevenlabs") {
    const eleResult = await tryElevenLabs();
    if (eleResult) return eleResult;
    // Fallback to GenMax if user set elevenlabs but it's a GenMax key
    const genResult = await tryGenMax();
    if (genResult) return genResult;
  } else if (preferredSource === "genmax") {
    const genResult = await tryGenMax();
    if (genResult) return genResult;
    // Fallback to ElevenLabs if user set genmax but it's an ElevenLabs key
    const eleResult = await tryElevenLabs();
    if (eleResult) return eleResult;
  } else {
    // Auto-detect: try ElevenLabs first then GenMax
    const eleResult = await tryElevenLabs();
    if (eleResult) return eleResult;
    const genResult = await tryGenMax();
    if (genResult) return genResult;
  }

  return {
    balance: -1,
    email: "",
    source: preferredSource || "genmax",
    errorMessage: lastErrorMessage || "Không thể xác thực API Key với ElevenLabs hoặc GenMax.",
  };
}

async function refreshAllBalancesBg() {
  const keys = loadKeys();
  let updated = false;
  for (const [k, v] of Object.entries(keys)) {
    const info = await fetchBalanceFromApi(k, v.source);
    if (info.balance !== -1) {
      keys[k].balance = info.balance;
      if (info.email) keys[k].email = info.email;
      keys[k].source = info.source;
      if (info.tier) keys[k].tier = info.tier;
      if (info.limit) keys[k].limit = info.limit;
      if (info.used !== undefined) keys[k].used = info.used;
      if (info.status) keys[k].status = info.status;
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
  const list = Object.entries(keys).map(([k, v]) => {
    const isEleven = v.source === "elevenlabs";
    const unit = "Cre";
    const srcTag = isEleven ? "ElevenLabs" : "GenMax";
    const balDisplay = v.balance !== -1 ? v.balance.toLocaleString() : "?";
    return {
      key: k,
      name: v.name || "Key",
      balance: v.balance ?? -1,
      email: v.email || "",
      source: v.source || "genmax",
      tier: v.tier || "",
      limit: v.limit || 0,
      used: v.used || 0,
      status: v.status || "active",
      label: `[${balDisplay} ${unit}] [${srcTag}] ${v.name || "Key"} (${k.slice(0, 8)}...)`,
    };
  });
  res.json({ keys: list, raw: keys });
});

// Check a single key on demand
app.post("/api/keys/check", async (req, res) => {
  const { apiKey, source } = req.body;
  if (!apiKey || !apiKey.trim()) {
    return res.status(400).json({ error: "Vui lòng nhập API Key cần kiểm tra!" });
  }

  const k = apiKey.trim();
  const info = await fetchBalanceFromApi(k, source);
  const keys = loadKeys();
  if (keys[k]) {
    if (info.balance !== -1) keys[k].balance = info.balance;
    if (info.email) keys[k].email = info.email;
    keys[k].source = info.source;
    if (info.tier) keys[k].tier = info.tier;
    if (info.limit) keys[k].limit = info.limit;
    if (info.used !== undefined) keys[k].used = info.used;
    if (info.status) keys[k].status = info.status;
    saveKeys(keys);
  }

  res.json({
    success: info.balance !== -1,
    balance: info.balance,
    email: info.email,
    source: info.source,
    tier: info.tier,
    limit: info.limit,
    used: info.used,
    status: info.status,
    errorMessage: info.errorMessage,
  });
});

// Add / Update key
app.post("/api/keys", async (req, res) => {
  const { apiKey, name, source } = req.body;
  if (!apiKey || !apiKey.trim() || !name || !name.trim()) {
    return res.status(400).json({ error: "Vui lòng nhập đủ Mã API Key và Tên gợi nhớ!" });
  }

  const k = apiKey.trim();
  const keyName = name.trim();
  const keys = loadKeys();

  keys[k] = { name: keyName, balance: -1, email: "", source: source as any };
  saveKeys(keys);

  // Check balance immediately
  const info = await fetchBalanceFromApi(k, source);
  if (info.balance !== -1) {
    keys[k].balance = info.balance;
    if (info.email) keys[k].email = info.email;
    keys[k].source = info.source;
    if (info.tier) keys[k].tier = info.tier;
    if (info.limit) keys[k].limit = info.limit;
    if (info.used !== undefined) keys[k].used = info.used;
    if (info.status) keys[k].status = info.status;
    saveKeys(keys);
  }

  const isEleven = keys[k].source === "elevenlabs";
  const unit = "Cre";
  const srcTag = isEleven ? "ElevenLabs" : "GenMax";
  const balDisplay = keys[k].balance !== -1 ? keys[k].balance.toLocaleString() : "?";

  res.json({
    success: true,
    message: `Lưu Key [${srcTag}] thành công! Đã kiểm tra số Cre: ${balDisplay} ${unit}`,
    key: {
      key: k,
      name: keys[k].name,
      balance: keys[k].balance,
      email: keys[k].email,
      source: keys[k].source,
      tier: keys[k].tier,
      limit: keys[k].limit,
      used: keys[k].used,
      status: keys[k].status,
      label: `[${balDisplay} ${unit}] [${srcTag}] ${keys[k].name} (${k.slice(0, 8)}...)`,
    },
  });
});

// Batch add / import keys
app.post("/api/keys/batch", async (req, res) => {
  const { rawText, defaultSource } = req.body;
  if (!rawText || !rawText.trim()) {
    return res.status(400).json({ error: "Vui lòng dán danh sách API Key!" });
  }

  const lines = rawText.split("\n").map((l: string) => l.trim()).filter(Boolean);
  const keys = loadKeys();
  let addedCount = 0;
  const newKeysList: { key: string; source?: "elevenlabs" | "genmax" }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let apiKey = line;
    let keyName = `Key ${Object.keys(keys).length + 1}`;
    let itemSource: "elevenlabs" | "genmax" | undefined = defaultSource;

    if (line.includes("|")) {
      const parts = line.split("|");
      apiKey = parts[0].trim();
      keyName = parts[1]?.trim() || keyName;
      if (parts[2]) {
        const s = parts[2].trim().toLowerCase();
        if (s.includes("eleven")) itemSource = "elevenlabs";
        else if (s.includes("genmax")) itemSource = "genmax";
      }
    } else if (line.includes(",")) {
      const parts = line.split(",");
      apiKey = parts[0].trim();
      keyName = parts[1]?.trim() || keyName;
    }

    if (apiKey && apiKey.length > 8) {
      keys[apiKey] = {
        name: keyName,
        balance: -1,
        email: "",
        source: itemSource,
      };
      newKeysList.push({ key: apiKey, source: itemSource });
      addedCount++;
    }
  }

  saveKeys(keys);

  // Background check balance for newly added keys
  (async () => {
    for (const item of newKeysList) {
      const info = await fetchBalanceFromApi(item.key, item.source);
      const currentKeys = loadKeys();
      if (currentKeys[item.key]) {
        if (info.balance !== -1) currentKeys[item.key].balance = info.balance;
        if (info.email) currentKeys[item.key].email = info.email;
        currentKeys[item.key].source = info.source;
        if (info.tier) currentKeys[item.key].tier = info.tier;
        if (info.limit) currentKeys[item.key].limit = info.limit;
        if (info.used !== undefined) currentKeys[item.key].used = info.used;
        if (info.status) currentKeys[item.key].status = info.status;
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

// Fetch ElevenLabs Official Models & Voices (api.elevenlabs.io)
app.get("/api/elevenlabs/data", async (req, res) => {
  const { apiKey } = req.query as { apiKey?: string };
  if (!apiKey) {
    return res.status(400).json({ error: "Vui lòng chọn hoặc nhập API Key ElevenLabs!" });
  }

  const cleanKey = apiKey.trim();
  const headers = { "xi-api-key": cleanKey };

  try {
    // Parallel fetch: Models, Voices, and User/Subscription Balance
    const [balanceInfo, modelsResult, voicesResult] = await Promise.all([
      fetchBalanceFromApi(cleanKey, "elevenlabs").catch(() => ({
        balance: -1,
        email: "",
        source: "elevenlabs" as const,
      })),
      (async () => {
        let models: Array<{ id: string; name: string }> = [];
        try {
          const resModels = await fetch("https://api.elevenlabs.io/v1/models", {
            headers,
            signal: AbortSignal.timeout(8000),
          });
          if (resModels.ok) {
            const modelsData = await resModels.json();
            models = (Array.isArray(modelsData) ? modelsData : [])
              .filter((m: any) => m.can_do_text_to_speech !== false)
              .map((m: any) => {
                let customName = m.name || m.model_id;
                if (m.model_id === "eleven_v3" || m.model_id === "eleven_multilingual_v3") {
                  customName = "Eleven v3 (🚀 Model Mới Nhất - Siêu Biểu Cảm, Audio Tags [thì thầm, cười...])";
                } else if (m.model_id === "eleven_multilingual_v2") {
                  customName = "Eleven Multilingual v2 (⭐ Chuẩn Tiếng Việt & Đa Ngôn Ngữ Tốt Nhất)";
                } else if (m.model_id === "eleven_turbo_v2_5") {
                  customName = "Eleven Turbo v2.5 (Siêu Nhanh, Tự Nhiên & Tiếng Việt)";
                } else if (m.model_id === "eleven_flash_v2_5") {
                  customName = "Eleven Flash v2.5 (Tốc Độ Cao, Siêu Tiết Kiệm Ký Tự)";
                }
                return {
                  id: m.model_id,
                  name: customName,
                };
              });
          }
        } catch (e) {
          console.warn("Failed to fetch ElevenLabs official models:", e);
        }

        // Ensure eleven_v3 is available
        if (!models.some((m) => m.id === "eleven_v3" || m.id === "eleven_multilingual_v3")) {
          models.unshift({
            id: "eleven_v3",
            name: "Eleven v3 (🚀 Model Mới Nhất - Siêu Biểu Cảm, Audio Tags [thì thầm, cười...])",
          });
        }

        if (models.length === 0) {
          models = [
            { id: "eleven_v3", name: "Eleven v3 (🚀 Model Mới Nhất - Siêu Biểu Cảm, Audio Tags [thì thầm, cười...])" },
            { id: "eleven_multilingual_v2", name: "Eleven Multilingual v2 (⭐ Chuẩn Tiếng Việt & Tự Nhiên)" },
            { id: "eleven_turbo_v2_5", name: "Eleven Turbo v2.5 (Siêu Nhanh, Độ Trễ Thấp)" },
            { id: "eleven_flash_v2_5", name: "Eleven Flash v2.5 (Tốc Độ Cao, Tiết Kiệm)" },
            { id: "eleven_turbo_v2", name: "Eleven Turbo v2 (Tiếng Anh / Phổ Thông)" },
            { id: "eleven_monolingual_v1", name: "Eleven Monolingual v1" },
          ];
        } else {
          models.sort((a, b) => {
            if (a.id === "eleven_v3") return -1;
            if (b.id === "eleven_v3") return 1;
            if (a.id === "eleven_multilingual_v2") return -1;
            if (b.id === "eleven_multilingual_v2") return 1;
            if (a.id === "eleven_turbo_v2_5") return -1;
            if (b.id === "eleven_turbo_v2_5") return 1;
            return 0;
          });
        }
        return models;
      })(),
      (async () => {
        let voices: Array<{ id: string; name: string; tag?: string; previewUrl?: string; isCloned?: boolean }> = [];
        try {
          const resVoices = await fetch("https://api.elevenlabs.io/v1/voices", {
            headers,
            signal: AbortSignal.timeout(8000),
          });
          if (resVoices.ok) {
            const vData = await resVoices.json();
            const rawVoices = vData.voices || [];
            voices = rawVoices.map((v: any) => {
              const isCloned = v.category === "cloned" || v.category === "professional" || v.category === "instant";
              const gender = v.labels?.gender ? (v.labels.gender.toLowerCase() === "female" ? "Nữ" : "Nam") : "";
              const accent = v.labels?.accent || "";
              const descParts = [gender, accent, v.labels?.description || v.labels?.["use case"]].filter(Boolean);
              const desc = descParts.length > 0 ? descParts.join(" - ") : (v.category || "Hệ Thống");
              return {
                id: v.voice_id,
                name: `${isCloned ? "⭐ " : ""}${v.name} (${desc})`,
                tag: isCloned ? "Giọng Clone Của Bạn" : v.category || "Default",
                previewUrl: v.preview_url,
                isCloned,
              };
            });

            voices.sort((a, b) => {
              if (a.isCloned && !b.isCloned) return -1;
              if (!a.isCloned && b.isCloned) return 1;
              return a.name.localeCompare(b.name);
            });
          }
        } catch (e) {
          console.warn("Failed to fetch ElevenLabs official voices:", e);
        }

        if (voices.length === 0) {
          voices = [
            { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel (Nữ - Truyền Cảm, Nhẹ Nhàng)", tag: "Nữ - Chuẩn" },
            { id: "pNInz6obpgDQGcFmaJgB", name: "Adam (Nam - Sâu Lắng, Dày Dặn)", tag: "Nam - Chuẩn" },
            { id: "ErXwobaYiN019PkySvjV", name: "Antoni (Nam - Tự Nhiên, Trẻ Trung)", tag: "Nam - Chuẩn" },
            { id: "EXAVITQu4vr4xnSDxMaL", name: "Bella (Nữ - Ngọt Ngào, Trong Trẻo)", tag: "Nữ - Chuẩn" },
            { id: "TxGEqnHWrfWFTfGW9XjX", name: "Josh (Nam - Giọng Đọc Trầm Ấm)", tag: "Nam - Chuẩn" },
            { id: "VR6AewLTigWG4xSOukaG", name: "Arnold (Nam - Mạnh Mẽ, Quyết Đoán)", tag: "Nam - Chuẩn" },
            { id: "yoZ06aMxZJJ28mfd3POQ", name: "Sam (Nam - Thân Thiện, Podcast)", tag: "Nam - Chuẩn" },
            { id: "AZnzlk1XvdvUeBnXmlld", name: "Domi (Nữ - Năng Động, Rõ Ràng)", tag: "Nữ - Chuẩn" },
            { id: "MF3mGyEYCl7XYWbV9V6O", name: "Elli (Nữ - Tự Nhiên, Kể Chuyện)", tag: "Nữ - Chuẩn" },
          ];
        }
        return voices;
      })(),
    ]);

    // Record / Update Cre balance in stored keys immediately
    if (balanceInfo && balanceInfo.balance !== -1) {
      const keysMap = loadKeys();
      if (keysMap[cleanKey]) {
        keysMap[cleanKey].balance = balanceInfo.balance;
        if (balanceInfo.email) keysMap[cleanKey].email = balanceInfo.email;
        keysMap[cleanKey].source = "elevenlabs";
        if (balanceInfo.tier) keysMap[cleanKey].tier = balanceInfo.tier;
        if (balanceInfo.limit) keysMap[cleanKey].limit = balanceInfo.limit;
        if (balanceInfo.used !== undefined) keysMap[cleanKey].used = balanceInfo.used;
        if (balanceInfo.status) keysMap[cleanKey].status = balanceInfo.status;
      } else {
        keysMap[cleanKey] = {
          name: "ElevenLabs Key",
          balance: balanceInfo.balance,
          email: balanceInfo.email,
          source: "elevenlabs",
          tier: balanceInfo.tier,
          limit: balanceInfo.limit,
          used: balanceInfo.used,
          status: balanceInfo.status,
        };
      }
      saveKeys(keysMap);
    }

    return res.json({
      models: modelsResult,
      voices: voicesResult,
      balance: balanceInfo?.balance ?? -1,
      limit: balanceInfo?.limit,
      used: balanceInfo?.used,
      tier: balanceInfo?.tier,
      email: balanceInfo?.email,
      source: "elevenlabs",
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Lỗi khi kết nối tới ElevenLabs API" });
  }
});

/**
 * Smart API Key Routing based on Credit Balance and Cost:
 * If selectedKey doesn't have enough balance (< requiredCre) and its balance is known,
 * automatically prioritize keys that have balance >= requiredCre (or unknown balance).
 * E.g., API 1 (100 Cre), API 2 (30 Cre), User needs 50 Cre -> Automatically pick API 1 first!
 */
function selectSmartCandidateKeys(
  allKeys: string[],
  keysDict: Record<string, StoredKey>,
  selectedKey: string | undefined,
  requiredCre: number,
  preferredSource?: "elevenlabs" | "genmax"
): { candidateKeys: string[]; switchedAutomatically: boolean; switchReason?: string } {
  const hasSelected = !!(selectedKey && keysDict[selectedKey]);
  const selectedBal = hasSelected ? (keysDict[selectedKey]?.balance ?? -1) : -1;
  const isSelectedSufficient = hasSelected && (selectedBal === -1 || selectedBal >= requiredCre);

  const getBal = (k: string) => keysDict[k]?.balance ?? -1;
  const sourceMatches = (k: string) => {
    if (!preferredSource) return true;
    const src = keysDict[k]?.source;
    return !src || src === preferredSource;
  };

  // Divide into buckets:
  // 1. Sufficient: balance >= requiredCre
  // 2. Unknown: balance === -1
  // 3. Insufficient: 0 <= balance < requiredCre
  const sufficientKeys: string[] = [];
  const unknownKeys: string[] = [];
  const insufficientKeys: string[] = [];

  for (const k of allKeys) {
    const bal = getBal(k);
    if (bal >= requiredCre) {
      sufficientKeys.push(k);
    } else if (bal === -1) {
      unknownKeys.push(k);
    } else {
      insufficientKeys.push(k);
    }
  }

  // Sort inside buckets:
  // Keys matching preferred source first, then highest balance first
  const sortFn = (a: string, b: string) => {
    const srcA = sourceMatches(a) ? 1 : 0;
    const srcB = sourceMatches(b) ? 1 : 0;
    if (srcA !== srcB) return srcB - srcA;
    return getBal(b) - getBal(a);
  };

  sufficientKeys.sort(sortFn);
  unknownKeys.sort(sortFn);
  insufficientKeys.sort(sortFn);

  let candidateKeys: string[] = [];
  let switchedAutomatically = false;
  let switchReason: string | undefined = undefined;

  if (hasSelected && isSelectedSufficient) {
    // Current key has enough Cre! Keep it first.
    candidateKeys.push(selectedKey!);
    for (const k of sufficientKeys) if (k !== selectedKey) candidateKeys.push(k);
    for (const k of unknownKeys) if (k !== selectedKey) candidateKeys.push(k);
    for (const k of insufficientKeys) if (k !== selectedKey) candidateKeys.push(k);
  } else {
    // Current key is missing or has INSUFFICIENT Cre (< requiredCre)
    if (sufficientKeys.length > 0) {
      candidateKeys = [...sufficientKeys, ...unknownKeys, ...insufficientKeys];
      if (hasSelected && selectedBal >= 0 && selectedBal < requiredCre) {
        switchedAutomatically = true;
        const bestKey = candidateKeys[0];
        const bestName = keysDict[bestKey]?.name || `Key (${bestKey.slice(0, 8)}...)`;
        const bestBal = getBal(bestKey);
        const selName = keysDict[selectedKey!]?.name || `Key (${selectedKey!.slice(0, 8)}...)`;
        switchReason = `Tự động chuyển từ "${selName}" (${selectedBal} Cre) sang "${bestName}" (${bestBal.toLocaleString()} Cre) do yêu cầu ${requiredCre} Cre.`;
        console.log(`[Smart Key Routing] ${switchReason}`);
      }
    } else if (unknownKeys.length > 0) {
      candidateKeys = [...unknownKeys, ...insufficientKeys];
      if (hasSelected && selectedBal >= 0 && selectedBal < requiredCre) {
        switchedAutomatically = true;
        const bestKey = candidateKeys[0];
        const bestName = keysDict[bestKey]?.name || `Key (${bestKey.slice(0, 8)}...)`;
        const selName = keysDict[selectedKey!]?.name || `Key (${selectedKey!.slice(0, 8)}...)`;
        switchReason = `Tự động chuyển từ "${selName}" (${selectedBal} Cre) sang "${bestName}" (Chưa kiểm tra) do yêu cầu ${requiredCre} Cre.`;
        console.log(`[Smart Key Routing] ${switchReason}`);
      }
    } else {
      // No keys have sufficient Cre
      if (hasSelected) candidateKeys.push(selectedKey!);
      for (const k of insufficientKeys) if (k !== selectedKey) candidateKeys.push(k);
    }
  }

  // Deduplicate
  candidateKeys = Array.from(new Set(candidateKeys));

  return { candidateKeys, switchedAutomatically, switchReason };
}

// Run TTS via ElevenLabs Official API (api.elevenlabs.io) with Multi-Key Rotation
app.post("/api/elevenlabs/tts", async (req, res) => {
  const {
    text,
    selectedKey,
    voiceId,
    modelId = "eleven_v3",
    stability = 0.5,
    similarityBoost = 0.75,
    style = 0,
    speed = 1.0,
    useSpeakerBoost = true,
    outputFormat = "mp3_44100_128",
    latency = 0,
  } = req.body;

  if (!text || !text.trim()) {
    return res.status(400).json({ error: "Vui lòng nhập văn bản cần đọc!" });
  }
  if (!voiceId) {
    return res.status(400).json({ error: "Vui lòng chọn giọng đọc ElevenLabs hợp lệ!" });
  }

  const charCount = text.trim().length;
  const keysDict = loadKeys();
  const allKeys = Object.keys(keysDict);

  if (allKeys.length === 0) {
    return res.status(400).json({
      error: `Chưa có API Key nào được lưu. Cần ít nhất ${charCount} ký tự. Vui lòng mở menu Quản Lý API Key để thêm key từ https://elevenlabs.io/app/api !`,
    });
  }

  // Smart Candidate Selection based on Balance and Char Count
  const smartRouting = selectSmartCandidateKeys(
    allKeys,
    keysDict,
    selectedKey,
    charCount,
    "elevenlabs"
  );
  const candidateKeys = smartRouting.candidateKeys;
  let switchReason = smartRouting.switchReason;

  let lastErrorText = "";
  let workingKey = "";
  let workingKeyName = "";
  let wasRotated = false;
  let attemptsCount = 0;
  let outputBuffer: Buffer | null = null;
  const isPcm = outputFormat && outputFormat.startsWith("pcm");
  const ext = isPcm ? "wav" : (outputFormat && outputFormat.startsWith("opus") ? "opus" : "mp3");

  for (const currentKey of candidateKeys) {
    attemptsCount++;
    const keyInfo = keysDict[currentKey];
    const keyName = keyInfo?.name || `Key (${currentKey.slice(0, 8)}...)`;

    try {
      console.log(`[ElevenLabs TTS] Thử Key: "${keyName}" - Model: ${modelId} - Format: ${outputFormat}`);

      const queryParams = new URLSearchParams({
        output_format: outputFormat || "mp3_44100_128",
      });
      if (latency && Number(latency) > 0) {
        queryParams.set("optimize_streaming_latency", String(latency));
      }

      const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?${queryParams.toString()}`;
      const ttsRes = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": currentKey,
          "Accept": isPcm ? "audio/wav" : "audio/mpeg",
        },
        body: JSON.stringify({
          text: text.trim(),
          model_id: modelId || "eleven_v3",
          voice_settings: {
            stability: Number(stability) ?? 0.5,
            similarity_boost: Number(similarityBoost) ?? 0.75,
            style: Number(style) ?? 0.0,
            use_speaker_boost: Boolean(useSpeakerBoost),
            speed: Number(speed) ?? 1.0,
          },
        }),
        signal: AbortSignal.timeout(40000),
      });

      if (!ttsRes.ok) {
        let errDetail = "";
        try {
          const errJson = await ttsRes.json();
          errDetail = errJson.detail?.message || errJson.detail?.status || JSON.stringify(errJson.detail) || "";
        } catch {
          errDetail = await ttsRes.text().catch(() => "");
        }

        const lowerErr = errDetail.toLowerCase();

        const isCreditOrAuth =
          ttsRes.status === 401 ||
          ttsRes.status === 402 ||
          ttsRes.status === 429 ||
          lowerErr.includes("quota_exceeded") ||
          lowerErr.includes("insufficient_credits") ||
          lowerErr.includes("character_limit") ||
          lowerErr.includes("unauthorized") ||
          lowerErr.includes("invalid key");

        if (isCreditOrAuth) {
          const kMap = loadKeys();
          if (kMap[currentKey]) {
            kMap[currentKey].balance = 0;
            saveKeys(kMap);
          }
          console.warn(`[Auto-Rotate ElevenLabs] Key "${keyName}" bị lỗi số dư (${errDetail}). Tự động chuyển sang key tiếp theo...`);
          lastErrorText = `Key "${keyName}": ${errDetail || "Hết hạn mức ký tự (quota exceeded)"}`;
          continue;
        }

        lastErrorText = `Key "${keyName}": ${errDetail || ttsRes.statusText}`;
        continue;
      }

      // Success! Read binary audio data directly
      const arrayBuf = await ttsRes.arrayBuffer();
      outputBuffer = Buffer.from(arrayBuf);
      workingKey = currentKey;
      workingKeyName = keyName;
      wasRotated = currentKey !== selectedKey || smartRouting.switchedAutomatically;
      break;
    } catch (err: any) {
      console.warn(`[ElevenLabs TTS] Lỗi với key "${keyName}":`, err.message);
      lastErrorText = err.message || "Lỗi kết nối ElevenLabs";
      continue;
    }
  }

  if (!outputBuffer || !workingKey) {
    return res.status(400).json({
      error: `Tất cả ${candidateKeys.length} API Key đều không tạo được giọng ElevenLabs (Cần ${charCount} ký tự). Chi tiết lỗi: ${lastErrorText}. Vui lòng nạp hoặc thêm API Key mới từ https://elevenlabs.io/app/api !`,
      totalAttempted: candidateKeys.length,
      lastError: lastErrorText,
    });
  }

  const filename = `elevenlabs_${voiceId}_${Date.now()}.${ext}`;
  const filepath = path.join(OUTPUTS_DIR, filename);
  fs.writeFileSync(filepath, outputBuffer);

  // Immediately deduct characters from recorded Cre balance
  let remainingBal = -1;
  const kMap = loadKeys();
  if (kMap[workingKey]) {
    if (typeof kMap[workingKey].balance === "number" && kMap[workingKey].balance > 0) {
      kMap[workingKey].balance = Math.max(0, kMap[workingKey].balance - charCount);
      remainingBal = kMap[workingKey].balance;
    }
    if (typeof kMap[workingKey].used === "number") {
      kMap[workingKey].used += charCount;
    }
    saveKeys(kMap);
  }

  // Background refresh balance to fetch exact subscription status from ElevenLabs
  setTimeout(() => {
    fetchBalanceFromApi(workingKey, "elevenlabs").then((info) => {
      const freshMap = loadKeys();
      if (freshMap[workingKey]) {
        if (info.balance !== -1) freshMap[workingKey].balance = info.balance;
        if (info.email) freshMap[workingKey].email = info.email;
        freshMap[workingKey].source = "elevenlabs";
        if (info.tier) freshMap[workingKey].tier = info.tier;
        if (info.limit) freshMap[workingKey].limit = info.limit;
        if (info.used !== undefined) freshMap[workingKey].used = info.used;
        saveKeys(freshMap);
      }
    });
  }, 1000);

  return res.json({
    success: true,
    audioUrl: `/outputs/${filename}`,
    usedKey: workingKey,
    usedKeyName: workingKeyName,
    wasRotated,
    switchReason: switchReason || (wasRotated ? `Đã tự động xoay sang "${workingKeyName}"` : undefined),
    attemptsCount,
    cost: charCount,
    remainingBalance: remainingBal,
  });
});

// Fetch GenMax Models & Voices
app.get("/api/genmax/data", async (req, res) => {
  const { apiKey, provider } = req.query as { apiKey?: string; provider?: string };
  if (!apiKey) {
    return res.status(400).json({ error: "Vui lòng chọn hoặc nhập API Key!" });
  }

  const cleanKey = apiKey.trim();

  if (provider === "ElevenLabs_Official") {
    // Forward to ElevenLabs Official handler
    try {
      const elRes = await fetch(`http://127.0.0.1:${PORT}/api/elevenlabs/data?apiKey=${encodeURIComponent(cleanKey)}`);
      const elData = await elRes.json();
      return res.status(elRes.status).json(elData);
    } catch (e) {
      // Fallback
    }
  }

  const headers = { "xi-api-key": cleanKey };
  const providerKey = provider === "MiniMax" ? "minimax" : "elevenlabs";

  try {
    // Parallel fetch: Models, Voices, and User Balance
    const [balanceInfo, modelsResult, voicesResult] = await Promise.all([
      fetchBalanceFromApi(cleanKey, "genmax").catch(() => ({
        balance: -1,
        email: "",
        source: "genmax" as const,
      })),
      (async () => {
        let models: Array<{ id: string; name: string }> = [];
        try {
          const resModels = await fetch(`https://api.genmax.io/v1/models?provider=${providerKey}`, {
            headers,
            signal: AbortSignal.timeout(8000),
          });
          if (resModels.ok) {
            const modelsData = await resModels.json();
            models = (Array.isArray(modelsData) ? modelsData : []).map((m: any) => {
              const id = m.model_id || m.id;
              let name = m.name || id;
              if (id === "eleven_v3" || id === "eleven_multilingual_v3") {
                name = "Eleven v3 (🚀 Model v3 Mới Nhất - Siêu Biểu Cảm, Audio Tags [thì thầm, cười...])";
              } else if (id === "eleven_multilingual_v2") {
                name = "Eleven Multilingual v2 (⭐ Chuẩn Tiếng Việt & Đa Ngôn Ngữ Tốt Nhất)";
              } else if (id === "eleven_turbo_v2_5") {
                name = "Eleven Turbo v2.5 (Siêu Nhanh, Tự Nhiên & Tiếng Việt)";
              } else if (id === "eleven_flash_v2_5") {
                name = "Eleven Flash v2.5 (Tốc Độ Cao, Siêu Tiết Kiệm Ký Tự)";
              }
              return { id, name };
            });
          }
        } catch (e) {
          console.warn("Failed to fetch models from API:", e);
        }

        if (providerKey === "elevenlabs") {
          // Ensure eleven_v3 is available
          if (!models.some((m) => m.id === "eleven_v3" || m.id === "eleven_multilingual_v3")) {
            models.unshift({
              id: "eleven_v3",
              name: "Eleven v3 (🚀 Model v3 Mới Nhất - Siêu Biểu Cảm, Audio Tags [thì thầm, cười...])",
            });
          }
          models.sort((a, b) => {
            if (a.id === "eleven_v3") return -1;
            if (b.id === "eleven_v3") return 1;
            if (a.id === "eleven_multilingual_v2") return -1;
            if (b.id === "eleven_multilingual_v2") return 1;
            if (a.id === "eleven_turbo_v2_5") return -1;
            if (b.id === "eleven_turbo_v2_5") return 1;
            return 0;
          });
        }

        if (models.length === 0) {
          models =
            providerKey === "elevenlabs"
              ? [
                  { id: "eleven_v3", name: "Eleven v3 (🚀 Model v3 Mới Nhất - Siêu Biểu Cảm, Audio Tags [thì thầm, cười...])" },
                  { id: "eleven_multilingual_v2", name: "Eleven Multilingual v2 (⭐ Chuẩn Tiếng Việt & Đa Ngôn Ngữ Tốt Nhất)" },
                  { id: "eleven_turbo_v2_5", name: "Eleven Turbo v2.5 (Siêu Nhanh, Tự Nhiên & Tiếng Việt)" },
                  { id: "eleven_flash_v2_5", name: "Eleven Flash v2.5 (Tốc Độ Cao, Siêu Tiết Kiệm Ký Tự)" },
                  { id: "eleven_monolingual_v1", name: "Eleven Monolingual v1" },
                ]
              : [
                  { id: "speech-2.8-turbo", name: "MiniMax Speech 2.8 Turbo" },
                  { id: "speech-01-turbo", name: "MiniMax Speech 01 Turbo" },
                  { id: "speech-2.5", name: "MiniMax Speech 2.5" },
                ];
        }
        return models;
      })(),
      (async () => {
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
        return voices;
      })(),
    ]);

    // Record / Update Cre balance in stored keys immediately
    if (balanceInfo && balanceInfo.balance !== -1) {
      const keysMap = loadKeys();
      if (keysMap[cleanKey]) {
        keysMap[cleanKey].balance = balanceInfo.balance;
        if (balanceInfo.email) keysMap[cleanKey].email = balanceInfo.email;
        keysMap[cleanKey].source = "genmax";
        if (balanceInfo.tier) keysMap[cleanKey].tier = balanceInfo.tier;
        if (balanceInfo.limit) keysMap[cleanKey].limit = balanceInfo.limit;
        if (balanceInfo.used !== undefined) keysMap[cleanKey].used = balanceInfo.used;
        if (balanceInfo.status) keysMap[cleanKey].status = balanceInfo.status;
      } else {
        keysMap[cleanKey] = {
          name: "GenMax Key",
          balance: balanceInfo.balance,
          email: balanceInfo.email,
          source: "genmax",
          tier: balanceInfo.tier,
          limit: balanceInfo.limit,
          used: balanceInfo.used,
          status: balanceInfo.status,
        };
      }
      saveKeys(keysMap);
    }

    return res.json({
      models: modelsResult,
      voices: voicesResult,
      balance: balanceInfo?.balance ?? -1,
      limit: balanceInfo?.limit,
      used: balanceInfo?.used,
      tier: balanceInfo?.tier,
      email: balanceInfo?.email,
      source: "genmax",
    });
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
    volume = 1.0,
    useSpeakerBoost = true,
  } = req.body;

  if (!text || !text.trim()) {
    return res.status(400).json({ error: "Vui lòng nhập văn bản cần đọc!" });
  }
  if (!voiceId) {
    return res.status(400).json({ error: "Vui lòng chọn giọng đọc hợp lệ!" });
  }

  if (provider === "ElevenLabs_Official") {
    try {
      const elRes = await fetch(`http://127.0.0.1:${PORT}/api/elevenlabs/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req.body),
      });
      const elData = await elRes.json();
      return res.status(elRes.status).json(elData);
    } catch (err: any) {
      return res.status(500).json({ error: err.message || "Lỗi khi gọi ElevenLabs Official TTS" });
    }
  }

  const cost = text.trim().length;
  const keysDict = loadKeys();
  const allKeys = Object.keys(keysDict);

  if (allKeys.length === 0) {
    return res.status(400).json({
      error: `Chưa có API Key nào được lưu. Cần ít nhất ${cost} credits. Vui lòng mở menu Quản Lý API Key để thêm key!`,
    });
  }

  // Smart Candidate Selection based on Balance and Cost (e.g. 50 Cre needed, API 2 has 30, API 1 has 100 -> auto pick API 1)
  const preferredSource = provider === "ElevenLabs" ? "elevenlabs" : "genmax";
  const smartRouting = selectSmartCandidateKeys(
    allKeys,
    keysDict,
    selectedKey,
    cost,
    preferredSource
  );
  const candidateKeys = smartRouting.candidateKeys;
  let switchReason = smartRouting.switchReason;

  const url = `https://api.genmax.io/v1/text-to-speech/${voiceId}`;
  const payloadBase: any = {
    text: text.trim(),
    model_id: modelId || (provider === "MiniMax" ? "speech-2.8-turbo" : "eleven_v3"),
  };

  if (provider === "MiniMax") {
    payloadBase.provider = "minimax";
    payloadBase.language_code = "Vietnamese";
    payloadBase.voice_settings = {
      speed: Number(speed) ?? 1.0,
      pitch: Number(pitch) ?? 0,
      vol: Number(volume) ?? 1.0,
    };
  } else {
    payloadBase.provider = "elevenlabs";
    payloadBase.language_code = "vi";
    payloadBase.voice_settings = {
      stability: Number(stability) ?? 0.5,
      similarity_boost: Number(similarityBoost) ?? 0.75,
      style: Number(style) ?? 0.0,
      use_speaker_boost: Boolean(useSpeakerBoost),
      speed: Number(speed) ?? 1.0,
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
          wasRotated = currentKey !== selectedKey || smartRouting.switchedAutomatically;
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
        wasRotated = currentKey !== selectedKey || smartRouting.switchedAutomatically;
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

  // Immediately deduct cost from recorded Cre balance
  let remainingBal = -1;
  const kMap = loadKeys();
  if (kMap[workingKey]) {
    if (typeof kMap[workingKey].balance === "number" && kMap[workingKey].balance > 0) {
      kMap[workingKey].balance = Math.max(0, kMap[workingKey].balance - cost);
      remainingBal = kMap[workingKey].balance;
    }
    if (typeof kMap[workingKey].used === "number") {
      kMap[workingKey].used += cost;
    }
    saveKeys(kMap);
  }

  // Background refresh balance for the working key
  setTimeout(() => {
    fetchBalanceFromApi(workingKey, "genmax").then((info) => {
      const freshMap = loadKeys();
      if (freshMap[workingKey]) {
        if (info.balance !== -1) freshMap[workingKey].balance = info.balance;
        if (info.email) freshMap[workingKey].email = info.email;
        freshMap[workingKey].source = "genmax";
        if (info.tier) freshMap[workingKey].tier = info.tier;
        if (info.limit) freshMap[workingKey].limit = info.limit;
        if (info.used !== undefined) freshMap[workingKey].used = info.used;
        saveKeys(freshMap);
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
    switchReason: switchReason || (wasRotated ? `Đã tự động xoay sang "${workingKeyName}"` : undefined),
    attemptsCount,
    cost,
    taskId,
    remainingBalance: remainingBal,
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

  // 0. Priority: Direct FastAPI /api/generate Endpoint (Supports trycloudflare.com & direct FastAPI tunnel)
  try {
    const fastApiRes = await fetch(`${cleanUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        audio_base64: refAudioBase64,
        ref_text: refText || "",
        gen_text: genText,
        speed: Number(speed) || 1.0,
        nfe_step: Number(nfeStep) || 64,
        cfg_strength: Number(cfgStrength) || 2.0,
      }),
      signal: AbortSignal.timeout(180000),
    });

    if (fastApiRes.ok) {
      const fastApiJson = await fastApiRes.json();
      if (fastApiJson.audio_base64) {
        const rawB64 = fastApiJson.audio_base64.replace(/^data:audio\/\w+;base64,/, "");
        const filename = `fastapi_colab_${Date.now()}.wav`;
        const filepath = path.join(OUTPUTS_DIR, filename);
        fs.writeFileSync(filepath, Buffer.from(rawB64, "base64"));
        return res.json({
          success: true,
          result: `/outputs/${filename}`,
          directUrl: fastApiJson.audio_base64,
        });
      }
      if (fastApiJson.audio_url) {
        const aUrl = fastApiJson.audio_url.startsWith("http") ? fastApiJson.audio_url : `${cleanUrl}${fastApiJson.audio_url.startsWith("/") ? "" : "/"}${fastApiJson.audio_url}`;
        return res.json({
          success: true,
          result: aUrl,
          directUrl: aUrl,
        });
      }
    }
  } catch (fastApiErr) {
    console.warn("Direct FastAPI /api/generate failed, proceeding to Gradio pipeline:", fastApiErr);
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
