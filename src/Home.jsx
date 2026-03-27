import React, { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message
} from 'antd';
import {
  AppstoreOutlined,
  CopyOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EyeOutlined,
  FileOutlined,
  FileTextOutlined,
  HomeOutlined,
  KeyOutlined,
  LogoutOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  UserOutlined,
  DatabaseOutlined
} from '@ant-design/icons';
import { api } from './api';

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;

const SECRET_TYPES = {
  apikey: { label: 'API Key', icon: <KeyOutlined />, fields: ['apiUrl', 'key'] },
  ssh: { label: 'SSH 密钥', icon: <KeyOutlined />, fields: ['privateKey', 'publicKey', 'passphrase'] },
  password: { label: '账号密码', icon: <UserOutlined />, fields: ['url', 'username', 'password'] },
  database: { label: '数据库连接', icon: <DatabaseOutlined />, fields: ['type', 'host', 'port', 'username', 'password', 'database'] },
  long_text: { label: '长文本', icon: <FileTextOutlined />, fields: ['content'] },
  config_file: { label: '配置文件', icon: <FileOutlined />, fields: ['file'] },
  custom: { label: '自定义', icon: <FileTextOutlined />, fields: ['content'] }
};

const TYPE_ORDER = ['apikey', 'ssh', 'password', 'database', 'long_text', 'config_file', 'custom'];

const FIELD_LABELS = {
  apiUrl: 'API 地址',
  key: 'API Key',
  privateKey: '私钥',
  publicKey: '公钥',
  passphrase: '口令',
  url: '地址',
  username: '用户名',
  password: '密码',
  type: '类型',
  host: '主机',
  port: '端口',
  database: '数据库',
  content: '内容',
  fileName: '文件名',
  mimeType: 'MIME 类型',
  size: '大小'
};

const formatTime = (value) => {
  if (!value) {
    return '-';
  }
  const time = new Date(value);
  if (Number.isNaN(time.getTime())) {
    return String(value);
  }
  return `${time.getFullYear()}-${String(time.getMonth() + 1).padStart(2, '0')}-${String(time.getDate()).padStart(2, '0')} ${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`;
};

const DEFAULT_SUMMARY = [
  { key: 'all', label: '全部记录', icon: <AppstoreOutlined /> },
  { key: 'apikey', label: 'API Key', icon: <KeyOutlined /> },
  { key: 'password', label: '账号密码', icon: <UserOutlined /> },
  { key: 'config_file', label: '配置文件', icon: <FileOutlined /> }
];

