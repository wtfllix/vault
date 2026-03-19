import React, { useState } from 'react';
import { Card, Form, Input, Button, message, Radio, Typography, Space } from 'antd';
import { LockOutlined, DatabaseOutlined, SafetyOutlined, ThunderboltOutlined, CloudSyncOutlined } from '@ant-design/icons';
import { invoke } from '@tauri-apps/api/core';

const { Title, Paragraph, Text } = Typography;

const Login = ({ onLogin }) => {
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState('open');

  const handleSubmit = async (values) => {
    setLoading(true);
    try {
      const path = values.dbPath || 'apikey-vault.db';

      if (mode === 'open') {
        const exists = await invoke('db_exists', { path });
        if (!exists) {
          message.error('数据库不存在，请切换到创建模式后初始化。');
          return;
        }
      }

      await invoke('init_db', {
        password: values.password,
        path
      });

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
            <Title className="login-title">API Key Vault</Title>
            <Paragraph className="login-subtitle">
              在本地保存你的 API Key、数据库凭据和 SSH 材料。所有数据写入 SQLCipher 数据库，离线可用。
            </Paragraph>
          </div>

          <div className="login-feature-grid">
            <div className="login-feature">
              <Space align="start">
                <SafetyOutlined />
                <div>
                  <Text strong>本地加密</Text>
                  <br />
                  <Text type="secondary">主密码派生密钥，文件落盘即加密</Text>
                </div>
              </Space>
            </div>
            <div className="login-feature">
              <Space align="start">
                <ThunderboltOutlined />
                <div>
                  <Text strong>快速检索</Text>
                  <br />
                  <Text type="secondary">按类型与关键字快速定位密钥</Text>
                </div>
              </Space>
            </div>
            <div className="login-feature">
              <Space align="start">
                <CloudSyncOutlined />
                <div>
                  <Text strong>单文件备份</Text>
                  <br />
                  <Text type="secondary">复制数据库文件即可迁移和备份</Text>
                </div>
              </Space>
            </div>
            <div className="login-feature">
              <Space align="start">
                <DatabaseOutlined />
                <div>
                  <Text strong>多场景</Text>
                  <br />
                  <Text type="secondary">支持 API Key、账号、数据库、SSH 等</Text>
                </div>
              </Space>
            </div>
          </div>
        </section>

        <Card className="glass-panel login-card" bordered={false}>
          <Space direction="vertical" size={14} style={{ width: '100%' }}>
            <div>
              <Title level={4} style={{ margin: 0 }}>
                {mode === 'create' ? '创建新保险箱' : '打开已有保险箱'}
              </Title>
              <Text type="secondary">选择模式后输入数据库路径与主密码</Text>
            </div>

            <Radio.Group value={mode} onChange={(e) => setMode(e.target.value)} buttonStyle="solid" style={{ width: '100%' }}>
              <Radio.Button value="open" style={{ width: '50%', textAlign: 'center' }}>打开</Radio.Button>
              <Radio.Button value="create" style={{ width: '50%', textAlign: 'center' }}>创建</Radio.Button>
            </Radio.Group>

            <Form onFinish={handleSubmit} layout="vertical" requiredMark={false}>
              <Form.Item
                name="dbPath"
                label="数据库路径"
                initialValue="apikey-vault.db"
                tooltip="建议使用绝对路径，避免误开新库"
              >
                <Input prefix={<DatabaseOutlined />} placeholder="例如 C:/secure/apikey-vault.db" />
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
                  {mode === 'create' ? '创建并进入' : '解锁并进入'}
                </Button>
              </Form.Item>
            </Form>

            <Text type="secondary" style={{ fontSize: 12 }}>
              请妥善保管主密码，忘记后无法恢复数据库内容。
            </Text>
          </Space>
        </Card>
      </div>
    </div>
  );
};

export default Login;
