"use client";

import {
  type ClipboardEvent,
  type DragEvent,
  type FocusEvent,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
} from "react";

export type AnnotationSeverity = "high" | "med" | "low";
export type AnnotationState = "open" | "edited" | "resolved";

export type EditorAnnotation = {
  id: string;
  criterionId: string;
  blockId: string;
  severity: AnnotationSeverity;
  anchor: string;
  title: string;
  what: string;
  how: string;
};

export type EditorCommand = "undo" | "redo" | "justifyLeft" | "justifyCenter" | "justifyRight" | "removeFormat" | "italic" | "bold" | "underline";

type RichTextBodyProps = {
  blockId: string;
  value: string;
  html?: string;
  annotations: EditorAnnotation[];
  annotationStateById: Record<string, AnnotationState>;
  className: string;
  ariaLabel: string;
  placeholder: string;
  onRegister: (blockId: string, editor: HTMLDivElement | null) => void;
  onAnnotationsRendered: (blockId: string, annotationIds: string[]) => void;
  onChange: (blockId: string, value: string, html: string, editedAnnotationIds: string[]) => void;
  onBlur: () => void;
  onAnnotationPreview: (annotationId: string, anchor: HTMLElement, pinned: boolean) => void;
  onAnnotationLeave: () => void;
};

type EditorToolbarProps = {
  className?: string;
  wordLabel: string;
  onCommand: (command: EditorCommand) => void;
  children?: ReactNode;
};

const ALLOWED_EDITOR_TAGS = new Set(["B", "BR", "DIV", "EM", "I", "P", "SPAN", "STRONG", "U"]);
const REMOVED_EDITOR_TAGS = new Set(["BASE", "EMBED", "IFRAME", "LINK", "META", "OBJECT", "SCRIPT", "STYLE"]);

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function textToHtml(value: string) {
  return escapeHtml(value.replace(/\r\n?/g, "\n")).replaceAll("\n", "<br>");
}

function unwrap(element: Element) {
  const parent = element.parentNode;
  if (!parent) return;
  while (element.firstChild) parent.insertBefore(element.firstChild, element);
  parent.removeChild(element);
  parent.normalize();
}

export function sanitiseEditorHtml(value: string) {
  if (typeof document === "undefined") return value;
  const template = document.createElement("template");
  template.innerHTML = value;
  const elements = [...template.content.querySelectorAll("*")].reverse();

  for (const element of elements) {
    if (element.matches("mark[data-annotation-id]")) {
      unwrap(element);
      continue;
    }
    if (REMOVED_EDITOR_TAGS.has(element.tagName)) {
      element.remove();
      continue;
    }
    if (!ALLOWED_EDITOR_TAGS.has(element.tagName)) {
      unwrap(element);
      continue;
    }

    const alignment = element instanceof HTMLElement ? element.style.textAlign : "";
    for (const attribute of [...element.attributes]) element.removeAttribute(attribute.name);
    if (element instanceof HTMLElement && ["left", "center", "right", "justify"].includes(alignment)) {
      element.style.textAlign = alignment;
    }
  }

  return template.innerHTML;
}

type IndexedTextNode = { node: Text; start: number; end: number };

function buildEditorTextIndex(root: ParentNode) {
  const textNodes: IndexedTextNode[] = [];
  let combined = "";
  const appendLineBreak = (force = false) => {
    if (force || (combined && !combined.endsWith("\n"))) combined += "\n";
  };
  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const textNode = node as Text;
      const normalised = textNode.data.replaceAll("\u00a0", " ");
      const start = combined.length;
      combined += normalised;
      textNodes.push({ node: textNode, start, end: combined.length });
      return;
    }
    if (!(node instanceof Element)) return;
    if (node.tagName === "BR") {
      appendLineBreak(true);
      return;
    }
    const isBlock = node.tagName === "DIV" || node.tagName === "P";
    if (isBlock) appendLineBreak();
    for (const child of node.childNodes) visit(child);
    if (isBlock) appendLineBreak();
  };
  for (const child of root.childNodes) visit(child);
  return { text: combined, textNodes };
}

