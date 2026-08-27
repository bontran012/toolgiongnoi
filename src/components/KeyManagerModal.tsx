import React, { useState } from 'react';
import { X, Plus, Trash2, RefreshCw, Key, ShieldCheck, Mail, CheckCircle2, AlertCircle, Layers, Zap } from 'lucide-react';
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
  const [newKey, setNewKey] = useState('');
  const [newName, setNewName] = useState('');
  const [batchText, setBatchText] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (!isOpen) return null;

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

    try {
      // Try backend first
      let saved = false;
      try {
        const res = await fetch('/api/keys', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apiKey: kVal, name: nVal }),
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
        const { balance, email } = await fetchDirectBalance(kVal);
        currentLocals.unshift({
          key: kVal,
          name: nVal,
          balance,
          email,
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

    try {
      let savedViaBackend = false;
      try {
        const res = await fetch('/api/keys/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rawText: batchText }),
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
          if (line.includes('|')) {
            const parts = line.split('|');
            k = parts[0].trim();
            name = parts.slice(1).join('|').trim() || name;
          }
          if (k.length > 10) {
            const existingIdx = currentLocals.findIndex((x) => x.key === k);
            if (existingIdx >= 0) {
              currentLocals[existingIdx].name = name;
            } else {
              currentLocals.push({
                key: k,
                name,
                balance: -1,
                email: '',
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
        const { balance, email } = await fetchDirectBalance(item.key);
        if (balance !== -1) item.balance = balance;
        if (email) item.email = email;
      }
      saveLocalKeys(locals);

      onKeysUpdated();
    } catch (err) {
      console.error('Error refreshing keys:', err);
    } finally {
      setRefreshing(false);
    }
  };

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
              <h3 className="text-base font-bold text-slate-100">Quản Lý Danh Sách API Key (GenMax)</h3>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <p className="text-xs text-emerald-400 font-medium">Tự động xoay vòng Key khi hết Credits</p>
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
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Key Auto Rotation Info Banner */}
          <div className="p-3.5 bg-blue-950/40 border border-blue-500/30 rounded-xl flex items-start gap-3 text-xs text-blue-200">
            <Zap className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-blue-300">Cơ chế xoay Key tự động (Failover):</span>{' '}
              Khi tạo giọng nói, nếu API Key đang chọn bị hết credits (lỗi <code>insufficient credits</code>) hoặc hết hạn, hệ thống sẽ <b>ngay lập tức thử tiếp các Key khác trong danh sách</b> cho đến khi thành công mà không làm gián đoạn công việc của bạn.
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
              <h4 className="text-xs font-semibold uppercase tracking-wider text-blue-400 flex items-center gap-1.5">
                <Plus className="w-4 h-4" /> Thêm API Key Mới
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Tên gợi nhớ</label>
                  <input
                    type="text"
                    placeholder="VD: Key Phụ 1, Account 2..."
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">Mã API Key (xi-api-key)</label>
                  <input
                    type="password"
                    placeholder="sk_..."
                    value={newKey}
                    onChange={(e) => setNewKey(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>
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
                {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                <span>{loading ? 'Đang kiểm tra & lưu...' : 'Lưu & Kiểm Tra Số Dư'}</span>
              </button>
            </form>
          ) : (
            <form onSubmit={handleBatchAdd} className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-blue-400 flex items-center gap-1.5">
                    <Layers className="w-4 h-4" /> Dán Danh Sách Hàng Loạt API Key
                  </h4>
                  <span className="text-[11px] text-slate-500">Mỗi dòng 1 key (hoặc <code>key|Tên key</code>)</span>
                </div>
                <textarea
                  rows={4}
                  value={batchText}
                  onChange={(e) => setBatchText(e.target.value)}
                  placeholder={`sk_key_1|Acc 1\nsk_key_2|Acc 2\nsk_key_3`}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500 font-mono"
                />
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

          {/* Keys List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" /> Danh sách Key ({keys.length})
              </h4>
              <button
                onClick={handleRefreshAll}
                disabled={refreshing}
                className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 hover:underline cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                <span>Cập nhật số dư tất cả</span>
              </button>
            </div>

            {keys.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-sm bg-slate-950/30 rounded-xl border border-slate-800/50">
                Chưa có API Key nào được lưu. Hãy thêm key để bắt đầu sử dụng GenMax.
              </div>
            ) : (
              <div className="space-y-2">
                {keys.map((kItem) => {
                  const isSelected = selectedKey === kItem.key;
                  const isOutOfCredits = kItem.balance === 0;

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
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm text-slate-200 truncate">{kItem.name}</span>
                            {isSelected && (
                              <span className="text-[10px] bg-blue-500/20 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded-full font-medium">
                                Ưu tiên chọn
                              </span>
                            )}
                            {isOutOfCredits && (
                              <span className="text-[10px] bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-0.5 rounded-full font-medium">
                                Hết Credits
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-slate-400 font-mono mt-0.5">
                            <span>{kItem.key.slice(0, 10)}...{kItem.key.slice(-4)}</span>
                            {kItem.email && (
                              <span className="flex items-center gap-1 text-slate-500 font-sans">
                                <Mail className="w-3 h-3" /> {kItem.email}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center space-x-3 flex-shrink-0">
                        <div className="text-right">
                          <div className={`text-xs font-bold ${isOutOfCredits ? 'text-red-400' : 'text-emerald-400'}`}>
                            {kItem.balance !== -1 ? `${kItem.balance.toLocaleString()} Cr` : '? Cr'}
                          </div>
                          <div className="text-[10px] text-slate-500">Số dư</div>
                        </div>

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
