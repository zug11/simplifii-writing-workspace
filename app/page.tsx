"use client";

import {
  type ChangeEvent,
  type DragEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type Stage = "import" | "review" | "choice" | "workspace";
type StructureChoice = "simplifii" | "self";
type ViewMode = "guide" | "full-draft";
type AnalysisState = "idle" | "running" | "complete";
type FileRole = "Assignment instructions" | "Marking criteria" | "Course context" | "Current draft" | "Supporting material";

type ImportedFile = {
  id: string;
  name: string;
  size: number;
  role: FileRole;
  text: string;
};

type Requirement = {
  id: string;
  text: string;
  scope: "whole-document" | "by-content";
  keywords: string[];
};

type Criterion = {
  id: string;
  name: string;
  weight: number;
  description: string;
  tone: "good" | "attention" | "priority";
};

type Assignment = {
  title: string;
  courseCode: string;
  type: string;
  dueLabel: string;
  wordLimit: number;
  task: string;
  requirements: Requirement[];
  criteria: Criterion[];
};

type WritingBlock = {
  id: string;
  heading: string;
  headingSource: "simplifii" | "student";
  body: string;
  guidanceIds: string[];
};

const RESEARCH_REQUIREMENTS: Requirement[] = [
  {
    id: "problem",
    text: "Explain the problem and why it matters before narrowing to your question.",
    scope: "by-content",
    keywords: ["background", "problem", "matters", "aim", "question", "hypothesis"],
  },
  {
    id: "concepts",
    text: "Define the central concepts in plain, precise academic language.",
    scope: "by-content",
    keywords: ["define", "means", "concept", "working memory", "sleep restriction"],
  },
  {
    id: "sources",
    text: "Use academic sources to support claims and connect them to your argument.",
    scope: "whole-document",
    keywords: ["source", "evidence", "study", "research", "citation"],
  },
  {
    id: "method",
    text: "Describe participants, materials, design and procedure clearly enough to follow.",
    scope: "by-content",
    keywords: ["participant", "method", "design", "materials", "procedure", "sample"],
  },
  {
    id: "results",
    text: "Report the findings with the numbers needed to understand each comparison.",
    scope: "by-content",
    keywords: ["result", "mean", "difference", "p =", "accuracy", "finding"],
  },
  {
    id: "discussion",
    text: "Interpret what the findings mean, consider alternatives and explain the limitations.",
    scope: "by-content",
    keywords: ["interpret", "means", "limitation", "alternative", "implication", "discussion"],
  },
  {
    id: "clarity",
    text: "Keep the argument clear, literal and easy to follow from one section to the next.",
    scope: "whole-document",
    keywords: ["clarity", "structure", "argument", "writing"],
  },
];

const DEFAULT_CRITERIA: Criterion[] = [
  { id: "depth", name: "Depth of analysis", weight: 30, description: "Explain meaning, alternatives and limitations rather than only describing.", tone: "attention" },
  { id: "sources", name: "Engagement with sources", weight: 25, description: "Use evidence critically and connect sources to the argument.", tone: "priority" },
  { id: "argument", name: "Argument & coherence", weight: 25, description: "Make the central line of reasoning easy to follow.", tone: "good" },
  { id: "style", name: "Writing style & clarity", weight: 10, description: "Use precise language and readable sentences.", tone: "attention" },
  { id: "structure", name: "Structure & presentation", weight: 10, description: "Organise the report consistently and follow submission conventions.", tone: "good" },
];

const DEFAULT_ASSIGNMENT: Assignment = {
  title: "Sleep restriction & working memory",
  courseCode: "PSYC201",
  type: "Research report",
  dueLabel: "Fri 22 Aug",
  wordLimit: 1500,
  task: "Explain and evaluate whether one night of restricted sleep reduces working-memory performance in undergraduate students.",
  requirements: RESEARCH_REQUIREMENTS,
  criteria: DEFAULT_CRITERIA,
};

const STRUCTURED_HEADINGS = ["Introduction", "Method", "Results", "Discussion", "Conclusion", "References"];
const TEXT_FILE_PATTERN = /\.(txt|md|html|htm|csv|json)$/i;
const COURSE_CODE_PATTERN = /\b[A-Z]{3,5}\d{3,4}\b/;
const WORD_LIMIT_PATTERN = /(?:word\s*(?:count|limit)|maximum)\D{0,16}(\d{3,5})/i;
const DUE_PATTERN = /(?:due(?:\s+date)?|submit(?:\s+by)?)\s*[:-]?\s*([^\n.]{4,48})/i;

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function classifyFile(name: string): FileRole {
  const lower = name.toLowerCase();
  if (/rubric|marking|criteria/.test(lower)) return "Marking criteria";
  if (/outline|course|syllabus/.test(lower)) return "Course context";
  if (/draft|essay|report-v|submission/.test(lower)) return "Current draft";
  if (/brief|assessment|assignment|guide|instructions/.test(lower)) return "Assignment instructions";
  return "Supporting material";
}

async function readImportedFile(file: File): Promise<ImportedFile> {
  let text = "";
  if (TEXT_FILE_PATTERN.test(file.name) || file.type.startsWith("text/")) {
    text = await file.text();
  }
  return {
    id: uid("file"),
    name: file.name,
    size: file.size,
    role: classifyFile(file.name),
    text,
  };
}

function firstMeaningfulLine(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 18 && line.length < 140);
}

