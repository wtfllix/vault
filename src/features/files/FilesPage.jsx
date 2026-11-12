import React, { useEffect, useRef, useState } from 'react';
import { Breadcrumb, Button, Dropdown, Modal, Progress, Select, Spin, Table, message } from 'antd';
import {
  UploadOutlined,
  FolderAddOutlined,
  FolderOutlined,
  FileOutlined,
  FileTextOutlined,
  PictureOutlined,
  AppstoreOutlined,
  BarsOutlined,
  SortAscendingOutlined,
  MoreOutlined,
  DownloadOutlined,
  EditOutlined,
  DeleteOutlined,
  CloseOutlined,
  SwapOutlined,
  EyeOutlined,
  CloudUploadOutlined,
  ArrowLeftOutlined
} from '@ant-design/icons';
import { useResource, useDetail } from '../../hooks/useResource';
import { request, mutate, upload, downloadUrl } from '../../services/api';
import {
  EmptyState,
  ErrorState,
  Favorite,
  RenameDialog,
  confirmAction,
  formatBytes,
  formatDate
} from '../../components/Common';
const icon = (row) =>
  row.is_folder ? (
    <FolderOutlined />
  ) : row.mime_type?.startsWith('image/') ? (
    <PictureOutlined />
  ) : /text|json/.test(row.mime_type) ? (
    <FileTextOutlined />
  ) : (
    <FileOutlined />
  );
