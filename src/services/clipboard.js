const targets = {
  apikey: ['key', 'API Key'],
  password: ['password', '密码'],
  database: ['password', '数据库密码'],
  ssh: ['privateKey', 'SSH 私钥'],
  config_file: ['contentBase64', '配置内容'],
  custom: ['content', '内容'],
  long_text: ['content', '内容']
};
export const quickCopyLabel = (type) => targets[type]?.[1] || '内容';
export const quickCopyValue = (row) => {
  const [field, label] = targets[row.secret_type] || ['content', '内容'];
  const value = row.data?.[field];
  if (value === undefined || value === null || value === '') throw new Error(`未填写${label}`);
  if (row.secret_type !== 'config_file') return String(value);
  try {
    const bytes = Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (text.includes('\0')) throw new Error('binary');
    return text;
  } catch {
    throw new Error('此配置不是 UTF-8 文本，请下载原文件');
  }
};
export const writeClipboard = async (
  getText,
  {
    clipboard = globalThis.navigator?.clipboard,
    ClipboardItemClass = globalThis.ClipboardItem
  } = {}
) => {
  if (!clipboard) throw new Error('无法访问剪贴板，请通过 HTTPS 打开');
  if (clipboard.write && typeof ClipboardItemClass === 'function') {
    // Initiate the native write within the click gesture, before awaiting authentication/network.
    const content = Promise.resolve()
      .then(getText)
      .then((text) => new Blob([text], { type: 'text/plain' }));
    content.catch(() => {});
    await clipboard.write([new ClipboardItemClass({ 'text/plain': content })]);
  } else {
    await clipboard.writeText(await getText());
  }
};