function extractRequirements(text: string): Requirement[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/^[\s•*\-\d.)]+/, "").trim())
    .filter((line) => line.length > 18 && line.length < 220)
    .filter((line) => /\b(must|should|required|include|demonstrate|explain|analyse|analyze|evaluate|discuss|describe|report|reference|cite)\b/i.test(line));

  const unique = [...new Set(lines)].slice(0, 8);
  if (unique.length < 3) return RESEARCH_REQUIREMENTS;

  return unique.map((line, index) => {
    const words = line.toLowerCase().match(/[a-z]{5,}/g) ?? [];
    const wholeDocument = /referenc|citation|clarity|format|academic writing/i.test(line);
    return {
      id: `extracted-${index + 1}`,
      text: line.replace(/[.;:]?$/, "."),
      scope: wholeDocument ? "whole-document" : "by-content",
      keywords: [...new Set(words)].slice(0, 6),
    };
  });
}

function extractCriteria(text: string): Criterion[] {
  const criteria: Criterion[] = [];
  for (const line of text.split(/\r?\n/)) {
    const match = line.trim().match(/^(.{3,72}?)\s*[-–:]?\s*(\d{1,2})\s*%/);
    if (!match) continue;
    const name = match[1].replace(/^[\d.)\s-]+/, "").trim();
    if (!name || criteria.some((criterion) => criterion.name.toLowerCase() === name.toLowerCase())) continue;
    criteria.push({
      id: `criterion-${criteria.length + 1}`,
      name,
      weight: Number(match[2]),
      description: "Simplifii will apply the imported rubric wording when analysing the draft.",
      tone: criteria.length === 1 ? "priority" : "attention",
    });
  }
  return criteria.length >= 2 ? criteria.slice(0, 8) : DEFAULT_CRITERIA;
}

