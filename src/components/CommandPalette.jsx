import React, { useEffect, useRef, useState } from 'react';
import { Modal, Input, Spin } from 'antd';
import {
  SearchOutlined,
  FolderOutlined,
  FileTextOutlined,
  KeyOutlined,
  LockOutlined,
  PlusOutlined,
  UploadOutlined
} from '@ant-design/icons';
import { request } from '../services/api';
const icons = { files: <FolderOutlined />, notes: <FileTextOutlined />, secrets: <KeyOutlined /> };
export default function CommandPalette({ open, onClose, navigate, onLock }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef(null);
  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      setTimeout(() => input.current?.focus(), 60);
    }
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    const timer = setTimeout(
      () =>
        request(`/search?q=${encodeURIComponent(query)}`, { signal: controller.signal })
          .then(setResults)
          .catch((e) => {
            if (e.name !== 'AbortError') setError(e.message);
          })
          .finally(() => {
            if (!controller.signal.aborted) setLoading(false);
          }),
      180
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, query]);
  const action = async (module, event) => {
    await navigate(module);
    onClose();
    setTimeout(() => window.dispatchEvent(new Event(event)), 100);
  };
  const commands = [
    ...['files', 'notes', 'secrets'].map((module) => ({
      title: `前往 ${module[0].toUpperCase() + module.slice(1)}`,
      icon: icons[module],
      run: () => navigate(module)
    })),
    { title: '上传文件', icon: <UploadOutlined />, run: () => action('files', 'vault:upload') },
    { title: '新建笔记', icon: <PlusOutlined />, run: () => action('notes', 'vault:new') },
    { title: '添加密钥', icon: <KeyOutlined />, run: () => action('secrets', 'vault:new') },
    { title: '锁定 Vault', icon: <LockOutlined />, run: onLock }
  ].filter((c) => !query || c.title.toLowerCase().includes(query.toLowerCase()));
  const all = [
    ...commands,
    ...results.map((r) => ({
      title: r.title,
      icon: icons[r.module],
      subtitle: r.module,
      run: () => navigate(r.module, r.id)
    }))
  ];
  const run = (i) => {
    all[i]?.run();
    onClose();
  };
  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      closable={false}
      className="command-modal"
      width={620}
      destroyOnClose
    >
      <div className="command-input">
        <SearchOutlined />
        <Input
          ref={input}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          variant="borderless"
          placeholder="搜索文件、笔记、密钥，或输入命令…"
          aria-label="全局搜索"
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((n) => Math.min(all.length - 1, n + 1));
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((n) => Math.max(0, n - 1));
            }
            if (e.key === 'Enter') {
              e.preventDefault();
              run(active);
            }
          }}
        />
        <kbd>ESC</kbd>
      </div>
      <div className="command-results" role="listbox" aria-label="命令与搜索结果">
        {loading && <Spin size="small" />}
        {error && <p role="alert">{error}</p>}
        {all.map((r, i) => (
          <button
            key={`${r.title}-${i}`}
            role="option"
            aria-selected={i === active}
            className={i === active ? 'active' : ''}
            onMouseEnter={() => setActive(i)}
            onClick={() => run(i)}
          >
            {r.icon}
            <span>{r.title}</span>
            <small>{r.subtitle || '命令'}</small>
          </button>
        ))}
        {!loading && !all.length && <p className="muted">没有匹配结果</p>}
      </div>
      <div className="command-footer">
        <span>↑ ↓ 选择</span>
        <span>↵ 打开</span>
      </div>
    </Modal>
  );
}
