import React, { Suspense, lazy, useEffect, useState } from 'react';
import { Button, Input, message } from 'antd';
import {
  FolderOutlined,
  FileTextOutlined,
  KeyOutlined,
  HistoryOutlined,
  DeleteOutlined,
  SettingOutlined,
  SearchOutlined,
  LockOutlined,
  MenuOutlined,
  ThunderboltOutlined
} from '@ant-design/icons';
const FilesPage = lazy(() => import('../features/files/FilesPage'));
const NotesPage = lazy(() => import('../features/notes/NotesPage'));
const SecretsPage = lazy(() => import('../features/secrets/SecretsPage'));
const CollectionsPage = lazy(() => import('./CollectionsPage'));
const RecentPage = lazy(() => import('./RecentPage'));
const SettingsPage = lazy(() => import('./SettingsPage'));
const CommandPalette = lazy(() => import('../components/CommandPalette'));
import { request, mutate } from '../services/api';
import { formatBytes } from '../components/Common';
const navigation = [
  { id: 'files', label: 'Files', icon: <FolderOutlined />, searchLabel: '文件' },
  { id: 'notes', label: 'Notes', icon: <FileTextOutlined />, searchLabel: '笔记' },
  { id: 'secrets', label: 'Secrets', icon: <KeyOutlined />, searchLabel: '密钥' },
  { id: 'recent', label: 'Recent', icon: <HistoryOutlined /> },
  { id: 'trash', label: 'Trash', icon: <DeleteOutlined /> },
  { id: 'settings', label: 'Settings', icon: <SettingOutlined /> }
];
const route = () => {
  const [rawModule, id] = location.hash.replace(/^#\/?/, '').split('/');
  const module = rawModule === 'favorites' ? 'recent' : rawModule;
  return {
    module: navigation.some((n) => n.id === module) ? module : 'recent',
    id
  };
};
export default function AppShell({ onLock }) {
  const [current, setCurrent] = useState(route);
  const [query, setQuery] = useState('');
  const [palette, setPalette] = useState(false);
  const [sidebar, setSidebar] = useState(false);
  const [storage, setStorage] = useState(null);
  const navigate = async (module, id = '') => {
    const waits = [];
    window.dispatchEvent(new CustomEvent('vault:beforeNavigate', { detail: { waits } }));
    const results = await Promise.all(waits);
    if (results.includes(false) && !window.confirm('保存未完成，已保留加密草稿。仍要离开吗？'))
      return;
    location.hash = `/${module}${id ? `/${id}` : ''}`;
    setCurrent({ module, id });
    setQuery('');
    setSidebar(false);
    setPalette(false);
  };
  const lock = async () => {
    const waits = [];
    window.dispatchEvent(new CustomEvent('vault:beforeNavigate', { detail: { waits } }));
    const saved = await Promise.all(waits);
    try {
      await mutate('/auth/logout');
      onLock(saved.includes(false));
    } catch (e) {
      message.error(`锁定未完成：${e.message}`);
    }
  };
  const refreshStorage = () =>
    request('/storage')
      .then(setStorage)
      .catch(() => {});
  useEffect(() => {
    const change = () => {
      setCurrent(route());
      setQuery('');
    };
    window.addEventListener('hashchange', change);
    window.addEventListener('vault:storage', refreshStorage);
    refreshStorage();
    const timer = setInterval(
      () =>
        request('/auth/session').catch((e) => {
          if (e.status === 401) onLock(true);
        }),
      60000
    );
    return () => {
      clearInterval(timer);
      window.removeEventListener('hashchange', change);
      window.removeEventListener('vault:storage', refreshStorage);
    };
  }, []);
  useEffect(() => {
    const keydown = (event) => {
      if (event.defaultPrevented) return;
      const cmd = event.ctrlKey || event.metaKey;
      const editing = event.target.closest('input,textarea,[contenteditable=true]');
      if (cmd && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPalette((v) => !v);
      } else if (cmd && event.key.toLowerCase() === 's' && current.module === 'notes') {
        event.preventDefault();
        window.dispatchEvent(new Event('vault:save'));
      } else if (cmd && !editing && ['u', 'n'].includes(event.key.toLowerCase())) {
        event.preventDefault();
        if (event.key.toLowerCase() === 'u') {
          if (current.module !== 'files')
            navigate('files').then(() =>
              setTimeout(() => window.dispatchEvent(new Event('vault:upload')), 100)
            );
          else window.dispatchEvent(new Event('vault:upload'));
        } else window.dispatchEvent(new Event('vault:new'));
      }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [current.module]);
  const item = navigation.find((n) => n.id === current.module) || navigation[0];
  const progress = storage
    ? Math.min(100, (storage.used / Math.max(1, Math.min(storage.quota, storage.total))) * 100)
    : 0;
  return (
    <div className="app-layout">
      {sidebar && (
        <button
          className="sidebar-backdrop"
          aria-label="关闭导航"
          onClick={() => setSidebar(false)}
        />
      )}
      <aside className={`sidebar ${sidebar ? 'is-open' : ''}`}>
        <button className="brand" onClick={() => navigate('recent')}>
          <span className="vault-mark">V</span>
          <span>Vault</span>
          <span className="version">2.0</span>
        </button>
        <button className="sidebar-search" onClick={() => setPalette(true)}>
          <SearchOutlined />
          <span>搜索与命令</span>
          <kbd>⌘ K</kbd>
        </button>
        <nav aria-label="主导航">
          {navigation.map((n, i) => (
            <React.Fragment key={n.id}>
              {i === 3 && <div className="nav-divider" />}
              <button
                aria-label={n.label}
                className={`nav-item ${current.module === n.id ? 'is-active' : ''}`}
                onClick={() => navigate(n.id)}
                aria-current={current.module === n.id ? 'page' : undefined}
              >
                {n.icon}
                <span>{n.label}</span>
                {n.id === 'secrets' && (
                  <span className="nav-private">
                    <LockOutlined />
                  </span>
                )}
              </button>
            </React.Fragment>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="storage-heading">
            <span>本地存储</span>
            <span>{storage ? formatBytes(storage.used) : '—'}</span>
          </div>
          <div className="storage-track">
            <div style={{ width: `${progress}%` }} />
          </div>
          <small>
            {storage
              ? `磁盘可用 ${formatBytes(storage.available)} · 配额 ${formatBytes(storage.quota)}`
              : '正在读取磁盘空间'}
          </small>
          <button className="owner-button" onClick={lock}>
            <LockOutlined />
            <span>锁定 Vault</span>
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-path">
            <Button
              className="menu-toggle"
              type="text"
              icon={<MenuOutlined />}
              aria-label="打开导航"
              onClick={() => setSidebar((v) => !v)}
            />
            <span className="topbar-workspace">Vault</span>
            <span className="path-separator">/</span>
            <span>
              {item.icon} {item.label}
            </span>
          </div>
          <div className="topbar-right">
            <Button
              type="text"
              icon={<ThunderboltOutlined />}
              aria-label="命令面板"
              onClick={() => setPalette(true)}
            />
          </div>
        </header>
        <main className={`workspace workspace-${current.module}`}>
          <Suspense fallback={<div className="boot-module">正在打开…</div>}>
            {['files', 'notes', 'secrets'].includes(current.module) && (
              <div className="workspace-heading">
                <div>
                  <h1>{item.label}</h1>
                </div>
                <Input
                  className="module-search"
                  allowClear
                  prefix={<SearchOutlined />}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={`搜索${item.searchLabel}`}
                  aria-label={`搜索 ${item.label}`}
                />
              </div>
            )}
            {current.module === 'files' && <FilesPage query={query} focusId={current.id} />}
            {current.module === 'notes' && <NotesPage query={query} focusId={current.id} />}
            {current.module === 'secrets' && <SecretsPage query={query} focusId={current.id} />}
            {current.module === 'recent' && <RecentPage navigate={navigate} />}
            {current.module === 'trash' && <CollectionsPage />}
            {current.module === 'settings' && <SettingsPage onLock={onLock} />}
          </Suspense>
        </main>
      </div>
      <nav className="mobile-tabbar" aria-label="移动端导航">
        {navigation.slice(0, 3).map((n) => (
          <button
            key={n.id}
            aria-label={n.label}
            className={current.module === n.id ? 'active' : ''}
            onClick={() => navigate(n.id)}
          >
            {n.icon}
            <span>{n.label}</span>
          </button>
        ))}
      </nav>
      <Suspense fallback={null}>
        {palette && (
          <CommandPalette
            open={palette}
            onClose={() => setPalette(false)}
            navigate={navigate}
            onLock={lock}
          />
        )}
      </Suspense>
    </div>
  );
}
