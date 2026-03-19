import React, { useEffect, useMemo, useState } from 'react';
import { Card, Form, Input, Button, message, Radio, Typography, Space, Tag, Divider } from 'antd';
import {
  LockOutlined,
  DatabaseOutlined,
  SyncOutlined,
  HistoryOutlined,
  FolderOpenOutlined,
  DeleteOutlined,
  RocketOutlined
} from '@ant-design/icons';
import { invoke } from '@tauri-apps/api/core';

const { Title, Paragraph, Text } = Typography;
const HISTORY_KEY = 'db_connection_history_v1';
const ONBOARD_KEY = 'db_connection_onboarded_v1';
const MAX_HISTORY = 8;

const Login = ({ onLogin }) => {
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState('open');
  const [history, setHistory] = useState([]);
  const [source, setSource] = useState('local');
  const [showWizard, setShowWizard] = useState(true);
  const [form] = Form.useForm();

  useEffect(() => {
    form.setFieldsValue({ dbPath: 'apikey-vault.db' });
    try {
      const saved = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
      const nextHistory = Array.isArray(saved) ? saved : [];
      const onboarded = localStorage.getItem(ONBOARD_KEY) === '1';
      setHistory(nextHistory);
      setShowWizard(!(onboarded && nextHistory.length > 0));
    } catch {
      setHistory([]);
      setShowWizard(true);
    }
  }, []);

  const historyCount = useMemo(() => history.length, [history]);
  const lastEntry = history[0] || null;

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
    localStorage.setItem(ONBOARD_KEY, '1');
  };

  const fillQuickPath = (nextPath, nextSource, nextMode = 'open') => {
    form.setFieldsValue({ dbPath: nextPath });
    setMode(nextMode);
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
      setShowWizard(false);
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
            <Title className="login-title">{showWizard ? '首次连接向导' : '快速连接入口'}</Title>
            <Paragraph className="login-subtitle">
              {showWizard
                ? '按照向导完成来源与路径设置，首次连接后将自动保存入口。'
                : '已为你准备上次入口。也可以随时进入向导创建新的连接入口。'}
            </Paragraph>
          </div>

          {showWizard ? (
            <div className="wizard-panel">
              <div className="wizard-step">
                <Text strong>步骤 1：选择存储来源</Text>
                <Space wrap style={{ marginTop: 8 }}>
                  <Button onClick={() => fillQuickPath('apikey-vault.db', 'local')} icon={<FolderOpenOutlined />}>
                    本地文件
                  </Button>
                  <Button onClick={() => fillQuickPath('D:/vault-sync/apikey-vault.db', 'syncthing')} icon={<SyncOutlined />}>
                    Syncthing 目录
                  </Button>
                </Space>
              </div>
              <div className="wizard-step">
                <Text strong>步骤 2：选择打开或创建</Text>
                <Space wrap style={{ marginTop: 8 }}>
                  <Button onClick={() => setMode('open')}>打开已有库</Button>
                  <Button onClick={() => setMode('create')}>创建新库</Button>
                </Space>
              </div>
              <div className="wizard-step">
                <Text strong>步骤 3：在右侧输入主密码并连接</Text>
                <br />
                <Text type="secondary">连接成功后，下次将自动显示“上次入口 + 新建入口向导”。</Text>
              </div>
            </div>
          ) : (
            <div className="quick-panel">
              {lastEntry ? (
                <div className="quick-card">
                  <Text strong>上次入口</Text>
                  <div className="quick-path">{lastEntry.path}</div>
                  <Space wrap style={{ marginTop: 8 }}>
                    <Tag color={lastEntry.source === 'syncthing' ? 'blue' : 'green'}>
                      {lastEntry.source === 'syncthing' ? 'Syncthing' : '本地'}
                    </Tag>
                    <Tag>{lastEntry.mode === 'create' ? '创建' : '打开'}</Tag>
                  </Space>
                  <div style={{ marginTop: 10 }}>
                    <Button
                      type="primary"
                      onClick={() => fillQuickPath(lastEntry.path, lastEntry.source || 'local', lastEntry.mode || 'open')}
                    >
                      使用上次入口
                    </Button>
                  </div>
                </div>
              ) : (
                <Text type="secondary">暂无上次入口，请先通过右侧表单完成一次连接。</Text>
              )}

              <div className="quick-card">
                <Text strong>新建入口向导</Text>
                <br />
                <Text type="secondary">用于切换到新的本地路径或 Syncthing 路径。</Text>
                <div style={{ marginTop: 10 }}>
                  <Button icon={<RocketOutlined />} onClick={() => setShowWizard(true)}>
                    打开向导
                  </Button>
                </div>
              </div>
            </div>
          )}

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
                    onClick={() => fillQuickPath(item.path, item.source || 'local', item.mode || 'open')}
                  >
                    <span className="history-path">{item.path}</span>
                    <span className="history-meta">
                      <Tag color={item.source === 'syncthing' ? 'blue' : 'green'}>
                        {item.source === 'syncthing' ? 'Syncthing' : '本地'}
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
                <Radio.Button value="syncthing">Syncthing</Radio.Button>
              </Radio.Group>
            </Space>

            <Form form={form} onFinish={handleSubmit} layout="vertical" requiredMark={false}>
              <Form.Item
                name="dbPath"
                label={source === 'syncthing' ? 'Syncthing 数据库路径' : '数据库路径'}
                tooltip={source === 'syncthing' ? '请确保该路径位于 Syncthing 同步目录' : '建议使用绝对路径，避免误开新库'}
                rules={[{ required: true, message: '请输入数据库路径' }]}
              >
                <Input
                  prefix={source === 'syncthing' ? <SyncOutlined /> : <DatabaseOutlined />}
                  placeholder={source === 'syncthing' ? '例如 D:/vault-sync/apikey-vault.db' : '例如 C:/secure/apikey-vault.db'}
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
