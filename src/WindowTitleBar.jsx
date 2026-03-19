import React, { useEffect, useState } from 'react';
import { MinusOutlined, BorderOutlined, CloseOutlined } from '@ant-design/icons';
import { getCurrentWindow } from '@tauri-apps/api/window';

const isTauriRuntime = () => {
  return typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__;
};

const WindowTitleBar = () => {
  const [isMaximized, setIsMaximized] = useState(false);
  const tauriWindow = isTauriRuntime() ? getCurrentWindow() : null;

  const syncMaximized = async () => {
    if (!tauriWindow) {
      return;
    }
    try {
      setIsMaximized(await tauriWindow.isMaximized());
    } catch {
      setIsMaximized(false);
    }
  };

  useEffect(() => {
    if (!tauriWindow) {
      return undefined;
    }

    syncMaximized();
    let unlisten = null;

    tauriWindow.onResized(() => {
      syncMaximized();
    }).then((fn) => {
      unlisten = fn;
    }).catch(() => {});

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  if (!tauriWindow) {
    return null;
  }

  return (
    <header className="titlebar glass-panel">
      <div className="titlebar-drag" data-tauri-drag-region>
        <img src="/app-icon.png" alt="App Icon" className="titlebar-logo" />
        <span className="titlebar-title">API Key Vault</span>
      </div>
      <div className="titlebar-actions">
        <button
          type="button"
          className="titlebar-btn"
          onClick={() => tauriWindow.minimize()}
          aria-label="最小化"
        >
          <MinusOutlined />
        </button>
        <button
          type="button"
          className="titlebar-btn"
          onClick={() => tauriWindow.toggleMaximize()}
          aria-label={isMaximized ? '还原' : '最大化'}
        >
          <BorderOutlined />
        </button>
        <button
          type="button"
          className="titlebar-btn titlebar-btn-close"
          onClick={() => tauriWindow.close()}
          aria-label="关闭"
        >
          <CloseOutlined />
        </button>
      </div>
    </header>
  );
};

export default WindowTitleBar;
