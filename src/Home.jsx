import React, { useState, useEffect, useMemo } from 'react';
import {
  Card, Button, Table, Tag, Modal, Form, Input, Select,
  Space, Popconfirm, message, Typography, Empty
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, CopyOutlined,
  LogoutOutlined, EyeOutlined, KeyOutlined,
  UserOutlined, DatabaseOutlined, FileTextOutlined,
  SearchOutlined, ReloadOutlined
} from '@ant-design/icons';
import { invoke } from '@tauri-apps/api/core';

const { Title, Text } = Typography;
const { Option } = Select;

const SECRET_TYPES = {
  apikey: { label: 'API Key', icon: <KeyOutlined />, fields: ['key'] },
  password: { label: '账号密码', icon: <UserOutlined />, fields: ['url', 'username', 'password'] },
  database: { label: '数据库', icon: <DatabaseOutlined />, fields: ['type', 'host', 'port', 'username', 'password', 'database'] },
  ssh: { label: 'SSH 密钥', icon: <KeyOutlined />, fields: ['privateKey', 'publicKey', 'passphrase'] },
  custom: { label: '自定义', icon: <FileTextOutlined />, fields: ['content'] }
};

const Home = ({ dbPath, onLogout }) => {
  const [secrets, setSecrets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [selectedSecret, setSelectedSecret] = useState(null);
  const [secretType, setSecretType] = useState('apikey');
  const [query, setQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [form] = Form.useForm();

  const fetchSecrets = async () => {
    setLoading(true);
    try {
      const data = await invoke('get_secrets');
      setSecrets(data);
    } catch (error) {
      message.error(`获取数据失败: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSecrets();
  }, []);

  const filteredSecrets = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return secrets.filter((item) => {
      const byType = filterType === 'all' || item.secret_type === filterType;
      const byText = !normalizedQuery
        || item.name.toLowerCase().includes(normalizedQuery)
        || (item.note || '').toLowerCase().includes(normalizedQuery);
      return byType && byText;
    });
  }, [secrets, query, filterType]);

  const metrics = useMemo(() => {
    const typeCount = Object.keys(SECRET_TYPES).reduce((acc, key) => {
      acc[key] = 0;
      return acc;
    }, {});

    secrets.forEach((item) => {
      if (typeCount[item.secret_type] !== undefined) {
        typeCount[item.secret_type] += 1;
      }
    });

    return {
      total: secrets.length,
      apikey: typeCount.apikey,
      database: typeCount.database,
      account: typeCount.password
    };
  }, [secrets]);

  const handleAdd = async (values) => {
    try {
      const data = {};
      const fields = SECRET_TYPES[secretType].fields;
      fields.forEach((field) => {
        data[field] = values[field] || '';
      });

      await invoke('add_secret', {
        secret: {
          secret_type: secretType,
          name: values.name,
          data,
          note: values.note || ''
        }
      });

      message.success('添加成功');
      setModalVisible(false);
      form.resetFields();
      setSecretType('apikey');
      fetchSecrets();
    } catch (error) {
      message.error(`添加失败: ${error}`);
    }
  };

  const handleDelete = async (id) => {
    try {
      await invoke('delete_secret', { id });
      message.success('删除成功');
      fetchSecrets();
    } catch (error) {
      message.error(`删除失败: ${error}`);
    }
  };

  const handleView = async (record) => {
    try {
      const data = await invoke('get_secret_detail', { id: record.id });
      setSelectedSecret(data);
      setDetailVisible(true);
    } catch (error) {
      message.error(`获取详情失败: ${error}`);
    }
  };

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      message.success('已复制到剪贴板');
    } catch {
      message.error('复制失败，请手动复制');
    }
  };

  const renderSecretValue = (record) => {
    try {
      const data = JSON.parse(record.encrypted_data);
      switch (record.secret_type) {
        case 'apikey':
          return data.key ? `${data.key.substring(0, 10)}...` : '***';
        case 'password':
          return data.username ? `${data.username} / ****` : '****';
        case 'database':
          return `${data.host || 'host'}:${data.port || 'port'}`;
        case 'ssh':
          return data.publicKey ? `${data.publicKey.substring(0, 20)}...` : 'SSH Key';
        default:
          return '***';
      }
    } catch {
      return '***';
    }
  };

  const columns = [
    {
      title: '类型',
      dataIndex: 'secret_type',
      key: 'type',
      width: 140,
      render: (type) => (
        <Tag icon={SECRET_TYPES[type]?.icon} color="green">
          {SECRET_TYPES[type]?.label || type}
        </Tag>
      )
    },
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name'
    },
    {
      title: '内容预览',
      key: 'preview',
      render: (_, record) => <code>{renderSecretValue(record)}</code>
    },
    {
      title: '备注',
      dataIndex: 'note',
      key: 'note',
      ellipsis: true
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      render: (_, record) => (
        <Space>
          <Button icon={<EyeOutlined />} onClick={() => handleView(record)} size="small">
            查看
          </Button>
          <Popconfirm title="确认删除该条密钥吗？" onConfirm={() => handleDelete(record.id)}>
            <Button icon={<DeleteOutlined />} danger size="small">
              删除
            </Button>
          </Popconfirm>
        </Space>
      )
    }
  ];

  const renderFormFields = () => {
    const fields = SECRET_TYPES[secretType].fields;

    return fields.map((field) => {
      switch (field) {
        case 'key':
          return (
            <Form.Item key={field} name={field} label="API Key" rules={[{ required: true, message: '请输入 API Key' }]}> 
              <Input.TextArea rows={3} placeholder="输入 API Key" />
            </Form.Item>
          );
        case 'url':
          return (
            <Form.Item key={field} name={field} label="网址">
              <Input placeholder="https://example.com" />
            </Form.Item>
          );
        case 'username':
          return (
            <Form.Item key={field} name={field} label="用户名">
              <Input placeholder="用户名" />
            </Form.Item>
          );
        case 'password':
          return (
            <Form.Item key={field} name={field} label="密码">
              <Input.Password placeholder="密码" />
            </Form.Item>
          );
        case 'type':
          return (
            <Form.Item key={field} name={field} label="数据库类型" initialValue="MySQL">
              <Select>
                <Option value="MySQL">MySQL</Option>
                <Option value="PostgreSQL">PostgreSQL</Option>
                <Option value="MongoDB">MongoDB</Option>
                <Option value="Redis">Redis</Option>
              </Select>
            </Form.Item>
          );
        case 'host':
          return (
            <Form.Item key={field} name={field} label="主机">
              <Input placeholder="localhost" />
            </Form.Item>
          );
        case 'port':
          return (
            <Form.Item key={field} name={field} label="端口" initialValue={3306}>
              <Input type="number" />
            </Form.Item>
          );
        case 'database':
          return (
            <Form.Item key={field} name={field} label="数据库名">
              <Input placeholder="数据库名" />
            </Form.Item>
          );
        case 'privateKey':
          return (
            <Form.Item key={field} name={field} label="私钥">
              <Input.TextArea rows={4} placeholder="-----BEGIN OPENSSH PRIVATE KEY-----" />
            </Form.Item>
          );
        case 'publicKey':
          return (
            <Form.Item key={field} name={field} label="公钥">
              <Input.TextArea rows={2} placeholder="ssh-rsa AAAA..." />
            </Form.Item>
          );
        case 'passphrase':
          return (
            <Form.Item key={field} name={field} label="密码短语">
              <Input.Password placeholder="可选" />
            </Form.Item>
          );
        case 'content':
          return (
            <Form.Item key={field} name={field} label="内容" rules={[{ required: true, message: '请输入内容' }]}> 
              <Input.TextArea rows={4} placeholder="输入任意内容" />
            </Form.Item>
          );
        default:
          return null;
      }
    });
  };

  return (
    <div className="app-shell page-enter">
      <div className="home-wrap">
        <Card className="glass-panel home-header" bordered={false}>
          <div>
            <Title className="home-title">API Key Vault</Title>
            <div className="home-meta">当前数据库: {dbPath}</div>
          </div>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={fetchSecrets}>刷新</Button>
            <Button icon={<LogoutOutlined />} onClick={onLogout}>退出</Button>
          </Space>
        </Card>

        <div className="metric-grid">
          <div className="metric-card glass-panel">
            <div className="metric-label">总密钥数</div>
            <div className="metric-value">{metrics.total}</div>
          </div>
          <div className="metric-card glass-panel">
            <div className="metric-label">API Key</div>
            <div className="metric-value">{metrics.apikey}</div>
          </div>
          <div className="metric-card glass-panel">
            <div className="metric-label">数据库账号</div>
            <div className="metric-value">{metrics.database}</div>
          </div>
          <div className="metric-card glass-panel">
            <div className="metric-label">网站账号</div>
            <div className="metric-value">{metrics.account}</div>
          </div>
        </div>

        <Card className="glass-panel toolbar-card" bordered={false}>
          <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
            <Space wrap>
              <Input
                allowClear
                prefix={<SearchOutlined />}
                placeholder="搜索名称或备注"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{ width: 280 }}
              />
              <Select value={filterType} onChange={setFilterType} style={{ width: 180 }}>
                <Option value="all">全部类型</Option>
                {Object.entries(SECRET_TYPES).map(([key, item]) => (
                  <Option key={key} value={key}>{item.label}</Option>
                ))}
              </Select>
            </Space>

            <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalVisible(true)}>
              添加密钥
            </Button>
          </Space>
        </Card>

        <Card className="glass-panel" bordered={false}>
          <Table
            columns={columns}
            dataSource={filteredSecrets}
            rowKey="id"
            loading={loading}
            pagination={{ pageSize: 8, showSizeChanger: false }}
            locale={{ emptyText: <Empty description="当前没有匹配的密钥" /> }}
          />
        </Card>
      </div>

      <Modal
        title="添加密钥"
        open={modalVisible}
        onCancel={() => {
          setModalVisible(false);
          setSecretType('apikey');
          form.resetFields();
        }}
        onOk={() => form.submit()}
        width={660}
        destroyOnClose
      >
        <Form form={form} onFinish={handleAdd} layout="vertical" requiredMark={false}>
          <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}> 
            <Input placeholder="给这个密钥起个名字" />
          </Form.Item>

          <Form.Item label="类型">
            <Select value={secretType} onChange={setSecretType}>
              {Object.entries(SECRET_TYPES).map(([key, item]) => (
                <Option key={key} value={key}>{item.label}</Option>
              ))}
            </Select>
          </Form.Item>

          {renderFormFields()}

          <Form.Item name="note" label="备注">
            <Input.TextArea rows={2} placeholder="可选备注" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="密钥详情"
        open={detailVisible}
        onCancel={() => setDetailVisible(false)}
        footer={null}
        width={660}
      >
        {selectedSecret && (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Text><Text strong>名称：</Text>{selectedSecret.name}</Text>
            <Text><Text strong>类型：</Text>{SECRET_TYPES[selectedSecret.secret_type]?.label}</Text>

            {(() => {
              try {
                const data = JSON.parse(selectedSecret.encrypted_data);
                return Object.entries(data).map(([key, value]) => (
                  value ? (
                    <div key={key} className="detail-row">
                      <span className="detail-key">{key}</span>
                      <Space style={{ width: '100%' }} align="start">
                        <pre className="detail-value">
                          {typeof value === 'string' && value.length > 500 ? `${value.substring(0, 500)}...` : String(value)}
                        </pre>
                        <Button icon={<CopyOutlined />} onClick={() => copyToClipboard(String(value))} />
                      </Space>
                    </div>
                  ) : null
                ));
              } catch {
                return <Text type="danger">无法解析数据</Text>;
              }
            })()}

            {selectedSecret.note && <Text><Text strong>备注：</Text>{selectedSecret.note}</Text>}
          </Space>
        )}
      </Modal>
    </div>
  );
};

export default Home;
