import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { Button, Input, Modal, Form, message } from 'antd';
import {
  FolderOutlined,
  FileTextOutlined,
  KeyOutlined,
  StarOutlined,
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
const SettingsPage = lazy(() => import('./SettingsPage'));
const CommandPalette = lazy(() => import('../components/CommandPalette'));
import { request, mutate } from '../services/api';
import { formatBytes } from '../components/Common';
const navigation = [
  { id: 'files', label: 'Files', icon: <FolderOutlined />, caption: '私人文件' },
  { id: 'notes', label: 'Notes', icon: <FileTextOutlined />, caption: '想法与代码' },
  { id: 'secrets', label: 'Secrets', icon: <KeyOutlined />, caption: '加密保险箱' },
  { id: 'favorites', label: 'Favorites', icon: <StarOutlined /> },
  { id: 'trash', label: 'Trash', icon: <DeleteOutlined /> },
  { id: 'settings', label: 'Settings', icon: <SettingOutlined /> }
];
const route = () => {
  const [module, id] = location.hash.replace(/^#\/?/, '').split('/');
  return {
    module: navigation.some((n) => n.id === module)
      ? module
      : navigation.some((n) => n.id === localStorage.getItem('vault-last-module'))
        ? localStorage.getItem('vault-last-module')
        : 'files',
    id
  };
};
export default function AppShell({ onLock }) {
  const [current, setCurrent] = useState(route);
  const [query, setQuery] = useState('');
  const [palette, setPalette] = useState(false);
  const [sidebar, setSidebar] = useState(false);
  const [storage, setStorage] = useState(null);
  const [reauth, setReauth] = useState(null);
  const [reauthBusy, setReauthBusy] = useState(false);
  const [reauthError, setReauthError] = useState('');
  const [reauthForm] = Form.useForm();
  const reauthRef = useRef(null);
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
    localStorage.setItem('vault-last-module', module);
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
    const needAuth = (event) => {
      reauthRef.current = event.detail;
      setReauth(event.detail);
      setReauthError('');
      reauthForm.resetFields();
    };
    window.addEventListener('hashchange', change);
    window.addEventListener('vault:reauth', needAuth);
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
      window.removeEventListener('vault:reauth', needAuth);
      window.removeEventListener('vault:storage', refreshStorage);
      reauthRef.current?.reject(new Error('验证已取消'));
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
        <button className="brand" onClick={() => navigate('files')}>
          <span className="vault-mark">V</span>
          <span>Vault</span>
          <span className="version">2.0</span>
        </button>
        <button className="sidebar-search" onClick={() => setPalette(true)}>
          <SearchOutlined />
          <span>搜索与命令</span>
          <kbd>⌘ K</kbd>
        </button>
        <div className="nav-label">WORKSPACE</div>
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
            <span className="avatar">L</span>
            <span>
              Personal space<small>只有你，恰到好处。</small>
            </span>
            <LockOutlined />
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
            <span className="topbar-workspace">私人空间</span>
            <span className="path-separator">/</span>
            <span>
              {item.icon} {item.label}
            </span>
          </div>
          <div className="topbar-right">
            <span className="private-badge">
              <span /> Private
            </span>
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
                  <div className="eyebrow">YOUR PERSONAL WORKSPACE</div>
                  <h1>
                    {item.label}
                    <span>{item.caption}</span>
                  </h1>
                </div>
                <Input
                  className="module-search"
                  allowClear
                  prefix={<SearchOutlined />}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={`搜索${item.caption}`}
                  aria-label={`搜索 ${item.label}`}
                />
              </div>
            )}
            {current.module === 'files' && <FilesPage query={query} focusId={current.id} />}
            {current.module === 'notes' && <NotesPage query={query} focusId={current.id} />}
            {current.module === 'secrets' && <SecretsPage query={query} focusId={current.id} />}
            {['favorites', 'trash'].includes(current.module) && (
              <CollectionsPage mode={current.module} navigate={navigate} />
            )}
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
      <Modal
        title="验证主密码"
        open={Boolean(reauth)}
        okText="验证"
        cancelText="取消"
        confirmLoading={reauthBusy}
        onOk={() => reauthForm.submit()}
        onCancel={() => {
          reauthRef.current?.reject(new Error('验证已取消'));
          reauthRef.current = null;
          setReauth(null);
        }}
        destroyOnClose
      >
        <p className="muted">为了保护敏感内容，请重新确认身份。</p>
        {reauthError && (
          <p role="alert" className="error-text">
            {reauthError}
          </p>
        )}
        <Form
          form={reauthForm}
          onFinish={async (values) => {
            if (reauthBusy) return;
            setReauthBusy(true);
            try {
              await mutate('/auth/reauth', values);
              reauthRef.current?.resolve();
              reauthRef.current = null;
              setReauth(null);
            } catch (e) {
              setReauthError(e.message);
            } finally {
              setReauthBusy(false);
            }
          }}
        >
          <Form.Item name="password" rules={[{ required: true }]}>
            <Input.Password autoFocus autoComplete="current-password" placeholder="主密码" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