export default function FilesPage({ query, focusId }) {
  const [folder, setFolder] = useState(null);
  const [selected, setSelected] = useState(null);
  const [sort, setSort] = useState('updated_at');
  const [order, setOrder] = useState('desc');
  const [grid, setGrid] = useState(false);
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState(null);
  const [moving, setMoving] = useState(false);
  const [target, setTarget] = useState(null);
  const [moveBusy, setMoveBusy] = useState(false);
  const [queue, setQueue] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const input = useRef(null);
  const uploadGuard = useRef(false);
  const generation = useRef(0);
  const mounted = useRef(true);
  const source = useResource('files', {
    parent_id: folder,
    query,
    sort,
    order,
    offset: (page - 1) * 50,
    limit: 50
  });
  const currentFolder = useDetail('files', folder);
  const detail = useDetail('files', selected);
  const folders = useResource('files', { folders: true, limit: 200 });
  const select = (id) => {
    generation.current++;
    setPreview(null);
    setPreviewBusy(false);
    setSelected(id);
  };
  const openFolder = (id) => {
    select(null);
    setFolder(id);
    setPage(1);
  };
  useEffect(() => {
    setPage(1);
  }, [query, sort, order]);
  useEffect(() => {
    if (!focusId) return;
    let active = true;
    request(`/files/${focusId}`)
      .then((row) => {
        if (!active) return;
        if (row.is_folder) openFolder(row.id);
        else {
          setFolder(row.parent_id);
          select(row.id);
        }
      })
      .catch((e) => message.error(e.message));
    return () => {
      active = false;
    };
  }, [focusId]);
  useEffect(() => {
    mounted.current = true;
    const choose = () => input.current?.click();
    const create = () => setDialog({ kind: 'folder' });
    window.addEventListener('vault:upload', choose);
    window.addEventListener('vault:new', create);
    return () => {
      mounted.current = false;
      generation.current++;
      window.removeEventListener('vault:upload', choose);
      window.removeEventListener('vault:new', create);
    };
  }, []);
  const updateQueue = (id, change) => {
    if (mounted.current)
      setQueue((rows) => rows.map((row) => (row.id === id ? { ...row, ...change } : row)));
  };
  const uploadFiles = async (files) => {
    if (uploadGuard.current) {
      message.info('请等待当前上传完成');
      return;
    }
    const entries = Array.from(files).map((file) => ({
      id: crypto.randomUUID(),
      file,
      parentId: folder,
      progress: 0,
      status: 'pending'
    }));
    setQueue((rows) => [...rows, ...entries]);
    uploadGuard.current = true;
    try {
      for (const entry of entries) await sendUpload(entry);
    } finally {
      uploadGuard.current = false;
    }
  };
  const sendUpload = async (entry) => {
    updateQueue(entry.id, { status: 'uploading', error: '' });
    try {
      const max = await request('/storage');
      if (entry.file.size > max.maxFileSize)
        throw new Error(`文件超过 ${formatBytes(max.maxFileSize)} 限制`);
      const digest = await crypto.subtle.digest('SHA-256', await entry.file.arrayBuffer());
      const hash = Array.from(new Uint8Array(digest), (n) => n.toString(16).padStart(2, '0')).join(
        ''
      );
      await upload(entry.file, entry.parentId, (p) => updateQueue(entry.id, { progress: p }), hash);
      updateQueue(entry.id, { status: 'done', progress: 100 });
      source.reload();
      folders.reload();
      window.dispatchEvent(new Event('vault:storage'));
    } catch (e) {
      updateQueue(entry.id, { status: 'failed', error: e.message });
    }
  };
  const retry = async (entry) => {
    if (uploadGuard.current) return;
    uploadGuard.current = true;
    try {
      await sendUpload(entry);
    } finally {
      uploadGuard.current = false;
    }
  };
  const favorite = async (row) => {
    try {
      await mutate(`/files/${row.id}`, { favorite: !row.favorite }, 'PATCH');
      source.reload();
      if (selected === row.id) detail.reload();
    } catch (e) {
      message.error(e.message);
    }
  };
  const remove = (row) =>
    confirmAction(`将“${row.name}”移入回收站？`, async () => {
      await mutate(`/files/${row.id}`, undefined, 'DELETE');
      if (selected === row.id) select(null);
      source.reload();
      folders.reload();
      window.dispatchEvent(new Event('vault:storage'));
    });
  const showPreview = async () => {
    const current = ++generation.current;
    setPreviewBusy(true);
    try {
      const data = await request(`/files/${selected}/preview`);
      if (current === generation.current) setPreview(data);
    } catch (e) {
      message.error(e.message);
    } finally {
      if (current === generation.current) setPreviewBusy(false);
    }
  };
  const actions = (row) => [
    { key: 'details', label: '查看详情', icon: <EyeOutlined />, onClick: () => select(row.id) },
    ...(row.is_folder
      ? []
      : [
          {
            key: 'download',
            label: '下载',
            icon: <DownloadOutlined />,
            onClick: () => {
              location.href = downloadUrl(row.id);
            }
          }
        ]),
    {
      key: 'rename',
      label: '重命名',
      icon: <EditOutlined />,
      onClick: () => setDialog({ kind: 'rename', row })
    },
    {
      key: 'move',
      label: '移动到',
      icon: <SwapOutlined />,
      onClick: () => {
        select(row.id);
        setTarget(row.parent_id);
        setMoving(true);
      }
    },
    { type: 'divider' },
    {
      key: 'delete',
      label: '移入回收站',
      icon: <DeleteOutlined />,
      danger: true,
      onClick: () => remove(row)
    }
  ];
  const rowOpen = (row) => (row.is_folder ? openFolder(row.id) : select(row.id));
  const f = detail.data;
  return (
    <>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          uploadFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <div className="module-toolbar">
        <div className="toolbar-group file-path">
          {folder && (
            <Button
              type="text"
              icon={<ArrowLeftOutlined />}
              aria-label="返回上级"
              onClick={() => openFolder(currentFolder.data?.parent_id || null)}
            />
          )}
          <Breadcrumb
            items={[
              {
                title: (
                  <button className="text-button" onClick={() => openFolder(null)}>
                    所有文件
                  </button>
                )
              },
              ...(currentFolder.data?.path || []).map((p) => ({
                title: (
                  <button className="text-button" onClick={() => openFolder(p.id)}>
                    {p.name}
                  </button>
                )
              }))
            ]}
          />
        </div>
        <div className="toolbar-group">
          <Button
            type="text"
            className="view-toggle"
            aria-label={grid ? '切换列表' : '切换网格'}
            icon={grid ? <BarsOutlined /> : <AppstoreOutlined />}
            onClick={() => setGrid((v) => !v)}
          />
          <Dropdown
            menu={{
              items: [
                { key: 'name', label: '按名称' },
                { key: 'updated_at', label: '按修改时间' },
                { key: 'size', label: '按大小' },
                { type: 'divider' },
                { key: 'direction', label: order === 'asc' ? '改为降序' : '改为升序' }
              ],
              onClick: ({ key }) =>
                key === 'direction' ? setOrder((v) => (v === 'asc' ? 'desc' : 'asc')) : setSort(key)
            }}
          >
            <Button type="text" icon={<SortAscendingOutlined />} aria-label="排序" />
          </Dropdown>
          <Button icon={<FolderAddOutlined />} onClick={() => setDialog({ kind: 'folder' })}>
            <span className="desktop-label">新建文件夹</span>
          </Button>
          <Button type="primary" icon={<UploadOutlined />} onClick={() => input.current?.click()}>
            上传<span className="desktop-label">文件</span>
          </Button>
        </div>
      </div>
      <ErrorState error={source.error} retry={source.reload} />
      <div className={`content-with-detail ${selected ? 'has-detail' : ''}`}>
        <div className="files-list-column">
          <section
            className={`surface list-surface file-drop-area ${dragging ? 'dragging' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              uploadFiles(e.dataTransfer.files);
            }}
          >
            {dragging && (
              <div className="drop-overlay">
                <CloudUploadOutlined />
                <h2>放开即可上传</h2>
                <p>文件保存在你的私人服务器</p>
              </div>
            )}
            {grid ? (
              <div className="file-grid">
                {source.items.map((row) => (
                  <article
                    key={row.id}
                    className={`file-card ${row.id === selected ? 'selected' : ''}`}
                  >
                    <button className="file-card-main" onClick={() => rowOpen(row)}>
                      <span className={`large-item-icon ${row.is_folder ? 'folder-icon' : ''}`}>
                        {icon(row)}
                      </span>
                      <strong>{row.name}</strong>
                      <small>{row.is_folder ? '文件夹' : formatBytes(row.size)}</small>
                    </button>
                    <div className="file-card-actions">
                      <Favorite value={row.favorite} onClick={() => favorite(row)} />
                      <Dropdown menu={{ items: actions(row) }} trigger={['click']}>
                        <Button
                          type="text"
                          icon={<MoreOutlined />}
                          aria-label={`操作 ${row.name}`}
                        />
                      </Dropdown>
                    </div>
                  </article>
                ))}
                {!source.loading && !source.items.length && (
                  <EmptyState
                    title="留一点空间，放重要的文件"
                    description="拖拽文件到这里，或点击上传。重名文件会被拒绝，不会覆盖。"
                  />
                )}
                {source.loading && <Spin />}
                <div className="grid-pagination">
                  <Button disabled={page === 1} onClick={() => setPage((n) => n - 1)}>
                    上一页
                  </Button>
                  <span>{page}</span>
                  <Button
                    disabled={page * 50 >= source.total}
                    onClick={() => setPage((n) => n + 1)}
                  >
                    下一页
                  </Button>
                </div>
              </div>
            ) : (
              <Table
                rowKey="id"
                size="small"
                loading={source.loading}
                dataSource={source.items}
                pagination={{
                  current: page,
                  pageSize: 50,
                  total: source.total,
                  onChange: setPage,
                  showSizeChanger: false
                }}
                onRow={(row) => ({
                  className: selected === row.id ? 'selected-row' : '',
                  onDoubleClick: () => rowOpen(row)
                })}
                locale={{
                  emptyText: (
                    <EmptyState
                      title="留一点空间，放重要的文件"
                      description="拖拽文件到这里，或点击上传。重名文件会被拒绝，不会覆盖。"
                      action={
                        <Button icon={<UploadOutlined />} onClick={() => input.current?.click()}>
                          上传第一个文件
                        </Button>
                      }
                    />
                  )
                }}
                columns={[
                  {
                    title: '名称',
                    render: (_, row) => (
                      <div className="name-cell">
                        <span className={`item-icon ${row.is_folder ? 'folder-icon' : ''}`}>
                          {icon(row)}
                        </span>
                        <button
                          aria-label={row.name}
                          className="text-button"
                          onClick={() => rowOpen(row)}
                        >
                          {row.name}
                          <small className="mobile-file-meta">
                            {row.is_folder ? '文件夹' : formatBytes(row.size)}
                          </small>
                        </button>
                      </div>
                    )
                  },
                  {
                    title: '大小',
                    width: 100,
                    render: (_, row) => (row.is_folder ? '—' : formatBytes(row.size)),
                    responsive: ['md']
                  },
                  {
                    title: '修改时间',
                    dataIndex: 'updated_at',
                    width: 130,
                    render: formatDate,
                    responsive: ['lg']
                  },
                  {
                    title: '类型',
                    width: 100,
                    render: (_, row) =>
                      row.is_folder
                        ? 'Folder'
                        : row.name.split('.').pop()?.toUpperCase().slice(0, 10),
                    responsive: ['xl']
                  },
                  {
                    title: '',
                    width: 44,
                    render: (_, row) => (
                      <Favorite value={row.favorite} onClick={() => favorite(row)} />
                    )
                  },
                  {
                    title: '',
                    width: 40,
                    render: (_, row) => (
                      <Dropdown menu={{ items: actions(row) }} trigger={['click']}>
                        <Button
                          type="text"
                          icon={<MoreOutlined />}
                          aria-label={`操作 ${row.name}`}
                        />
                      </Dropdown>
                    )
                  }
                ]}
              />
            )}
            <div className="list-footnote">
              <span>{source.total} 个项目</span>
              <span>本地磁盘 · 私人访问</span>
            </div>
          </section>
          {queue.length > 0 && (
            <section className="surface upload-queue">
              <div className="section-label">
                传输任务
                <Button
                  type="text"
                  size="small"
                  onClick={() => setQueue((rows) => rows.filter((r) => r.status !== 'done'))}
                >
                  清除已完成
                </Button>
              </div>
              {queue.map((entry) => (
                <div className="upload-item" key={entry.id}>
                  <div>
                    <FileOutlined />
                    <span>{entry.file.name}</span>
                    <small>
                      {entry.status === 'done'
                        ? '已保存'
                        : entry.status === 'failed'
                          ? '失败'
                          : entry.progress === 100
                            ? '服务器校验中'
                            : `${entry.progress}%`}
                    </small>
                  </div>
                  <Progress
                    percent={entry.progress}
                    size="small"
                    showInfo={false}
                    status={
                      entry.status === 'failed'
                        ? 'exception'
                        : entry.status === 'done'
                          ? 'success'
                          : 'active'
                    }
                  />
                  {entry.error && (
                    <div className="upload-error">
                      <span role="alert">{entry.error}</span>
                      <Button size="small" onClick={() => retry(entry)}>
                        重试
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </section>
          )}
        </div>
        {selected && (
          <aside className="surface detail-panel file-details" aria-label="文件详情">
            <div className="detail-topline">
              <span>文件详情</span>
              <Button
                type="text"
                icon={<CloseOutlined />}
                aria-label="关闭详情"
                onClick={() => select(null)}
              />
            </div>
            <ErrorState error={detail.error} retry={detail.reload} />
            {detail.loading ? (
              <Spin />
            ) : (
              f && (
                <>
                  <div className="detail-hero">
                    <div className="large-item-icon">{icon(f)}</div>
                    <h2>{f.name}</h2>
                    <span className="muted">{f.is_folder ? '文件夹' : formatBytes(f.size)}</span>
                  </div>
                  {preview && (
                    <div className="file-preview">
                      {preview.kind === 'image' ? (
                        <img src={`data:${preview.mime};base64,${preview.content}`} alt={f.name} />
                      ) : (
                        <pre>{preview.content}</pre>
                      )}
                    </div>
                  )}
                  <div className="detail-meta-grid">
                    <span>类型</span>
                    <span>{f.mime_type}</span>
                    <span>创建时间</span>
                    <span>{formatDate(f.created_at)}</span>
                    <span>修改时间</span>
                    <span>{formatDate(f.updated_at)}</span>
                    <span>SHA-256</span>
                    <code title={f.sha256}>{f.sha256?.slice(0, 16)}…</code>
                  </div>
                  <div className="detail-actions vertical">
                    <>
                      {!f.is_folder && (
                        <>
                          <Button
                            type="primary"
                            icon={<DownloadOutlined />}
                            href={downloadUrl(f.id)}
                          >
                            下载原文件
                          </Button>
                          <Button
                            icon={<EyeOutlined />}
                            loading={previewBusy}
                            onClick={showPreview}
                          >
                            安全预览
                          </Button>
                        </>
                      )}
                    </>
                    <Button
                      icon={<EditOutlined />}
                      onClick={() => setDialog({ kind: 'rename', row: f })}
                    >
                      重命名
                    </Button>
                    <Button
                      icon={<SwapOutlined />}
                      onClick={() => {
                        setTarget(f.parent_id);
                        setMoving(true);
                      }}
                    >
                      移动到文件夹
                    </Button>
                    <Button danger icon={<DeleteOutlined />} onClick={() => remove(f)}>
                      移入回收站
                    </Button>
                  </div>
                </>
              )
            )}
          </aside>
        )}
      </div>
      <RenameDialog
        open={Boolean(dialog)}
        title={dialog?.kind === 'folder' ? '新建文件夹' : '重命名'}
        initial={dialog?.row?.name || ''}
        onClose={() => setDialog(null)}
        onSave={async (name) => {
          if (dialog.kind === 'folder') await mutate('/files/folders', { name, parent_id: folder });
          else await mutate(`/files/${dialog.row.id}`, { name }, 'PATCH');
          source.reload();
          folders.reload();
          detail.reload();
        }}
      />
      <Modal
        open={moving}
        title="移动到文件夹"
        okText="移动"
        cancelText="取消"
        confirmLoading={moveBusy}
        onCancel={() => setMoving(false)}
        onOk={async () => {
          if (moveBusy) return;
          setMoveBusy(true);
          try {
            await mutate(`/files/${selected}`, { parent_id: target }, 'PATCH');
            setMoving(false);
            select(null);
            source.reload();
            folders.reload();
          } catch (e) {
            message.error(e.message);
          } finally {
            setMoveBusy(false);
          }
        }}
      >
        <p className="muted">同名项目会阻止移动；文件夹不能移入自身或子目录。</p>
        <Select
          style={{ width: '100%' }}
          aria-label="目标文件夹"
          value={target || 'root'}
          onChange={(v) => setTarget(v === 'root' ? null : v)}
          options={[
            { value: 'root', label: '所有文件（根目录）' },
            ...folders.items
              .filter((r) => r.id !== selected)
              .map((r) => ({ value: r.id, label: r.name }))
          ]}
        />
      </Modal>
    </>
  );
}
