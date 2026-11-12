import React, { useRef, useState } from 'react';
import { Alert, Button, Form, Input } from 'antd';
import { LockOutlined } from '@ant-design/icons';
import { mutate, setCsrf } from './services/api';
export default function Login({ initialized, onAuthSuccess }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const guard = useRef(false);
  const submit = async (values) => {
    if (guard.current) return;
    guard.current = true;
    setLoading(true);
    setError('');
    try {
      const result = await mutate(
        initialized ? '/auth/login' : '/auth/bootstrap',
        initialized
          ? { password: values.password }
          : { password: values.password, bootstrapToken: values.bootstrapToken }
      );
      setCsrf(result.csrf);
      onAuthSuccess();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      guard.current = false;
    }
  };
  return (
    <main className="login-page">
      <div className="login-brand">
        <span className="vault-mark">V</span> Vault <span className="version">2.0</span>
      </div>
      <section className="login-box">
        <div className="login-symbol">
          <LockOutlined />
        </div>
        <h1>{initialized ? '登录 Vault' : '初始化 Vault'}</h1>
        {error && <Alert type="error" showIcon message={error} />}
        <Form layout="vertical" onFinish={submit} requiredMark={false}>
          {!initialized && (
            <Form.Item name="bootstrapToken" label="一次性初始化凭据" rules={[{ required: true }]}>
              <Input.Password autoComplete="off" placeholder="从服务器配置中获取" />
            </Form.Item>
          )}
          <Form.Item
            name="password"
            label={initialized ? '主密码' : '设置主密码'}
            rules={[
              { required: true },
              { min: initialized ? 1 : 12, max: 256, message: '新主密码至少 12 个字符' }
            ]}
          >
            <Input.Password
              autoComplete={initialized ? 'current-password' : 'new-password'}
              size="large"
              placeholder={initialized ? '输入主密码解锁' : '至少 12 个字符'}
            />
          </Form.Item>
          {!initialized && (
            <Form.Item
              name="confirm"
              label="确认主密码"
              dependencies={['password']}
              rules={[
                { required: true },
                ({ getFieldValue }) => ({
                  validator: (_, v) =>
                    v === getFieldValue('password')
                      ? Promise.resolve()
                      : Promise.reject(new Error('两次密码不一致'))
                })
              ]}
            >
              <Input.Password autoComplete="new-password" />
            </Form.Item>
          )}
          <Button block size="large" type="primary" htmlType="submit" loading={loading}>
            {initialized ? '解锁 Vault' : '初始化 Vault'}
          </Button>
        </Form>
      </section>
    </main>
  );
}
