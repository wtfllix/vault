import React, { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Button, Input, Segmented, Select, message } from 'antd';
import {
  SaveOutlined,
  DeleteOutlined,
  ArrowLeftOutlined,
  CopyOutlined,
  ReloadOutlined
} from '@ant-design/icons';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
const CodeEditor = lazy(() => import('./CodeEditor'));
import { request, mutate } from '../../services/api';
import { loadDraft, saveDraft, removeDraft } from '../../services/drafts';
import { Favorite, confirmAction } from '../../components/Common';
const fingerprint = (v) => JSON.stringify([v.title, v.language, v.content]);
const languages = [
  { value: 'text', label: 'Plain Text' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'json', label: 'JSON' },
  { value: 'yaml', label: 'YAML' },
  { value: 'shell', label: 'Shell' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'python', label: 'Python' }
];
export default function NoteEditor({ note, onSaved, onClose, onDeleted }) {
  const [value, setValue] = useState({
    title: note.title,
    language: note.language,
    content: note.content
  });
  const [status, setStatus] = useState('Saved');
  const [error, setError] = useState('');
  const [mode, setMode] = useState('edit');
  const [recovery, setRecovery] = useState(null);
  const [favorite, setFavorite] = useState(note.favorite);
  const current = useRef(value);
  current.current = value;
  const version = useRef(note.version);
  const confirmed = useRef(fingerprint(value));
  const inFlight = useRef(null);
  const conflict = useRef(false);
  const alive = useRef(true);
  const draftTimer = useRef(null);
  const draftChain = useRef(Promise.resolve());
  const keepDraft = useCallback(async () => {
    const snapshot = { ...current.current, version: version.current };
    draftChain.current = draftChain.current
      .catch(() => {})
      .then(() => saveDraft(note.id, snapshot));
    return draftChain.current;
  }, [note.id]);
  const save = useCallback(async () => {
    if (inFlight.current) {
      await inFlight.current;
      return fingerprint(current.current) === confirmed.current
        ? true
        : conflict.current
          ? false
          : save();
    }
    if (fingerprint(current.current) === confirmed.current) return true;
    if (conflict.current) return false;
    const snapshot = { ...current.current, version: version.current };
    if (!snapshot.title.trim()) {
      if (alive.current) {
        setError('标题不能为空');
        setStatus('Save failed');
      }
      await keepDraft();
      return false;
    }
    clearTimeout(draftTimer.current);
    if (alive.current) {
      setStatus('Saving');
      setError('');
    }
    inFlight.current = (async () => {
      try {
        await keepDraft().catch(() => {});
        const result = await mutate(`/notes/${note.id}`, snapshot, 'PUT');
        version.current = result.version;
        confirmed.current = fingerprint(snapshot);
        if (fingerprint(current.current) === confirmed.current) {
          await draftChain.current;
          removeDraft(note.id);
          await mutate(`/notes/${note.id}/draft`, undefined, 'DELETE').catch(() => {});
          if (alive.current) setStatus('Saved');
        } else if (alive.current) setStatus('Unsaved');
        onSaved();
        return true;
      } catch (e) {
        if (e.status === 409) conflict.current = true;
        await keepDraft().catch(() => {});
        await mutate(
          `/notes/${note.id}/draft`,
          { ...current.current, version: version.current },
          'PUT'
        ).catch(() => {});
        if (alive.current) {
          setStatus('Save failed');
          setError(e.message);
        }
        return false;
      } finally {
        inFlight.current = null;
      }
    })();
    const success = await inFlight.current;
    if (success && fingerprint(current.current) !== confirmed.current) return save();
    return success;
  }, [note.id, keepDraft, onSaved]);
  useEffect(() => {
    alive.current = true;
    (async () => {
      const draft =
        (await loadDraft(note.id)) || (await request(`/notes/${note.id}/draft`).catch(() => null));
      if (alive.current && draft && fingerprint(draft) !== confirmed.current) setRecovery(draft);
    })();
    const saveEvent = () => save();
    const beforeNavigate = (e) => {
      e.detail.waits.push(save());
    };
    const unload = (e) => {
      if (fingerprint(current.current) !== confirmed.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('vault:save', saveEvent);
    window.addEventListener('vault:beforeNavigate', beforeNavigate);
    window.addEventListener('beforeunload', unload);
    return () => {
      alive.current = false;
      clearTimeout(draftTimer.current);
      window.removeEventListener('vault:save', saveEvent);
      window.removeEventListener('vault:beforeNavigate', beforeNavigate);
      window.removeEventListener('beforeunload', unload);
    };
  }, [note.id, save]);
  useEffect(() => {
    if (fingerprint(value) === confirmed.current) return;
    setStatus(conflict.current ? 'Save failed' : 'Unsaved');
    clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(
      () =>
        keepDraft().catch(() => {
          if (alive.current) setError('草稿备份失败，请保持页面打开并重试保存');
        }),
      200
    );
    const timer = setTimeout(() => save(), 1000);
    return () => clearTimeout(timer);
  }, [value, save, keepDraft]);
  const change = (patch) => {
    setValue((v) => ({ ...v, ...patch }));
  };
  const copyAsNew = async () => {
    try {
      await mutate('/notes', {
        ...current.current,
        title: `${current.current.title}（副本）`.slice(0, 255)
      });
      conflict.current = false;
      confirmed.current = fingerprint(current.current);
      removeDraft(note.id);
      onSaved();
      onClose();
      message.success('已另存为新笔记');
    } catch (e) {
      message.error(e.message);
    }
  };
  const preview =
    value.language === 'markdown'
      ? DOMPurify.sanitize(marked.parse(value.content, { breaks: true, gfm: true }), {
          USE_PROFILES: { html: true },
          FORBID_TAGS: ['img', 'video', 'audio', 'iframe', 'form', 'style', 'input'],
          FORBID_ATTR: ['style', 'target']
        })
      : '';
  return (
    <section className="surface note-editor-panel">
      <div className="note-editor-top">
        <Button
          className="note-back"
          type="text"
          icon={<ArrowLeftOutlined />}
          aria-label="返回笔记列表"
          onClick={async () => {
            if ((await save()) || window.confirm('保存失败，已保留加密草稿。仍要离开吗？'))
              onClose();
          }}
        />
        <Input
          className="note-title-input"
          aria-label="笔记标题"
          variant="borderless"
          value={value.title}
          maxLength={255}
          onChange={(e) => change({ title: e.target.value })}
        />
        <Favorite
          value={favorite}
          onClick={async () => {
            try {
              await mutate(`/notes/${note.id}/favorite`, { favorite: !favorite }, 'PATCH');
              setFavorite((v) => !v);
              onSaved();
            } catch (e) {
              message.error(e.message);
            }
          }}
        />
        <Button
          type="text"
          danger
          icon={<DeleteOutlined />}
          aria-label="删除笔记"
          onClick={() =>
            confirmAction('删除这篇笔记？', async () => {
              await mutate(`/notes/${note.id}`, undefined, 'DELETE');
              onDeleted();
            })
          }
        />
      </div>
      <div className="editor-toolbar">
        <Select
          aria-label="笔记语言"
          value={value.language}
          options={languages}
          onChange={(language) => change({ language })}
          variant="borderless"
          style={{ width: 135 }}
        />
        {value.language === 'markdown' && (
          <Segmented
            size="small"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'edit', label: '编辑' },
              { value: 'preview', label: '预览' },
              { value: 'split', label: '分栏' }
            ]}
          />
        )}
        <Button
          size="small"
          type="text"
          icon={<SaveOutlined />}
          loading={status === 'Saving'}
          onClick={save}
        >
          保存
        </Button>
      </div>
      {recovery && (
        <div className="draft-banner">
          <span>发现可恢复的加密草稿</span>
          <Button
            size="small"
            onClick={() => {
              const draft = recovery;
              setValue({ title: draft.title, language: draft.language, content: draft.content });
              if (draft.version !== version.current) {
                conflict.current = true;
                setError('草稿基于旧版本。请另存副本，或重新加载服务器版本。');
                setStatus('Save failed');
              }
              setRecovery(null);
            }}
          >
            恢复草稿
          </Button>
          <Button
            size="small"
            type="text"
            onClick={() => {
              removeDraft(note.id);
              mutate(`/notes/${note.id}/draft`, undefined, 'DELETE').catch(() => {});
              setRecovery(null);
            }}
          >
            丢弃
          </Button>
        </div>
      )}
      {error && (
        <div className="note-save-error" role="alert">
          <span>{error}</span>
          {conflict.current ? (
            <>
              <Button size="small" icon={<CopyOutlined />} onClick={copyAsNew}>
                另存副本
              </Button>
              <Button
                size="small"
                icon={<ReloadOutlined />}
                onClick={async () => {
                  if (!window.confirm('将重新加载服务器内容；本地加密草稿仍会保留。')) return;
                  try {
                    await keepDraft();
                    const row = await request(`/notes/${note.id}`);
                    const loaded = {
                      title: row.title,
                      language: row.language,
                      content: row.content
                    };
                    version.current = row.version;
                    confirmed.current = fingerprint(loaded);
                    current.current = loaded;
                    conflict.current = false;
                    setValue(loaded);
                    setError('');
                    setStatus('Saved');
                    setRecovery(await loadDraft(note.id));
                  } catch (e) {
                    message.error(e.message);
                  }
                }}
              >
                重新加载
              </Button>
            </>
          ) : (
            <Button size="small" onClick={save}>
              重试保存
            </Button>
          )}
        </div>
      )}
      <div className={`editor-body ${value.language === 'markdown' ? `mode-${mode}` : ''}`}>
        {(value.language !== 'markdown' || mode !== 'preview') && (
          <Suspense fallback={<div className="editor-loading">正在加载编辑器…</div>}>
            <CodeEditor
              value={value.content}
              language={value.language}
              onChange={(content) => change({ content })}
              onSave={save}
            />
          </Suspense>
        )}
        {value.language === 'markdown' && mode !== 'edit' && (
          <article className="markdown-preview" dangerouslySetInnerHTML={{ __html: preview }} />
        )}
      </div>
      <footer className="editor-status">
        <span
          className={`save-state ${status === 'Saved' ? 'saved' : status === 'Save failed' ? 'failed' : ''}`}
        >
          <i />
          {status}
        </span>
        <span>{value.content.length.toLocaleString()} 字符 · UTF-8</span>
        <span>内容加密存储</span>
      </footer>
    </section>
  );
}
