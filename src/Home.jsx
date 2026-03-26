import React, { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
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

const { Title, Text } = Typography;
const { Option } = Select;

const SECRET_TYPES = {
  apikey: { label: 'API Key', icon: <KeyOutlined />, fields: ['apiUrl', 'key'] },
  ssh: { label: 'SSH 公钥', icon: <KeyOutlined />, fields: ['privateKey', 'publicKey', 'passphrase'] },
  password: { label: '密码', icon: <UserOutlined />, fields: ['url', 'username', 'password'] },
  database: { label: '数据库', icon: <DatabaseOutlined />, fields: ['type', 'host', 'port', 'username', 'password', 'database'] },
  long_text: { label: '长文本', icon: <FileTextOutlined />, fields: ['content'] },
  config_file: { label: '配置文件', icon: <FileOutlined />, fields: ['file'] },
  custom: { label: '其他', icon: <FileTextOutlined />, fields: ['content'] }
};

const TYPE_ORDER = ['apikey', 'ssh', 'password', 'database', 'long_text', 'config_file', 'custom'];
const SIDEBAR_ITEMS = [
  { key: 'all', label: '主页', icon: <HomeOutlined /> },
  ...TYPE_ORDER.map((key) => ({ key, label: SECRET_TYPES[key].label, icon: SECRET_TYPES[key].icon }))
];

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

const Home = ({ onLogout, onAuthExpired }) => {
  const [secrets, setSecrets] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [activeType, setActiveType] = useState('all');
  const [modalVisible, setModalVisible] = useState(false);
  const [secretType, setSecretType] = useState('apikey');
  const [selectedSecret, setSelectedSecret] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [form] = Form.useForm();

  const totalCount = TYPE_ORDER.reduce((sum, key) => sum + (counts[key] || 0), 0);

  const loadCounts = async () => {
    try {
      const data = await api.getSecrets({});
      const next = {};
      TYPE_ORDER.forEach((typeKey) => {
        next[typeKey] = data.filter((item) => item.secret_type === typeKey).length;
      });
      setCounts(next);
    } catch {
      // 忽略计数失败
    }
  };

  const loadSecrets = async (searchText = query, type = activeType) => {
    setLoading(true);
    try {
      const normalizedQuery = searchText.trim();
      if (type === 'all' && !normalizedQuery) {
        setSecrets([]);
        setSelectedSecret(null);
        return;
      }

      const data = await api.getSecrets({
        query: normalizedQuery,
        type: type === 'all' ? '' : type
      });
      setSecrets(data);

      if (selectedSecret) {
        const stillExists = data.find((item) => item.id === selectedSecret.id);
        if (!stillExists) {
          setSelectedSecret(null);
        }
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

  const handleView = async (id) => {
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

  useEffect(() => {
    loadCounts();
    loadSecrets('', 'all');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = async (value) => {
    setQuery(value);
    await loadSecrets(value, activeType);
  };

  const handleSidebarChange = async (key) => {
    setActiveType(key);
    setSelectedSecret(null);
    await loadSecrets(query, key);
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

      message.success('添加成功');
      setModalVisible(false);
      setSecretType('apikey');
      setSelectedFile(null);
      form.resetFields();
      await Promise.all([loadSecrets(query, activeType), loadCounts()]);
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
      if (selectedSecret?.id === id) {
        setSelectedSecret(null);
      }
      message.success('删除成功');
      await Promise.all([loadSecrets(query, activeType), loadCounts()]);
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
            <Input.TextArea rows={3} />
          </Form.Item>
        );
      }
      if (field === 'type') {
        return (
          <Form.Item key={field} name={field} label="数据库类型" initialValue="MySQL">
            <Select>
              <Option value="MySQL">MySQL</Option>
              <Option value="PostgreSQL">PostgreSQL</Option>
              <Option value="Redis">Redis</Option>
              <Option value="MongoDB">MongoDB</Option>
            </Select>
          </Form.Item>
        );
      }
      if (field === 'content') {
        const contentLabel = secretType === 'long_text' ? '长文本内容' : '内容';
        return (
          <Form.Item key={field} name={field} label={contentLabel}>
            <Input.TextArea rows={secretType === 'long_text' ? 8 : 4} />
          </Form.Item>
        );
      }
      if (field === 'file') {
        return (
          <Form.Item key={field} label="配置文件">
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
        <Form.Item key={field} name={field} label={field}>
          {field.includes('password') ? <Input.Password /> : <Input />}
        </Form.Item>
      );
    });
  };

  const tableColumns = useMemo(() => {
    const columns = [
      {
        title: '类型',
        dataIndex: 'secret_type',
        key: 'secret_type',
        width: 140,
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
        width: 240,
        render: (_, record) => (
          <Space size={8}>
            <Text strong>{record.name}</Text>
          </Space>
        )
      },
      {
        title: '预览',
        dataIndex: 'preview',
        key: 'preview',
        ellipsis: true,
        render: (value) => <Text type="secondary">{value || '***'}</Text>
      },
      {
        title: '更新时间',
        dataIndex: 'created_at',
        key: 'created_at',
        width: 180,
        render: (value) => <Text type="secondary">{formatTime(value)}</Text>
      },
      {
        title: '操作',
        key: 'actions',
        width: 120,
        render: (_, record) => (
          <Space size={2}>
            <Button type="text" icon={<EyeOutlined />} onClick={() => handleView(record.id)} />
            <Popconfirm title="确认删除该条记录？" onConfirm={() => handleDelete(record.id)}>
              <Button type="text" icon={<DeleteOutlined />} danger />
            </Popconfirm>
          </Space>
        )
      }
    ];
    return columns;
  }, []);

  const renderDetailPanel = () => {
    if (!selectedSecret) {
      return (
        <div className="detail-empty-wrap">
          <Empty description="选择左侧一条记录查看详情" />
        </div>
      );
    }

    return (
      <Space direction="vertical" size={10} style={{ width: '100%' }}>
        <Text><Text strong>名称：</Text>{selectedSecret.name}</Text>
        <Text><Text strong>类型：</Text>{SECRET_TYPES[selectedSecret.secret_type]?.label || selectedSecret.secret_type}</Text>
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
        {selectedSecret.note ? <Text><Text strong>备注：</Text>{selectedSecret.note}</Text> : null}
      </Space>
    );
  };

  return (
    <div className="app-shell page-enter">
      <header className="home-topbar glass-panel">
        <div className="brand-block">
          <Text className="brand-kicker">Vault Workspace</Text>
          <Title level={3} className="topbar-title">API Key Vault</Title>
        </div>
        <div className="topbar-search-wrap">
          <Input
            allowClear
            size="large"
            value={query}
            prefix={<SearchOutlined />}
            placeholder="全局搜索：名称 / 类型，例如 apikey、ssh、数据库"
            className="topbar-search"
            onChange={(e) => handleSearch(e.target.value)}
          />
        </div>
        <Space wrap className="topbar-actions">
          <Tag icon={<AppstoreOutlined />}>总计 {totalCount}</Tag>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalVisible(true)}>
            新建
          </Button>
          <Button icon={<LogoutOutlined />} onClick={onLogout}>
            退出
          </Button>
        </Space>
      </header>

      <div className="home-layout desktop-focus">
        <aside className="home-sidebar glass-panel">
          <div className="sidebar-title">导航</div>
          <div className="sidebar-list">
            {SIDEBAR_ITEMS.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`sidebar-item ${activeType === item.key ? 'is-active' : ''}`}
                onClick={() => handleSidebarChange(item.key)}
              >
                <span className="sidebar-item-left">
                  {item.icon}
                  <span>{item.label}</span>
                </span>
                {item.key !== 'all' ? <Tag>{counts[item.key] || 0}</Tag> : null}
              </button>
            ))}
          </div>
          <div className="sidebar-actions">
            <Button
              icon={<ReloadOutlined />}
              onClick={() => Promise.all([loadSecrets(query, activeType), loadCounts()])}
              loading={loading}
              block
            >
              刷新
            </Button>
          </div>
        </aside>

        <main className="home-main">
          <div className="desktop-content-grid">
            <Card className="glass-panel table-card" bordered={false}>
              <div className="table-toolbar">
                <Space size={10}>
                  <Text strong>{activeType === 'all' ? '搜索结果' : `${SECRET_TYPES[activeType]?.label || activeType} 列表`}</Text>
                  <Tag>{secrets.length}</Tag>
                </Space>
              </div>
              {activeType === 'all' && !query.trim() ? (
                <div className="table-empty-wrap">
                  <Empty description="先输入关键词开始搜索" />
                </div>
              ) : (
                <Table
                  rowKey="id"
                  columns={tableColumns}
                  dataSource={secrets}
                  loading={loading}
                  pagination={{ pageSize: 8, hideOnSinglePage: true, size: 'small' }}
                  scroll={{ y: 'calc(100vh - 360px)' }}
                  size="middle"
                  onRow={(record) => ({
                    onClick: () => handleView(record.id),
                    className: selectedSecret?.id === record.id ? 'table-row-active' : ''
                  })}
                />
              )}
            </Card>

            <Card className="glass-panel detail-panel-card" bordered={false} title="详情">
              {renderDetailPanel()}
            </Card>
          </div>
        </main>
      </div>

      <Modal
        title="新建记录"
        open={modalVisible}
        width={640}
        destroyOnClose
        onCancel={() => {
          setModalVisible(false);
          setSecretType('apikey');
          setSelectedFile(null);
          form.resetFields();
        }}
        onOk={() => form.submit()}
      >
        <Form form={form} layout="vertical" requiredMark={false} onFinish={handleAdd}>
          <Form.Item name="name" label="名称">
            <Input />
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
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Home;
