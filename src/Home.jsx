import React, { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Tag,
  Typography,
  message
} from 'antd';
import {
  CopyOutlined,
  DeleteOutlined,
  EyeOutlined,
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
  custom: { label: '其他', icon: <FileTextOutlined />, fields: ['content'] }
};

const TYPE_ORDER = ['apikey', 'ssh', 'password', 'database', 'custom'];
const SIDEBAR_ITEMS = [
  { key: 'all', label: '主页', icon: <HomeOutlined /> },
  ...TYPE_ORDER.map((key) => ({ key, label: SECRET_TYPES[key].label, icon: SECRET_TYPES[key].icon }))
];

const Home = ({ onLogout, onAuthExpired }) => {
  const [secrets, setSecrets] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [activeType, setActiveType] = useState('all');
  const [modalVisible, setModalVisible] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [secretType, setSecretType] = useState('apikey');
  const [selectedSecret, setSelectedSecret] = useState(null);
  const [form] = Form.useForm();

  const refreshCounts = async () => {
    try {
      const data = await api.getSecrets({});
      const next = {};
      TYPE_ORDER.forEach((t) => {
        next[t] = data.filter((x) => x.secret_type === t).length;
      });
      setCounts(next);
    } catch {
      // 忽略计数刷新失败，不阻断主流程
    }
  };

  const loadSecrets = async (searchText = query, type = activeType) => {
    setLoading(true);
    try {
      const data = await api.getSecrets({
        query: searchText.trim(),
        type: type === 'all' ? '' : type
      });
      setSecrets(data);
      await refreshCounts();
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
    loadSecrets('', 'all');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const grouped = useMemo(() => {
    const map = {};
    TYPE_ORDER.forEach((k) => {
      map[k] = [];
    });
    secrets.forEach((item) => {
      if (map[item.secret_type]) {
        map[item.secret_type].push(item);
      } else {
        map.custom.push(item);
      }
    });
    return map;
  }, [secrets]);

  const visibleSections = activeType === 'all' ? [] : [activeType];

  const handleSearch = async (value) => {
    setQuery(value);
    await loadSecrets(value, activeType);
  };

  const handleSidebarChange = async (key) => {
    setActiveType(key);
    await loadSecrets(query, key);
  };

  const handleAdd = async (values) => {
    try {
      const data = {};
      const fields = SECRET_TYPES[secretType].fields;
      fields.forEach((field) => {
        if (values[field] !== undefined && values[field] !== '') {
          data[field] = values[field];
        }
      });

      await api.addSecret({
        secret_type: secretType,
        name: values.name,
        data,
        note: values.note || ''
      });

      message.success('添加成功');
      setModalVisible(false);
      setSecretType('apikey');
      form.resetFields();
      await loadSecrets(query, activeType);
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
      message.success('删除成功');
      await loadSecrets(query, activeType);
    } catch (error) {
      if (error.message.includes('未授权')) {
        onAuthExpired();
        return;
      }
      message.error(error.message || '删除失败');
    }
  };

  const handleView = async (id) => {
    try {
      const detail = await api.getSecretDetail(id);
      setSelectedSecret(detail);
      setDetailVisible(true);
    } catch (error) {
      if (error.message.includes('未授权')) {
        onAuthExpired();
        return;
      }
      message.error(error.message || '读取详情失败');
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

  const allModeResults = useMemo(() => {
    if (activeType !== 'all') {
      return [];
    }
    return secrets;
  }, [activeType, secrets]);

  const renderFormFields = () => {
    const fields = SECRET_TYPES[secretType].fields;
    return fields.map((field) => {
      if (field === 'apiUrl') {
        return (
          <Form.Item key={field} name={field} label="API 地址" rules={[{ required: true, message: '请输入 API 地址' }]}>
            <Input placeholder="https://api.example.com/v1" />
          </Form.Item>
        );
      }
      if (field === 'key') {
        return (
          <Form.Item key={field} name={field} label="API Key" rules={[{ required: true, message: '请输入 API Key' }]}>
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
        return (
          <Form.Item key={field} name={field} label="内容" rules={[{ required: true, message: '请输入内容' }]}>
            <Input.TextArea rows={4} />
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

  return (
    <div className="app-shell page-enter">
      <div className="home-layout">
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
            <Button icon={<ReloadOutlined />} onClick={() => loadSecrets(query, activeType)} loading={loading} block>
              刷新
            </Button>
            <Button icon={<LogoutOutlined />} onClick={onLogout} block>
              退出
            </Button>
          </div>
        </aside>

        <main className="home-main">
          <Card className="glass-panel search-hero" bordered={false}>
            <Title level={3} style={{ marginTop: 0 }}>搜索你的密钥</Title>
            <Text type="secondary">支持按名称和类型快速查找</Text>
            <Input
              allowClear
              size="large"
              value={query}
              prefix={<SearchOutlined />}
              placeholder="输入名称 / 类型，例如：apikey、ssh、数据库"
              className="hero-search"
              onChange={(e) => handleSearch(e.target.value)}
            />
            <div className="hero-actions">
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalVisible(true)}>
                添加密钥
              </Button>
            </div>
          </Card>

          <div className="result-sections">
            {activeType === 'all' ? (
              <div className="search-result-list">
                {allModeResults.map((item) => (
                  <div key={item.id} className="secret-item">
                    <div className="secret-item-head">
                      <Space size={8}>
                        {SECRET_TYPES[item.secret_type]?.icon}
                        <Text strong>{item.name}</Text>
                        <Tag>{SECRET_TYPES[item.secret_type]?.label || item.secret_type}</Tag>
                      </Space>
                      <Space size={4}>
                        <Button type="text" icon={<EyeOutlined />} onClick={() => handleView(item.id)} />
                        <Popconfirm title="确认删除该条记录？" onConfirm={() => handleDelete(item.id)}>
                          <Button type="text" icon={<DeleteOutlined />} danger />
                        </Popconfirm>
                      </Space>
                    </div>
                    <Text className="secret-preview" type="secondary">{item.preview || '***'}</Text>
                  </div>
                ))}
              </div>
            ) : null}
            {visibleSections.map((type) => {
              const meta = SECRET_TYPES[type];
              const list = grouped[type] || [];
              return (
                <Card
                  key={type}
                  className="glass-panel result-card"
                  bordered={false}
                  title={(
                    <Space>
                      {meta.icon}
                      <span>{meta.label}</span>
                      <Tag>{list.length}</Tag>
                    </Space>
                  )}
                >
                  <div className="secret-list">
                    {list.map((item) => (
                      <div key={item.id} className="secret-item">
                        <div className="secret-item-head">
                          <Text strong>{item.name}</Text>
                          <Space size={4}>
                            <Button type="text" icon={<EyeOutlined />} onClick={() => handleView(item.id)} />
                            <Popconfirm title="确认删除该条记录？" onConfirm={() => handleDelete(item.id)}>
                              <Button type="text" icon={<DeleteOutlined />} danger />
                            </Popconfirm>
                          </Space>
                        </div>
                        <Text className="secret-preview" type="secondary">{item.preview || '***'}</Text>
                      </div>
                    ))}
                  </div>
                </Card>
              );
            })}
          </div>
        </main>
      </div>

      <Modal
        title="添加密钥"
        open={modalVisible}
        width={640}
        destroyOnClose
        onCancel={() => {
          setModalVisible(false);
          setSecretType('apikey');
          form.resetFields();
        }}
        onOk={() => form.submit()}
      >
        <Form form={form} layout="vertical" requiredMark={false} onFinish={handleAdd}>
          <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input />
          </Form.Item>
          <Form.Item label="类型">
            <Select value={secretType} onChange={setSecretType}>
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

      <Modal
        title="密钥详情"
        open={detailVisible}
        width={640}
        footer={null}
        onCancel={() => setDetailVisible(false)}
      >
        {selectedSecret && (
          <Space direction="vertical" size={10} style={{ width: '100%' }}>
            <Text><Text strong>名称：</Text>{selectedSecret.name}</Text>
            <Text><Text strong>类型：</Text>{SECRET_TYPES[selectedSecret.secret_type]?.label || selectedSecret.secret_type}</Text>
            {Object.entries(selectedSecret.data || {}).map(([key, value]) => (
              <div key={key} className="detail-row">
                <span className="detail-key">{key}</span>
                <Space style={{ width: '100%' }} align="start">
                  <pre className="detail-value">{String(value)}</pre>
                  <Button icon={<CopyOutlined />} onClick={() => copyToClipboard(value)} />
                </Space>
              </div>
            ))}
            {selectedSecret.note ? <Text><Text strong>备注：</Text>{selectedSecret.note}</Text> : null}
          </Space>
        )}
      </Modal>
    </div>
  );
};

export default Home;