const Home = ({ onLogout, onAuthExpired }) => {
  const [secrets, setSecrets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [activeType, setActiveType] = useState('all');
  const [modalVisible, setModalVisible] = useState(false);
  const [secretType, setSecretType] = useState('apikey');
  const [selectedSecret, setSelectedSecret] = useState(null);
  const [selectedSecretId, setSelectedSecretId] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [form] = Form.useForm();

  const loadSecrets = async () => {
    setLoading(true);
    try {
      const data = await api.getSecrets({});
      setSecrets(data);

      if (selectedSecretId && !data.some((item) => item.id === selectedSecretId)) {
        setSelectedSecretId(null);
        setSelectedSecret(null);
      }
    } catch (error) {
      if (error.message.includes('未授权')) {
        onAuthExpired();
        return;
      }
      message.error(error.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSecrets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const counts = useMemo(() => {
    const next = { all: secrets.length };
    TYPE_ORDER.forEach((typeKey) => {
      next[typeKey] = secrets.filter((item) => item.secret_type === typeKey).length;
    });
    return next;
  }, [secrets]);

  const filteredSecrets = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return secrets.filter((item) => {
      const matchesType = activeType === 'all' || item.secret_type === activeType;
      if (!matchesType) {
        return false;
      }
      if (!normalizedQuery) {
        return true;
      }

      const haystacks = [
        item.name,
        item.note,
        item.preview,
        item.secret_type,
        SECRET_TYPES[item.secret_type]?.label
      ];

      return haystacks.some((value) => String(value || '').toLowerCase().includes(normalizedQuery));
    });
  }, [activeType, query, secrets]);

  const handleView = async (id) => {
    setSelectedSecretId(id);
    try {
      const detail = await api.getSecretDetail(id);
      setSelectedSecret(detail);
    } catch (error) {
      if (error.message.includes('未授权')) {
        onAuthExpired();
        return;
      }
      message.error(error.message || '读取详情失败');
    }
  };

  const readFileAsBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const marker = 'base64,';
      const index = result.indexOf(marker);
      if (index === -1) {
        reject(new Error('文件读取失败'));
        return;
      }
      resolve(result.slice(index + marker.length));
    };
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsDataURL(file);
  });

  const handleAdd = async (values) => {
    try {
      const data = {};
      const normalizedName = String(values.name || '').trim();
      const normalizedNote = String(values.note || '').trim();

      if (secretType === 'config_file') {
        if (selectedFile) {
          const contentBase64 = await readFileAsBase64(selectedFile);
          data.fileName = selectedFile.name;
          data.mimeType = selectedFile.type || 'application/octet-stream';
          data.size = selectedFile.size;
          data.contentBase64 = contentBase64;
        }
      } else {
        const fields = SECRET_TYPES[secretType].fields;
        fields.forEach((field) => {
          if (values[field] !== undefined && values[field] !== '') {
            data[field] = values[field];
          }
        });
      }

      await api.addSecret({
        secret_type: secretType,
        name: normalizedName,
        data,
        note: normalizedNote
      });

      message.success('记录已保存');
      setModalVisible(false);
      setSecretType('apikey');
      setSelectedFile(null);
      form.resetFields();
      await loadSecrets();
    } catch (error) {
      if (error.message.includes('未授权')) {
        onAuthExpired();
        return;
      }
      message.error(error.message || '添加失败');
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.deleteSecret(id);
      if (selectedSecretId === id) {
        setSelectedSecretId(null);
        setSelectedSecret(null);
      }
      message.success('记录已删除');
      await loadSecrets();
    } catch (error) {
      if (error.message.includes('未授权')) {
        onAuthExpired();
        return;
      }
      message.error(error.message || '删除失败');
    }
  };

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(String(text));
      message.success('已复制');
    } catch {
      message.error('复制失败');
    }
  };

  const downloadFileFromSecret = (detail) => {
    const payload = detail?.data || {};
    if (!payload.contentBase64 || !payload.fileName) {
      message.error('文件数据不完整');
      return;
    }

    try {
      const binary = atob(payload.contentBase64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: payload.mimeType || 'application/octet-stream' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = payload.fileName;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch {
      message.error('文件下载失败');
    }
  };

  const closeCreateModal = () => {
    setModalVisible(false);
    setSecretType('apikey');
    setSelectedFile(null);
    form.resetFields();
  };

  const renderFormFields = () => {
    const fields = SECRET_TYPES[secretType].fields;
    return fields.map((field) => {
      if (field === 'apiUrl') {
        return (
          <Form.Item key={field} name={field} label="API 地址">
            <Input placeholder="https://api.example.com/v1" />
          </Form.Item>
        );
      }
      if (field === 'key') {
        return (
          <Form.Item key={field} name={field} label="API Key">
            <Input.TextArea rows={3} placeholder="粘贴密钥内容" />
          </Form.Item>
        );
      }
      if (field === 'type') {
        return (
          <Form.Item key={field} name={field} label="数据库类型" initialValue="PostgreSQL">
            <Select>
              <Option value="PostgreSQL">PostgreSQL</Option>
              <Option value="MySQL">MySQL</Option>
              <Option value="Redis">Redis</Option>
              <Option value="MongoDB">MongoDB</Option>
            </Select>
          </Form.Item>
        );
      }
      if (field === 'content') {
        return (
          <Form.Item key={field} name={field} label={secretType === 'long_text' ? '长文本内容' : '内容'}>
            <Input.TextArea rows={secretType === 'long_text' ? 8 : 4} />
          </Form.Item>
        );
      }
      if (field === 'file') {
        return (
          <Form.Item key={field} label="上传配置文件">
            <input
              type="file"
              onChange={(e) => {
                const file = e.target.files?.[0] || null;
                setSelectedFile(file);
              }}
            />
            {selectedFile ? <Text type="secondary">已选择：{selectedFile.name}</Text> : null}
          </Form.Item>
        );
      }
      if (field === 'privateKey' || field === 'publicKey') {
        return (
          <Form.Item key={field} name={field} label={field === 'privateKey' ? '私钥' : '公钥'}>
            <Input.TextArea rows={field === 'privateKey' ? 4 : 2} />
          </Form.Item>
        );
      }
      return (
        <Form.Item key={field} name={field} label={FIELD_LABELS[field] || field}>
          {field.includes('password') ? <Input.Password /> : <Input />}
        </Form.Item>
      );
    });
  };

  const tableColumns = [
    {
      title: '类型',
      dataIndex: 'secret_type',
      key: 'secret_type',
      width: 144,
      render: (value) => (
        <Tag icon={SECRET_TYPES[value]?.icon}>
          {SECRET_TYPES[value]?.label || value}
        </Tag>
      )
    },
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      render: (_, record) => <Text strong>{record.name}</Text>
    },
    {
      title: '摘要',
      dataIndex: 'preview',
      key: 'preview',
      ellipsis: true,
      render: (value) => <Text type="secondary">{value || '无预览'}</Text>
    },
    {
      title: '更新时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 176,
      render: (value) => <Text type="secondary">{formatTime(value)}</Text>
    },
    {
      title: '操作',
      key: 'actions',
      width: 116,
      render: (_, record) => (
        <Space size={2}>
          <Button type="text" icon={<EyeOutlined />} onClick={() => handleView(record.id)} />
          <Popconfirm title="确认删除这条记录？" onConfirm={() => handleDelete(record.id)}>
            <Button type="text" icon={<DeleteOutlined />} danger />
          </Popconfirm>
        </Space>
      )
    }
  ];

  const renderDetailPanel = () => {
    if (!selectedSecret) {
      return (
        <div className="detail-empty-wrap">
          <Empty
            description="从左侧列表选择一条记录，查看完整内容"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          >
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalVisible(true)}>
              新建第一条记录
            </Button>
          </Empty>
        </div>
      );
    }

    return (
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <div className="detail-meta">
          <Tag icon={SECRET_TYPES[selectedSecret.secret_type]?.icon}>
            {SECRET_TYPES[selectedSecret.secret_type]?.label || selectedSecret.secret_type}
          </Tag>
          <Text type="secondary">创建于 {formatTime(selectedSecret.created_at)}</Text>
        </div>
        <Title level={4} style={{ margin: 0 }}>
          {selectedSecret.name}
        </Title>
        {selectedSecret.secret_type === 'config_file' ? (
          <Space>
            <Text><Text strong>文件：</Text>{selectedSecret.data?.fileName || '-'}</Text>
            <Button icon={<DownloadOutlined />} onClick={() => downloadFileFromSecret(selectedSecret)}>
              下载原文件
            </Button>
          </Space>
        ) : null}
        {Object.entries(selectedSecret.data || {}).map(([key, value]) => (
          key === 'contentBase64' ? null : (
            <div key={key} className="detail-row">
              <span className="detail-key">{FIELD_LABELS[key] || key}</span>
              <Space style={{ width: '100%' }} align="start">
                <pre className="detail-value">{String(value)}</pre>
                <Button icon={<CopyOutlined />} onClick={() => copyToClipboard(value)} />
              </Space>
            </div>
          )
        ))}
        {selectedSecret.note ? (
          <div className="detail-row">
            <span className="detail-key">备注</span>
            <pre className="detail-value">{selectedSecret.note}</pre>
          </div>
        ) : null}
      </Space>
    );
  };

  return (
    <div className="app-shell page-enter">
      <div className="workspace-shell">
        <section className="glass-panel hero-card">
          <div className="hero-copy">
            <Tag bordered={false} className="hero-badge">个人自部署</Tag>
            <Title level={2} className="hero-title">打开页面，直接管理你的常用密钥</Title>
            <Paragraph className="hero-subtitle">
              所有记录集中保存在你自己的服务里，适合个人开发者日常保存 API Key、数据库账号、SSH 密钥和配置文件。
            </Paragraph>
          </div>
          <div className="hero-actions">
            <Input
              allowClear
              size="large"
              value={query}
              prefix={<SearchOutlined />}
              placeholder="搜索名称、类型或摘要"
              onChange={(e) => setQuery(e.target.value)}
            />
            <Space wrap>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalVisible(true)}>
                新建记录
              </Button>
              <Button icon={<ReloadOutlined />} onClick={loadSecrets} loading={loading}>
                刷新
              </Button>
              <Button icon={<LogoutOutlined />} onClick={onLogout}>
                退出
              </Button>
            </Space>
          </div>
        </section>

        <section className="summary-grid">
          {DEFAULT_SUMMARY.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`summary-card ${activeType === item.key ? 'is-active' : ''}`}
              onClick={() => setActiveType(item.key)}
            >
              <span className="summary-icon">{item.icon}</span>
              <span className="summary-label">{item.label}</span>
              <span className="summary-value">{counts[item.key] || 0}</span>
            </button>
          ))}
        </section>

        <div className="workspace-grid">
          <aside className="glass-panel sidebar-card">
            <div className="sidebar-head">
              <Text strong>分类筛选</Text>
              <Tag>{counts.all || 0} 条</Tag>
            </div>
            <div className="sidebar-list">
              <button
                type="button"
                className={`sidebar-item ${activeType === 'all' ? 'is-active' : ''}`}
                onClick={() => setActiveType('all')}
              >
                <span className="sidebar-item-left">
                  <HomeOutlined />
                  <span>全部记录</span>
                </span>
                <Tag>{counts.all || 0}</Tag>
              </button>
              {TYPE_ORDER.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={`sidebar-item ${activeType === item ? 'is-active' : ''}`}
                  onClick={() => setActiveType(item)}
                >
                  <span className="sidebar-item-left">
                    {SECRET_TYPES[item].icon}
                    <span>{SECRET_TYPES[item].label}</span>
                  </span>
                  <Tag>{counts[item] || 0}</Tag>
                </button>
              ))}
            </div>
          </aside>

          <section className="glass-panel section-card">
            <div className="section-head">
              <div>
                <Title level={4} className="section-title">
                  {activeType === 'all' ? '全部记录' : SECRET_TYPES[activeType]?.label}
                </Title>
                <Text type="secondary">
                  {query.trim() ? `已根据“${query}”筛选，共 ${filteredSecrets.length} 条结果` : `当前共有 ${filteredSecrets.length} 条记录`}
                </Text>
              </div>
            </div>

            {filteredSecrets.length === 0 ? (
              <div className="table-empty-wrap">
                <Empty
                  description={query.trim() ? '没有找到匹配记录' : '还没有保存任何记录'}
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                >
                  <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalVisible(true)}>
                    新建记录
                  </Button>
                </Empty>
              </div>
            ) : (
              <Table
                rowKey="id"
                columns={tableColumns}
                dataSource={filteredSecrets}
                loading={loading}
                pagination={{ pageSize: 8, hideOnSinglePage: true, size: 'small' }}
                scroll={{ x: 720 }}
                size="middle"
                onRow={(record) => ({
                  onClick: () => handleView(record.id),
                  className: selectedSecretId === record.id ? 'table-row-active' : ''
                })}
              />
            )}
          </section>

          <section className="glass-panel detail-panel-card">
            <div className="detail-panel-head">记录详情</div>
            {renderDetailPanel()}
          </section>
        </div>
      </div>

      <Modal
        title="新建记录"
        open={modalVisible}
        width={640}
        destroyOnClose
        onCancel={closeCreateModal}
        onOk={() => form.submit()}
      >
        <Paragraph className="modal-helper">
          只填写你真正需要保存的字段即可，名称和备注都支持后续快速搜索。
        </Paragraph>
        <Form form={form} layout="vertical" requiredMark={false} onFinish={handleAdd}>
          <Form.Item name="name" label="名称">
            <Input placeholder="例如：OpenAI 正式环境、生产数据库、服务器 SSH" />
          </Form.Item>
          <Form.Item label="类型">
            <Select
              value={secretType}
              onChange={(value) => {
                setSecretType(value);
                setSelectedFile(null);
              }}
            >
              {Object.entries(SECRET_TYPES).map(([key, meta]) => (
                <Option key={key} value={key}>{meta.label}</Option>
              ))}
            </Select>
          </Form.Item>
          {renderFormFields()}
          <Form.Item name="note" label="备注">
            <Input.TextArea rows={2} placeholder="可选，用来补充用途、环境或团队说明" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Home;
