import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider, App as AntdApp } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import App from './App';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#275d46',
          colorInfo: '#275d46',
          colorSuccess: '#275d46',
          colorWarning: '#cf7f00',
          colorError: '#b42318',
          borderRadius: 10,
          fontFamily: "'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif"
        },
        components: {
          Card: {
            borderRadiusLG: 16
          },
          Modal: {
            borderRadiusLG: 16
          },
          Table: {
            headerBg: '#f3f7f4',
            borderColor: '#d9e3dc'
          }
        }
      }}
    >
      <AntdApp>
        <App />
      </AntdApp>
    </ConfigProvider>
  </React.StrictMode>
);