function extractAssignment(files: ImportedFile[], pastedText: string): Assignment {
  const sourceText = [pastedText, ...files.map((file) => file.text)].filter(Boolean).join("\n\n");
  const fileText = files.map((file) => file.name.replace(/\.[^.]+$/, "")).join(" ");
  const courseCode = sourceText.match(COURSE_CODE_PATTERN)?.[0] ?? fileText.match(COURSE_CODE_PATTERN)?.[0] ?? DEFAULT_ASSIGNMENT.courseCode;
  const wordLimit = Number(sourceText.match(WORD_LIMIT_PATTERN)?.[1]) || DEFAULT_ASSIGNMENT.wordLimit;
  const dueLabel = sourceText.match(DUE_PATTERN)?.[1]?.trim() ?? DEFAULT_ASSIGNMENT.dueLabel;
  const titleLine = sourceText.match(/(?:assignment|assessment)\s*(?:title)?\s*[:-]\s*([^\n]{6,100})/i)?.[1]?.trim();
  const instructionsName = files.find((file) => file.role === "Assignment instructions")?.name.replace(/\.[^.]+$/, "");
  const title = titleLine ?? instructionsName ?? DEFAULT_ASSIGNMENT.title;
  const lower = sourceText.toLowerCase();
  const type = /reflection/.test(lower) ? "Reflective assignment" : /essay/.test(lower) ? "Essay" : /presentation/.test(lower) ? "Presentation" : DEFAULT_ASSIGNMENT.type;

  return {
    title,
    courseCode,
    type,
    dueLabel,
    wordLimit,
    task: firstMeaningfulLine(sourceText) ?? DEFAULT_ASSIGNMENT.task,
    requirements: extractRequirements(sourceText),
    criteria: extractCriteria(sourceText),
  };
}

function guidanceForHeading(heading: string, requirements: Requirement[]) {
  const lower = heading.toLowerCase();
  const matches = requirements.filter((requirement) => {
    if (requirement.scope === "whole-document") return true;
    return requirement.keywords.some((keyword) => lower.includes(keyword) || keyword.includes(lower));
  });
  if (matches.length > 2) return matches.map((requirement) => requirement.id);

  const fallbackMap: Record<string, string[]> = {
    introduction: ["problem", "concepts", "sources", "clarity"],
    method: ["method", "sources", "clarity"],
    results: ["results", "clarity"],
    discussion: ["discussion", "sources", "clarity"],
    conclusion: ["discussion", "clarity"],
    references: ["sources", "clarity"],
  };
  const fallbackIds = fallbackMap[lower] ?? [];
  const available = new Set(requirements.map((requirement) => requirement.id));
  const filtered = fallbackIds.filter((id) => available.has(id));
  return filtered.length ? filtered : requirements.map((requirement) => requirement.id);
}

function createBlocks(assignment: Assignment, choice: StructureChoice): WritingBlock[] {
  if (choice === "self") {
    return [{ id: uid("block"), heading: "Your draft", headingSource: "simplifii", body: "", guidanceIds: assignment.requirements.map((requirement) => requirement.id) }];
  }

  return STRUCTURED_HEADINGS.map((heading) => ({
    id: uid("block"),
    heading,
    headingSource: "simplifii",
    body: "",
    guidanceIds: guidanceForHeading(heading, assignment.requirements),
  }));
}