function editorHtmlMatchesValue(html: string, value: string) {
  if (typeof document === "undefined") return true;
  const template = document.createElement("template");
  template.innerHTML = html;
  const comparable = (text: string) => text
    .replaceAll("\u00a0", " ")
    .replace(/\r\n?/g, "\n")
    .replace(/[\t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n+/g, "\n")
    .trim();
  return comparable(buildEditorTextIndex(template.content).text) === comparable(value);
}

function wrapAnnotation(root: DocumentFragment, annotation: EditorAnnotation, state: AnnotationState) {
  const { text: combined, textNodes } = buildEditorTextIndex(root);

  const start = combined.indexOf(annotation.anchor);
  if (start < 0 || combined.lastIndexOf(annotation.anchor) !== start) return false;
  const end = start + annotation.anchor.length;
  let startNode: Text | null = null;
  let endNode: Text | null = null;
  let startOffset = 0;
  let endOffset = 0;

  for (const entry of textNodes) {
    if (!startNode && start >= entry.start && start < entry.end) {
      startNode = entry.node;
      startOffset = start - entry.start;
    }
    if (endNode === null && end > entry.start && end <= entry.end) {
      endNode = entry.node;
      endOffset = end - entry.start;
      break;
    }
  }

  if (!startNode || !endNode) return false;
  const range = document.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  const mark = document.createElement("mark");
  mark.className = `annotation-mark annotation-${annotation.severity}`;
  mark.dataset.annotationId = annotation.id;
  mark.dataset.annotationState = state;
  mark.tabIndex = 0;
  mark.setAttribute("aria-label", `${annotation.title}. ${annotation.what}`);
  mark.append(range.extractContents());
  range.insertNode(mark);
  return true;
}

function annotatedHtml(value: string, annotations: EditorAnnotation[], annotationStateById: Record<string, AnnotationState>) {
  const clean = sanitiseEditorHtml(value);
  const template = document.createElement("template");
  template.innerHTML = clean;
  for (const annotation of annotations) {
    const state = annotationStateById[annotation.id] ?? "open";
    // An edited mark no longer has a trustworthy source range. Do not search
    // the whole document for matching prose and risk moving its comment to a
    // copied passage; only a fresh analysis may create a new anchor.
    if (state === "open") wrapAnnotation(template.content, annotation, state);
  }
  return template.innerHTML;
}

function editorPlainText(editor: HTMLElement) {
  return editor.innerText.replaceAll("\u00a0", " ").replace(/\n$/, "");
}

function captureSelection(editor: HTMLElement) {
  const selection = window.getSelection();
  if (!selection?.rangeCount || !selection.anchorNode || !editor.contains(selection.anchorNode)) return null;
  const range = selection.getRangeAt(0);
  const beforeStart = document.createRange();
  beforeStart.selectNodeContents(editor);
  beforeStart.setEnd(range.startContainer, range.startOffset);
  const beforeEnd = document.createRange();
  beforeEnd.selectNodeContents(editor);
  beforeEnd.setEnd(range.endContainer, range.endOffset);
  return { start: beforeStart.toString().length, end: beforeEnd.toString().length };
}

function restoreSelection(editor: HTMLElement, offsets: { start: number; end: number } | null) {
  if (!offsets) return;
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
  let cursor = 0;
  let startNode: Text | null = null;
  let endNode: Text | null = null;
  let startOffset = 0;
  let endOffset = 0;
  let node = walker.nextNode();
  while (node) {
    const textNode = node as Text;
    const nextCursor = cursor + textNode.data.length;
    if (!startNode && offsets.start >= cursor && offsets.start <= nextCursor) {
      startNode = textNode;
      startOffset = Math.min(textNode.data.length, offsets.start - cursor);
    }
    if (!endNode && offsets.end >= cursor && offsets.end <= nextCursor) {
      endNode = textNode;
      endOffset = Math.min(textNode.data.length, offsets.end - cursor);
    }
    if (startNode && endNode) break;
    cursor = nextCursor;
    node = walker.nextNode();
  }
  if (!startNode || !endNode) return;
  const range = document.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function insertPlainText(editor: HTMLElement, value: string) {
  if (!value) return;
  editor.focus({ preventScroll: true });
  const selection = window.getSelection();
  const selectedRange = selection?.rangeCount ? selection.getRangeAt(0) : null;
  const range = selectedRange && editor.contains(selectedRange.commonAncestorContainer)
    ? selectedRange
    : document.createRange();
  if (!selectedRange || !editor.contains(selectedRange.commonAncestorContainer)) range.selectNodeContents(editor);
  if (!selectedRange || !editor.contains(selectedRange.commonAncestorContainer)) range.collapse(false);
  range.deleteContents();
  const text = document.createTextNode(value.replace(/\r\n?/g, "\n"));
  range.insertNode(text);
  range.setStartAfter(text);
  range.collapse(true);
  selection?.removeAllRanges();
  selection?.addRange(range);
  editor.dispatchEvent(new Event("input", { bubbles: true }));
}

function ToolbarIcon({ command }: { command: EditorCommand }) {
  if (command === "undo") {
    return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 4.5 3 7.5l3 3M3.4 7.5H9.5a3.5 3.5 0 0 1 0 7H7" /></svg>;
  }
  if (command === "redo") {
    return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m10 4.5 3 3-3 3M12.6 7.5H6.5a3.5 3.5 0 0 0 0 7H9" /></svg>;
  }
  if (command === "justifyLeft") return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 4h12M2 8h8M2 12h12" /></svg>;
  if (command === "justifyCenter") return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 4h12M4 8h8M2 12h12" /></svg>;
  if (command === "justifyRight") return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 4h12M6 8h8M2 12h12" /></svg>;
  if (command === "removeFormat") return <>Tx</>;
  if (command === "italic") return <em>I</em>;
  if (command === "bold") return <strong>B</strong>;
  return <u>U</u>;
}

const TOOLBAR_GROUPS: Array<Array<{ command: EditorCommand; label: string }>> = [
  [
    { command: "undo", label: "Undo" },
    { command: "redo", label: "Redo" },
  ],
  [
    { command: "justifyLeft", label: "Align left" },
    { command: "justifyCenter", label: "Align centre" },
    { command: "justifyRight", label: "Align right" },
  ],
  [
    { command: "removeFormat", label: "Clear formatting" },
    { command: "italic", label: "Italic" },
    { command: "bold", label: "Bold" },
    { command: "underline", label: "Underline" },
  ],
];

export function EditorToolbar({ className = "", wordLabel, onCommand, children }: EditorToolbarProps) {
  return (
    <div className={`editor-toolbar ${className}`.trim()} role="toolbar" aria-label="Text formatting">
      <div className="editor-toolbar-scroll">
        {TOOLBAR_GROUPS.map((group, groupIndex) => (
          <div className="editor-toolbar-group" key={group[0].command}>
            {group.map((item) => (
              <button
                className={`editor-tool editor-tool-${item.command}`}
                type="button"
                key={item.command}
                aria-label={item.label}
                title={item.label}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onCommand(item.command)}
              >
                <ToolbarIcon command={item.command} />
              </button>
            ))}
            {groupIndex < TOOLBAR_GROUPS.length - 1 ? <span className="editor-toolbar-divider" aria-hidden="true" /> : null}
          </div>
        ))}
      </div>
      <span className="editor-toolbar-spacer" />
      {children}
      <span className="editor-word-count">{wordLabel}</span>
    </div>
  );
}

export function RichTextBody({
  blockId,
  value,
  html,
  annotations,
  annotationStateById,
  className,
  ariaLabel,
  placeholder,
  onRegister,
  onAnnotationsRendered,
  onChange,
  onBlur,
  onAnnotationPreview,
  onAnnotationLeave,
}: RichTextBodyProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const emittedHtmlRef = useRef("");
  const renderedAnnotationSignatureRef = useRef("");
  const suppliedHtml = html === undefined ? undefined : sanitiseEditorHtml(html);
  const baseHtml = suppliedHtml !== undefined && editorHtmlMatchesValue(suppliedHtml, value)
    ? suppliedHtml
    : textToHtml(value);
  const visibleAnnotations = useMemo(
    () => annotations.filter((annotation) => (annotationStateById[annotation.id] ?? "open") !== "resolved"),
    [annotationStateById, annotations],
  );
  const annotationSignature = visibleAnnotations.map((annotation) => `${annotation.id}:${annotation.severity}:${annotation.anchor}:${annotation.title}:${annotation.what}`).join("|");

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    onRegister(blockId, editor);
    return () => onRegister(blockId, null);
  }, [blockId, onRegister]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const cleanBase = sanitiseEditorHtml(baseHtml);
    if (emittedHtmlRef.current === cleanBase && renderedAnnotationSignatureRef.current === annotationSignature) return;
    const selection = captureSelection(editor);
    editor.innerHTML = annotatedHtml(cleanBase, visibleAnnotations, annotationStateById);
    restoreSelection(editor, selection);
    emittedHtmlRef.current = cleanBase;
    renderedAnnotationSignatureRef.current = annotationSignature;
    onAnnotationsRendered(blockId, [...editor.querySelectorAll<HTMLElement>("mark[data-annotation-id]")]
      .map((mark) => mark.dataset.annotationId)
      .filter((id): id is string => Boolean(id)));
  }, [annotationSignature, annotationStateById, baseHtml, blockId, onAnnotationsRendered, visibleAnnotations]);

  useEffect(() => () => onAnnotationsRendered(blockId, []), [blockId, onAnnotationsRendered]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    for (const mark of editor.querySelectorAll<HTMLElement>("mark[data-annotation-id]")) {
      const annotationId = mark.dataset.annotationId;
      if (annotationId) mark.dataset.annotationState = annotationStateById[annotationId] ?? "open";
    }
  }, [annotationStateById]);

  const commit = (event: FormEvent<HTMLDivElement>) => {
    const editor = event.currentTarget;
    const editedIds: string[] = [];
    for (const mark of editor.querySelectorAll<HTMLElement>("mark[data-annotation-id]")) {
      const annotation = annotations.find((item) => item.id === mark.dataset.annotationId);
      if (!annotation || mark.textContent === annotation.anchor) continue;
      mark.dataset.annotationState = "edited";
      editedIds.push(annotation.id);
    }
    const cleanHtml = sanitiseEditorHtml(editor.innerHTML);
    emittedHtmlRef.current = cleanHtml;
    onChange(blockId, editorPlainText(editor), cleanHtml, editedIds);
  };

  const findMark = (target: EventTarget | null) => target instanceof HTMLElement
    ? target.closest<HTMLElement>("mark[data-annotation-id]")
    : null;

  const previewMark = (target: EventTarget | null, pinned: boolean) => {
    const mark = findMark(target);
    if (mark?.dataset.annotationId) onAnnotationPreview(mark.dataset.annotationId, mark, pinned);
  };

  const handleFocus = (event: FocusEvent<HTMLDivElement>) => {
    previewMark(event.target, false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const mark = findMark(event.target);
    if (!mark || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    if (mark.dataset.annotationId) onAnnotationPreview(mark.dataset.annotationId, mark, true);
  };

  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    insertPlainText(event.currentTarget, event.clipboardData.getData("text/plain"));
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    insertPlainText(event.currentTarget, event.dataTransfer.getData("text/plain"));
  };

  return (
    <div
      ref={editorRef}
      className={className}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      role="textbox"
      tabIndex={0}
      aria-multiline="true"
      aria-label={ariaLabel}
      data-rich-editor={blockId}
      data-placeholder={placeholder}
      onInput={commit}
      onPaste={handlePaste}
      onDragOver={(event: DragEvent<HTMLDivElement>) => event.preventDefault()}
      onDrop={handleDrop}
      onBlur={onBlur}
      onFocus={handleFocus}
      onKeyDown={handleKeyDown}
      onMouseOver={(event: MouseEvent<HTMLDivElement>) => previewMark(event.target, false)}
      onMouseOut={(event: MouseEvent<HTMLDivElement>) => {
        if (findMark(event.target)) onAnnotationLeave();
      }}
      onClick={(event: MouseEvent<HTMLDivElement>) => previewMark(event.target, true)}
    />
  );
}
