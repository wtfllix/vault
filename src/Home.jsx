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
  Tag,
  Typography,
  message
} from 'antd';
import {
  CopyOutlined,
  DeleteOutlined,
  EyeOutlined,
  FileTextOutlined,
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
  apikey: { label: 'API Key', icon: <KeyOutlined />, fields: ['key'] },
  ssh: { label: 'SSH 公钥', icon: <KeyOutlined />, fields: ['privateKey', 'publicKey', 'passphrase'] },
  password: { label: '密码', icon: <UserOutlined />, fields: ['url', 'username', 'password'] },
  database: { label: '数据库', icon: <DatabaseOutlined />, fields: ['type', 'host', 'port', 'username', 'password', 'database'] },
  custom: { label: '其他', icon: <FileTextOutlined />, fields: ['content'] }
};

const COLUMN_ORDER = ['apikey', 'ssh', 'password', 'database', 'custom'];

const Home = ({ onLogout, onAuthExpired }) => {
  const [secrets, setSecrets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [secretType, setSecretType] = useState('apikey');
  const [selectedSecret, setSelectedSecret] = useState(null);
  const [form] = Form.useForm();

  const loadSecrets = async (searchText = query) => {
    setLoading(true);
    try {
      const data = await api.getSecrets({ query: searchText.trim() });
      setSecrets(data);
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
    loadSecrets('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const groupedSecrets = useMemo(() => {
    const groups = {};
    COLUMN_ORDER.forEach((type) => {
      groups[type] = [];
    });

    secrets.forEach((item) => {
      const key = COLUMN_ORDER.includes(item.secret_type) ? item.secret_type : 'custom';
      groups[key].push(item);
    });
    return groups;
  }, [secrets]);

  const handleSearch = async (value) => {
    setQuery(value);
    await loadSecrets(value);
  };

  const handleAdd = async (values) => {
    try {
      const fields = SECRET_TYPES[secretType].fields;
      const data = {};
      fields.forEach((field) => {
        if (values[field]) {
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
      message.success('删除成功');
      await loadSecrets();
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

  const renderFormFields = () => {
    const fields = SECRET_TYPES[secretType].fields;
    return fields.map((field) => {
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
      <div className="home-wrap">
        <Card className="glass-panel home-header" bordered={false}>
          <div>
            <Title className="home-title">API Key Vault</Title>
            <div className="home-meta">Web MVP · PostgreSQL</div>
          </div>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={() => loadSecrets()} loading={loading}>刷新</Button>
            <Button icon={<LogoutOutlined />} onClick={onLogout}>退出</Button>
          </Space>
        </Card>

        <Card className="glass-panel toolbar-card" bordered={false}>
          <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
            <Input
              allowClear
              value={query}
              prefix={<SearchOutlined />}
              placeholder="搜索名称或类型"
              style={{ width: 320 }}
              onChange={(e) => handleSearch(e.target.value)}
            />
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalVisible(true)}>
              添加密钥
            </Button>
          </Space>
        </Card>

        <div className="type-columns">
          {COLUMN_ORDER.map((type) => {
            const typeMeta = SECRET_TYPES[type];
            const list = groupedSecrets[type] || [];
            return (
              <Card
                key={type}
                className="glass-panel type-column"
                bordered={false}
                title={(
                  <Space>
                    {typeMeta.icon}
                    <span>{typeMeta.label}</span>
                    <Tag>{list.length}</Tag>
                  </Space>
                )}
              >
                {list.length === 0 ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无数据" />
                ) : (
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
                        <Text className="secret-preview" type="secondary">
                          {item.preview || '***'}
                        </Text>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
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