function reallocateGuidance(blocks: WritingBlock[], requirements: Requirement[]) {
  const next = blocks.map((block) => ({ ...block, guidanceIds: [] as string[] }));

  for (const requirement of requirements) {
    if (requirement.scope === "whole-document") {
      next.forEach((block) => block.guidanceIds.push(requirement.id));
      continue;
    }

    const relevantIds = new Set(
      next
        .filter((block) => {
          const content = `${block.heading} ${block.body}`.toLowerCase();
          return requirement.keywords.some((keyword) => content.includes(keyword.toLowerCase()));
        })
        .map((block) => block.id),
    );

    if (relevantIds.size === 0) {
      blocks.forEach((block) => {
        if (block.guidanceIds.includes(requirement.id)) {
          next.find((candidate) => candidate.id === block.id)?.guidanceIds.push(requirement.id);
        }
      });
    } else {
      next.forEach((block) => {
        const wasOwner = blocks.find((candidate) => candidate.id === block.id)?.guidanceIds.includes(requirement.id);
        if (relevantIds.has(block.id) || (wasOwner && !block.body.trim())) block.guidanceIds.push(requirement.id);
      });
    }
  }

  return next;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function wordCount(text: string) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function Brand() {
  return (
    <div className="brand" aria-label="Simplifii">
      <span className="brand-mark" aria-hidden="true" />
      <span>Simplifii</span>
    </div>
  );
}

function ImportHeader() {
  return (
    <header className="simple-topbar">
      <Brand />
      <span className="topbar-note">Assignment workspace</span>
    </header>
  );
}

function ImportScreen({
  files,
  pastedText,
  onFiles,
  onPaste,
  onRemove,
  onContinue,
}: {
  files: ImportedFile[];
  pastedText: string;
  onFiles: (files: File[]) => void;
  onPaste: (value: string) => void;
  onRemove: (id: string) => void;
  onContinue: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    onFiles([...event.dataTransfer.files]);
  };

  return (
    <div className="setup-shell">
      <ImportHeader />
      <main className="setup-main">
        <section className="setup-intro">
          <span className="eyebrow">START AN ASSIGNMENT</span>
          <h1>Add what your course gave you.</h1>
          <p>Simplifii sorts the files, extracts what you need to do, and carries it into the writing workspace.</p>
        </section>

        <section className="setup-card" aria-labelledby="materials-heading">
          <div className="card-heading-row">
            <div>
              <h2 id="materials-heading">Assignment material</h2>
              <p>Brief, rubric, course outline, current draft—or whatever your institution calls them.</p>
            </div>
            <span className="quiet-pill">PDF · DOCX · text</span>
          </div>

          <div
            className={`drop-zone${dragging ? " is-dragging" : ""}`}
            onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
          >
            <input
              ref={inputRef}
              className="visually-hidden"
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.txt,.md,.html,image/*"
              onChange={(event: ChangeEvent<HTMLInputElement>) => onFiles([...(event.target.files ?? [])])}
            />
            <span className="upload-icon" aria-hidden="true"><span /></span>
            <strong>Drop files here</strong>
            <span>or</span>
            <button className="secondary-button" type="button" onClick={() => inputRef.current?.click()}>Choose files</button>
          </div>

          {files.length > 0 ? (
            <div className="file-list" aria-label="Added files">
              {files.map((file) => (
                <div className="file-row" key={file.id}>
                  <span className="file-mark" aria-hidden="true" />
                  <div className="file-copy">
                    <strong>{file.name}</strong>
                    <span>{file.role} · {formatBytes(file.size)}</span>
                  </div>
                  <button type="button" className="icon-button" aria-label={`Remove ${file.name}`} onClick={() => onRemove(file.id)}>×</button>
                </div>
              ))}
            </div>
          ) : null}

          <div className="paste-divider"><span>or paste the wording</span></div>
          <label className="paste-label" htmlFor="assignment-text">Assignment brief or rubric text</label>
          <textarea
            id="assignment-text"
            className="paste-area"
            value={pastedText}
            onChange={(event) => onPaste(event.target.value)}
            placeholder="Paste the assignment instructions or rubric here…"
          />

          <div className="setup-actions">
            <span>Start with what you have. You can add more material later.</span>
            <button className="primary-button" type="button" disabled={!files.length && !pastedText.trim()} onClick={onContinue}>Read assignment</button>
          </div>
        </section>
      </main>
    </div>
  );
}

function ReviewScreen({ assignment, files, onBack, onContinue }: { assignment: Assignment; files: ImportedFile[]; onBack: () => void; onContinue: () => void }) {
  return (
    <div className="setup-shell">
      <ImportHeader />
      <main className="setup-main review-main">
        <button className="back-button" type="button" onClick={onBack}>← Add or change files</button>
        <section className="setup-intro compact-intro">
          <span className="eyebrow">ASSIGNMENT UNDERSTOOD</span>
          <h1>Here’s what Simplifii extracted.</h1>
          <p>Check the meaning before it becomes guidance in your writing workspace.</p>
        </section>

        <section className="assignment-summary">
          <div className="summary-title-row">
            <div>
              <span>{assignment.courseCode} · {assignment.type}</span>
              <h2>{assignment.title}</h2>
            </div>
            <span className="ready-pill"><i /> Ready</span>
          </div>
          <div className="summary-facts">
            <div><span>Due</span><strong>{assignment.dueLabel}</strong></div>
            <div><span>Length</span><strong>{assignment.wordLimit.toLocaleString()} words</strong></div>
            <div><span>Files read</span><strong>{Math.max(files.length, 1)}</strong></div>
          </div>
        </section>

        <div className="review-grid">
          <section className="review-card review-task">
            <span className="review-label">WHAT YOU ARE DOING</span>
            <p>{assignment.task}</p>
          </section>
          <section className="review-card">
            <span className="review-label">WHAT NEEDS TO BE COVERED</span>
            <div className="review-list">
              {assignment.requirements.map((requirement) => <div key={requirement.id}><i />{requirement.text}</div>)}
            </div>
          </section>
          <section className="review-card rubric-review">
            <span className="review-label">HOW IT IS MARKED</span>
            {assignment.criteria.map((criterion) => (
              <div className="criterion-line" key={criterion.id}>
                <span>{criterion.name}</span>
                <strong>{criterion.weight}%</strong>
              </div>
            ))}
          </section>
        </div>

        <div className="review-actions">
          <span>This becomes the context behind every block.</span>
          <button className="primary-button" type="button" onClick={onContinue}>Choose how to begin</button>
        </div>
      </main>
    </div>
  );
}

function ChoiceScreen({ choice, onChoice, onBack, onContinue }: { choice: StructureChoice; onChoice: (choice: StructureChoice) => void; onBack: () => void; onContinue: () => void }) {
  return (
    <div className="setup-shell">
      <ImportHeader />
      <main className="setup-main choice-main">
        <button className="back-button" type="button" onClick={onBack}>← Check extraction</button>
        <section className="setup-intro compact-intro">
          <span className="eyebrow">YOUR STARTING POINT</span>
          <h1>How do you want to begin?</h1>
          <p>Both choices open the same writing workspace. Only the starting blocks change.</p>
        </section>

        <div className="choice-grid" role="radiogroup" aria-label="Starting structure">
          <button className={`choice-card${choice === "simplifii" ? " selected" : ""}`} role="radio" aria-checked={choice === "simplifii"} type="button" onClick={() => onChoice("simplifii")}>
            <span className="choice-radio" aria-hidden="true"><i /></span>
            <span className="choice-visual blocks-visual" aria-hidden="true"><i /><i /><i /></span>
            <strong>Simplifii structures it</strong>
            <span>Simplifii creates the blocks and places the extracted guidance where it is most useful.</span>
          </button>
          <button className={`choice-card${choice === "self" ? " selected" : ""}`} role="radio" aria-checked={choice === "self"} type="button" onClick={() => onChoice("self")}>
            <span className="choice-radio" aria-hidden="true"><i /></span>
            <span className="choice-visual page-visual" aria-hidden="true"><i /><i /><i /></span>
            <strong>I’ll structure it myself</strong>
            <span>Begin with one block containing all the guidance. Add another block with + whenever it helps.</span>
          </button>
        </div>

        <div className="choice-actions">
          <span>Nothing about your assignment changes. This only decides the first view.</span>
          <button className="primary-button" type="button" onClick={onContinue}>Create workspace</button>
        </div>
      </main>
    </div>
  );
}

function ViewIcon({ mode }: { mode: ViewMode }) {
  return mode === "guide" ? <span className="mini-block-icon" aria-hidden="true"><i /><i /><i /></span> : <span className="mini-page-icon" aria-hidden="true"><i /><i /><i /></span>;
}

function PlusButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <div className="block-insert">
      <span />
      <button type="button" aria-label={label} title={label} onClick={onClick}>+</button>
      <span />
    </div>
  );
}

function Workspace({
  assignment,
  blocks,
  view,
  analysis,
  focusHeadingId,
  onView,
  onHeading,
  onBody,
  onBlur,
  onInsert,
  onAnalyse,
  saveLabel,
}: {
  assignment: Assignment;
  blocks: WritingBlock[];
  view: ViewMode;
  analysis: AnalysisState;
  focusHeadingId: string | null;
  onView: (view: ViewMode) => void;
  onHeading: (blockId: string, value: string) => void;
  onBody: (blockId: string, value: string) => void;
  onBlur: () => void;
  onInsert: (anchorId: string, position: "before" | "after") => void;
  onAnalyse: () => void;
  saveLabel: string;
}) {
  const requirementMap = useMemo(() => new Map(assignment.requirements.map((requirement) => [requirement.id, requirement])), [assignment.requirements]);
  const totalWords = blocks.reduce((total, block) => total + wordCount(block.body), 0);

  useEffect(() => {
    if (!focusHeadingId) return;
    document.querySelector<HTMLInputElement>(`[data-block-heading-id="${focusHeadingId}"]`)?.focus();
  }, [focusHeadingId]);

  return (
    <div className="workspace-shell">
      <header className="workspace-topbar">
        <Brand />
        <span className="bar-divider" aria-hidden="true" />
        <div className="document-identity">
          <strong>{assignment.title}</strong>
          <span>{assignment.courseCode} · {assignment.type}</span>
        </div>
        <span className="due-pill"><i />Due {assignment.dueLabel} · On track</span>
        <span className="bar-spacer" />
        <span className="save-label" aria-live="polite">{saveLabel}</span>
        <button className="text-button" type="button">History</button>
        <button className="text-button" type="button" aria-label="Reading settings">Aa</button>
        <div className="view-toggle" role="group" aria-label="Writing view">
          <button className={view === "guide" ? "active" : ""} type="button" aria-label="Guide blocks" title="Guide blocks" onClick={() => onView("guide")}><ViewIcon mode="guide" /></button>
          <button className={view === "full-draft" ? "active" : ""} type="button" aria-label="Full draft" title="Full draft" onClick={() => onView("full-draft")}><ViewIcon mode="full-draft" /></button>
        </div>
        <button className="export-button" type="button">Export</button>
      </header>

      <main className="workspace-scroll">
        <div className="workspace-column">
          {view === "guide" ? (
            <div className="guide-layout">
              <section className="rubric-section">
                <div className="rubric-heading">
                  <div><span className="review-label">RUBRIC</span><p>Marked against the imported criteria.</p></div>
                  {analysis === "idle" ? <button className="primary-button small" type="button" onClick={onAnalyse}>Analyse my draft</button> : null}
                  {analysis === "complete" ? <button className="secondary-button small" type="button" onClick={onAnalyse}>Run again</button> : null}
                </div>
                {analysis === "running" ? <div className="analysis-running"><span><i /><i /><i /></span>Reading your draft against each criterion…</div> : null}
                {analysis === "complete" ? (
                  <>
                    <div className="analysis-summary">
                      <strong>Next focus</strong>
                      <div><span>Engagement with sources</span> has the highest leverage in this draft.</div>
                      <p>This is guidance against the rubric—not a mark.</p>
                    </div>
                    <div className="criterion-grid">
                      {assignment.criteria.map((criterion) => (
                        <article className={`criterion-card ${criterion.tone}`} key={criterion.id}>
                          <div><strong>{criterion.name}</strong><span>{criterion.weight}%</span></div>
                          <p>{criterion.description}</p>
                          <button type="button" onClick={() => onView("full-draft")}>See this in the draft</button>
                        </article>
                      ))}
                    </div>
                  </>
                ) : null}
              </section>

              <div className="blocks-list">
                {blocks.map((block, index) => {
                  const guidance = block.guidanceIds.map((id) => requirementMap.get(id)).filter((item): item is Requirement => Boolean(item));
                  const words = wordCount(block.body);
                  const displayHeading = block.heading.trim() || "this block";
                  const status = words === 0 ? "empty" : words < 60 ? "priority" : words < 140 ? "attention" : "good";
                  const statusLabel = status === "empty" ? "Not started" : status === "priority" ? "Needs work" : status === "attention" ? "Needs attention" : "On track";
                  return (
                    <div className="block-wrap" key={block.id}>
                      {index === 0 ? <PlusButton label="Add a block above" onClick={() => onInsert(block.id, "before")} /> : null}
                      <article className={`writing-block ${status}`}>
                        <div className="block-guide">
                          <div className="block-guide-top">
                            <span className="violet-dot" aria-hidden="true" />
                            <span className="guide-title">GUIDE{block.heading.trim() ? ` · ${block.heading.trim().toUpperCase()}` : ""}</span>
                            <span className="guide-count">{guidance.length} things to hold</span>
                            <span className="block-status"><i />{statusLabel}</span>
                          </div>
                          <p>{guidance[0]?.text ?? "Write this section in the way that makes sense for your assignment."}</p>
                          <div className="guidance-list">
                            {guidance.slice(0, 5).map((requirement) => <span key={requirement.id}><i />{requirement.text}</span>)}
                          </div>
                        </div>
                        <div className="block-editor-wrap">
                          {block.headingSource === "student" ? (
                            <input
                              className="block-heading-editor"
                              data-block-heading-id={block.id}
                              value={block.heading}
                              onChange={(event) => onHeading(block.id, event.target.value)}
                              onBlur={onBlur}
                              onKeyDown={(event) => {
                                if (event.key !== "Enter") return;
                                event.preventDefault();
                                event.currentTarget.parentElement?.querySelector("textarea")?.focus();
                              }}
                              aria-label="Section heading"
                              placeholder="Write the first sentence — this becomes the section heading"
                            />
                          ) : null}
                          <textarea
                            className="block-editor"
                            value={block.body}
                            onChange={(event) => onBody(block.id, event.target.value)}
                            onBlur={onBlur}
                            aria-label={`${displayHeading} draft text`}
                            placeholder={block.headingSource === "student" ? "Continue writing underneath…" : `Write your ${displayHeading.toLowerCase()} here…`}
                          />
                          <div className="editor-footer"><span>B</span><span><em>I</em></span><span><u>U</u></span><i /> <small>{words} words</small></div>
                        </div>
                      </article>
                      <PlusButton label={`Add a block below ${displayHeading}`} onClick={() => onInsert(block.id, "after")} />
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <article className="full-draft-card">
              <div className="draft-heading">
                <span>{assignment.courseCode} · {assignment.type.toUpperCase()}</span>
                <h1>{assignment.title}</h1>
              </div>
              <div className="draft-toolbar"><span>B</span><span><em>I</em></span><span><u>U</u></span><i /><small>{totalWords} words</small></div>
              <div className="draft-sections">
                {blocks.map((block) => (
                  <section key={block.id}>
                    {block.headingSource === "student" ? (
                      <input
                        className="draft-section-heading"
                        data-block-heading-id={block.id}
                        value={block.heading}
                        onChange={(event) => onHeading(block.id, event.target.value)}
                        onBlur={onBlur}
                        onKeyDown={(event) => {
                          if (event.key !== "Enter") return;
                          event.preventDefault();
                          event.currentTarget.parentElement?.querySelector("textarea")?.focus();
                        }}
                        aria-label="Section heading"
                        placeholder="Write the first sentence — this becomes the section heading"
                      />
                    ) : <h2>{block.heading}</h2>}
                    <textarea
                      value={block.body}
                      onChange={(event) => onBody(block.id, event.target.value)}
                      onBlur={onBlur}
                      aria-label={`${block.heading.trim() || "This block"} draft text`}
                      placeholder={block.headingSource === "student" ? "Continue writing underneath…" : `Write your ${block.heading.toLowerCase()} here…`}
                    />
                  </section>
                ))}
              </div>
            </article>
          )}
        </div>
      </main>
    </div>
  );
}

export default function Home() {
  const [stage, setStage] = useState<Stage>("import");
  const [files, setFiles] = useState<ImportedFile[]>([]);
  const [pastedText, setPastedText] = useState("");
  const [assignment, setAssignment] = useState<Assignment>(DEFAULT_ASSIGNMENT);
  const [choice, setChoice] = useState<StructureChoice>("simplifii");
  const [blocks, setBlocks] = useState<WritingBlock[]>([]);
  const [view, setView] = useState<ViewMode>("guide");
  const [analysis, setAnalysis] = useState<AnalysisState>("idle");
  const [focusHeadingId, setFocusHeadingId] = useState<string | null>(null);
  const [saveLabel, setSaveLabel] = useState("Saved · just now");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);

  const addFiles = async (incoming: File[]) => {
    const imported = await Promise.all(incoming.map(readImportedFile));
    setFiles((current) => [...current, ...imported]);
  };

  const readAssignment = () => {
    setAssignment(extractAssignment(files, pastedText));
    setStage("review");
  };

  const createWorkspace = () => {
    setBlocks(createBlocks(assignment, choice));
    setStage("workspace");
    setView("guide");
  };

  const updateBody = (blockId: string, value: string) => {
    setBlocks((current) => current.map((block) => block.id === blockId ? { ...block, body: value } : block));
    setSaveLabel("Saving…");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => setSaveLabel("Saved · just now"), 800);
  };

  const updateHeading = (blockId: string, value: string) => {
    setBlocks((current) => current.map((block) => block.id === blockId ? { ...block, heading: value } : block));
    setSaveLabel("Saving…");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => setSaveLabel("Saved · just now"), 800);
  };

  const insertBlock = (anchorId: string, position: "before" | "after") => {
    const newBlockId = uid("block");
    setBlocks((current) => {
      const index = current.findIndex((block) => block.id === anchorId);
      if (index < 0) return current;
      const anchor = current[index];
      const newBlock: WritingBlock = { id: newBlockId, heading: "", headingSource: "student", body: "", guidanceIds: [...anchor.guidanceIds] };
      const next = [...current];
      next.splice(position === "before" ? index : index + 1, 0, newBlock);
      return next;
    });
    setFocusHeadingId(newBlockId);
  };

  const analyse = () => {
    setAnalysis("running");
    setTimeout(() => setAnalysis("complete"), 1200);
  };

  if (stage === "import") {
    return <ImportScreen files={files} pastedText={pastedText} onFiles={addFiles} onPaste={setPastedText} onRemove={(id) => setFiles((current) => current.filter((file) => file.id !== id))} onContinue={readAssignment} />;
  }
  if (stage === "review") {
    return <ReviewScreen assignment={assignment} files={files} onBack={() => setStage("import")} onContinue={() => setStage("choice")} />;
  }
  if (stage === "choice") {
    return <ChoiceScreen choice={choice} onChoice={setChoice} onBack={() => setStage("review")} onContinue={createWorkspace} />;
  }
  return (
    <Workspace
      assignment={assignment}
      blocks={blocks}
      view={view}
      analysis={analysis}
      focusHeadingId={focusHeadingId}
      onView={setView}
      onHeading={updateHeading}
      onBody={updateBody}
      onBlur={() => setBlocks((current) => reallocateGuidance(current, assignment.requirements))}
      onInsert={insertBlock}
      onAnalyse={analyse}
      saveLabel={saveLabel}
    />
  );
}
