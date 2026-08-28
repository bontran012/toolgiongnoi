import React, { useState } from 'react';
import {
  X,
  Plus,
  Trash2,
  RefreshCw,
  Key,
  ShieldCheck,
  Mail,
  CheckCircle2,
  AlertCircle,
  Layers,
  Zap,
  ExternalLink,
  Sparkles,
} from 'lucide-react';
import { KeyItem } from '../types';
import { getLocalKeys, saveLocalKeys, fetchDirectBalance } from '../utils/directApiFallback';

interface KeyManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  keys: KeyItem[];
  selectedKey: string;
  onSelectKey: (key: string) => void;
  onKeysUpdated: () => void;
}

export const KeyManagerModal: React.FC<KeyManagerModalProps> = ({
  isOpen,
  onClose,
  keys,
  selectedKey,
  onSelectKey,
  onKeysUpdated,
}) => {
  const [addMode, setAddMode] = useState<'single' | 'batch'>('single');
  const [keySource, setKeySource] = useState<'auto' | 'elevenlabs' | 'genmax'>('auto');
  const [batchSource, setBatchSource] = useState<'auto' | 'elevenlabs' | 'genmax'>('auto');
  const [filterTab, setFilterTab] = useState<'all' | 'elevenlabs' | 'genmax'>('all');
  const [newKey, setNewKey] = useState('');
  const [newName, setNewName] = useState('');
  const [batchText, setBatchText] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [checkingKeys, setCheckingKeys] = useState<Record<string, boolean>>({});
  const [testingKey, setTestingKey] = useState(false);
  const [testFeedback, setTestFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleTestNewKey = async () => {
    if (!newKey.trim()) {
      setError('Vui lòng nhập Mã API Key trước khi kiểm tra!');
      return;
    }
    setTestingKey(true);
    setError(null);
    setSuccess(null);
    setTestFeedback(null);
    try {
      const kVal = newKey.trim();
      const preferredSource = keySource === 'auto' ? undefined : keySource;
      let info: any = null;
      try {
        const res = await fetch('/api/keys/check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apiKey: kVal, source: preferredSource }),
        });
        if (res.ok) info = await res.json();
      } catch {}

      if (!info || info.balance === -1) {
        info = await fetchDirectBalance(kVal, preferredSource);
      }

      if (info && info.balance !== -1) {
        const src = info.source === 'elevenlabs' ? 'ElevenLabs' : 'GenMax';
        const lim = info.limit ? ` / ${info.limit.toLocaleString()} Cre` : ' Cre';
        setTestFeedback(`✅ Key hợp lệ [${src}]: Còn ${info.balance.toLocaleString()}${lim} • Gói: ${info.tier || 'Active'}`);
        if (info.source && keySource === 'auto') {
          setKeySource(info.source);
        }
      } else {
        const errorMsg = info?.errorMessage || 'Không kiểm tra được số Cre của Key. Vui lòng kiểm tra lại mã API Key ElevenLabs / GenMax!';
        setError(`❌ ${errorMsg}`);
      }
    } catch (err: any) {
      setError('Lỗi khi kiểm tra key: ' + (err.message || ''));
    } finally {
      setTestingKey(false);
    }
  };

  const handleCheckSingleKey = async (item: KeyItem) => {
    setCheckingKeys((prev) => ({ ...prev, [item.key]: true }));
    setError(null);
    try {
      let updatedInfo: any = null;
      try {
        const res = await fetch('/api/keys/check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apiKey: item.key, source: item.source }),
        });
        if (res.ok) {
          updatedInfo = await res.json();
        }
      } catch {}

      if (!updatedInfo || updatedInfo.balance === -1) {
        updatedInfo = await fetchDirectBalance(item.key, item.source as any);
      }

      // Update local storage
      const locals = getLocalKeys();
      const idx = locals.findIndex((x) => x.key === item.key);
      if (idx >= 0 && updatedInfo && updatedInfo.balance !== -1) {
        locals[idx].balance = updatedInfo.balance;
        if (updatedInfo.email) locals[idx].email = updatedInfo.email;
        if (updatedInfo.source) locals[idx].source = updatedInfo.source;
        if (updatedInfo.tier) locals[idx].tier = updatedInfo.tier;
        if (updatedInfo.limit) locals[idx].limit = updatedInfo.limit;
        if (updatedInfo.used !== undefined) locals[idx].used = updatedInfo.used;
        if (updatedInfo.status) locals[idx].status = updatedInfo.status;
        saveLocalKeys(locals);
      }

      onKeysUpdated();
      if (updatedInfo && updatedInfo.balance !== -1) {
        const srcName = updatedInfo.source === 'elevenlabs' ? 'ElevenLabs' : 'GenMax';
        const limStr = updatedInfo.limit ? ` / ${updatedInfo.limit.toLocaleString()}` : '';
        setSuccess(`Đã cập nhật [${srcName}] "${item.name}": Còn ${updatedInfo.balance.toLocaleString()}${limStr} Cre (Gói: ${updatedInfo.tier || 'Active'})`);
      } else {
        const errorMsg = updatedInfo?.errorMessage || `Không thể lấy số Cre của key "${item.name}". Vui lòng kiểm tra lại key!`;
        setError(errorMsg);
      }
    } catch (err: any) {
      setError(err.message || 'Lỗi khi kiểm tra key');
    } finally {
      setCheckingKeys((prev) => ({ ...prev, [item.key]: false }));
    }
  };

  const handleAddKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKey.trim() || !newName.trim()) {
      setError('Vui lòng nhập đầy đủ Mã API Key và Tên gợi nhớ!');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    const kVal = newKey.trim();
    const nVal = newName.trim();
    const preferredSource = keySource === 'auto' ? undefined : keySource;

    try {
      // Try backend first
      let saved = false;
      try {
        const res = await fetch('/api/keys', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apiKey: kVal, name: nVal, source: preferredSource }),
        });
        if (res.ok) {
          const contentType = res.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            const data = await res.json();
            saved = true;
            if (data.key?.key) onSelectKey(data.key.key);
          }
        }
      } catch {}

      if (!saved) {
        // Fallback to local storage
        const currentLocals = getLocalKeys().filter((item) => item.key !== kVal);
        const info = await fetchDirectBalance(kVal, preferredSource);
        currentLocals.unshift({
          key: kVal,
          name: nVal,
          balance: info.balance,
          email: info.email,
          source: info.source,
          tier: info.tier,
          limit: info.limit,
        });
        saveLocalKeys(currentLocals);
        onSelectKey(kVal);
      }

      setSuccess('Thêm và lưu API Key thành công!');
      setNewKey('');
      setNewName('');
      onKeysUpdated();
    } catch (err: any) {
      setError(err.message || 'Lỗi khi lưu key');
    } finally {
      setLoading(false);
    }
  };

  const handleBatchAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!batchText.trim()) {
      setError('Vui lòng dán danh sách API Key!');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    const lines = batchText.split('\n').map((l) => l.trim()).filter(Boolean);
    const preferredDefault = batchSource === 'auto' ? undefined : batchSource;

    try {
      let savedViaBackend = false;
      try {
        const res = await fetch('/api/keys/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rawText: batchText, defaultSource: preferredDefault }),
        });
        if (res.ok) {
          const data = await res.json();
          savedViaBackend = true;
          setSuccess(data.message || `Đã thêm ${lines.length} key thành công!`);
        }
      } catch {}

      if (!savedViaBackend) {
        const currentLocals = getLocalKeys();
        let addedCount = 0;
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          let k = line;
          let name = `Key ${currentLocals.length + 1}`;
          let itemSource = preferredDefault;

          if (line.includes('|')) {
            const parts = line.split('|');
            k = parts[0].trim();
            name = parts[1]?.trim() || name;
            if (parts[2]) {
              const s = parts[2].trim().toLowerCase();
              if (s.includes('eleven')) itemSource = 'elevenlabs';
              else if (s.includes('genmax')) itemSource = 'genmax';
            }
          }
          if (k.length > 8) {
            const existingIdx = currentLocals.findIndex((x) => x.key === k);
            if (existingIdx >= 0) {
              currentLocals[existingIdx].name = name;
              if (itemSource) currentLocals[existingIdx].source = itemSource;
            } else {
              currentLocals.push({
                key: k,
                name,
                balance: -1,
                email: '',
                source: itemSource,
              });
              addedCount++;
            }
          }
        }
        saveLocalKeys(currentLocals);
        setSuccess(`Đã lưu ${addedCount} API Key mới vào danh sách!`);
      }

      setBatchText('');
      onKeysUpdated();
    } catch (err: any) {
      setError(err.message || 'Lỗi khi lưu danh sách key');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteKey = async (keyToDelete: string) => {
    try {
      try {
        await fetch(`/api/keys/${encodeURIComponent(keyToDelete)}`, {
          method: 'DELETE',
        });
      } catch {}

      // Also clean up local storage
      const locals = getLocalKeys().filter((k) => k.key !== keyToDelete);
      saveLocalKeys(locals);

      onKeysUpdated();
      if (selectedKey === keyToDelete) {
        const remaining = keys.filter((k) => k.key !== keyToDelete);
        if (remaining.length > 0) {
          onSelectKey(remaining[0].key);
        }
      }
    } catch (err) {
      console.error('Error deleting key:', err);
    }
  };

  const handleRefreshAll = async () => {
    setRefreshing(true);
    try {
      try {
        await fetch('/api/keys/refresh', { method: 'POST' });
      } catch {}

      // Also refresh local storage balances
      const locals = getLocalKeys();
      for (const item of locals) {
        const info = await fetchDirectBalance(item.key, item.source as any);
        if (info.balance !== -1) item.balance = info.balance;
        if (info.email) item.email = info.email;
        if (info.source) item.source = info.source;
        if (info.tier) item.tier = info.tier;
        if (info.limit) item.limit = info.limit;
      }
      saveLocalKeys(locals);

      onKeysUpdated();
    } catch (err) {
      console.error('Error refreshing keys:', err);
    } finally {
      setRefreshing(false);
    }
  };

  const filteredKeys = keys.filter((k) => {
    if (filterTab === 'all') return true;
    if (filterTab === 'elevenlabs') return k.source === 'elevenlabs';
    if (filterTab === 'genmax') return k.source === 'genmax' || !k.source;
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/80">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100">Quản Lý API Key (ElevenLabs & GenMax)</h3>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <p className="text-xs text-emerald-400 font-medium">Tự động xoay vòng Key khi hết hạn mức</p>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* ElevenLabs Official Guide & Link Banner */}
          <div className="p-3.5 bg-gradient-to-r from-purple-950/40 via-blue-950/40 to-slate-900/40 border border-purple-500/30 rounded-xl flex items-start justify-between gap-3 text-xs text-purple-200">
            <div className="flex items-start gap-2.5">
              <Sparkles className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-purple-300">Tích hợp ElevenLabs Chính Thức:</span>{' '}
                Hỗ trợ trực tiếp API Key từ{' '}
                <a
                  href="https://elevenlabs.io/app/api"
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-400 hover:underline font-semibold inline-flex items-center gap-1"
                >
                  elevenlabs.io/app/api <ExternalLink className="w-3 h-3" />
                </a>
                . Tự động đồng bộ số dư ký tự, gói tài khoản (Tier) và các <b>Giọng Clone</b> cá nhân của bạn!
              </div>
            </div>
          </div>

          {/* Key Auto Rotation & Smart Balance Info Banner */}
          <div className="p-3.5 bg-gradient-to-r from-blue-950/50 to-indigo-950/40 border border-blue-500/30 rounded-xl flex items-start gap-2.5 text-xs text-blue-200">
            <Zap className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-amber-300">Cơ chế chuyển Key thông minh theo số dư Cre:</span>{' '}
              Hệ thống tự động tính toán lượng Cre tiêu hao theo độ dài văn bản và <b>ưu tiên tự động chuyển sang API Key có đủ số dư</b> (Ví dụ: cần 50 Cre, Key 1 có 30 Cre, Key 2 có 100 Cre thì tự động dùng Key 2). Đồng thời kích hoạt cơ chế xoay vòng Failover nếu Key gặp lỗi hạn mức.
            </div>
          </div>

          {/* Add Mode Selector */}
          <div className="flex bg-slate-950/80 p-1 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => setAddMode('single')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition flex items-center justify-center gap-1.5 ${
                addMode === 'single'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Plus className="w-3.5 h-3.5" /> Thêm Từng Key
            </button>
            <button
              type="button"
              onClick={() => setAddMode('batch')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition flex items-center justify-center gap-1.5 ${
                addMode === 'batch'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5" /> Dán Hàng Loạt (Nhiều Key)
            </button>
          </div>

          {/* Add Key Form */}
          {addMode === 'single' ? (
            <form onSubmit={handleAddKey} className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-blue-400 flex items-center gap-1.5">
                  <Plus className="w-4 h-4" /> Thêm API Key Mới
                </h4>
                <div className="flex items-center gap-1 text-[11px] text-slate-400">
                  <span>Nguồn:</span>
                  <select
                    value={keySource}
                    onChange={(e) => setKeySource(e.target.value as any)}
                    className="bg-slate-900 border border-slate-700 rounded px-2 py-0.5 text-[11px] text-slate-200 focus:outline-none"
                  >
                    <option value="auto">Tự động nhận diện</option>
                    <option value="elevenlabs">ElevenLabs (elevenlabs.io)</option>
                    <option value="genmax">GenMax (api.genmax.io)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Tên gợi nhớ</label>
                  <input
                    type="text"
                    placeholder="VD: ElevenLabs Chính, GenMax Acc 2..."
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs text-slate-400">Mã API Key (xi-api-key)</label>
                    <button
                      type="button"
                      onClick={handleTestNewKey}
                      disabled={testingKey || !newKey.trim()}
                      className="text-[11px] text-blue-400 hover:text-blue-300 disabled:opacity-40 flex items-center gap-1 hover:underline cursor-pointer"
                    >
                      <RefreshCw className={`w-3 h-3 ${testingKey ? 'animate-spin' : ''}`} />
                      <span>{testingKey ? 'Đang kiểm tra...' : 'Kiểm tra số Cre'}</span>
                    </button>
                  </div>
                  <input
                    type="password"
                    placeholder="sk_... (ElevenLabs) hoặc mã API Key GenMax"
                    value={newKey}
                    onChange={(e) => {
                      setNewKey(e.target.value);
                      setTestFeedback(null);
                    }}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono"
                  />
                  {newKey.trim().length === 64 && !newKey.trim().startsWith('sk_') && (
                    <div className="mt-1 text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/20 p-2 rounded-md">
                      ⚠️ <b>Lưu ý ElevenLabs:</b> Bạn đang nhập chuỗi 64 ký tự (Key ID). Trên ElevenLabs, API Key thực tế để gọi và đọc Credit bắt đầu bằng <code className="bg-slate-900 px-1 py-0.5 rounded text-amber-300 font-mono">sk_...</code>. Bạn hãy vào <a href="https://elevenlabs.io/app/settings/api-keys" target="_blank" rel="noreferrer" className="underline font-semibold">Settings &gt; API Keys</a> tạo/xoay key mới để copy mã <code className="text-amber-300 font-mono">sk_...</code> nhé!
                    </div>
                  )}
                </div>
              </div>

              {testFeedback && (
                <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 p-2.5 rounded-lg">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  <span>{testFeedback}</span>
                </div>
              )}

              {error && (
                <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 p-2.5 rounded-lg">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {success && (
                <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 p-2.5 rounded-lg">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  <span>{success}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition shadow-md flex items-center justify-center gap-2 cursor-pointer"
              >
                {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                <span>{loading ? 'Đang kiểm tra số Cre & lưu...' : 'Lưu & Kiểm Tra Số Cre'}</span>
              </button>
            </form>
          ) : (
            <form onSubmit={handleBatchAdd} className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-blue-400 flex items-center gap-1.5">
                    <Layers className="w-4 h-4" /> Dán Danh Sách Hàng Loạt API Key
                  </h4>
                  <div className="flex items-center gap-1 text-[11px] text-slate-400">
                    <span>Mặc định:</span>
                    <select
                      value={batchSource}
                      onChange={(e) => setBatchSource(e.target.value as any)}
                      className="bg-slate-900 border border-slate-700 rounded px-2 py-0.5 text-[11px] text-slate-200 focus:outline-none"
                    >
                      <option value="auto">Tự động nhận diện</option>
                      <option value="elevenlabs">ElevenLabs</option>
                      <option value="genmax">GenMax</option>
                    </select>
                  </div>
                </div>
                <textarea
                  rows={4}
                  value={batchText}
                  onChange={(e) => setBatchText(e.target.value)}
                  placeholder={`key_eleven_1|Acc ElevenLabs 1|elevenlabs\nkey_genmax_2|Acc GenMax 2|genmax\nkey_3|Acc 3`}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500 font-mono"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Định dạng hỗ trợ: <code>key</code> hoặc <code>key|Tên key</code> hoặc <code>key|Tên key|elevenlabs</code>
                </p>
              </div>

              {error && (
                <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 p-2.5 rounded-lg">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {success && (
                <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 p-2.5 rounded-lg">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  <span>{success}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition shadow-md flex items-center justify-center gap-2 cursor-pointer"
              >
                {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Layers className="w-4 h-4" />}
                <span>{loading ? 'Đang nạp danh sách...' : 'Nạp Hàng Loạt Vào Kho Key'}</span>
              </button>
            </form>
          )}

          {/* Keys List with Filter Tabs */}
          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" /> Danh sách Key ({keys.length})
                </h4>
                {/* Filter Tabs */}
                <div className="flex items-center bg-slate-950 rounded-lg p-0.5 border border-slate-800 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setFilterTab('all')}
                    className={`px-2 py-0.5 rounded transition ${
                      filterTab === 'all' ? 'bg-slate-800 text-white font-medium' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Tất cả
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterTab('elevenlabs')}
                    className={`px-2 py-0.5 rounded transition ${
                      filterTab === 'elevenlabs' ? 'bg-purple-600/30 text-purple-300 font-medium' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    ElevenLabs
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterTab('genmax')}
                    className={`px-2 py-0.5 rounded transition ${
                      filterTab === 'genmax' ? 'bg-blue-600/30 text-blue-300 font-medium' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    GenMax
                  </button>
                </div>
              </div>

              <button
                onClick={handleRefreshAll}
                disabled={refreshing}
                className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 hover:underline cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                <span>Cập nhật số dư tất cả</span>
              </button>
            </div>

            {filteredKeys.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-sm bg-slate-950/30 rounded-xl border border-slate-800/50">
                {keys.length === 0
                  ? 'Chưa có API Key nào được lưu. Hãy thêm key từ ElevenLabs hoặc GenMax để bắt đầu!'
                  : 'Không có key nào thuộc bộ lọc này.'}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredKeys.map((kItem) => {
                  const isSelected = selectedKey === kItem.key;
                  const isOutOfCredits = kItem.balance === 0;
                  const isEleven = kItem.source === 'elevenlabs';
                  const isCheckingThis = !!checkingKeys[kItem.key];

                  return (
                    <div
                      key={kItem.key}
                      className={`p-3 rounded-xl border transition flex items-center justify-between gap-3 ${
                        isSelected
                          ? 'bg-blue-950/30 border-blue-500/50 shadow-sm shadow-blue-500/10'
                          : isOutOfCredits
                          ? 'bg-red-950/10 border-red-900/30 opacity-75'
                          : 'bg-slate-950/40 border-slate-800/80 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center space-x-3 overflow-hidden">
                        <input
                          type="radio"
                          name="selected_key_radio"
                          checked={isSelected}
                          onChange={() => onSelectKey(kItem.key)}
                          className="w-4 h-4 text-blue-600 bg-slate-900 border-slate-700 focus:ring-blue-500 cursor-pointer"
                        />
                        <div className="overflow-hidden">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm text-slate-200 truncate">{kItem.name}</span>
                            {/* Provider Badge */}
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
                                isEleven
                                  ? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                                  : 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                              }`}
                            >
                              {isEleven ? 'ElevenLabs' : 'GenMax'}
                            </span>
                            {kItem.tier && (
                              <span className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded border border-slate-700">
                                {kItem.tier}
                              </span>
                            )}
                            {isSelected && (
                              <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-medium">
                                Ưu tiên chọn
                              </span>
                            )}
                            {isOutOfCredits && (
                              <span className="text-[10px] bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-0.5 rounded-full font-medium">
                                Hết hạn mức
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-slate-400 font-mono mt-0.5">
                            <span>
                              {kItem.key.slice(0, 10)}...{kItem.key.slice(-4)}
                            </span>
                            {kItem.email && (
                              <span className="flex items-center gap-1 text-slate-500 font-sans">
                                <Mail className="w-3 h-3" /> {kItem.email}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2 flex-shrink-0">
                        <div className="text-right mr-1">
                          <div className={`text-xs font-bold ${isOutOfCredits ? 'text-red-400' : 'text-emerald-400'}`}>
                            {kItem.balance !== -1 ? `${kItem.balance.toLocaleString()} Cre` : '? Cre'}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {kItem.limit && kItem.limit > 0 ? (
                              <span>Đã dùng {(kItem.used || 0).toLocaleString()} / {kItem.limit.toLocaleString()}</span>
                            ) : (
                              <span>Số Cre khả dụng</span>
                            )}
                          </div>
                        </div>

                        {/* Check single key button */}
                        <button
                          type="button"
                          onClick={() => handleCheckSingleKey(kItem)}
                          disabled={isCheckingThis}
                          className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition cursor-pointer"
                          title="Kiểm tra lại số Cre ngay"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${isCheckingThis ? 'animate-spin text-blue-400' : ''}`} />
                        </button>

                        <button
                          onClick={() => handleDeleteKey(kItem.key)}
                          className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition cursor-pointer"
                          title="Xóa Key"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Explanatory note */}
            <div className="mt-3 p-2.5 bg-slate-950/60 rounded-xl border border-slate-800/80 text-[11px] text-slate-400 flex items-start gap-2">
              <Sparkles className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-slate-300">Quy đổi số Cre:</span> Cả <b>ElevenLabs</b> và <b>GenMax</b> đều kiểm tra và hiển thị trực tiếp số Cre khả dụng. Đối với ElevenLabs, <b>1 Ký tự = 1 Cre</b> (Credit). Bấm nút 🔄 bên cạnh mỗi Key để kiểm tra lại số Cre tức thì!
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-900/90 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg transition cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};

