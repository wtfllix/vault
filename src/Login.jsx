import React, { useState } from 'react';
import { Button, Card, Form, Input, Typography, message } from 'antd';
import { LockOutlined, SafetyOutlined } from '@ant-design/icons';
import { api, setToken } from './api';

const { Title, Paragraph, Text } = Typography;

const Login = ({ initialized, onAuthSuccess }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (values) => {
    setLoading(true);
    try {
      if (!initialized) {
        const result = await api.bootstrap(values.password);
        setToken(result.token);
        message.success('主密码设置成功');
      } else {
        const result = await api.login(values.password);
        setToken(result.token);
        message.success('登录成功');
      }
      onAuthSuccess();
    } catch (error) {
      message.error(error.message || '操作失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-shell login-shell page-enter">
      <Card className="glass-panel login-card" bordered={false}>
        <Title level={2} style={{ marginTop: 0 }}>
          API Key Vault
        </Title>
        <Paragraph className="login-subtitle">
          {!initialized
            ? '首次启动：请设置一个主密码，后续用它解锁系统。'
            : '请输入主密码登录。'}
        </Paragraph>
        <Form
          form={form}
          layout="vertical"
          requiredMark={false}
          onFinish={handleSubmit}
        >
          <Form.Item
            name="password"
            label="主密码"
            rules={[
              { required: true, message: '请输入主密码' },
              { min: 8, message: '至少 8 位字符' }
            ]}
          >
            <Input.Password
              prefix={initialized ? <LockOutlined /> : <SafetyOutlined />}
              placeholder={initialized ? '输入主密码' : '设置主密码'}
              autoComplete="current-password"
            />
          </Form.Item>

          {!initialized && (
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
                    return Promise.reject(new Error('两次密码不一致'));
                  }
                })
              ]}
            >
              <Input.Password placeholder="再次输入主密码" autoComplete="new-password" />
            </Form.Item>
          )}

          <Button type="primary" htmlType="submit" loading={loading} block size="large">
            {!initialized ? '设置并进入' : '登录'}
          </Button>
        </Form>
        <Text type="secondary" style={{ marginTop: 12, display: 'block' }}>
          MVP 单用户模式，敏感数据将以加密形式存储在 PostgreSQL。
        </Text>
      </Card>
    </div>
  );
};

export default Login;
