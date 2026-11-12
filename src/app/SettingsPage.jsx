import React, { useState } from 'react';
import { Button, Form, Input, Select, Modal, message } from 'antd';
import { mutate } from '../services/api';
export default function SettingsPage({ onLock }) {
  const [saving, setSaving] = useState(false);
  const [theme, setTheme] = useState(localStorage.getItem('vault-theme') || 'dark');
  return (
    <>
      <div className="workspace-heading">
        <div>
          <h1>Settings</h1>
          <p className="muted">让这个空间适合你。</p>
        </div>
      </div>
      <div className="settings-grid">
        <section className="surface settings-card">
          <div className="eyebrow">APPEARANCE</div>
          <h2>外观</h2>
          <p>默认深色，也可以跟随系统。</p>
          <Select
            aria-label="主题"
            value={theme}
            style={{ width: 200 }}
            options={[
              { value: 'dark', label: '深色' },
              { value: 'light', label: '浅色' },
              { value: 'system', label: '跟随系统' }
            ]}
            onChange={(v) => {
              localStorage.setItem('vault-theme', v);
              setTheme(v);
              window.dispatchEvent(new Event('vault:theme'));
            }}
          />
        </section>
        <section className="surface settings-card">
          <div className="eyebrow">SECURITY</div>
          <h2>主密码</h2>
          <p>修改后所有设备会立即退出。数据加密密钥保持原样。</p>
          <Form
            layout="vertical"
            onFinish={async (values) => {
              if (saving) return;
              setSaving(true);
              try {
                await mutate('/auth/password', values);
                onLock();
              } catch (e) {
                message.error(e.message);
              } finally {
                setSaving(false);
              }
            }}
          >
            <Form.Item name="currentPassword" label="当前主密码" rules={[{ required: true }]}>
              <Input.Password autoComplete="current-password" />
            </Form.Item>
            <Form.Item
              name="newPassword"
              label="新主密码"
              rules={[{ required: true }, { min: 12, max: 256 }]}
            >
              <Input.Password autoComplete="new-password" />
            </Form.Item>
            <Button htmlType="submit" type="primary" loading={saving}>
              更新主密码
            </Button>
          </Form>
        </section>
        <section className="surface settings-card">
          <div className="eyebrow">SESSIONS</div>
          <h2>设备与会话</h2>
          <p>默认 30 分钟无活动自动失效。敏感操作需要近期身份验证。</p>
          <Button
            danger
            onClick={() =>
              Modal.confirm({
                title: '退出所有设备？',
                content: '包括当前设备在内的所有会话都会立即撤销。',
                okText: '全部退出',
                cancelText: '取消',
                onOk: async () => {
                  await mutate('/auth/logout-all');
                  onLock();
                }
              })
            }
          >
            退出所有设备
          </Button>
        </section>
        <section className="surface settings-card">
          <div className="eyebrow">SHORTCUTS</div>
          <h2>少一点点击</h2>
          <div className="shortcut-row">
            <span>搜索与命令</span>
            <kbd>⌘ / Ctrl K</kbd>
          </div>
          <div className="shortcut-row">
            <span>上传文件</span>
            <kbd>⌘ / Ctrl U</kbd>
          </div>
          <div className="shortcut-row">
            <span>新建项目</span>
            <kbd>⌘ / Ctrl N</kbd>
          </div>
          <div className="shortcut-row">
            <span>保存笔记</span>
            <kbd>⌘ / Ctrl S</kbd>
          </div>
        </section>
      </div>
    </>
  );
}
