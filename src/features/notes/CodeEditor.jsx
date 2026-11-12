import React, { useEffect, useRef } from 'react';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import {
  bracketMatching,
  syntaxHighlighting,
  defaultHighlightStyle,
  StreamLanguage
} from '@codemirror/language';
import { oneDark } from '@codemirror/theme-one-dark';
const languageExtension = async (language) => {
  if (language === 'markdown') return (await import('@codemirror/lang-markdown')).markdown();
  if (language === 'json') return (await import('@codemirror/lang-json')).json();
  if (language === 'javascript') return (await import('@codemirror/lang-javascript')).javascript();
  if (language === 'python') return (await import('@codemirror/lang-python')).python();
  if (language === 'yaml' || language === 'shell') {
    const mode =
      language === 'yaml'
        ? (await import('@codemirror/legacy-modes/mode/yaml')).yaml
        : (await import('@codemirror/legacy-modes/mode/shell')).shell;
    return StreamLanguage.define(mode);
  }
  return [];
};
export default function CodeEditor({ value, language, onChange, onSave }) {
  const host = useRef(null);
  const view = useRef(null);
  const callbacks = useRef({ onChange, onSave });
  callbacks.current = { onChange, onSave };
  const initial = useRef(value);
  const compartment = useRef(new Compartment());
  useEffect(() => {
    const theme = new Compartment();
    const editor = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: initial.current,
        extensions: [
          lineNumbers(),
          history(),
          bracketMatching(),
          highlightActiveLine(),
          syntaxHighlighting(defaultHighlightStyle),
          EditorView.lineWrapping,
          keymap.of([
            {
              key: 'Mod-s',
              run: () => {
                callbacks.current.onSave();
                return true;
              }
            },
            ...defaultKeymap,
            ...historyKeymap,
            indentWithTab
          ]),
          compartment.current.of([]),
          theme.of(document.documentElement.dataset.theme === 'light' ? [] : oneDark),
          EditorView.theme({
            '&': { height: '100%', backgroundColor: 'transparent', fontSize: '13px' },
            '.cm-scroller': { overflow: 'auto', fontFamily: 'var(--font-mono)', lineHeight: '1.8' },
            '.cm-gutters': {
              backgroundColor: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)'
            },
            '.cm-content': { padding: '16px 0', caretColor: 'var(--accent)' },
            '&.cm-focused': { outline: 'none' }
          }),
          EditorView.contentAttributes.of({ 'aria-label': '笔记内容编辑器' }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) callbacks.current.onChange(update.state.doc.toString());
          })
        ]
      })
    });
    view.current = editor;
    const observer = new MutationObserver(() =>
      editor.dispatch({
        effects: theme.reconfigure(
          document.documentElement.dataset.theme === 'light' ? [] : oneDark
        )
      })
    );
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme']
    });
    return () => {
      observer.disconnect();
      editor.destroy();
      view.current = null;
    };
  }, []);
  useEffect(() => {
    let current = true;
    languageExtension(language)
      .then((extension) => {
        if (current && view.current)
          view.current.dispatch({ effects: compartment.current.reconfigure(extension) });
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [language]);
  useEffect(() => {
    const editor = view.current;
    if (editor && editor.state.doc.toString() !== value)
      editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } });
  }, [value]);
  return <div className="code-editor" ref={host} />;
}
