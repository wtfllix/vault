import React from 'react';
import { Button, Empty, Modal, Input, Form, message } from 'antd';
import { StarFilled, StarOutlined } from '@ant-design/icons';
export const formatBytes = (value) => {
  const n = Number(value) || 0;
  return n < 1024
    ? `${n} B`
    : n < 1024 ** 2
      ? `${(n / 1024).toFixed(1)} KB`
      : n < 1024 ** 3
        ? `${(n / 1024 ** 2).toFixed(1)} MB`
        : `${(n / 1024 ** 3).toFixed(1)} GB`;
};
export const formatDate = (value) =>
  new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
export const ErrorState = ({ error, retry }) =>
  error ? (
    <div className="error-state" role="alert">
      {error}
      {retry && (
        <Button size="small" onClick={retry}>
          重试
        </Button>
      )}
    </div>
  ) : null;
export const EmptyState = ({ title, description, action }) => (
  <div className="empty-state">
    <Empty
      image={Empty.PRESENTED_IMAGE_SIMPLE}
      description={
        <>
          <strong>{title}</strong>
          <p>{description}</p>
        </>
      }
    >
      {action}
    </Empty>
  </div>
);
export const Favorite = ({ value, onClick }) => (
  <Button
    type="text"
    className={value ? 'favorite active' : 'favorite'}
    aria-label={value ? '取消收藏' : '收藏'}
    icon={value ? <StarFilled /> : <StarOutlined />}
    onClick={(event) => {
      event.stopPropagation();
      onClick();
    }}
  />
);
export const confirmAction = (title, action) =>
  Modal.confirm({
    title,
    content: '记录将移入回收站，可随时恢复。',
    okText: '移入回收站',
    cancelText: '取消',
    okButtonProps: { danger: true },
    onOk: async () => {
      try {
        await action();
      } catch (e) {
        message.error(e.message);
        throw e;
      }
    }
  });
export const RenameDialog = ({ open, title, initial = '', onClose, onSave }) => {
  const [form] = Form.useForm();
  const [saving, setSaving] = React.useState(false);
  const guard = React.useRef(false);
  React.useEffect(() => {
    if (open) form.setFieldsValue({ name: initial });
  }, [open, initial, form]);
  return (
    <Modal
      open={open}
      title={title}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={saving}
      destroyOnClose
      okText="保存"
      cancelText="取消"
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={async (values) => {
          if (guard.current) return;
          guard.current = true;
          setSaving(true);
          try {
            await onSave(values.name.trim());
            onClose();
          } catch (e) {
            message.error(e.message);
          } finally {
            guard.current = false;
            setSaving(false);
          }
        }}
      >
        <Form.Item
          name="name"
          label="名称"
          rules={[{ required: true, whitespace: true }, { max: 255 }]}
        >
          <Input autoFocus maxLength={255} />
        </Form.Item>
      </Form>
    </Modal>
  );
};
