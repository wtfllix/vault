import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider, App as AntApp, theme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import App from './App';
import './styles/tokens.css';
import './styles/global.css';

function Root() {
  const [mode, setMode] = React.useState(localStorage.getItem('vault-theme') || 'dark');
  const [systemDark, setSystemDark] = React.useState(
    matchMedia('(prefers-color-scheme: dark)').matches
  );
  const dark = mode === 'system' ? systemDark : mode !== 'light';
  const designTheme = React.useMemo(
    () => ({
      algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
      token: {
        colorPrimary: dark ? '#818cf8' : '#4f46e5',
        colorBgBase: dark ? '#111318' : '#f6f7f9',
        colorBgContainer: dark ? '#1d2028' : '#fff',
        colorBgElevated: dark ? '#272b35' : '#fff',
        colorText: dark ? '#f2f3f7' : '#171b26',
        colorTextSecondary: dark ? '#9297a5' : '#535d70',
        colorSuccess: dark ? '#34d399' : '#047857',
        colorWarning: dark ? '#fbbf24' : '#92400e',
        colorError: dark ? '#fb7185' : '#be123c',
        colorBorder: dark ? '#30343e' : '#d6dae3',
        borderRadius: 8,
        fontSize: 13,
        controlHeight: 36,
        fontFamily:
          "Inter,-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif",
        motionDurationFast: '0.12s',
        motionDurationMid: '0.16s'
      },
      components: {
        Modal: { borderRadiusLG: 12 },
        Table: { headerBg: dark ? '#17191f' : '#eef0f4', cellPaddingBlockSM: 10 },
        Button: { primaryShadow: 'none' },
        Input: { activeShadow: 'none' }
      }
    }),
    [dark]
  );

  React.useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const listener = (event) => setSystemDark(event.matches);
    const change = () => setMode(localStorage.getItem('vault-theme') || 'dark');
    media.addEventListener('change', listener);
    window.addEventListener('vault:theme', change);
    return () => {
      media.removeEventListener('change', listener);
      window.removeEventListener('vault:theme', change);
    };
  }, []);
  React.useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    ConfigProvider.config({
      holderRender: (children) => (
        <ConfigProvider locale={zhCN} theme={designTheme}>
          {children}
        </ConfigProvider>
      )
    });
  }, [dark, designTheme]);

  return (
    <ConfigProvider locale={zhCN} theme={designTheme}>
      <AntApp>
        <App />
      </AntApp>
    </ConfigProvider>
  );
}
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
