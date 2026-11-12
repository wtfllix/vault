import React, { useEffect, useRef, useState } from 'react';
import { Form, Input, Modal, Select, Switch, message } from 'antd';
import { mutate } from '../../services/api';
import { secretTypes, labels } from './types';
export default function SecretEditor({ snapshot, onClose, onSaved }) {
  const [form] = Form.useForm();
  const [type, setType] = useState(snapshot.secret_type || 'apikey');
  const [saving, setSaving] = useState(false);
  const guard = useRef(false);
  const [file, setFile] = useState(null);
  useEffect(() => {
    form.setFieldsValue({ ...snapshot, values: snapshot.data || {} });
    return () => form.resetFields();
  }, []);
  const fields = [
    ...new Set([
      ...(secretTypes[type]?.fields || []),
      ...(type === snapshot.secret_type ? Object.keys(snapshot.data || {}) : [])
    ])
  ];
  const submit = async (values) => {
    if (guard.current) return;
    guard.current = true;
    setSaving(true);
    try {
      let data = type === snapshot.secret_type ? { ...snapshot.data } : {};
      for (const field of fields)
        if (values.values?.[field] !== undefined) data[field] = values.values[field];
      if (file && type === 'config_file') {
        data = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () =>
            resolve({
              fileName: file.name,
              mimeType: file.type || 'application/octet-stream',
              size: file.size,
              contentBase64: String(reader.result).split(',')[1]
            });
          reader.onerror = () => reject(new Error('文件读取失败'));
          reader.readAsDataURL(file);
        });
      }
      const payload = {
        name: values.name.trim(),
        secret_type: type,
        tags: values.tags || [],
        environment: values.environment || '',
        favorite: values.favorite || false,
        note: values.note || '',
        data,
        ...(snapshot.id ? { version: snapshot.version } : {})
      };
      const saved = await mutate(
        `/secrets${snapshot.id ? `/${snapshot.id}` : ''}`,
        payload,
        snapshot.id ? 'PUT' : 'POST'
      );
      form.resetFields();
      onSaved(saved);
      onClose();
      message.success('密钥已加密保存');
    } catch (e) {
      message.error(e.message);
    } finally {
      setSaving(false);
      guard.current = false;
    }
  };
  return (
    <Modal
      open
      title={snapshot.id ? '编辑密钥' : '添加密钥'}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={saving}
      okText="加密保存"
      cancelText="取消"
      width={600}
      destroyOnClose
    >
      <p className="muted">名称、标签和环境用于检索，请勿填写密码或凭据。</p>
      <Form form={form} layout="vertical" onFinish={submit} requiredMark={false}>
        <div className="form-two">
          <Form.Item
            name="name"
            label="名称"
            rules={[{ required: true, whitespace: true }, { max: 255 }]}
          >
            <Input autoFocus placeholder="例如：Production API" />
          </Form.Item>
          <Form.Item label="类型">
            <Select
              value={type}
              options={Object.entries(secretTypes).map(([value, t]) => ({ value, label: t.label }))}
              onChange={setType}
            />
          </Form.Item>
        </div>
        <div className="form-two">
          <Form.Item name="tags" label="标签">
            <Select mode="tags" maxCount={20} tokenSeparators={[',']} placeholder="添加标签" />
          </Form.Item>
          <Form.Item name="environment" label="环境">
            <Input maxLength={40} placeholder="Production / Development" />
          </Form.Item>
        </div>
        <div className="encrypted-form">
          <div className="eyebrow">ENCRYPTED FIELDS</div>
          {type === 'config_file' && (
            <label className="file-picker-label">
              替换配置文件
              <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
              <small>未选择文件时保留原文件；最大 10 MB。</small>
            </label>
          )}
          {fields
            .filter((k) => k !== 'contentBase64' && k !== 'size')
            .map((field) => (
              <Form.Item key={field} name={['values', field]} label={labels[field] || field}>
                {['content', 'privateKey', 'publicKey'].includes(field) ? (
                  <Input.TextArea rows={field === 'content' ? 6 : 3} />
                ) : ['key', 'password', 'passphrase', 'connectionUrl'].includes(field) ? (
                  <Input.Password autoComplete="off" />
                ) : (
                  <Input maxLength={10000} />
                )}
              </Form.Item>
            ))}
          <Form.Item name="note" label="加密备注">
            <Input.TextArea maxLength={10000} rows={3} />
          </Form.Item>
        </div>
        <Form.Item name="favorite" label="收藏" valuePropName="checked">
          <Switch />
        </Form.Item>
      </Form>
    </Modal>
  );
}
