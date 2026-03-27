import React, { useState } from 'react';
import { Button, Card, Form, Input, Tag, Typography, message } from 'antd';
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
        <div className="login-head">
          <Tag className="login-badge" bordered={false}>
            自部署个人版
          </Tag>
          <Title level={2} className="login-title">
            API Key Vault
          </Title>
          <Paragraph className="login-subtitle">
            为个人开发者准备的轻量密钥保险箱。部署完成后，打开页面即可开始管理常用密钥、密码和配置文件。
          </Paragraph>
        </div>

        <div className="login-highlights">
          <div className="login-highlight">单用户模式，安装后即可使用</div>
          <div className="login-highlight">统一存放 API Key、数据库账号和配置文件</div>
          <div className="login-highlight">敏感数据以加密形式存储在你的自部署服务中</div>
        </div>

        <Form
          form={form}
          layout="vertical"
          requiredMark={false}
          onFinish={handleSubmit}
        >
          <Form.Item name="username" style={{ display: 'none' }} initialValue="owner">
            <Input autoComplete="username" />
          </Form.Item>
          <Form.Item
            name="password"
            label={initialized ? '输入主密码' : '设置主密码'}
            rules={[
              { required: true, message: '请输入主密码' },
              { min: 8, message: '至少 8 位字符' }
            ]}
          >
            <Input.Password
              prefix={initialized ? <LockOutlined /> : <SafetyOutlined />}
              placeholder={initialized ? '输入主密码解锁' : '创建一个至少 8 位的主密码'}
              autoComplete={initialized ? 'current-password' : 'new-password'}
              size="large"
            />
          </Form.Item>

          {!initialized && (
            <Form.Item
              name="confirmPassword"
              label="确认主密码"
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
              <Input.Password placeholder="再次输入主密码" autoComplete="new-password" size="large" />
            </Form.Item>
          )}

          <Button type="primary" htmlType="submit" loading={loading} block size="large">
            {!initialized ? '完成初始化并进入保险箱' : '进入保险箱'}
          </Button>
        </Form>

        <Text type="secondary" className="login-footnote">
          {!initialized ? '首次登录只需设置一次主密码。' : '如果主密码错误，现有数据不会被修改。'}
        </Text>
      </Card>
    </div>
  );
};

export default Login;
