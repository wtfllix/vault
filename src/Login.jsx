import React, { useState, useEffect } from 'react';
import { Card, Form, Input, Button, message, Radio, Space } from 'antd';
import { LockOutlined, DatabaseOutlined } from '@ant-design/icons';
import { invoke } from '@tauri-apps/api/core';

const Login = ({ onLogin }) => {
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState('open'); // 'open' 或 'create'
  const [dbPath, setDbPath] = useState('');

  useEffect(() => {
    // 默认路径
    setDbPath('apikey-vault.db');
  }, []);

  const handleSubmit = async (values) => {
    setLoading(true);
    try {
      const path = values.dbPath || 'apikey-vault.db';
      
      if (mode === 'open') {
        // 检查数据库是否存在
        const exists = await invoke('db_exists', { path });
        if (!exists) {
          message.error('数据库不存在，请切换至创建模式');
          setLoading(false);
          return;
        }
      }
      
      // 初始化数据库
      await invoke('init_db', { 
        password: values.password,
        path: path
      });
      
      message.success(mode === 'create' ? '创建成功' : '登录成功');
      onLogin(path);
    } catch (error) {
      message.error('密码错误或操作失败: ' + error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ 
      height: '100vh', 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center',
      background: '#f0f2f5'
    }}>
      <Card 
        title="API Key 保险箱" 
        style={{ width: 400 }}
        extra={
          <Radio.Group value={mode} onChange={(e) => setMode(e.target.value)}>
            <Radio.Button value="open">打开</Radio.Button>
            <Radio.Button value="create">创建</Radio.Button>
          </Radio.Group>
        }
      >
        <Form onFinish={handleSubmit} layout="vertical">
          <Form.Item
            name="dbPath"
            label="数据库路径"
            initialValue="apikey-vault.db"
          >
            <Input 
              prefix={<DatabaseOutlined />} 
              placeholder="数据库文件路径"
            />
          </Form.Item>
          
          <Form.Item
            name="password"
            label="主密码"
            rules={[{ required: true, message: '请输入主密码' }]}
          >
            <Input.Password 
              prefix={<LockOutlined />} 
              placeholder="主密码（用于加密数据库）"
            />
          </Form.Item>
          
          {mode === 'create' && (
            <Form.Item
              name="confirmPassword"
              label="确认密码"
              dependencies={['password']}
              rules={[
                { required: true, message: '请确认密码' },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue('password') === value) {
                      return Promise.resolve();
                    }
                    return Promise.reject(new Error('两次输入的密码不一致'));
                  },
                }),
              ]}
            >
              <Input.Password placeholder="再次输入主密码" />
            </Form.Item>
          )}
          
          <Form.Item>
            <Button 
              type="primary" 
              htmlType="submit" 
              loading={loading}
              block
              size="large"
            >
              {mode === 'create' ? '创建保险箱' : '打开保险箱'}
            </Button>
          </Form.Item>
        </Form>
        
        <div style={{ marginTop: 16, color: '#999', fontSize: 12 }}>
          <p>提示：</p>
          <ul>
            <li>主密码用于加密数据库，请务必牢记</li>
            <li>忘记密码将无法恢复数据</li>
            <li>建议定期导出备份</li>
          </ul>
        </div>
      </Card>
    </div>
  );
};

export default Login;
