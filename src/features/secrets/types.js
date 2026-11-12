export const secretTypes = {
  apikey: { label: 'API Key', fields: ['provider', 'key', 'apiUrl'] },
  password: { label: 'Password', fields: ['url', 'username', 'password'] },
  database: {
    label: 'Database',
    fields: ['type', 'host', 'port', 'username', 'password', 'database', 'connectionUrl']
  },
  ssh: { label: 'SSH Key', fields: ['username', 'host', 'privateKey', 'publicKey', 'passphrase'] },
  config_file: { label: 'Configuration', fields: ['fileName', 'mimeType', 'contentBase64'] },
  custom: { label: 'Custom Secret', fields: ['content'] },
  long_text: { label: 'Long Text（兼容）', fields: ['content'] }
};
export const labels = {
  provider: 'Provider',
  key: 'API Key',
  apiUrl: 'Base URL',
  url: 'URL',
  username: 'Username',
  password: 'Password',
  type: 'Database Type',
  host: 'Host',
  port: 'Port',
  database: 'Database',
  connectionUrl: 'Connection URL',
  privateKey: 'Private Key',
  publicKey: 'Public Key',
  passphrase: 'Passphrase',
  content: '内容',
  fileName: '文件名',
  mimeType: 'MIME 类型',
  contentBase64: '文件内容 (Base64)',
  size: '文件大小'
};
