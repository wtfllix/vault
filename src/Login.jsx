import React, { useEffect, useMemo, useState } from 'react';
import { Card, Form, Input, Button, message, Radio, Typography, Space, Tag, Empty } from 'antd';
import {
  LockOutlined,
  DatabaseOutlined,
  SyncOutlined,
  FolderOpenOutlined,
  PlusOutlined,
  ImportOutlined,
  CompassOutlined
} from '@ant-design/icons';
import { invoke } from '@tauri-apps/api/core';

const { Title, Paragraph, Text } = Typography;
const RECORDS_KEY = 'db_connection_records_v2';
const ONBOARD_KEY = 'db_connection_onboarded_v2';
const MAX_RECORDS = 8;

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
  const [wizardStep, setWizardStep] = useState('create');
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
        setWizardStep('create');
      } else {
        setMode('open');
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
    form.setFieldsValue({
      dbPath: record.dbPath || '',
      syncPath: record.syncPath || ''
    });
  };

  const applyWizardChoice = (choice) => {
    if (choice === 'create') {
      setWizardStep('create');
      setMode('create');
      setSource('local');
      form.setFieldsValue({
        dbPath: 'apikey-vault.db',
        syncPath: 'D:/vault-sync/apikey-vault.db'
      });
      return;
    }

    setWizardStep('import');
    setMode('open');
    if (choice === 'import-local') {
      setSource('local');
      form.setFieldsValue({
        dbPath: 'D:/secure/apikey-vault.db',
        syncPath: 'D:/vault-sync/apikey-vault.db'
      });
      return;
    }

    setSource('syncthing');
    form.setFieldsValue({
      dbPath: 'D:/vault-sync/apikey-vault.db',
      syncPath: 'D:/vault-sync/apikey-vault.db'
    });
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
              <div className="wizard-grid">
                <button type="button" className="wizard-choice" onClick={() => applyWizardChoice('create')}>
                  <PlusOutlined />
                  <span>创建本地数据库</span>
                </button>
                <button type="button" className="wizard-choice" onClick={() => applyWizardChoice('import-local')}>
                  <ImportOutlined />
                  <span>导入本地数据库</span>
                </button>
                <button type="button" className="wizard-choice" onClick={() => applyWizardChoice('import-syncthing')}>
                  <SyncOutlined />
                  <span>导入 Syncthing 数据库</span>
                </button>
              </div>
              <div className="wizard-note">
                <Tag color={wizardStep === 'create' ? 'green' : 'blue'}>
                  {wizardStep === 'create' ? '当前: 创建向导' : '当前: 导入向导'}
                </Tag>
                <Text type="secondary">右侧表单已自动填入对应模板路径，可直接修改。</Text>
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
              <Button icon={<PlusOutlined />} onClick={() => setIsFirstLaunch(true)}>
                新建入口向导
              </Button>
            </>
          )}
        </section>

        <Card className="glass-panel login-card" bordered={false}>
          <Space direction="vertical" size={14} style={{ width: '100%' }}>
            <div>
              <Title level={4} style={{ margin: 0 }}>
                {mode === 'create' ? '创建数据库' : '导入数据库'}
              </Title>
              <Text type="secondary">填写数据库与同步配置。</Text>
            </div>

            <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
              <Radio.Group value={mode} onChange={(e) => setMode(e.target.value)} buttonStyle="solid">
                <Radio.Button value="open">导入</Radio.Button>
                <Radio.Button value="create">创建</Radio.Button>
              </Radio.Group>
              <Radio.Group
                value={source}
                onChange={(e) => {
                  const next = e.target.value;
                  setSource(next);
                  if (next === 'syncthing') {
                    const current = form.getFieldValue('dbPath');
                    if (current) {
                      form.setFieldValue('syncPath', current);
                    }
                  }
                }}
                buttonStyle="solid"
              >
                <Radio.Button value="local">本地</Radio.Button>
                <Radio.Button value="syncthing">Syncthing</Radio.Button>
              </Radio.Group>
            </Space>

            <Form form={form} onFinish={handleSubmit} layout="vertical" requiredMark={false}>
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

              <Form.Item style={{ marginBottom: 8 }}>
                <Button type="primary" htmlType="submit" loading={loading} block size="large">
                  {mode === 'create' ? '创建并进入' : '导入并进入'}
                </Button>
              </Form.Item>
            </Form>
          </Space>
        </Card>
      </div>
    </div>
  );
};

export default Login;
