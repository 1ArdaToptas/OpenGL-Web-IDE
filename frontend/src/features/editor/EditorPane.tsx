import Editor, { type OnMount } from "@monaco-editor/react";
import { useEffect, useRef } from "react";
import type { Marker } from "./editorLogic";
import { languageFor } from "./editorLogic";
import { monaco } from "./monacoSetup";

export interface Reveal {
  path: string;
  line: number;
  col: number;
  seq: number;
}

interface Props {
  path: string;
  value: string;
  markers: Marker[];
  reveal: Reveal | null;
  onChange: (value: string) => void;
  onSave: () => void;
}

type IEditor = Parameters<OnMount>[0];

export function EditorPane({ path, value, markers, reveal, onChange, onSave }: Props) {
  const editorRef = useRef<IEditor | null>(null);
  const saveRef = useRef(onSave);
  saveRef.current = onSave;

  const onMount: OnMount = (editor) => {
    editorRef.current = editor;
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => saveRef.current());
  };

  useEffect(() => {
    const model = editorRef.current?.getModel();
    if (model) monaco.editor.setModelMarkers(model, "gcc", markers);
  }, [markers, path]);

  useEffect(() => {
    const ed = editorRef.current;
    if (!ed || !reveal || reveal.path !== path) return;
    ed.revealLineInCenter(reveal.line);
    ed.setPosition({ lineNumber: reveal.line, column: reveal.col });
    ed.focus();
  }, [reveal, path]);

  return (
    <Editor
      path={path}
      value={value}
      language={languageFor(path)}
      theme="oglide-dark"
      onMount={onMount}
      onChange={(v) => onChange(v ?? "")}
      options={{
        fontFamily: "Cascadia Code, Cascadia Mono, Consolas, monospace",
        fontSize: 14,
        minimap: { enabled: false },
        automaticLayout: true,
        scrollBeyondLastLine: false,
        tabSize: 4,
      }}
    />
  );
}
