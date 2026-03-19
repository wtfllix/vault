import React, { useEffect, useMemo, useState } from 'react';
import { Form, Input, Button, message, Radio, Typography, Space, Tag, Empty } from 'antd';
import {
  LockOutlined,
  DatabaseOutlined,
  SyncOutlined,
  FolderOpenOutlined,
  CompassOutlined
} from '@ant-design/icons';
import { invoke } from '@tauri-apps/api/core';

const { Title, Paragraph, Text } = Typography;
const RECORDS_KEY = 'db_connection_records_v2';
const ONBOARD_KEY = 'db_connection_onboarded_v2';
const MAX_RECORDS = 8;
const ACCESS_CHOICES = [
  { key: 'create-local', label: '创建本地数据库' },
  { key: 'import-local', label: '导入本地数据库' },
  { key: 'import-syncthing', label: '导入 Syncthing 数据库' }
];

const defaultRecord = {
  source: 'local',
  mode: 'open',
  dbPath: 'apikey-vault.db',
  syncPath: 'D:/vault-sync/apikey-vault.db'
};

const Login = ({ onLogin }) => {
  const [loading, setLoading] = useState(false);
  const [records, setRecords] = useState([]);
  const [isFirstLaunch, setIsFirstLaunch] = useState(true);
  const [wizardChoice, setWizardChoice] = useState('create-local');
  const [source, setSource] = useState('local');
  const [mode, setMode] = useState('create');
  const [form] = Form.useForm();

  useEffect(() => {
    form.setFieldsValue(defaultRecord);
    try {
      const saved = JSON.parse(localStorage.getItem(RECORDS_KEY) || '[]');
      const nextRecords = Array.isArray(saved) ? saved : [];
      const onboarded = localStorage.getItem(ONBOARD_KEY) === '1';
      setRecords(nextRecords);
      setIsFirstLaunch(!(onboarded && nextRecords.length > 0));
      if (!onboarded || nextRecords.length === 0) {
        setMode('create');
        setSource('local');
        setWizardChoice('create-local');
      } else {
        setMode('open');
        setWizardChoice('import-local');
      }
    } catch {
      setRecords([]);
      setIsFirstLaunch(true);
    }
  }, []);

  const circleRecords = useMemo(() => records.slice(0, 6), [records]);

  const saveRecord = (payload) => {
    const normalized = {
      source: payload.source,
      mode: payload.mode,
      dbPath: payload.dbPath,
      syncPath: payload.syncPath,
      lastUsedAt: new Date().toISOString()
    };
    const next = [normalized, ...records.filter((r) => r.dbPath !== payload.dbPath)].slice(0, MAX_RECORDS);
    setRecords(next);
    localStorage.setItem(RECORDS_KEY, JSON.stringify(next));
    localStorage.setItem(ONBOARD_KEY, '1');
  };

  const applyRecord = (record) => {
    setSource(record.source || 'local');
    setMode(record.mode || 'open');
    setWizardChoice(
      (record.mode || 'open') === 'create'
        ? 'create-local'
        : (record.source === 'syncthing' ? 'import-syncthing' : 'import-local')
    );
    form.setFieldsValue({
      dbPath: record.dbPath || '',
      syncPath: record.syncPath || ''
    });
  };

  const applyWizardChoice = (choice) => {
    setWizardChoice(choice);
    if (choice === 'create-local') {
      setMode('create');
      setSource('local');
      form.setFieldsValue({
        dbPath: 'apikey-vault.db',
        syncPath: 'D:/vault-sync/apikey-vault.db'
      });
    } else if (choice === 'import-local') {
      setSource('local');
      setMode('open');
      form.setFieldsValue({
        dbPath: 'D:/secure/apikey-vault.db',
        syncPath: 'D:/vault-sync/apikey-vault.db'
      });
    } else {
      setSource('syncthing');
      setMode('open');
      form.setFieldsValue({
        dbPath: 'D:/vault-sync/apikey-vault.db',
        syncPath: 'D:/vault-sync/apikey-vault.db'
      });
    }
  };

  const handleSubmit = async (values) => {
    setLoading(true);
    try {
      const dbPath = values.dbPath?.trim();
      const syncPath = values.syncPath?.trim();

      if (!dbPath || !syncPath) {
        message.error('请填写数据库路径和 Syncthing 同步路径');
        return;
      }

      if (mode === 'open') {
        const exists = await invoke('db_exists', { path: dbPath });
        if (!exists) {
          message.error('数据库不存在，请确认路径或切换创建模式。');
          return;
        }
      }

      await invoke('init_db', { password: values.password, path: dbPath });

      const session = {
        dbPath,
        syncPath,
        source,
        mode
      };
      saveRecord(session);
      setIsFirstLaunch(false);
      message.success(mode === 'create' ? '数据库创建成功' : '数据库已导入');
      onLogin(session);
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
          {isFirstLaunch ? (
            <>
              <div>
                <Title className="login-title">首次启动向导</Title>
                <Paragraph className="login-subtitle">
                  先确定数据库来源：本地创建，或导入现有数据库（本地 / Syncthing）。
                </Paragraph>
              </div>
              <Radio.Group
                value={wizardChoice}
                onChange={(e) => applyWizardChoice(e.target.value)}
                className="choice-tags"
              >
                {ACCESS_CHOICES.map((item) => (
                  <Radio.Button key={item.key} value={item.key}>{item.label}</Radio.Button>
                ))}
              </Radio.Group>
              <div className="wizard-note">
                <Tag color={mode === 'create' ? 'green' : 'blue'}>
                  {mode === 'create' ? '当前: 创建流程' : '当前: 导入流程'}
                </Tag>
                <Text type="secondary">已自动填入路径模板，可直接修改。</Text>
              </div>
            </>
          ) : (
            <>
              <div>
                <Title className="login-title">选择已存在的数据库入口</Title>
                <Paragraph className="login-subtitle">
                  点击圆形入口快速回填路径，像常规登录页一样先选用户再输入密码。
                </Paragraph>
              </div>
              {circleRecords.length === 0 ? (
                <Empty description="暂无可用记录，点击下方新建向导创建入口" />
              ) : (
                <div className="record-circle-wrap">
                  <div className="record-circle">
                    <div className="record-center">
                      <CompassOutlined />
                      <span>入口</span>
                    </div>
                    {circleRecords.map((record, idx) => {
                      const count = circleRecords.length;
                      const angle = (Math.PI * 2 * idx) / count - Math.PI / 2;
                      const radius = count === 1 ? 0 : 118;
                      const x = Math.cos(angle) * radius;
                      const y = Math.sin(angle) * radius;
                      const label = record.dbPath.split(/[\\/]/).pop() || record.dbPath;
                      return (
                        <button
                          key={`${record.dbPath}-${idx}`}
                          type="button"
                          className="record-node"
                          style={{ transform: `translate(${x}px, ${y}px)` }}
                          onClick={() => applyRecord(record)}
                          title={record.dbPath}
                        >
                          <span className="record-node-label">{label.slice(0, 16)}</span>
                          <span className="record-node-tag">{record.source === 'syncthing' ? 'Syncthing' : '本地'}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <Button onClick={() => setIsFirstLaunch(true)}>
                新建入口向导
              </Button>
            </>
          )}
          <div className="login-form-block">
            <Title level={4} style={{ margin: 0 }}>
              数据库连接
            </Title>
            <Text type="secondary">根据上方向导或入口选择，填写路径与密码后连接。</Text>

            <Space wrap style={{ width: '100%', justifyContent: 'space-between', marginTop: 10 }}>
              <Radio.Group
                value={wizardChoice}
                onChange={(e) => applyWizardChoice(e.target.value)}
                className="choice-tags"
              >
                {ACCESS_CHOICES.map((item) => (
                  <Radio.Button key={item.key} value={item.key}>{item.label}</Radio.Button>
                ))}
              </Radio.Group>
            </Space>

            <Form form={form} onFinish={handleSubmit} layout="vertical" requiredMark={false} style={{ marginTop: 12 }}>
              <Form.Item
                name="dbPath"
                label={source === 'syncthing' ? '数据库路径（Syncthing）' : '数据库路径（本地）'}
                rules={[{ required: true, message: '请输入数据库路径' }]}
              >
                <Input
                  prefix={source === 'syncthing' ? <SyncOutlined /> : <FolderOpenOutlined />}
                  placeholder={source === 'syncthing' ? '例如 D:/vault-sync/apikey-vault.db' : '例如 D:/secure/apikey-vault.db'}
                />
              </Form.Item>

              <Form.Item
                name="syncPath"
                label="Syncthing 同步目标路径"
                tooltip="每次退出应用会自动把当前数据库同步到该路径"
                rules={[{ required: true, message: '请输入同步路径' }]}
              >
                <Input prefix={<DatabaseOutlined />} placeholder="例如 D:/vault-sync/apikey-vault.db" />
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

              <Form.Item style={{ marginBottom: 0 }}>
                <Button type="primary" htmlType="submit" loading={loading} block size="large">
                  {mode === 'create' ? '创建并进入' : '导入并进入'}
                </Button>
              </Form.Item>
            </Form>
          </div>
        </section>
      </div>
    </div>
  );
};

export default Login;
