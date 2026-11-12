import React, { useRef, useState } from 'react';
import { Alert, Button, Form, Input } from 'antd';
import { LockOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
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
        <h1>{initialized ? '欢迎回来' : '你的私人数字空间'}</h1>
        <p>Files、Notes 与 Secrets，安静有序地归于一处。</p>
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
            {initialized ? '解锁 Vault' : '创建私人空间'}
          </Button>
        </Form>
        <div className="login-assurance">
          <SafetyCertificateOutlined /> 仅你可访问 · 私人自部署
        </div>
      </section>
      <footer className="login-footer">A little space. Entirely yours.</footer>
    </main>
  );
}
