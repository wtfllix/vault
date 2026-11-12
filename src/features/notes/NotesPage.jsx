import React, { useEffect, useState } from 'react';
import { Button, Spin, message } from 'antd';
import { PlusOutlined, FileTextOutlined } from '@ant-design/icons';
import { useResource, useDetail } from '../../hooks/useResource';
import { mutate } from '../../services/api';
import { EmptyState, ErrorState, formatDate } from '../../components/Common';
import NoteEditor from './NoteEditor';
export default function NotesPage({ query, focusId }) {
  const [selected, setSelected] = useState(focusId || null);
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const source = useResource('notes', { query, limit: 50, offset: (page - 1) * 50 });
  const detail = useDetail('notes', selected);
  const beforeSwitch = async () => {
    const waits = [];
    window.dispatchEvent(new CustomEvent('vault:beforeNavigate', { detail: { waits } }));
    const results = await Promise.all(waits);
    return !results.includes(false) || window.confirm('保存未完成，已保留加密草稿。仍要切换吗？');
  };
  const create = async () => {
    if (creating || !(await beforeSwitch())) return;
    setCreating(true);
    try {
      const note = await mutate('/notes', {
        title: '未命名笔记',
        language: 'markdown',
        content: ''
      });
      setSelected(note.id);
      source.reload();
    } catch (e) {
      message.error(e.message);
    } finally {
      setCreating(false);
    }
  };
  useEffect(() => {
    if (focusId) setSelected(focusId);
  }, [focusId]);
  useEffect(() => {
    setPage(1);
  }, [query]);
  useEffect(() => {
    const listener = () => create();
    window.addEventListener('vault:new', listener);
    return () => window.removeEventListener('vault:new', listener);
  }, [creating]);
  return (
    <>
      <div className="module-toolbar">
        <div className="toolbar-group">
          <span className="result-count">{source.total} 篇笔记</span>
        </div>
        <Button
          aria-label="新建笔记"
          type="primary"
          icon={<PlusOutlined />}
          loading={creating}
          onClick={create}
        >
          新建笔记
        </Button>
      </div>
      <div className={`notes-layout ${selected ? 'note-open' : ''}`}>
        <aside className="surface note-list">
          <div className="note-list-header">
            <span>笔记</span>
            <FileTextOutlined />
          </div>
          <ErrorState error={source.error} retry={source.reload} />
          {source.loading && <Spin />}
          {source.items.map((note) => (
            <button
              key={note.id}
              className={`note-list-item ${selected === note.id ? 'active' : ''}`}
              onClick={async () => {
                if (selected !== note.id && (await beforeSwitch())) setSelected(note.id);
              }}
            >
              <div>
                <FileTextOutlined />
                <strong>{note.title}</strong>
              </div>
              <small>
                <span>{note.language}</span>
                <span>{formatDate(note.updated_at)}</span>
              </small>
            </button>
          ))}
          {!source.loading && !source.items.length && <EmptyState title="暂无笔记" />}
          {source.total > 50 && (
            <div className="grid-pagination">
              <Button size="small" disabled={page === 1} onClick={() => setPage((n) => n - 1)}>
                上一页
              </Button>
              <span>{page}</span>
              <Button
                size="small"
                disabled={page * 50 >= source.total}
                onClick={() => setPage((n) => n + 1)}
              >
                下一页
              </Button>
            </div>
          )}
        </aside>
        {selected ? (
          <>
            <ErrorState error={detail.error} retry={detail.reload} />
            {detail.loading ? (
              <div className="surface editor-loading">
                <Spin />
              </div>
            ) : (
              detail.data && (
                <NoteEditor
                  key={selected}
                  note={detail.data}
                  onSaved={source.reload}
                  onClose={() => setSelected(null)}
                  onDeleted={() => {
                    setSelected(null);
                    source.reload();
                  }}
                />
              )
            )}
          </>
        ) : (
          <div className="surface notes-welcome">
            <FileTextOutlined />
            <h2>选择笔记</h2>
            <Button icon={<PlusOutlined />} onClick={create}>
              创建笔记
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
