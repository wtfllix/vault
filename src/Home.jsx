import React, { useState, useEffect } from 'react';
import { 
  Card, Button, Table, Tag, Modal, Form, Input, Select,
  Space, Popconfirm, message, Typography, Tabs
} from 'antd';
import { 
  PlusOutlined, DeleteOutlined, CopyOutlined, 
  LogoutOutlined, EyeOutlined, KeyOutlined,
  UserOutlined, DatabaseOutlined, FileTextOutlined
} from '@ant-design/icons';
import { invoke } from '@tauri-apps/api/core';

const { Title } = Typography;
const { Option } = Select;
const { TabPane } = Tabs;

const SECRET_TYPES = {
  apikey: { label: 'API Key', icon: <KeyOutlined />, fields: ['key'] },
  password: { label: '账号密码', icon: <UserOutlined />, fields: ['url', 'username', 'password'] },
  database: { label: '数据库', icon: <DatabaseOutlined />, fields: ['type', 'host', 'port', 'username', 'password', 'database'] },
  ssh: { label: 'SSH 密钥', icon: <KeyOutlined />, fields: ['privateKey', 'publicKey', 'passphrase'] },
  custom: { label: '自定义', icon: <FileTextOutlined />, fields: ['content'] },
};

const Home = ({ dbPath, onLogout }) => {
  const [secrets, setSecrets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [selectedSecret, setSelectedSecret] = useState(null);
  const [secretType, setSecretType] = useState('apikey');
  const [form] = Form.useForm();

  const fetchSecrets = async () => {
    setLoading(true);
    try {
      const data = await invoke('get_secrets');
      setSecrets(data);
    } catch (error) {
      message.error('获取数据失败: ' + error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSecrets();
  }, []);

  const handleAdd = async (values) => {
    try {
      const data = {};
      // 根据类型收集数据
      const fields = SECRET_TYPES[secretType].fields;
      fields.forEach(field => {
        data[field] = values[field] || '';
      });

      await invoke('add_secret', {
        secret: {
          secret_type: secretType,
          name: values.name,
          data: data,
          note: values.note || ''
        }
      });

      message.success('添加成功');
      setModalVisible(false);
      form.resetFields();
      fetchSecrets();
    } catch (error) {
      message.error('添加失败: ' + error);
    }
  };

  const handleDelete = async (id) => {
    try {
      await invoke('delete_secret', { id });
      message.success('删除成功');
      fetchSecrets();
    } catch (error) {
      message.error('删除失败: ' + error);
    }
  };

  const handleView = async (record) => {
    try {
      const data = await invoke('get_secret_detail', { id: record.id });
      setSelectedSecret(data);
      setDetailVisible(true);
    } catch (error) {
      message.error('获取详情失败: ' + error);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      message.success('已复制到剪贴板');
    });
  };

  const renderSecretValue = (record) => {
    try {
      const data = JSON.parse(record.encrypted_data);
      switch (record.secret_type) {
        case 'apikey':
          return data.key ? `${data.key.substring(0, 8)}****` : '***';
        case 'password':
          return data.username ? `${data.username} / ****` : '****';
        case 'database':
          return `${data.host}:${data.port}`;
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
      width: 120,
      render: (type) => (
        <Tag icon={SECRET_TYPES[type]?.icon}>
          {SECRET_TYPES[type]?.label || type}
        </Tag>
      ),
    },
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '内容预览',
      key: 'preview',
      render: (_, record) => <code>{renderSecretValue(record)}</code>,
    },
    {
      title: '备注',
      dataIndex: 'note',
      key: 'note',
      ellipsis: true,
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      render: (_, record) => (
        <Space>
          <Button 
            icon={<EyeOutlined />} 
            onClick={() => handleView(record)}
            size="small"
          >
            查看
          </Button>
          <Popconfirm
            title="确定删除？"
            onConfirm={() => handleDelete(record.id)}
          >
            <Button 
              icon={<DeleteOutlined />} 
              danger
              size="small"
            >
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const renderFormFields = () => {
    const fields = SECRET_TYPES[secretType].fields;
    
    return fields.map(field => {
      switch (field) {
        case 'key':
          return (
            <Form.Item key={field} name={field} label="API Key" rules={[{ required: true }]}>
              <Input.TextArea rows={3} placeholder="输入 API Key" />
            </Form.Item>
          );
        case 'url':
          return (
            <Form.Item key={field} name={field} label="网址">
              <Input placeholder="https://..." />
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
              <Input.Password placeholder="如果有的话" />
            </Form.Item>
          );
        case 'content':
          return (
            <Form.Item key={field} name={field} label="内容" rules={[{ required: true }]}>
              <Input.TextArea rows={4} placeholder="输入任意内容" />
            </Form.Item>
          );
        default:
          return null;
      }
    });
  };

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <Title level={4} style={{ margin: 0 }}>API Key 保险箱</Title>
            <div style={{ color: '#999', fontSize: 12 }}>{dbPath}</div>
          </div>
          <Button icon={<LogoutOutlined />} onClick={onLogout}>
            退出
          </Button>
        </div>

        <Space style={{ marginBottom: 16 }}>
          <Button 
            type="primary" 
            icon={<PlusOutlined />}
            onClick={() => setModalVisible(true)}
          >
            添加密钥
          </Button>
        </Space>

        <Table 
          columns={columns} 
          dataSource={secrets} 
          rowKey="id"
          loading={loading}
          pagination={false}
        />
      </Card>

      {/* 添加密钥弹窗 */}
      <Modal
        title="添加密钥"
        open={modalVisible}
        onCancel={() => {
          setModalVisible(false);
          form.resetFields();
        }}
        onOk={() => form.submit()}
        width={600}
      >
        <Form form={form} onFinish={handleAdd} layout="vertical">
          <Form.Item name="name" label="名称" rules={[{ required: true }]}>
            <Input placeholder="给这个密钥起个名字" />
          </Form.Item>

          <Form.Item label="类型">
            <Select value={secretType} onChange={setSecretType}>
              {Object.entries(SECRET_TYPES).map(([key, { label, icon }]) => (
                <Option key={key} value={key}>
                  <Space>{icon} {label}</Space>
                </Option>
              ))}
            </Select>
          </Form.Item>

          {renderFormFields()}

          <Form.Item name="note" label="备注">
            <Input.TextArea rows={2} placeholder="可选备注" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 查看详情弹窗 */}
      <Modal
        title="密钥详情"
        open={detailVisible}
        onCancel={() => setDetailVisible(false)}
        footer={null}
        width={600}
      >
        {selectedSecret && (
          <div>
            <p><strong>名称：</strong>{selectedSecret.name}</p>
            <p><strong>类型：</strong>{SECRET_TYPES[selectedSecret.secret_type]?.label}</p>
            
            {(() => {
              try {
                const data = JSON.parse(selectedSecret.encrypted_data);
                return (
                  <div>
                    {Object.entries(data).map(([key, value]) => (
                      value && (
                        <div key={key} style={{ marginBottom: 12 }}>
                          <strong>{key}：</strong>
                          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                            <code style={{ 
                              flex: 1,
                              padding: 8, 
                              background: '#f5f5f5',
                              wordBreak: 'break-all',
                              fontSize: 12
                            }}>
                              {typeof value === 'string' && value.length > 100 
                                ? value.substring(0, 100) + '...' 
                                : value}
                            </code>
                            <Button 
                              icon={<CopyOutlined />}
                              onClick={() => copyToClipboard(String(value))}
                              size="small"
                            />
                          </div>
                        </div>
                      )
                    ))}
                  </div>
                );
              } catch {
                return <p>无法解析数据</p>;
              }
            })()}
            
            {selectedSecret.note && (
              <p><strong>备注：</strong>{selectedSecret.note}</p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default Home;
