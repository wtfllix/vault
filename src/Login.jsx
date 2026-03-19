import React, { useEffect, useMemo, useState } from 'react';
import { Card, Form, Input, Button, message, Radio, Typography, Space, Tag, Divider } from 'antd';
import {
  LockOutlined,
  DatabaseOutlined,
  LinkOutlined,
  HistoryOutlined,
  FolderOpenOutlined,
  DeleteOutlined
} from '@ant-design/icons';
import { invoke } from '@tauri-apps/api/core';

const { Title, Paragraph, Text } = Typography;
const HISTORY_KEY = 'db_connection_history_v1';
const MAX_HISTORY = 8;

const Login = ({ onLogin }) => {
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState('open');
  const [history, setHistory] = useState([]);
  const [source, setSource] = useState('local');
  const [form] = Form.useForm();

  useEffect(() => {
    form.setFieldsValue({ dbPath: 'apikey-vault.db' });
    try {
      const saved = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
      if (Array.isArray(saved)) {
        setHistory(saved);
      }
    } catch {
      setHistory([]);
    }
  }, []);

  const historyCount = useMemo(() => history.length, [history]);

  const saveHistory = (path, usedMode, usedSource) => {
    const item = {
      path,
      mode: usedMode,
      source: usedSource,
      lastUsedAt: new Date().toISOString()
    };
    const next = [item, ...history.filter((h) => h.path !== path)].slice(0, MAX_HISTORY);
    setHistory(next);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  };

  const fillQuickPath = (nextPath, nextSource) => {
    form.setFieldValue('dbPath', nextPath);
    setMode('open');
    setSource(nextSource);
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem(HISTORY_KEY);
    message.success('连接历史已清空');
  };

  const handleSubmit = async (values) => {
    setLoading(true);
    try {
      const path = values.dbPath || 'apikey-vault.db';

      if (mode === 'open') {
        const exists = await invoke('db_exists', { path });
        if (!exists) {
          message.error('数据库不存在。请先确认路径，或切换创建模式初始化。');
          return;
        }
      }

      await invoke('init_db', {
        password: values.password,
        path
      });

      saveHistory(path, mode, source);
      message.success(mode === 'create' ? '保险箱创建成功' : '保险箱已解锁');
      onLogin(path);
    } catch (error) {
      message.error(`密码错误或操作失败: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-shell page-enter">
      <div className="login-layout">
        <section className="glass-panel login-hero">
          <div>
            <Title className="login-title">数据库连接中心</Title>
            <Paragraph className="login-subtitle">
              在进入保险箱前，先选择数据库入口。支持本地文件和已挂载网络路径，并保存最近连接记录。
            </Paragraph>
          </div>

          <div className="entry-stack">
            <div className="entry-card">
              <Space align="start">
                <FolderOpenOutlined />
                <div>
                  <Text strong>本地数据库入口</Text>
                  <br />
                  <Text type="secondary">示例：`D:/secure/apikey-vault.db` 或 `./apikey-vault.db`</Text>
                  <br />
                  <Button type="link" className="entry-link-btn" onClick={() => fillQuickPath('apikey-vault.db', 'local')}>
                    使用默认本地路径
                  </Button>
                </div>
              </Space>
            </div>

            <div className="entry-card">
              <Space align="start">
                <LinkOutlined />
                <div>
                  <Text strong>网络挂载入口</Text>
                  <br />
                  <Text type="secondary">示例：`\\\\NAS\\vault\\apikey-vault.db`（先在系统中挂载共享目录）</Text>
                  <br />
                  <Button
                    type="link"
                    className="entry-link-btn"
                    onClick={() => fillQuickPath('\\\\NAS\\vault\\apikey-vault.db', 'network')}
                  >
                    填入网络路径模板
                  </Button>
                </div>
              </Space>
            </div>
          </div>

          <Divider style={{ margin: '10px 0 12px' }} />

          <div className="history-block">
            <div className="history-head">
              <Space>
                <HistoryOutlined />
                <Text strong>最近连接 ({historyCount})</Text>
              </Space>
              <Button type="link" icon={<DeleteOutlined />} onClick={clearHistory} disabled={historyCount === 0}>
                清空历史
              </Button>
            </div>

            {historyCount === 0 ? (
              <Text type="secondary">暂无历史记录。成功连接后会自动保存。</Text>
            ) : (
              <div className="history-list">
                {history.map((item) => (
                  <button
                    type="button"
                    key={item.path}
                    className="history-item"
                    onClick={() => fillQuickPath(item.path, item.source || 'local')}
                  >
                    <span className="history-path">{item.path}</span>
                    <span className="history-meta">
                      <Tag color={item.source === 'network' ? 'gold' : 'green'}>
                        {item.source === 'network' ? '网络' : '本地'}
                      </Tag>
                      <Tag>{item.mode === 'create' ? '创建' : '打开'}</Tag>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        <Card className="glass-panel login-card" bordered={false}>
          <Space direction="vertical" size={14} style={{ width: '100%' }}>
            <div>
              <Title level={4} style={{ margin: 0 }}>
                {mode === 'create' ? '创建新保险箱' : '打开已有保险箱'}
              </Title>
              <Text type="secondary">输入数据库路径与主密码，然后连接。</Text>
            </div>

            <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
              <Radio.Group value={mode} onChange={(e) => setMode(e.target.value)} buttonStyle="solid">
                <Radio.Button value="open">打开</Radio.Button>
                <Radio.Button value="create">创建</Radio.Button>
              </Radio.Group>
              <Radio.Group value={source} onChange={(e) => setSource(e.target.value)} buttonStyle="solid">
                <Radio.Button value="local">本地</Radio.Button>
                <Radio.Button value="network">网络挂载</Radio.Button>
              </Radio.Group>
            </Space>

            <Form form={form} onFinish={handleSubmit} layout="vertical" requiredMark={false}>
              <Form.Item
                name="dbPath"
                label={source === 'network' ? '网络数据库路径' : '数据库路径'}
                tooltip={source === 'network' ? '请确保共享目录已挂载并可访问' : '建议使用绝对路径，避免误开新库'}
                rules={[{ required: true, message: '请输入数据库路径' }]}
              >
                <Input
                  prefix={source === 'network' ? <LinkOutlined /> : <DatabaseOutlined />}
                  placeholder={source === 'network' ? '\\\\NAS\\vault\\apikey-vault.db' : '例如 C:/secure/apikey-vault.db'}
                />
              </Form.Item>

              <Form.Item
                name="password"
                label="主密码"
                rules={[
                  { required: true, message: '请输入主密码' },
                  { min: 8, message: '建议至少 8 位字符' }
                ]}
              >
                <Input.Password prefix={<LockOutlined />} placeholder="用于加密数据库" />
              </Form.Item>

              {mode === 'create' && (
                <Form.Item
                  name="confirmPassword"
                  label="确认密码"
                  dependencies={['password']}
                  rules={[
                    { required: true, message: '请再次输入主密码' },
                    ({ getFieldValue }) => ({
                      validator(_, value) {
                        if (!value || getFieldValue('password') === value) {
                          return Promise.resolve();
                        }
                        return Promise.reject(new Error('两次密码输入不一致'));
                      }
                    })
                  ]}
                >
                  <Input.Password placeholder="再次输入主密码" />
                </Form.Item>
              )}

              <Form.Item style={{ marginBottom: 8 }}>
                <Button type="primary" htmlType="submit" loading={loading} block size="large">
                  {mode === 'create' ? '创建并进入' : '连接并进入'}
                </Button>
              </Form.Item>
            </Form>

            <Text type="secondary" style={{ fontSize: 12 }}>
              连接成功后路径会自动加入历史。忘记主密码将无法恢复数据库内容。
            </Text>
          </Space>
        </Card>
      </div>
    </div>
  );
};

export default Login;
