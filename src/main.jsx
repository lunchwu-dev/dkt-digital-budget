import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider, App as AntApp } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import 'antd/dist/reset.css';
import App from './App.jsx';
import { StoreProvider } from './store.jsx';

dayjs.locale('zh-cn');

ReactDOM.createRoot(document.getElementById('root')).render(
  <ConfigProvider
    locale={zhCN}
    theme={{
      token: {
        colorPrimary: '#005BAA',
        colorInfo: '#005BAA',
        colorSuccess: '#2E7D32',
        colorWarning: '#C77700',
        colorError: '#C0392B',
        borderRadius: 8,
        fontSize: 14,
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif"
      },
      components: {
        Layout: { headerBg: '#FFFFFF', headerHeight: 64, headerPadding: '0 24px' },
        Table: { headerBg: '#F5F7FA', headerColor: '#1F2937' },
        Card: { paddingLG: 20 }
      }
    }}
  >
    <AntApp>
      <StoreProvider>
        <App />
      </StoreProvider>
    </AntApp>
  </ConfigProvider>
);
