import React, { useEffect, useRef, useState } from 'react';
import { Button, Select, Table, Tag, Spin, message } from 'antd';
import {
  PlusOutlined,
  KeyOutlined,
  EyeOutlined,
  EyeInvisibleOutlined,
  CopyOutlined,
  EditOutlined,
  DeleteOutlined,
  CloseOutlined,
  LockOutlined,
  DownloadOutlined
} from '@ant-design/icons';
import { useResource } from '../../hooks/useResource';
import { request, mutate } from '../../services/api';
import { quickCopyLabel, quickCopyValue, writeClipboard } from '../../services/clipboard';
import {
  EmptyState,
  ErrorState,
  Favorite,
  confirmAction,
  formatDate
} from '../../components/Common';
import { secretTypes, labels } from './types';
import SecretEditor from './SecretEditor';
export default function SecretsPage({ query, focusId }) {
  const [type, setType] = useState('');
  const [tag, setTag] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [plaintext, setPlaintext] = useState(null);
  const [editor, setEditor] = useState(null);
  const [busy, setBusy] = useState(false);
  const [copyingId, setCopyingId] = useState(null);
  const copyOperation = useRef(null);
  const source = useResource('secrets', { query, type, tag, offset: (page - 1) * 50, limit: 50 });
  const generation = useRef(0);
  const timer = useRef(null);
  const selectedRef = useRef(null);
  const clear = () => {
    copyOperation.current?.abort();
    generation.current++;
    clearTimeout(timer.current);
    setPlaintext(null);
    setBusy(false);
  };
  const select = (row) => {
    clear();
    setSelected(row);
    selectedRef.current = row?.id;
  };
  useEffect(() => {
    setPage(1);
  }, [query, type, tag]);
  useEffect(() => {
    if (focusId) {
      let active = true;
      request(`/secrets/${focusId}/metadata`)
        .then((row) => {
          if (active) select(row);
        })
        .catch((e) => message.error(e.message));
      return () => {
        active = false;
      };
    }
  }, [focusId]);
  useEffect(() => {
    const create = () => {
      clear();
      setEditor({ secret_type: 'apikey', data: {} });
    };
    window.addEventListener('vault:new', create);
    return () => {
      generation.current++;
      copyOperation.current?.abort();
      clearTimeout(timer.current);
      window.removeEventListener('vault:new', create);
    };
  }, []);
  const detail = async () => {
    if (!selected) return null;
    const id = selected.id;
    const current = ++generation.current;
    setBusy(true);
    try {
      const row = await request(`/secrets/${id}`);
      if (current !== generation.current || selectedRef.current !== id) return null;
      return row;
    } catch (e) {
      message.error(e.message);
      return null;
    } finally {
      if (current === generation.current) setBusy(false);
    }
  };
  const reveal = async () => {
    const row = await detail();
    if (row) {
      setPlaintext(row);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setPlaintext(null), 30000);
    }
  };
  const copy = async (field) => {
    try {
      const row = plaintext || (await detail());
      if (row) {
        await navigator.clipboard.writeText(
          String(field === 'note' ? row.note : (row.data?.[field] ?? ''))
        );
        message.success('已复制');
      }
    } catch {
      message.error('无法访问剪贴板，请通过 HTTPS 打开');
    }
  };
  const quickCopy = async (metadata) => {
    if (copyOperation.current) return;
    const controller = new AbortController();
    copyOperation.current = controller;
    const current = ++generation.current;
    setBusy(false);
    setCopyingId(metadata.id);
    try {
      await writeClipboard(async () => {
        const row = await request(`/secrets/${metadata.id}`, { signal: controller.signal });
        if (controller.signal.aborted || current !== generation.current)
          throw new DOMException('取消复制', 'AbortError');
        return quickCopyValue(row);
      });
      if (!controller.signal.aborted && current === generation.current) message.success('已复制');
    } catch (error) {
      if (!controller.signal.aborted && error.name !== 'AbortError')
        message.error(
          error.name === 'NotAllowedError' ? '剪贴板访问被拒绝，请允许权限并重试' : error.message
        );
    } finally {
      if (copyOperation.current === controller) {
        copyOperation.current = null;
        setCopyingId(null);
      }
    }
  };
  const edit = async () => {
    const row = await detail();
    if (row) {
      clear();
      setEditor(structuredClone(row));
    }
  };
  const favorite = async (row) => {
    try {
      const updated = await mutate(
        `/secrets/${row.id}/favorite`,
        { favorite: !row.favorite },
        'PATCH'
      );
      if (selected?.id === row.id) setSelected(updated);
      source.reload();
    } catch (e) {
      message.error(e.message);
    }
  };
  const tags = [...new Set(source.items.flatMap((r) => r.tags))];
  const remove = () =>
    confirmAction('删除这条密钥？', async () => {
      await mutate(`/secrets/${selected.id}`, undefined, 'DELETE');
      select(null);
      source.reload();
    });
  const downloadLegacy = () => {
    if (!plaintext?.data?.contentBase64) return;
    try {
      const bytes = Uint8Array.from(atob(plaintext.data.contentBase64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = plaintext.data.fileName || 'configuration';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      message.error('文件内容无效');
    }
  };
  return (
    <>
      <div className="module-toolbar">
        <div className="toolbar-group">
          <Select
            aria-label="密钥类型筛选"
            value={type}
            onChange={setType}
            style={{ width: 155 }}
            options={[
              { value: '', label: '全部类型' },
              ...Object.entries(secretTypes).map(([value, t]) => ({ value, label: t.label }))
            ]}
          />
          <Select
            aria-label="标签筛选"
            value={tag}
            onChange={setTag}
            style={{ width: 130 }}
            options={[
              { value: '', label: '全部标签' },
              ...tags.map((value) => ({ value, label: value }))
            ]}
          />
          <span className="result-count">{source.total} 条记录</span>
        </div>
        <Button
          aria-label="添加密钥"
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => {
            clear();
            setEditor({ secret_type: 'apikey', data: {} });
          }}
        >
          添加密钥
        </Button>
      </div>
      <ErrorState error={source.error} retry={source.reload} />
      <div className={`content-with-detail ${selected ? 'has-detail' : ''}`}>
        <section className="surface list-surface">
          <Table
            size="small"
            rowKey="id"
            loading={source.loading}
            dataSource={source.items}
            pagination={{
              current: page,
              pageSize: 50,
              total: source.total,
              onChange: setPage,
              showSizeChanger: false
            }}
            locale={{
              emptyText: (
                <EmptyState
                  title="为重要凭据留一个安全位置"
                  description="密钥与备注加密存储，列表仅显示名称和分类。"
                  action={
                    <Button
                      icon={<PlusOutlined />}
                      onClick={() => setEditor({ secret_type: 'apikey', data: {} })}
                    >
                      添加第一条密钥
                    </Button>
                  }
                />
              )
            }}
            onRow={(row) => ({
              onClick: () => select(row),
              className: selected?.id === row.id ? 'selected-row' : ''
            })}
            columns={[
              {
                title: '名称',
                render: (_, row) => (
                  <div className="name-cell">
                    <span className="item-icon secret-icon">
                      <KeyOutlined />
                    </span>
                    <button
                      aria-label={`查看 ${row.name}`}
                      className="text-button"
                      onClick={() => select(row)}
                    >
                      {row.name}
                      <small>{secretTypes[row.secret_type]?.label || row.secret_type}</small>
                    </button>
                  </div>
                )
              },
              {
                title: '标签',
                width: 140,
                responsive: ['lg'],
                render: (_, row) => (
                  <div className="tags">
                    {row.tags.slice(0, 2).map((t) => (
                      <Tag key={t}>{t}</Tag>
                    ))}
                  </div>
                )
              },
              {
                title: '环境',
                dataIndex: 'environment',
                width: 110,
                responsive: ['md'],
                render: (v) =>
                  v ? <Tag className="environment-tag">{v}</Tag> : <span className="muted">—</span>
              },
              {
                title: '更新',
                dataIndex: 'updated_at',
                width: 120,
                responsive: ['xl'],
                render: formatDate
              },
              {
                title: '',
                width: 44,
                render: (_, row) => (
                  <Button
                    type="text"
                    icon={<CopyOutlined />}
                    aria-label={`复制 ${row.name} 的${quickCopyLabel(row.secret_type)}`}
                    title={`复制${quickCopyLabel(row.secret_type)}`}
                    loading={copyingId === row.id}
                    disabled={copyingId !== null && copyingId !== row.id}
                    onClick={(event) => {
                      event.stopPropagation();
                      quickCopy(row);
                    }}
                  />
                )
              },
              {
                title: '',
                width: 48,
                render: (_, row) => <Favorite value={row.favorite} onClick={() => favorite(row)} />
              }
            ]}
          />
          <div className="list-footnote">
            <LockOutlined /> 内容按需解密 · 显示 30 秒后自动隐藏
          </div>
        </section>
        {selected && (
          <aside className="surface detail-panel" aria-label="密钥详情">
            <div className="detail-topline">
              <span>密钥详情</span>
              <Button
                type="text"
                icon={<CloseOutlined />}
                aria-label="关闭详情"
                onClick={() => select(null)}
              />
            </div>
            <div className="detail-hero">
              <div className="large-item-icon secret-icon">
                <KeyOutlined />
              </div>
              <h2>{selected.name}</h2>
              <Tag>{secretTypes[selected.secret_type]?.label}</Tag>
            </div>
            <div className="detail-meta-grid">
              <span>环境</span>
              <span>{selected.environment || '未设置'}</span>
              <span>更新时间</span>
              <span>{formatDate(selected.updated_at)}</span>
              <span>标签</span>
              <span>
                {selected.tags.map((t) => (
                  <Tag key={t}>{t}</Tag>
                ))}
              </span>
            </div>
            <div className="sensitive-section">
              <div className="section-label">
                ENCRYPTED CONTENT <LockOutlined />
              </div>
              {busy ? (
                <Spin />
              ) : plaintext ? (
                <>
                  <div className="reveal-warning">30 秒后自动隐藏</div>
                  {Object.entries(plaintext.data || {})
                    .filter(([k]) => k !== 'contentBase64')
                    .map(([key, value]) => (
                      <div className="secret-field" key={key}>
                        <label>{labels[key] || key}</label>
                        <div>
                          <pre>{String(value)}</pre>
                          <Button
                            type="text"
                            size="small"
                            icon={<CopyOutlined />}
                            aria-label={`复制 ${labels[key] || key}`}
                            onClick={() => copy(key)}
                          />
                        </div>
                      </div>
                    ))}
                  {plaintext.note && (
                    <div className="secret-field">
                      <label>加密备注</label>
                      <pre>{plaintext.note}</pre>
                    </div>
                  )}
                  {plaintext.data?.contentBase64 && (
                    <Button icon={<DownloadOutlined />} onClick={downloadLegacy}>
                      下载原配置文件
                    </Button>
                  )}
                  <Button
                    aria-label="立即隐藏"
                    block
                    icon={<EyeInvisibleOutlined />}
                    onClick={clear}
                  >
                    立即隐藏
                  </Button>
                </>
              ) : (
                <div className="secret-locked">
                  <div className="masked-value">•••• •••• •••• ••••</div>
                  <p>敏感内容尚未加载</p>
                  <div className="quick-copy-actions">
                    <Button
                      aria-label={`复制${quickCopyLabel(selected.secret_type)}`}
                      type="primary"
                      icon={<CopyOutlined />}
                      loading={copyingId === selected.id}
                      disabled={copyingId !== null && copyingId !== selected.id}
                      onClick={() => quickCopy(selected)}
                    >
                      复制{quickCopyLabel(selected.secret_type)}
                    </Button>
                    <Button
                      aria-label="显示内容"
                      icon={<EyeOutlined />}
                      onClick={reveal}
                      disabled={copyingId !== null}
                    >
                      显示内容
                    </Button>
                  </div>
                </div>
              )}
            </div>
            <div className="detail-actions">
              <Button icon={<EditOutlined />} onClick={edit}>
                编辑密钥
              </Button>
              <Button danger icon={<DeleteOutlined />} onClick={remove}>
                删除
              </Button>
            </div>
          </aside>
        )}
      </div>
      {editor && (
        <SecretEditor
          key={editor.id || 'new'}
          snapshot={editor}
          onClose={() => setEditor(null)}
          onSaved={(row) => {
            source.reload();
            clear();
            setSelected(row);
            selectedRef.current = row.id;
          }}
        />
      )}
    </>
  );
}
