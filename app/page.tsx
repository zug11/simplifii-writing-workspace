"use client";

import {
  type ChangeEvent,
  type CSSProperties,
  type DragEvent,
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  EditorToolbar,
  RichTextBody,
  type AnnotationState,
  type EditorAnnotation,
  type EditorCommand,
} from "@/app/components/RichTextEditor";
import { FeedbackWidget } from "@/app/components/FeedbackWidget";
import { prepareBrowserCache, quarantineUnreadableBrowserCache, readBrowserCache, writeBrowserCache, writeBrowserJournal } from "@/lib/browser-cache";
import { projectDraftIntoBlocks, projectDraftIntoOneBlock, segmentDraft, type DraftGrouping } from "@/lib/draft-structure";

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
  mediaType?: string;
  dataUrl?: string;
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

type ResponsiveBlockGuide = {
  encouragement: string;
  nextStep: string;
  biggerPicture: string;
};

type WritingBlock = {
  id: string;
  heading: string;
  headingSource: "simplifii" | "student";
  body: string;
  bodyHtml?: string;
  guidanceIds: string[];
  guide?: ResponsiveBlockGuide;
};

type StructurePlanBlock = {
  heading: string;
  guidanceIds: string[];
};

type AiExtraction = Omit<Assignment, "requirements" | "criteria"> & {
  requirements: Array<Omit<Requirement, "id">>;
  criteria: Array<Omit<Criterion, "id" | "tone">>;
};

type DraftAnalysis = {
  overallComplete?: boolean;
  summary: string;
  highestLeverageCriterionId: string;
  criteria: Array<{
    criterionId: string;
    tone: Criterion["tone"];
    diagnosis: string;
    action: string;
  }>;
  blockAnalysis: Array<{
    blockId: string;
    summary: string;
    checklist: Array<{
      text: string;
      met: boolean;
    }>;
  }>;
  annotations: EditorAnnotation[];
};

type GuidanceAllocation = {
  blockId: string;
  guidanceIds: string[];
  guide: ResponsiveBlockGuide;
};

type CachedAssignment = {
  id: string;
  createdAt: number;
  updatedAt: number;
  stage: Stage;
  files: ImportedFile[];
  pastedText: string;
  draftText?: string;
  assignment: Assignment;
  choice: StructureChoice;
  structurePlan?: StructurePlanBlock[];
  blocks: WritingBlock[];
  view: ViewMode;
  analysisResult: DraftAnalysis | null;
  analysisStale?: boolean;
  annotationStateById?: Record<string, AnnotationState>;
};

type CachedAppState = {
  version: 1;
  activeAssignmentId: string;
  assignments: CachedAssignment[];
};

type AssignmentMenuProps = {
  ready: boolean;
  activeId: string;
  activeTitle: string;
  storageNote: string;
  assignments: Array<{ id: string; title: string; updatedAt: number }>;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => boolean;
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
const MAX_AI_FILE_BYTES = 10 * 1024 * 1024;
const MAX_EXISTING_DRAFT_CHARACTERS = 120_000;

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function blankCachedAssignment(): CachedAssignment {
  const now = Date.now();
  return {
    id: uid("assignment"),
    createdAt: now,
    updatedAt: now,
    stage: "import",
    files: [],
    pastedText: "",
    draftText: "",
    assignment: {
      ...DEFAULT_ASSIGNMENT,
      requirements: DEFAULT_ASSIGNMENT.requirements.map((requirement) => ({ ...requirement, keywords: [...requirement.keywords] })),
      criteria: DEFAULT_ASSIGNMENT.criteria.map((criterion) => ({ ...criterion })),
    },
    choice: "simplifii",
    structurePlan: [],
    blocks: [],
    view: "guide",
    analysisResult: null,
    analysisStale: false,
    annotationStateById: {},
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isCachedAssignment(item: unknown): item is CachedAssignment {
  if (!isRecord(item) || typeof item.id !== "string" || typeof item.createdAt !== "number" || typeof item.updatedAt !== "number") return false;
  if (!(["import", "review", "choice", "workspace"] as unknown[]).includes(item.stage)) return false;
  if (!Array.isArray(item.files) || !Array.isArray(item.blocks) || !isRecord(item.assignment)) return false;
  if (typeof item.pastedText !== "string" || (item.draftText !== undefined && typeof item.draftText !== "string") || !(["simplifii", "self"] as unknown[]).includes(item.choice)) return false;
  if (item.structurePlan !== undefined && (!Array.isArray(item.structurePlan) || !item.structurePlan.every((block) => isRecord(block) && typeof block.heading === "string" && Array.isArray(block.guidanceIds)))) return false;
  if (!(["guide", "full-draft"] as unknown[]).includes(item.view)) return false;

  const assignment = item.assignment;
  if (typeof assignment.title !== "string" || typeof assignment.courseCode !== "string" || typeof assignment.type !== "string") return false;
  if (typeof assignment.dueLabel !== "string" || typeof assignment.wordLimit !== "number" || typeof assignment.task !== "string") return false;
  if (!Array.isArray(assignment.requirements) || !Array.isArray(assignment.criteria)) return false;
  if (!item.files.every((file) => isRecord(file) && typeof file.id === "string" && typeof file.name === "string" && typeof file.text === "string")) return false;
  if (!item.blocks.every((block) => isRecord(block)
    && typeof block.id === "string"
    && typeof block.heading === "string"
    && typeof block.body === "string"
    && (block.bodyHtml === undefined || typeof block.bodyHtml === "string")
    && Array.isArray(block.guidanceIds)
    && (block.guide === undefined || (isRecord(block.guide)
      && typeof block.guide.encouragement === "string"
      && typeof block.guide.nextStep === "string"
      && typeof block.guide.biggerPicture === "string")))) return false;
  if (item.analysisStale !== undefined && typeof item.analysisStale !== "boolean") return false;
  if (item.annotationStateById !== undefined && (!isRecord(item.annotationStateById) || !Object.values(item.annotationStateById).every((state) => state === "open" || state === "edited" || state === "resolved"))) return false;
  if (item.analysisResult === null) return true;
  if (!isRecord(item.analysisResult) || typeof item.analysisResult.summary !== "string" || !Array.isArray(item.analysisResult.criteria)) return false;
  if (item.analysisResult.overallComplete !== undefined && typeof item.analysisResult.overallComplete !== "boolean") return false;
  if (item.analysisResult.blockAnalysis !== undefined && (!Array.isArray(item.analysisResult.blockAnalysis) || !item.analysisResult.blockAnalysis.every((analysis) => isRecord(analysis)
    && typeof analysis.blockId === "string"
    && typeof analysis.summary === "string"
    && Array.isArray(analysis.checklist)
    && analysis.checklist.every((check) => isRecord(check) && typeof check.text === "string" && typeof check.met === "boolean")))) return false;
  return item.analysisResult.annotations === undefined || (Array.isArray(item.analysisResult.annotations) && item.analysisResult.annotations.every((annotation) => isRecord(annotation)
    && typeof annotation.id === "string"
    && typeof annotation.criterionId === "string"
    && typeof annotation.blockId === "string"
    && (annotation.severity === "high" || annotation.severity === "med" || annotation.severity === "low")
    && typeof annotation.anchor === "string"
    && typeof annotation.title === "string"
    && typeof annotation.what === "string"
    && typeof annotation.how === "string"));
}

function isCachedAppState(value: unknown): value is CachedAppState {
  return isRecord(value)
    && value.version === 1
    && typeof value.activeAssignmentId === "string"
    && Array.isArray(value.assignments)
    && value.assignments.every(isCachedAssignment);
}

function salvageCachedAssignments(value: unknown) {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.assignments)) return [];
  return value.assignments.filter(isCachedAssignment);
}

function upsertCachedAssignment(assignments: CachedAssignment[], record: CachedAssignment) {
  const existingIndex = assignments.findIndex((item) => item.id === record.id);
  if (existingIndex < 0) return [record, ...assignments];
  const next = [...assignments];
  next[existingIndex] = record;
  return next;
}

function classifyFile(name: string): FileRole {
  const lower = name.toLowerCase();
  if (/rubric|marking|criteria/.test(lower)) return "Marking criteria";
  if (/outline|course|syllabus/.test(lower)) return "Course context";
  if (/brief|guide|instructions/.test(lower)) return "Assignment instructions";
  if (/draft|report-v|submission/.test(lower)) return "Current draft";
  if (/assessment|assignment/.test(lower)) return "Assignment instructions";
  if (/essay/.test(lower)) return "Current draft";
  return "Supporting material";
}

async function readImportedFile(file: File): Promise<ImportedFile> {
  let text = "";
  let dataUrl: string | undefined;
  if (/\.docx$/i.test(file.name)) {
    const mammoth = (await import("mammoth")).default;
    text = (await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value;
  } else if (TEXT_FILE_PATTERN.test(file.name) || file.type.startsWith("text/")) {
    text = await file.text();
  } else if ((/\.pdf$/i.test(file.name) || file.type.startsWith("image/")) && file.size <= MAX_AI_FILE_BYTES) {
    dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener("load", () => resolve(String(reader.result)));
      reader.addEventListener("error", () => reject(reader.error));
      reader.readAsDataURL(file);
    });
  }
  return {
    id: uid("file"),
    name: file.name,
    size: file.size,
    role: classifyFile(file.name),
    text,
    mediaType: file.type || (/\.pdf$/i.test(file.name) ? "application/pdf" : undefined),
    dataUrl,
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
  if (unique.length < 3) return [];

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
  return criteria.length >= 2 ? criteria.slice(0, 8) : [];
}

function extractAssignment(files: ImportedFile[], pastedText: string): Assignment {
  const assignmentFiles = files.filter((file) => file.role !== "Current draft");
  const sourceText = [pastedText, ...assignmentFiles.map((file) => file.text)].filter(Boolean).join("\n\n");
  const fileText = assignmentFiles.map((file) => file.name.replace(/\.[^.]+$/, "")).join(" ");
  const courseCode = sourceText.match(COURSE_CODE_PATTERN)?.[0] ?? fileText.match(COURSE_CODE_PATTERN)?.[0] ?? "COURSE";
  const wordLimit = Number(sourceText.match(WORD_LIMIT_PATTERN)?.[1]) || 0;
  const dueLabel = sourceText.match(DUE_PATTERN)?.[1]?.trim() ?? "Not provided";
  const titleLine = sourceText.match(/(?:assignment|assessment)\s*(?:title)?\s*[:-]\s*([^\n]{6,100})/i)?.[1]?.trim();
  const instructionsName = assignmentFiles.find((file) => file.role === "Assignment instructions")?.name.replace(/\.[^.]+$/, "");
  const title = titleLine ?? instructionsName ?? "Untitled assignment";
  const lower = sourceText.toLowerCase();
  const type = /reflection/.test(lower) ? "Reflective assignment" : /essay/.test(lower) ? "Essay" : /presentation/.test(lower) ? "Presentation" : "Assignment";

  return {
    title,
    courseCode,
    type,
    dueLabel,
    wordLimit,
    task: firstMeaningfulLine(sourceText) ?? "The task was not clear in the supplied material.",
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

// A requirement with no block whose heading actually matches it still gets
// forced into some block by reallocateGuidance's fallback. That keeps every
// requirement covered, but silently — the student never learns their
// structure might be missing a section for it. This surfaces that gap
// instead of hiding it.
function findUnhomedRequirements(requirements: Requirement[], blocks: WritingBlock[]): Requirement[] {
  return requirements.filter((requirement) => {
    if (requirement.scope === "whole-document") return false;
    return !blocks.some((block) => {
      const heading = block.heading.trim().toLowerCase();
      if (!heading) return false;
      return requirement.keywords.some((keyword) => heading.includes(keyword) || keyword.includes(heading));
    });
  });
}

function createBlocks(assignment: Assignment, choice: StructureChoice): WritingBlock[] {
  if (choice === "self") {
    return [{ id: uid("block"), heading: "", headingSource: "student", body: "", guidanceIds: assignment.requirements.map((requirement) => requirement.id) }];
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

function applyGuidanceAllocations(blocks: WritingBlock[], allocations: GuidanceAllocation[], requirements: Requirement[]) {
  const allocationMap = new Map(allocations.map((allocation) => [allocation.blockId, allocation]));
  const allowedIds = new Set(requirements.map((requirement) => requirement.id));
  return blocks.map((block) => {
    const allocation = allocationMap.get(block.id);
    if (!allocation) return block;
    const guidanceIds = [...new Set(allocation.guidanceIds.filter((id) => allowedIds.has(id)))];
    const guide = {
      encouragement: allocation.guide.encouragement.trim(),
      nextStep: allocation.guide.nextStep.trim(),
      biggerPicture: allocation.guide.biggerPicture.trim(),
    };
    return {
      ...block,
      guidanceIds: guidanceIds.length ? guidanceIds : block.guidanceIds,
      guide: guide.encouragement && guide.nextStep && guide.biggerPicture ? guide : block.guide,
    };
  });
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function wordCount(text: string) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function writingBlockWordCount(block: WritingBlock) {
  return wordCount(block.body) + (block.headingSource === "student" ? wordCount(block.heading) : 0);
}

function blockGuidanceSignature(blocks: WritingBlock[]) {
  return JSON.stringify(blocks.map(({ id, heading, body }) => ({ id, heading, body })));
}

async function requestAi<T>(action: "extract" | "structure" | "structure-draft" | "allocate" | "analyse" | "analyse-block", input: unknown): Promise<T> {
  const response = await fetch("/api/ai", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, input }),
  });
  const payload = await response.json() as T & { error?: string };
  if (response.status === 401 && typeof window !== "undefined") window.location.reload();
  if (!response.ok) throw new Error(payload.error || "Simplifii could not complete that AI step.");
  return payload;
}

function Brand() {
  return (
    <div className="brand" aria-label="Simplifii">
      <span className="brand-mark" aria-hidden="true" />
      <span>Simplifii</span>
    </div>
  );
}

function InviteGate({ checking = false, onGranted }: { checking?: boolean; onGranted?: () => void }) {
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!code.trim()) {
      setError("Enter the invite code.");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/invite", {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const payload = await response.json() as { granted?: boolean; error?: string };
      if (!response.ok || !payload.granted) throw new Error(payload.error || "That invite code could not be checked.");
      setCode("");
      onGranted?.();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That invite code could not be checked.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="invite-shell">
      <section className="invite-card" aria-labelledby="invite-heading">
        <div className="invite-mark" aria-hidden="true">S</div>
        <div className="invite-copy">
          <h1 id="invite-heading">{checking ? "Opening Simplifii…" : "Enter your invite code."}</h1>
          <p>{checking ? "Checking whether this browser already has early access." : "No account is needed. The shared code only unlocks this early build on your browser."}</p>
        </div>
        {checking ? (
          <button className="invite-submit invite-checking" type="button" disabled aria-live="polite">Checking access</button>
        ) : (
          <form className="invite-form" onSubmit={submit}>
            <label className="invite-label" htmlFor="invite-code">Invite code</label>
            <div className="invite-input-wrap">
              <input
                className="invite-input"
                id="invite-code"
                type="password"
                value={code}
                autoComplete="one-time-code"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={256}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? "invite-error" : "invite-note"}
                placeholder="Enter code"
                onChange={(event) => {
                  setCode(event.target.value);
                  if (error) setError("");
                }}
              />
            </div>
            {error ? <p className="invite-error" id="invite-error" role="alert">{error}</p> : null}
            <button className={`invite-submit${submitting ? " invite-checking" : ""}`} type="submit" disabled={submitting}>
              {submitting ? "Checking code" : "Open Simplifii"}
            </button>
          </form>
        )}
        <p className="invite-footnote" id="invite-note">Access is remembered for 30 days. Your local assignment workspace stays in this browser.</p>
      </section>
    </main>
  );
}

function InviteBoundary() {
  const [state, setState] = useState<"checking" | "required" | "granted">("checking");

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/invite", { cache: "no-store", credentials: "same-origin" })
      .then(async (response) => {
        const payload = await response.json() as { granted?: boolean };
        if (!cancelled) setState(response.ok && payload.granted ? "granted" : "required");
      })
      .catch(() => {
        if (!cancelled) setState("required");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === "checking") return <InviteGate checking />;
  if (state === "required") return <InviteGate onGranted={() => setState("granted")} />;
  return (
    <>
      <WorkspaceApp />
      <FeedbackWidget />
    </>
  );
}

function AssignmentSwitcher({ ready, activeId, activeTitle, storageNote, assignments, onSelect, onCreate, onDelete }: AssignmentMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeWithEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeWithEscape);
    };
  }, [open]);

  return (
    <div
      className="assignment-switcher"
      ref={rootRef}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        ref={triggerRef}
        className="assignment-switcher-trigger"
        type="button"
        aria-expanded={open}
        aria-controls="assignment-switcher-list"
        disabled={!ready}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="assignment-switcher-title">{activeTitle}</span>
        <span className={`assignment-caret${open ? " open" : ""}`} aria-hidden="true" />
      </button>
      {open ? (
        <div className="assignment-menu" id="assignment-switcher-list" role="group" aria-label="Assignments">
          <span className="assignment-menu-heading">Assignments</span>
          <div className="assignment-menu-list">
            {assignments.map((item) => (
              <div className={`assignment-menu-row${item.id === activeId ? " assignment-menu-active" : ""}`} key={item.id}>
                <button
                  className="assignment-menu-item"
                  type="button"
                  aria-current={item.id === activeId ? "page" : undefined}
                  onClick={() => {
                    setOpen(false);
                    if (item.id !== activeId) onSelect(item.id);
                  }}
                >
                  <span className="assignment-menu-item-copy"><strong>{item.title}</strong></span>
                  {item.id === activeId ? <span className="assignment-menu-current">Current</span> : null}
                </button>
                <button
                  className="assignment-menu-delete"
                  type="button"
                  aria-label={`Delete ${item.title}`}
                  title={`Delete ${item.title}`}
                  onClick={() => {
                    if (!onDelete(item.id)) return;
                    setOpen(false);
                    window.requestAnimationFrame(() => triggerRef.current?.focus());
                  }}
                >
                  <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 4.5h9M6 4.5V3.2h4v1.3m-5.4 0 .6 8.2h5.6l.6-8.2M6.8 6.6v4.1m2.4-4.1v4.1" /></svg>
                </button>
              </div>
            ))}
          </div>
          <button
            className="assignment-menu-create"
            type="button"
            onClick={() => {
              setOpen(false);
              onCreate();
            }}
          >
            <span aria-hidden="true">+</span> Create new assignment
          </button>
          <span className="assignment-menu-note">{storageNote}</span>
        </div>
      ) : null}
    </div>
  );
}

function ImportHeader({ assignmentMenu }: { assignmentMenu: AssignmentMenuProps }) {
  return (
    <header className="simple-topbar">
      <Brand />
      <AssignmentSwitcher {...assignmentMenu} />
      <span className="topbar-note">Assignment workspace</span>
    </header>
  );
}

function CacheRecoveryScreen() {
  return (
    <div className="setup-shell">
      <header className="simple-topbar">
        <Brand />
        <span className="topbar-note">Browser cache protected</span>
      </header>
      <main className="setup-main">
        <section className="setup-intro">
          <span className="eyebrow">LOCAL DATA NEEDS ATTENTION</span>
          <h1>Simplifii has not overwritten it.</h1>
          <p>The saved browser data could not be read or copied into recovery safely, so this workspace is paused instead of letting new writing disappear.</p>
        </section>
        <section className="setup-card">
          <div className="card-heading-row">
            <div>
              <h2>Clear this site’s stored data, then reload</h2>
              <p>This only affects Simplifii data held by this browser. You can also open the site in another browser profile to begin a clean local workspace.</p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function ImportScreen({
  files,
  pastedText,
  onFiles,
  onPaste,
  onRemove,
  onContinue,
  isReading,
  error,
  assignmentMenu,
}: {
  files: ImportedFile[];
  pastedText: string;
  onFiles: (files: File[]) => void;
  onPaste: (value: string) => void;
  onRemove: (id: string) => void;
  onContinue: () => void;
  isReading: boolean;
  error: string;
  assignmentMenu: AssignmentMenuProps;
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
      <ImportHeader assignmentMenu={assignmentMenu} />
      <main className="setup-main">
        <section className="setup-intro">
          <span className="eyebrow">START AN ASSIGNMENT</span>
          <h1>Add your assignment brief and rubric.</h1>
          <p>For this test, just those two: the instructions you were given, and how it is marked. Simplifii reads them and carries the details into your writing workspace. Nothing else yet, even if you have a course outline or a draft on hand.</p>
        </section>

        <section className="setup-card" aria-labelledby="materials-heading">
          <div className="card-heading-row">
            <div>
              <h2 id="materials-heading">Assignment brief and rubric only</h2>
              <p>Two files max for this test: what you were given for the assignment, and the marking criteria. Hold off on the course outline or a draft for now.</p>
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
              accept=".pdf,.docx,.txt,.md,.html,image/*"
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
          {files.length > 2 ? (
            <p className="inline-error" role="alert">That is more than the two this test covers. Remove the extra files so it is just the brief and the rubric.</p>
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
            <span>{error ? <span className="inline-error" role="alert">{error}</span> : "Start with what you have. You can add more material later."}</span>
            <button className="primary-button" type="button" disabled={isReading || (!files.length && !pastedText.trim())} onClick={onContinue}>{isReading ? "Reading…" : "Read assignment"}</button>
          </div>
        </section>
      </main>
    </div>
  );
}

function ReviewScreen({ assignment, files, onBack, onContinue, assignmentMenu }: { assignment: Assignment; files: ImportedFile[]; onBack: () => void; onContinue: () => void; assignmentMenu: AssignmentMenuProps }) {
  return (
    <div className="setup-shell">
      <ImportHeader assignmentMenu={assignmentMenu} />
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
            <div><span>Length</span><strong>{assignment.wordLimit > 0 ? `${assignment.wordLimit.toLocaleString()} words` : "Not provided"}</strong></div>
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

function ChoiceScreen({
  choice,
  draftText,
  hasDraftFile,
  hasReadableDraftFile,
  hasDraft,
  onChoice,
  onDraftText,
  onBack,
  onContinue,
  isStructuring,
  error,
  assignmentMenu,
}: {
  choice: StructureChoice;
  draftText: string;
  hasDraftFile: boolean;
  hasReadableDraftFile: boolean;
  hasDraft: boolean;
  onChoice: (choice: StructureChoice) => void;
  onDraftText: (value: string) => void;
  onBack: () => void;
  onContinue: () => void;
  isStructuring: boolean;
  error: string;
  assignmentMenu: AssignmentMenuProps;
}) {
  const draftHelper = hasReadableDraftFile && !draftText.trim()
    ? "A readable draft file is already attached. Paste here only if this is a newer version."
    : hasDraftFile && !draftText.trim()
      ? "A draft file is attached. Paste its text here so Simplifii can preserve the exact wording in blocks."
      : "Paste anything you have written so far. Simplifii will keep your wording and carry it into the workspace.";

  return (
    <div className="setup-shell">
      <ImportHeader assignmentMenu={assignmentMenu} />
      <main className="setup-main choice-main">
        <button className="back-button" type="button" onClick={onBack}>← Check extraction</button>
        <section className="setup-intro compact-intro">
          <span className="eyebrow">YOUR STARTING POINT</span>
          <h1>How do you want to begin?</h1>
          <p>Both choices open the same writing workspace. Only the starting blocks change.</p>
        </section>

        <section className="review-card draft-start-card" aria-labelledby="existing-draft-label">
          <label className="paste-label" id="existing-draft-label" htmlFor="existing-draft">Existing draft (optional)</label>
          <p id="existing-draft-helper">{draftHelper}</p>
          <textarea
            id="existing-draft"
            className="paste-area draft-start-area"
            value={draftText}
            maxLength={MAX_EXISTING_DRAFT_CHARACTERS}
            disabled={isStructuring}
            aria-describedby="existing-draft-helper"
            onChange={(event) => onDraftText(event.target.value)}
            placeholder="Paste your draft here…"
          />
        </section>

        <div className="choice-grid" role="radiogroup" aria-label="Starting structure">
          <button className={`choice-card${choice === "simplifii" ? " selected" : ""}`} role="radio" aria-checked={choice === "simplifii"} type="button" disabled={isStructuring} onClick={() => onChoice("simplifii")}>
            <span className="choice-radio" aria-hidden="true"><i /></span>
            <span className="choice-visual blocks-visual" aria-hidden="true"><i /><i /><i /></span>
            <strong>{hasDraft ? "Simplifii structures my draft" : "Simplifii structures it"}</strong>
            <span>{hasDraft ? "Your existing writing is placed inside blocks without being rewritten, and the extracted guidance follows it." : "Simplifii creates the blocks and places the extracted guidance where it is most useful."}</span>
          </button>
          <button className={`choice-card${choice === "self" ? " selected" : ""}`} role="radio" aria-checked={choice === "self"} type="button" disabled={isStructuring} onClick={() => onChoice("self")}>
            <span className="choice-radio" aria-hidden="true"><i /></span>
            <span className="choice-visual page-visual" aria-hidden="true"><i /><i /><i /></span>
            <strong>{hasDraft ? "Keep my draft in one block" : "I’ll structure it myself"}</strong>
            <span>{hasDraft ? "Your complete draft starts in one block with all the guidance. Add another block with + whenever it helps." : "Begin with one block containing all the guidance. Add another block with + whenever it helps."}</span>
          </button>
        </div>

        <div className="choice-actions">
          <span>{error ? <span className="inline-error" role="alert">{error}</span> : "Nothing about your assignment changes. This only decides the first view."}</span>
          <button className="primary-button" type="button" disabled={isStructuring} onClick={onContinue}>{isStructuring ? (hasDraft ? "Structuring draft…" : "Creating…") : "Create workspace"}</button>
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
  assignmentMenu,
  blocks,
  view,
  analysis,
  analysisResult,
  analysisStale,
  analysisError,
  annotationStateById,
  focusHeadingId,
  onView,
  onHeading,
  onBody,
  onBlur,
  onInsert,
  onRemove,
  onAnalyse,
  onAnalyseBlock,
  analysingBlockId,
  blockAnalysisErrors,
  onAnnotationsEdited,
  onAnnotationResolved,
  onAnnotationsRechecked,
  saveLabel,
}: {
  assignment: Assignment;
  assignmentMenu: AssignmentMenuProps;
  blocks: WritingBlock[];
  view: ViewMode;
  analysis: AnalysisState;
  analysisResult: DraftAnalysis | null;
  analysisStale: boolean;
  analysisError: string;
  annotationStateById: Record<string, AnnotationState>;
  focusHeadingId: string | null;
  onView: (view: ViewMode) => void;
  onHeading: (blockId: string, value: string) => void;
  onBody: (blockId: string, value: string, html: string) => void;
  onBlur: () => void;
  onInsert: (anchorId: string, position: "before" | "after") => void;
  onRemove: (blockId: string) => void;
  onAnalyse: () => void;
  onAnalyseBlock: (blockId: string) => void;
  analysingBlockId: string | null;
  blockAnalysisErrors: Record<string, string>;
  onAnnotationsEdited: (annotationIds: string[]) => void;
  onAnnotationResolved: (annotationId: string) => void;
  onAnnotationsRechecked: (states: Record<string, AnnotationState>) => void;
  saveLabel: string;
}) {
  const requirementMap = useMemo(() => new Map(assignment.requirements.map((requirement) => [requirement.id, requirement])), [assignment.requirements]);
  const feedbackMap = useMemo(() => new Map(analysisResult?.criteria.map((criterion) => [criterion.criterionId, criterion]) ?? []), [analysisResult]);
  const blockAnalysisMap = useMemo(() => new Map((analysisResult?.blockAnalysis ?? []).map((block) => [block.blockId, block])), [analysisResult]);
  const criterionMap = useMemo(() => new Map(assignment.criteria.map((criterion) => [criterion.id, criterion])), [assignment.criteria]);
  const highestLeverageCriterion = assignment.criteria.find((criterion) => criterion.id === analysisResult?.highestLeverageCriterionId);
  const totalWords = blocks.reduce((total, block) => total + writingBlockWordCount(block), 0);
  const blockIds = useMemo(() => new Set(blocks.map((block) => block.id)), [blocks]);
  const progressStats = useMemo(() => {
    const blocksStarted = blocks.filter((block) => writingBlockWordCount(block) > 0).length;
    let checksTotal = 0;
    let checksMet = 0;
    for (const block of blocks) {
      const guidance = block.guidanceIds.map((id) => requirementMap.get(id)).filter((item): item is Requirement => Boolean(item));
      const blockReview = blockAnalysisMap.get(block.id);
      const checks = blockReview?.checklist.length ? blockReview.checklist : guidance.map((requirement) => ({ text: requirement.text, met: false }));
      checksTotal += checks.length;
      checksMet += checks.filter((check) => check.met).length;
    }
    return {
      blocksStarted,
      totalBlocks: blocks.length,
      percent: checksTotal > 0 ? Math.round((checksMet / checksTotal) * 100) : 0,
    };
  }, [blocks, requirementMap, blockAnalysisMap]);
  const nextTask = useMemo(() => {
    const candidates = blocks.map((block) => {
      const guidance = block.guidanceIds.map((id) => requirementMap.get(id)).filter((item): item is Requirement => Boolean(item));
      const blockReview = blockAnalysisMap.get(block.id);
      const checks = blockReview?.checklist.length ? blockReview.checklist : guidance.map((requirement) => ({ text: requirement.text, met: false }));
      const firstUnmet = checks.find((check) => !check.met);
      return firstUnmet ? { blockId: block.id, heading: block.heading || "this block", text: firstUnmet.text } : null;
    });
    return candidates.find((candidate): candidate is { blockId: string; heading: string; text: string } => Boolean(candidate)) ?? null;
  }, [blocks, requirementMap, blockAnalysisMap]);
  const unhomedRequirements = useMemo(
    () => findUnhomedRequirements(assignment.requirements, blocks),
    [assignment.requirements, blocks],
  );
  const allAnnotations = useMemo(
    () => (analysisResult?.annotations ?? []).filter((annotation) => blockIds.has(annotation.blockId) && criterionMap.has(annotation.criterionId)),
    [analysisResult, blockIds, criterionMap],
  );
  const renderableAnnotations = useMemo(() => {
    const bodyByBlockId = new Map(blocks.map((block) => [block.id, block.body]));
    return allAnnotations.filter((annotation) => {
      if ((annotationStateById[annotation.id] ?? "open") !== "open") return false;
      const body = bodyByBlockId.get(annotation.blockId);
      if (body === undefined) return false;
      const start = body.indexOf(annotation.anchor);
      return start >= 0 && body.lastIndexOf(annotation.anchor) === start;
    });
  }, [allAnnotations, annotationStateById, blocks]);
  const [expandedBlockIds, setExpandedBlockIds] = useState<Set<string>>(() => new Set());
  const [renderedAnnotationIdsByBlock, setRenderedAnnotationIdsByBlock] = useState<Record<string, string[]>>({});
  const [activeCriterionId, setActiveCriterionId] = useState<string | null>(null);
  const [coachNote, setCoachNote] = useState<{ annotationId: string; pinned: boolean; left: number; top: number; maxHeight: number; anchor: HTMLElement } | null>(null);
  const [toast, setToast] = useState("");
  const [criterionBarHeight, setCriterionBarHeight] = useState(0);
  const editorsRef = useRef(new Map<string, HTMLDivElement>());
  const coachRef = useRef<HTMLDivElement>(null);
  const coachHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingAnnotationId = useRef<string | null>(null);
  const rubricRef = useRef<HTMLElement>(null);
  const criterionBarRef = useRef<HTMLDivElement>(null);
  const renderedAnnotationIdSet = useMemo(
    () => new Set(Object.values(renderedAnnotationIdsByBlock).flat()),
    [renderedAnnotationIdsByBlock],
  );
  const displayedAnnotations = useMemo(
    () => renderableAnnotations.filter((annotation) => renderedAnnotationIdSet.has(annotation.id)),
    [renderableAnnotations, renderedAnnotationIdSet],
  );

  const visibleAnnotations = useMemo(
    () => activeCriterionId ? renderableAnnotations.filter((annotation) => annotation.criterionId === activeCriterionId) : renderableAnnotations,
    [activeCriterionId, renderableAnnotations],
  );
  const annotationsByBlock = useMemo(() => {
    const result = new Map<string, EditorAnnotation[]>();
    for (const annotation of visibleAnnotations) {
      const current = result.get(annotation.blockId) ?? [];
      current.push(annotation);
      result.set(annotation.blockId, current);
    }
    return result;
  }, [visibleAnnotations]);
  const activeCriterion = activeCriterionId ? criterionMap.get(activeCriterionId) : undefined;
  const activeCriterionAnnotations = activeCriterionId ? allAnnotations.filter((annotation) => annotation.criterionId === activeCriterionId) : [];
  const activeOpenCount = displayedAnnotations.filter((annotation) => annotation.criterionId === activeCriterionId).length;
  const activeEditedCount = activeCriterionAnnotations.filter((annotation) => annotationStateById[annotation.id] === "edited").length;
  const coachAnnotation = coachNote ? allAnnotations.find((annotation) => annotation.id === coachNote.annotationId) : undefined;
  const coachCriterion = coachAnnotation ? criterionMap.get(coachAnnotation.criterionId) : undefined;

  useEffect(() => {
    if (!focusHeadingId) return;
    document.querySelector<HTMLInputElement>(`[data-block-heading-id="${focusHeadingId}"]`)?.focus();
  }, [focusHeadingId]);

  useEffect(() => () => {
    if (coachHideTimer.current) clearTimeout(coachHideTimer.current);
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      if (coachRef.current?.contains(target) || target.closest("mark[data-annotation-id]")) return;
      setCoachNote((current) => current?.pinned ? null : current);
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (coachNote) {
        coachNote.anchor.focus();
        setCoachNote(null);
        return;
      }
      if (activeCriterionId) {
        setActiveCriterionId(null);
        onView("guide");
        setTimeout(() => rubricRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [activeCriterionId, coachNote, onView]);

  useEffect(() => {
    if (coachNote?.pinned && document.activeElement === coachNote.anchor) coachRef.current?.focus();
  }, [coachNote]);

  const coachAnchor = coachNote?.anchor;
  const coachAnnotationId = coachNote?.annotationId;

  useEffect(() => {
    if (!coachAnchor || !coachAnnotationId) return;
    const frame = window.requestAnimationFrame(() => {
      const note = coachRef.current;
      if (!note) return;
      const anchorRect = coachAnchor.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const fullHeight = Math.min(note.scrollHeight, viewportHeight - 16);
      const below = anchorRect.bottom + 10;
      const top = below + fullHeight <= viewportHeight - 8
        ? below
        : Math.max(8, Math.min(anchorRect.top - fullHeight - 10, viewportHeight - fullHeight - 8));
      const maxHeight = Math.max(120, viewportHeight - top - 8);
      setCoachNote((current) => {
        if (!current || current.annotationId !== coachAnnotationId || current.anchor !== coachAnchor) return current;
        if (Math.abs(current.top - top) < 1 && Math.abs(current.maxHeight - maxHeight) < 1) return current;
        return { ...current, top, maxHeight };
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [coachAnchor, coachAnnotationId]);

  useEffect(() => {
    const bar = criterionBarRef.current;
    if (!bar || !activeCriterionId || typeof ResizeObserver === "undefined") return;
    const updateHeight = () => setCriterionBarHeight(Math.ceil(bar.getBoundingClientRect().height));
    const observer = new ResizeObserver(updateHeight);
    observer.observe(bar);
    const frame = window.requestAnimationFrame(updateHeight);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [activeCriterionId]);

  const showToast = useCallback((message: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(""), 2800);
  }, []);

  const registerEditor = useCallback((blockId: string, editor: HTMLDivElement | null) => {
    if (editor) editorsRef.current.set(blockId, editor);
    else editorsRef.current.delete(blockId);
  }, []);

  const reportRenderedAnnotations = useCallback((blockId: string, annotationIds: string[]) => {
    const uniqueIds = [...new Set(annotationIds)];
    setRenderedAnnotationIdsByBlock((current) => {
      const previous = current[blockId] ?? [];
      if (previous.length === uniqueIds.length && previous.every((id, index) => id === uniqueIds[index])) return current;
      const next = { ...current };
      if (uniqueIds.length) next[blockId] = uniqueIds;
      else delete next[blockId];
      return next;
    });
  }, []);

  const runEditorCommand = useCallback((command: EditorCommand) => {
    const selection = window.getSelection();
    const selectionElement = selection?.anchorNode instanceof HTMLElement
      ? selection.anchorNode
      : selection?.anchorNode?.parentElement;
    const selectedEditor = selectionElement?.closest<HTMLDivElement>("[data-rich-editor]");
    const editor = selectedEditor ?? editorsRef.current.values().next().value;
    if (!editor) return;
    if (!selectedEditor) editor.focus({ preventScroll: true });
    document.execCommand(command, false);
    editor.dispatchEvent(new Event("input", { bubbles: true }));
  }, []);

  const previewAnnotation = useCallback((annotationId: string, anchor: HTMLElement, pinned: boolean) => {
    if (coachHideTimer.current) clearTimeout(coachHideTimer.current);
    setCoachNote((current) => {
      if (current?.pinned && !pinned) return current;
      const rect = anchor.getBoundingClientRect();
      const width = Math.min(352, window.innerWidth - 24);
      const left = Math.max(12, Math.min(rect.left - 10, window.innerWidth - width - 12));
      const below = rect.bottom + 10;
      return { annotationId, pinned, left, top: below, maxHeight: window.innerHeight - 16, anchor };
    });
  }, []);

  const hideAnnotationSoon = useCallback(() => {
    if (coachHideTimer.current) clearTimeout(coachHideTimer.current);
    coachHideTimer.current = setTimeout(() => {
      setCoachNote((current) => current?.pinned ? current : null);
    }, 260);
  }, []);

  const revealAnnotation = useCallback((annotationId: string) => {
    const mark = document.querySelector<HTMLElement>(`mark[data-annotation-id="${annotationId}"]`);
    if (!mark) {
      showToast("That sentence changed. Run the analysis again to place a fresh highlight.");
      return;
    }
    mark.scrollIntoView({ behavior: "smooth", block: "center" });
    mark.focus({ preventScroll: true });
    mark.classList.remove("annotation-jump");
    void mark.offsetWidth;
    mark.classList.add("annotation-jump");
    window.setTimeout(() => mark.classList.remove("annotation-jump"), 1400);
    previewAnnotation(annotationId, mark, true);
  }, [previewAnnotation, showToast]);

  useEffect(() => {
    const annotationId = pendingAnnotationId.current;
    if (view !== "full-draft" || !annotationId || !renderedAnnotationIdSet.has(annotationId)) return;
    pendingAnnotationId.current = null;
    revealAnnotation(annotationId);
  }, [renderedAnnotationIdSet, revealAnnotation, view]);

  const handleBodyChange = useCallback((blockId: string, value: string, html: string, editedAnnotationIds: string[]) => {
    onBody(blockId, value, html);
    if (editedAnnotationIds.length) onAnnotationsEdited(editedAnnotationIds);
  }, [onAnnotationsEdited, onBody]);

  const changeView = (nextView: ViewMode) => {
    if (nextView === "guide") {
      pendingAnnotationId.current = null;
      setActiveCriterionId(null);
    }
    setCoachNote(null);
    onView(nextView);
  };

  const openCriterion = (criterionId: string) => {
    const first = displayedAnnotations.find((annotation) => annotation.criterionId === criterionId);
    pendingAnnotationId.current = first?.id ?? null;
    setActiveCriterionId(criterionId);
    setCoachNote(null);
    changeView("full-draft");
  };

  const leaveCriterion = () => {
    setActiveCriterionId(null);
    setCoachNote(null);
    changeView("guide");
    setTimeout(() => rubricRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  };

  const recheckCriterion = () => {
    if (!activeCriterionId) return;
    const next = { ...annotationStateById };
    let addressed = 0;
    for (const annotation of activeCriterionAnnotations) {
      const block = blocks.find((candidate) => candidate.id === annotation.blockId);
      const firstOccurrence = block?.body.indexOf(annotation.anchor) ?? -1;
      const lastOccurrence = block?.body.lastIndexOf(annotation.anchor) ?? -1;
      const currentState = next[annotation.id] ?? "open";
      if (!block || firstOccurrence < 0 || currentState === "resolved") {
        next[annotation.id] = "resolved";
        addressed += 1;
      } else if (currentState === "edited" || firstOccurrence !== lastOccurrence) {
        // Once the original marked range has changed, a matching copy elsewhere
        // cannot safely prove that the feedback still belongs there. A fresh
        // analysis run is the only operation allowed to create a new anchor.
        next[annotation.id] = "edited";
      } else {
        next[annotation.id] = "open";
      }
    }
    onAnnotationsRechecked(next);
    setCoachNote(null);
    showToast(addressed === activeCriterionAnnotations.length
      ? `All ${addressed} addressed on this criterion.`
      : `${addressed} of ${activeCriterionAnnotations.length} addressed. The rest stay highlighted.`);
  };

  const scrollToBlock = (blockId: string) => {
    const editor = editorsRef.current.get(blockId);
    if (!editor) return;
    editor.scrollIntoView({ behavior: "smooth", block: "center" });
    editor.focus();
  };

  const closeCoach = () => {
    const anchor = coachNote?.anchor;
    setCoachNote(null);
    anchor?.focus();
  };

  return (
    <div className="workspace-shell">
      <header className="workspace-topbar">
        <Brand />
        <AssignmentSwitcher {...assignmentMenu} />
        <span className="bar-divider" aria-hidden="true" />
        <div className="document-identity">
          <span>{assignment.courseCode} · {assignment.type}</span>
        </div>
        <span className="due-pill"><i />{assignment.dueLabel === "Not provided" ? "Due date not provided" : `Due ${assignment.dueLabel} · On track`}</span>
        <span className="bar-spacer" />
        <span className="save-label" aria-live="polite">{saveLabel}</span>
        <button className="text-button" type="button">History</button>
        <button className="text-button" type="button" aria-label="Reading settings">Aa</button>
        <div className="view-toggle" role="group" aria-label="Writing view">
          <button className={view === "guide" ? "active" : ""} type="button" aria-label="Guide blocks" title="Guide blocks" onClick={() => changeView("guide")}><ViewIcon mode="guide" /></button>
          <button className={view === "full-draft" ? "active" : ""} type="button" aria-label="Full draft" title="Full draft" onClick={() => changeView("full-draft")}><ViewIcon mode="full-draft" /></button>
        </div>
        <button className="export-button" type="button">Export</button>
      </header>

      <main className="workspace-scroll" style={{ "--criterion-bar-height": `${criterionBarHeight}px` } as CSSProperties}>
        {activeCriterion ? (
          <div className="criterion-focus-bar" ref={criterionBarRef}>
            <div>
              <span className="criterion-focus-dot" aria-hidden="true" />
              <strong>{activeCriterion.name.toUpperCase()}</strong>
              <p>{activeOpenCount} highlights. Hover or focus one to read the note; edit the text and Re-check.</p>
              <span className="criterion-focus-spacer" />
              <button className={activeEditedCount ? "recheck-button pulse" : "recheck-button"} type="button" onClick={recheckCriterion}>Re-check</button>
              <button className="back-to-rubric" type="button" onClick={leaveCriterion}>Back to rubric</button>
            </div>
          </div>
        ) : null}
        <div className="workspace-column">
          {view === "guide" ? (
            <div className="guide-layout">
              <div className="progress-shell">
                <div className="progress-top">
                  <strong>{progressStats.blocksStarted} of {progressStats.totalBlocks} sections started</strong>
                  <span>{progressStats.percent}% understood</span>
                </div>
                <div className="progress-track"><div className="progress-fill" style={{ width: `${progressStats.percent}%` }} /></div>
                <div className="progress-steps">
                  {blocks.map((block) => (
                    <div
                      key={block.id}
                      className={`progress-step${writingBlockWordCount(block) > 0 ? " done" : ""}`}
                      aria-hidden="true"
                    />
                  ))}
                </div>
              </div>

              {nextTask ? (
                <div className="next-task-chip">
                  <span className="dot" aria-hidden="true" />
                  <div>
                    <div className="label">ONE THING TO DO NEXT</div>
                    <div className="task">{nextTask.text}</div>
                  </div>
                  <button type="button" onClick={() => scrollToBlock(nextTask.blockId)}>Take me there</button>
                </div>
              ) : null}

              <section className="rubric-section" ref={rubricRef}>
                <div className="rubric-heading">
                  <div><span className="review-label">RUBRIC</span><p>Marked against the imported criteria.</p></div>
                  {analysis === "idle" ? <button className="primary-button small" type="button" onClick={onAnalyse}>Analyse my draft</button> : null}
                  {analysis === "complete" ? <button className="secondary-button small" type="button" onClick={onAnalyse}>Run again</button> : null}
                </div>
                {analysis === "running" ? <div className="analysis-running"><span><i /><i /><i /></span>Reading your draft against each criterion…</div> : null}
                {analysisError ? <div className="analysis-error" role="alert">{analysisError}</div> : null}
                {analysis === "complete" && analysisResult ? (
                  <>
                    <div className="analysis-summary">
                      <strong>Next focus</strong>
                      <div><span>{highestLeverageCriterion?.name ?? "The clearest next step"}</span> has the highest leverage in this draft.</div>
                      <div>{analysisResult.summary}</div>
                      <p>{analysisStale ? "Your draft changed after this analysis. The comments remain anchored; run again when you want a fresh reading." : "This is guidance against the rubric—not a mark."}</p>
                    </div>
                    <div className="criterion-grid">
                      {assignment.criteria.map((criterion) => {
                        const feedback = feedbackMap.get(criterion.id);
                        const annotationCount = displayedAnnotations.filter((annotation) => annotation.criterionId === criterion.id).length;
                        return (
                          <article className={`criterion-card ${feedback?.tone ?? criterion.tone}`} key={criterion.id}>
                            <div><strong>{criterion.name}</strong></div>
                            <p>{feedback?.diagnosis ?? criterion.description}</p>
                            <p className="criterion-action"><strong>Next:</strong> {feedback?.action ?? "Review this criterion against the current draft."}</p>
                            <button type="button" disabled={annotationCount === 0} onClick={() => openCriterion(criterion.id)}>{annotationCount ? `See ${annotationCount} highlight${annotationCount === 1 ? "" : "s"} in the draft` : "No inline highlights for this criterion"}</button>
                          </article>
                        );
                      })}
                    </div>
                  </>
                ) : null}
              </section>

              <div className="blocks-list">
                {blocks.map((block, index) => {
                  const guidance = block.guidanceIds.map((id) => requirementMap.get(id)).filter((item): item is Requirement => Boolean(item));
                  const blockReview = blockAnalysisMap.get(block.id);
                  const checks = blockReview?.checklist.length
                    ? blockReview.checklist
                    : guidance.map((requirement) => ({ text: requirement.text, met: false }));
                  const completedChecks = checks.filter((check) => check.met).length;
                  const blockAnnotations = displayedAnnotations.filter((annotation) => annotation.blockId === block.id);
                  const outstandingBlockAnnotations = allAnnotations.filter((annotation) => annotation.blockId === block.id && (annotationStateById[annotation.id] ?? "open") !== "resolved");
                  const priorityCount = outstandingBlockAnnotations.filter((annotation) => annotation.severity === "high").length;
                  const attentionCount = outstandingBlockAnnotations.filter((annotation) => annotation.severity === "med").length;
                  const polishCount = outstandingBlockAnnotations.filter((annotation) => annotation.severity === "low").length;
                  const staleFindingCount = outstandingBlockAnnotations.length - blockAnnotations.length;
                  const words = writingBlockWordCount(block);
                  const displayHeading = block.heading.trim() || "this block";
                  const isReviewing = analysingBlockId === block.id;
                  const hasBlockReview = Boolean(blockReview);
                  const nextStep = block.guide?.nextStep || guidance[0]?.text || "Decide what this section needs to help the reader understand, then write that idea in your own words.";
                  const status = words === 0
                    ? "empty"
                    : hasBlockReview
                      ? priorityCount > 0 ? "priority" : attentionCount > 0 || checks.some((check) => !check.met) ? "attention" : "good"
                      : "attention";
                  const statusLabel = words === 0
                    ? "Not started"
                    : !hasBlockReview
                      ? "In progress"
                      : status === "priority" ? "Needs work" : status === "attention" ? "Needs attention" : "On track";
                  const expanded = expandedBlockIds.has(block.id);
                  return (
                    <div className="block-wrap" key={block.id}>
                      {index === 0 ? <PlusButton label="Add a block above" onClick={() => onInsert(block.id, "before")} /> : null}
                      <article className={`writing-block ${status}${expanded ? " is-expanded" : ""}`}>
                        <div className="block-guide">
                          <div className="block-guide-top">
                            <span className="violet-dot" aria-hidden="true" />
                            <span className="guide-title">GUIDE{block.heading.trim() ? ` · ${block.heading.trim().toUpperCase()}` : ""}</span>
                            <span className="guide-count">{completedChecks}/{checks.length} steps</span>
                            <span className="block-status"><i />{statusLabel}</span>
                          </div>
                          <div className="block-guide-content">
                            {block.guide?.encouragement ? <p className="guide-encouragement">{block.guide.encouragement}</p> : null}
                            <div className="guide-next-row">
                              <div className="guide-next-step">
                                <strong>{words ? "NEXT STEP" : "START HERE"}</strong>
                                <span>{nextStep}</span>
                              </div>
                              <button
                                className="block-review-button"
                                type="button"
                                disabled={words === 0 || analysis === "running" || analysingBlockId !== null}
                                aria-busy={isReviewing}
                                title={words === 0 ? "Write something in this block first" : undefined}
                                onClick={() => onAnalyseBlock(block.id)}
                              >{isReviewing ? "Reviewing…" : hasBlockReview ? "Review again" : "Review this block"}</button>
                            </div>
                            {block.guide?.biggerPicture ? <p className="guide-bigger-picture"><strong>Bigger picture:</strong> {block.guide.biggerPicture}</p> : null}
                            {blockAnalysisErrors[block.id] ? <p className="block-review-error" role="alert">{blockAnalysisErrors[block.id]}</p> : null}
                          </div>
                          <ul className="guidance-list" aria-label={`${displayHeading} checklist`}>
                            {checks.map((check, checkIndex) => (
                              <li className={check.met ? "met" : "unmet"} key={`${block.id}-check-${checkIndex}`}>
                                <i aria-hidden="true">{check.met ? "✓" : ""}</i>
                                <span><span className="visually-hidden">{check.met ? "Met: " : "Not yet met: "}</span>{check.text}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                        {analysis === "running" || isReviewing ? (
                          <div className="block-analysis block-analysis-running">
                            <span><i /><i /><i /></span>{isReviewing ? "Reviewing this block…" : "Reading this block against the rubric…"}
                          </div>
                        ) : null}
                        {blockReview && analysisResult && !isReviewing ? (
                          <section className="block-analysis" aria-label={`${displayHeading} rubric analysis`}>
                            <div className={`block-analysis-meta ${status}`}>
                              <i aria-hidden="true" />
                              <span>Rubric reading · {words} words read</span>
                              {priorityCount ? <span>· {priorityCount} to fix</span> : null}
                              {attentionCount ? <span>· {attentionCount} to watch</span> : null}
                              {polishCount ? <span>· {polishCount} {polishCount === 1 ? "strength or polish point" : "strengths or polish points"}</span> : null}
                              {staleFindingCount ? <span>· {staleFindingCount} changed {staleFindingCount === 1 ? "finding needs" : "findings need"} a fresh analysis</span> : null}
                              <span>· {blockAnnotations.length ? "select a finding to jump to its highlighted text" : "no exact text highlight in this block"}</span>
                            </div>
                            <p>{blockReview?.summary ?? (blockAnnotations.length
                              ? "These findings are tied to the rubric. Select one to reveal its exact sentence and full comment."
                              : "Run the analysis again to add a rubric reading for this block.")}</p>
                            {blockAnnotations.length ? (
                              <div className="block-findings">
                                {blockAnnotations.map((annotation) => (
                                    <button
                                      className={`block-finding annotation-${annotation.severity}`}
                                      type="button"
                                      key={annotation.id}
                                      onClick={() => revealAnnotation(annotation.id)}
                                      aria-label={`${annotation.title}. Jump to highlighted text. ${annotation.what}`}
                                    >
                                      <i aria-hidden="true" />
                                      <span><strong>{annotation.title}.</strong> {annotation.what}</span>
                                    </button>
                                ))}
                              </div>
                            ) : null}
                          </section>
                        ) : null}
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
                                event.currentTarget.parentElement?.querySelector<HTMLElement>("[data-rich-editor]")?.focus();
                              }}
                              aria-label="Section heading"
                              placeholder="Write the first sentence — this becomes the section heading"
                            />
                          ) : null}
                          <RichTextBody
                            blockId={block.id}
                            value={block.body}
                            html={block.bodyHtml}
                            annotations={annotationsByBlock.get(block.id) ?? []}
                            annotationStateById={annotationStateById}
                            className="block-editor rich-editor"
                            aria-label={`${displayHeading} draft text`}
                            placeholder={block.headingSource === "student" ? "Continue writing underneath…" : `Write your ${displayHeading.toLowerCase()} here…`}
                            onRegister={registerEditor}
                            onAnnotationsRendered={reportRenderedAnnotations}
                            onChange={handleBodyChange}
                            onBlur={onBlur}
                            onAnnotationPreview={previewAnnotation}
                            onAnnotationLeave={hideAnnotationSoon}
                          />
                        </div>
                        <EditorToolbar className="block-editor-toolbar" wordLabel={`${words} words`} onCommand={runEditorCommand}>
                          <button
                            className="block-toolbar-action"
                            type="button"
                            aria-pressed={expanded}
                            onClick={() => setExpandedBlockIds((current) => {
                              const next = new Set(current);
                              if (next.has(block.id)) next.delete(block.id);
                              else next.add(block.id);
                              return next;
                            })}
                          >{expanded ? "Natural height" : "Enlarge"}</button>
                          <button className="block-toolbar-action remove" type="button" aria-label={`Delete ${displayHeading}`} title="Delete this block" onClick={() => onRemove(block.id)}>Delete block</button>
                        </EditorToolbar>
                      </article>
                      <PlusButton label={`Add a block below ${displayHeading}`} onClick={() => onInsert(block.id, "after")} />
                    </div>
                  );
                })}
              </div>

              {unhomedRequirements.length && blocks.length ? (
                <div className="suggested-block">
                  <span className="icon" aria-hidden="true">+</span>
                  <div>
                    <strong>Your rubric also mentions something with no block yet</strong>
                    <p>{unhomedRequirements[0].text} {unhomedRequirements.length > 1 ? `(and ${unhomedRequirements.length - 1} more like it)` : ""}</p>
                  </div>
                  <button type="button" onClick={() => onInsert(blocks[blocks.length - 1].id, "after")}>Add block</button>
                </div>
              ) : null}
            </div>
          ) : (
            <article className="full-draft-card">
              <div className="draft-heading">
                <span>{assignment.courseCode} · {assignment.type.toUpperCase()}</span>
                <h1>{assignment.title}</h1>
              </div>
              <EditorToolbar className="draft-toolbar" wordLabel={`${totalWords} words`} onCommand={runEditorCommand} />
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
                          event.currentTarget.parentElement?.querySelector<HTMLElement>("[data-rich-editor]")?.focus();
                        }}
                        aria-label="Section heading"
                        placeholder="Write the first sentence — this becomes the section heading"
                      />
                    ) : <h2>{block.heading}</h2>}
                    <RichTextBody
                      blockId={block.id}
                      value={block.body}
                      html={block.bodyHtml}
                      annotations={annotationsByBlock.get(block.id) ?? []}
                      annotationStateById={annotationStateById}
                      className="draft-rich-editor rich-editor"
                      aria-label={`${block.heading.trim() || "This block"} draft text`}
                      placeholder={block.headingSource === "student" ? "Continue writing underneath…" : `Write your ${block.heading.toLowerCase()} here…`}
                      onRegister={registerEditor}
                      onAnnotationsRendered={reportRenderedAnnotations}
                      onChange={handleBodyChange}
                      onBlur={onBlur}
                      onAnnotationPreview={previewAnnotation}
                      onAnnotationLeave={hideAnnotationSoon}
                    />
                  </section>
                ))}
              </div>
            </article>
          )}
        </div>
      </main>
      {coachNote && coachAnnotation ? (
        <div
          className="coach-note"
          role="dialog"
          aria-modal="false"
          aria-labelledby="coach-note-title"
          ref={coachRef}
          tabIndex={-1}
          style={{ left: coachNote.left, top: coachNote.top, maxHeight: coachNote.maxHeight }}
          onMouseEnter={() => {
            if (coachHideTimer.current) clearTimeout(coachHideTimer.current);
          }}
          onMouseLeave={hideAnnotationSoon}
        >
          <div className="coach-note-heading">
            <span className={`coach-severity annotation-${coachAnnotation.severity}`}>{coachAnnotation.severity === "high" ? "priority" : coachAnnotation.severity === "med" ? "worth a look" : "polish"}</span>
            <strong id="coach-note-title">{coachAnnotation.title}</strong>
            <button type="button" aria-label="Close note" onClick={closeCoach}>×</button>
          </div>
          <p>{coachAnnotation.what}</p>
          <div className="coach-improvement"><strong>HOW TO IMPROVE IT</strong><span>{coachAnnotation.how}</span></div>
          <div className="coach-note-actions">
            <span>{coachCriterion?.name ?? "Rubric"}</span>
            <button type="button" onClick={() => {
              onAnnotationResolved(coachAnnotation.id);
              setCoachNote(null);
              showToast("Noted. Marked as addressed.");
            }}>Mark addressed</button>
          </div>
          <em>Nothing is rewritten for you. What changes is your call.</em>
        </div>
      ) : null}
      {toast ? <div className="workspace-toast" role="status">{toast}</div> : null}
    </div>
  );
}

function WorkspaceApp() {
  const [stage, setStage] = useState<Stage>("import");
  const [files, setFiles] = useState<ImportedFile[]>([]);
  const [pastedText, setPastedText] = useState("");
  const [draftText, setDraftText] = useState("");
  const [assignment, setAssignment] = useState<Assignment>(DEFAULT_ASSIGNMENT);
  const [choice, setChoice] = useState<StructureChoice>("simplifii");
  const [structurePlan, setStructurePlan] = useState<StructurePlanBlock[]>([]);
  const [blocks, setBlocks] = useState<WritingBlock[]>([]);
  const [view, setView] = useState<ViewMode>("guide");
  const [analysis, setAnalysis] = useState<AnalysisState>("idle");
  const [analysisResult, setAnalysisResult] = useState<DraftAnalysis | null>(null);
  const [analysisStale, setAnalysisStale] = useState(false);
  const [annotationStateById, setAnnotationStateById] = useState<Record<string, AnnotationState>>({});
  const [analysisError, setAnalysisError] = useState("");
  const [analysingBlockId, setAnalysingBlockId] = useState<string | null>(null);
  const [blockAnalysisErrors, setBlockAnalysisErrors] = useState<Record<string, string>>({});
  const [isReading, setIsReading] = useState(false);
  const [isStructuring, setIsStructuring] = useState(false);
  const [importError, setImportError] = useState("");
  const [structureError, setStructureError] = useState("");
  const [focusHeadingId, setFocusHeadingId] = useState<string | null>(null);
  const [saveLabel, setSaveLabel] = useState("Saved locally · just now");
  const [cacheReady, setCacheReady] = useState(false);
  const [cacheBlocked, setCacheBlocked] = useState(false);
  const [activeAssignmentId, setActiveAssignmentId] = useState("");
  const [assignmentCatalog, setAssignmentCatalog] = useState<CachedAssignment[]>([]);
  const cacheWriteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cacheWriteChain = useRef<Promise<boolean>>(Promise.resolve(true));
  const latestPreparedAt = useRef(0);
  const forceNextCacheWrite = useRef(false);
  const catalogRef = useRef<CachedAssignment[]>([]);
  const activeAssignmentIdRef = useRef("");
  const cacheWritableRef = useRef(true);
  const assignmentEpoch = useRef(0);
  const importRevision = useRef(0);
  const draftRevision = useRef(0);
  const extractionRevision = useRef(0);
  const documentRevision = useRef(0);
  const guidanceRequest = useRef(0);
  const structureRequest = useRef(0);
  const guidanceRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestBlocksRef = useRef<WritingBlock[]>([]);
  const lastGuidanceSignature = useRef("");
  const pendingGuidanceSignature = useRef("");

  const attachedDraftText = useMemo(() => files
    .filter((file) => file.role === "Current draft" && file.text.trim())
    .map((file) => file.text)
    .join("\n\n"), [files]);
  const startingDraft = draftText.trim() ? draftText : attachedDraftText;

  const restoreAssignment = useCallback((record: CachedAssignment) => {
    assignmentEpoch.current += 1;
    importRevision.current = 0;
    draftRevision.current = 0;
    extractionRevision.current = 0;
    documentRevision.current = 0;
    guidanceRequest.current += 1;
    structureRequest.current += 1;
    lastGuidanceSignature.current = "";
    pendingGuidanceSignature.current = "";
    if (guidanceRefreshTimer.current) clearTimeout(guidanceRefreshTimer.current);
    setStage(record.stage);
    setFiles(record.files);
    setPastedText(record.pastedText);
    setDraftText(record.draftText ?? "");
    setAssignment(record.assignment);
    setChoice(record.choice);
    setStructurePlan(record.structurePlan ?? []);
    setBlocks(record.blocks);
    latestBlocksRef.current = record.blocks;
    setView(record.view);
    setAnalysis(record.analysisResult && record.analysisResult.overallComplete !== false ? "complete" : "idle");
    setAnalysisResult(record.analysisResult ? {
      ...record.analysisResult,
      blockAnalysis: record.analysisResult.blockAnalysis ?? [],
      annotations: record.analysisResult.annotations ?? [],
    } : null);
    setAnalysisStale(record.analysisStale ?? false);
    setAnnotationStateById(record.annotationStateById ?? {});
    setAnalysisError("");
    setAnalysingBlockId(null);
    setBlockAnalysisErrors({});
    setImportError("");
    setStructureError("");
    setFocusHeadingId(null);
    setIsReading(false);
    setIsStructuring(false);
    setSaveLabel("Saved locally · just now");
  }, []);

  useEffect(() => {
    latestBlocksRef.current = blocks;
  }, [blocks]);

  const stageCacheWrite = useCallback((cache: CachedAppState, immediate = false) => {
    if (!cacheWritableRef.current) return;
    const prepared = prepareBrowserCache(cache);
    latestPreparedAt.current = prepared.writtenAt;
    if (!writeBrowserJournal(prepared)) setSaveLabel("Saving locally…");

    if (cacheWriteTimer.current) clearTimeout(cacheWriteTimer.current);
    const commit = () => {
      cacheWriteChain.current = cacheWriteChain.current
        .catch(() => false)
        .then(() => writeBrowserCache(prepared));
      void cacheWriteChain.current.then((saved) => {
        if (prepared.writtenAt !== latestPreparedAt.current || activeAssignmentIdRef.current !== cache.activeAssignmentId) return;
        setSaveLabel(saved ? "Saved locally · just now" : "Local save unavailable");
      });
    };

    if (immediate) commit();
    else cacheWriteTimer.current = setTimeout(commit, 350);
  }, []);

  const captureCurrentRecord = useCallback((): CachedAssignment | null => {
    if (!activeAssignmentId) return null;
    const existing = catalogRef.current.find((record) => record.id === activeAssignmentId);
    const now = Date.now();
    return {
      id: activeAssignmentId,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      stage,
      files,
      pastedText,
      draftText,
      assignment,
      choice,
      structurePlan,
      blocks,
      view,
      analysisResult,
      analysisStale,
      annotationStateById,
    };
  }, [activeAssignmentId, analysisResult, analysisStale, annotationStateById, assignment, blocks, choice, draftText, files, pastedText, stage, structurePlan, view]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const cacheResult = await readBrowserCache<unknown>();
      if (cancelled) return;
      const cached = cacheResult.status === "ready" ? cacheResult.value : null;
      const validCache = isCachedAppState(cached);
      const unreadableCache = cacheResult.status === "unreadable" || (cacheResult.status === "ready" && !validCache);
      const cacheRecovered = unreadableCache ? await quarantineUnreadableBrowserCache() : true;
      if (cancelled) return;
      const salvagedCatalog = salvageCachedAssignments(cached);
      const restoredCatalog = validCache && cached.assignments.length ? cached.assignments : salvagedCatalog.length ? salvagedCatalog : [blankCachedAssignment()];
      const requestedActiveId = validCache ? cached.activeAssignmentId : isRecord(cached) && typeof cached.activeAssignmentId === "string" ? cached.activeAssignmentId : "";
      const restoredActive = restoredCatalog.find((record) => record.id === requestedActiveId) ?? restoredCatalog[0];
      cacheWritableRef.current = cacheRecovered;
      catalogRef.current = restoredCatalog;
      activeAssignmentIdRef.current = restoredActive.id;
      setAssignmentCatalog(restoredCatalog);
      setActiveAssignmentId(restoredActive.id);
      restoreAssignment(restoredActive);
      setCacheBlocked(!cacheRecovered);
      if (unreadableCache) setSaveLabel(cacheRecovered ? "Previous cache preserved" : "Local cache needs attention");
      setCacheReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [restoreAssignment]);

  useEffect(() => {
    if (!cacheReady) return;
    const currentRecord = captureCurrentRecord();
    if (!currentRecord) return;
    const nextCatalog = upsertCachedAssignment(catalogRef.current, currentRecord);
    catalogRef.current = nextCatalog;
    setAssignmentCatalog(nextCatalog);

    const immediate = forceNextCacheWrite.current;
    forceNextCacheWrite.current = false;
    stageCacheWrite({ version: 1, activeAssignmentId: currentRecord.id, assignments: nextCatalog }, immediate);
  }, [cacheReady, captureCurrentRecord, stageCacheWrite]);

  useEffect(() => () => {
    if (cacheWriteTimer.current) clearTimeout(cacheWriteTimer.current);
    if (guidanceRefreshTimer.current) clearTimeout(guidanceRefreshTimer.current);
  }, []);

  const switchAssignment = useCallback((id: string) => {
    if (id === activeAssignmentIdRef.current) return;
    if (cacheWriteTimer.current) clearTimeout(cacheWriteTimer.current);
    const currentRecord = captureCurrentRecord();
    const nextCatalog = currentRecord ? upsertCachedAssignment(catalogRef.current, currentRecord) : catalogRef.current;
    const target = nextCatalog.find((record) => record.id === id);
    if (!target) return;

    catalogRef.current = nextCatalog;
    activeAssignmentIdRef.current = target.id;
    setAssignmentCatalog(nextCatalog);
    setActiveAssignmentId(target.id);
    restoreAssignment(target);
    stageCacheWrite({ version: 1, activeAssignmentId: target.id, assignments: nextCatalog }, true);
  }, [captureCurrentRecord, restoreAssignment, stageCacheWrite]);

  const createNewAssignment = useCallback(() => {
    if (cacheWriteTimer.current) clearTimeout(cacheWriteTimer.current);
    const currentRecord = captureCurrentRecord();
    const withCurrent = currentRecord ? upsertCachedAssignment(catalogRef.current, currentRecord) : catalogRef.current;
    const blank = blankCachedAssignment();
    const nextCatalog = [blank, ...withCurrent];

    catalogRef.current = nextCatalog;
    activeAssignmentIdRef.current = blank.id;
    setAssignmentCatalog(nextCatalog);
    setActiveAssignmentId(blank.id);
    restoreAssignment(blank);
    stageCacheWrite({ version: 1, activeAssignmentId: blank.id, assignments: nextCatalog }, true);
  }, [captureCurrentRecord, restoreAssignment, stageCacheWrite]);

  const deleteAssignment = useCallback((id: string) => {
    const record = catalogRef.current.find((item) => item.id === id);
    if (!record) return false;
    const title = record.stage === "import" ? "this new assignment" : record.assignment.title.trim() || "this assignment";
    if (!window.confirm(`Delete ${title}? Its files, draft and feedback will be removed from this browser.`)) return false;

    if (cacheWriteTimer.current) clearTimeout(cacheWriteTimer.current);
    const deletingActive = id === activeAssignmentIdRef.current;
    const currentRecord = deletingActive ? null : captureCurrentRecord();
    const savedCatalog = currentRecord ? upsertCachedAssignment(catalogRef.current, currentRecord) : catalogRef.current;
    const remaining = savedCatalog.filter((item) => item.id !== id);
    const nextCatalog = remaining.length ? remaining : [blankCachedAssignment()];
    const nextActive = deletingActive
      ? nextCatalog[0]
      : nextCatalog.find((item) => item.id === activeAssignmentIdRef.current) ?? nextCatalog[0];

    catalogRef.current = nextCatalog;
    activeAssignmentIdRef.current = nextActive.id;
    setAssignmentCatalog(nextCatalog);
    setActiveAssignmentId(nextActive.id);
    if (deletingActive) restoreAssignment(nextActive);
    stageCacheWrite({ version: 1, activeAssignmentId: nextActive.id, assignments: nextCatalog }, true);
    return true;
  }, [captureCurrentRecord, restoreAssignment, stageCacheWrite]);

  const addFiles = async (incoming: File[]) => {
    const originId = activeAssignmentIdRef.current;
    const originEpoch = assignmentEpoch.current;
    const imported = await Promise.all(incoming.map(readImportedFile));
    if (originId !== activeAssignmentIdRef.current || originEpoch !== assignmentEpoch.current) return;
    importRevision.current += 1;
    forceNextCacheWrite.current = imported.some((file) => Boolean(file.dataUrl));
    setSaveLabel("Saving locally…");
    setFiles((current) => [...current, ...imported]);
  };

  const changePastedText = (value: string) => {
    importRevision.current += 1;
    setPastedText(value);
  };

  const changeDraftText = (value: string) => {
    draftRevision.current += 1;
    setDraftText(value);
    setStructureError("");
  };

  const changeStructureChoice = (value: StructureChoice) => {
    setChoice(value);
    setStructureError("");
  };

  const removeFile = (id: string) => {
    importRevision.current += 1;
    setFiles((current) => current.filter((file) => file.id !== id));
  };

  const readAssignment = async () => {
    const fallback = extractAssignment(files, pastedText);
    const originId = activeAssignmentIdRef.current;
    const originEpoch = assignmentEpoch.current;
    const originImportRevision = importRevision.current;
    setIsReading(true);
    setImportError("");
    try {
      const extracted = await requestAi<AiExtraction>("extract", {
        sourceText: pastedText,
        files: files
          .filter((file) => file.role !== "Current draft")
          .map((file) => ({ name: file.name, role: file.role, text: file.text, mediaType: file.mediaType, dataUrl: file.dataUrl })),
      });
      if (originId !== activeAssignmentIdRef.current || originEpoch !== assignmentEpoch.current || originImportRevision !== importRevision.current) return;
      const requirements = extracted.requirements
        .filter((requirement) => requirement.text.trim())
        .slice(0, 10)
        .map((requirement, index) => ({
          id: `ai-requirement-${index + 1}`,
          text: requirement.text.trim(),
          scope: requirement.scope,
          keywords: requirement.keywords.map((keyword) => keyword.trim().toLowerCase()).filter(Boolean).slice(0, 8),
        }));
      const criteria = extracted.criteria
        .filter((criterion) => criterion.name.trim())
        .slice(0, 10)
        .map((criterion, index) => ({
          id: `ai-criterion-${index + 1}`,
          name: criterion.name.trim(),
          weight: Math.max(0, Math.min(100, Math.round(criterion.weight))),
          description: criterion.description.trim(),
          tone: "attention" as const,
        }));

      setAssignment({
        title: extracted.title.trim() || fallback.title,
        courseCode: extracted.courseCode.trim() || fallback.courseCode,
        type: extracted.type.trim() || fallback.type,
        dueLabel: extracted.dueLabel.trim() || fallback.dueLabel,
        wordLimit: extracted.wordLimit > 0 ? Math.round(extracted.wordLimit) : fallback.wordLimit,
        task: extracted.task.trim() || fallback.task,
        requirements: requirements.length ? requirements : fallback.requirements,
        criteria: criteria.length ? criteria : fallback.criteria,
      });
      setStructurePlan([]);
      extractionRevision.current += 1;
      setStage("review");
    } catch (error) {
      if (originId === activeAssignmentIdRef.current && originEpoch === assignmentEpoch.current) {
        setImportError(error instanceof Error ? error.message : "Simplifii could not read that assignment.");
      }
    } finally {
      if (originId === activeAssignmentIdRef.current && originEpoch === assignmentEpoch.current) setIsReading(false);
    }
  };

  const runFullDraftAnalysis = async (sourceBlocks: WritingBlock[], automatic = false) => {
    if (sourceBlocks.reduce((total, block) => total + writingBlockWordCount(block), 0) < 20) {
      if (!automatic) setAnalysisError("Write a little more before asking Simplifii to analyse the draft.");
      return;
    }
    const originId = activeAssignmentIdRef.current;
    const originEpoch = assignmentEpoch.current;
    const originDocumentRevision = documentRevision.current;
    setAnalysingBlockId(null);
    setAnalysis("running");
    setAnalysisError("");
    try {
      const result = await requestAi<DraftAnalysis>("analyse", {
        assignment,
        blocks: sourceBlocks.map(({ id, heading, headingSource, body, guidanceIds }) => ({ id, heading, headingSource, body, guidanceIds })),
      });
      if (originId !== activeAssignmentIdRef.current || originEpoch !== assignmentEpoch.current || originDocumentRevision !== documentRevision.current) {
        if (originId === activeAssignmentIdRef.current && originEpoch === assignmentEpoch.current) setAnalysis("idle");
        return;
      }
      setAnalysisResult({ ...result, overallComplete: true });
      setAnalysis("complete");
      setAnalysisStale(false);
      setAnnotationStateById({});
      setSaveLabel("Saving locally…");
    } catch (error) {
      if (originId === activeAssignmentIdRef.current && originEpoch === assignmentEpoch.current && originDocumentRevision === documentRevision.current) {
        setAnalysis("idle");
        setAnalysisError(automatic
          ? "Your draft is in place, but the automatic rubric reading did not finish. Choose Analyse my draft to try again."
          : error instanceof Error ? error.message : "Simplifii could not analyse the draft.");
      }
    }
  };

  const createWorkspace = async () => {
    setStructureError("");
    if (startingDraft.length > MAX_EXISTING_DRAFT_CHARACTERS) {
      setStructureError("That draft is too long to structure safely in one pass. Use a draft under 120,000 characters.");
      return;
    }
    const originId = activeAssignmentIdRef.current;
    const originEpoch = assignmentEpoch.current;
    const originImportRevision = importRevision.current;
    const originDraftRevision = draftRevision.current;
    const originExtractionRevision = extractionRevision.current;
    const requestId = ++structureRequest.current;
    setIsStructuring(true);
    try {
      let result: { blocks: StructurePlanBlock[] };
      try {
        result = await requestAi<{ blocks: StructurePlanBlock[] }>("structure", { assignment });
      } catch (error) {
        if (choice !== "self") throw error;
        result = { blocks: createBlocks(assignment, "simplifii").map(({ heading, guidanceIds }) => ({ heading, guidanceIds })) };
      }
      if (originId !== activeAssignmentIdRef.current
        || originEpoch !== assignmentEpoch.current
        || originImportRevision !== importRevision.current
        || originDraftRevision !== draftRevision.current
        || originExtractionRevision !== extractionRevision.current
        || requestId !== structureRequest.current) return;

      const allowedIds = new Set(assignment.requirements.map((requirement) => requirement.id));
      let plannedBlocks = result.blocks
        .filter((block) => block.heading.trim())
        .slice(0, 8)
        .map((block) => {
          const guidanceIds = [...new Set(block.guidanceIds.filter((id) => allowedIds.has(id)))];
          return {
            heading: block.heading.trim(),
            guidanceIds: guidanceIds.length ? guidanceIds : guidanceForHeading(block.heading, assignment.requirements),
          };
        });

      if (!plannedBlocks.length && choice === "self") {
        plannedBlocks = createBlocks(assignment, "simplifii").map(({ heading, guidanceIds }) => ({ heading, guidanceIds }));
      }
      if (!plannedBlocks.length) throw new Error("Simplifii did not find a useful structure. Try reading the assignment again.");

      const allGuidanceIds = assignment.requirements.map((requirement) => requirement.id);
      let nextBlocks: WritingBlock[];
      if (choice === "self") {
        const draftBlock = projectDraftIntoOneBlock(startingDraft, allGuidanceIds);
        nextBlocks = [{ id: uid("block"), heading: draftBlock.heading, headingSource: "student", body: draftBlock.body, guidanceIds: draftBlock.guidanceIds }];
      } else if (startingDraft.trim()) {
        const segments = segmentDraft(startingDraft);
        const draftResult = await requestAi<{ blocks: DraftGrouping[] }>("structure-draft", {
          assignment,
          plannedBlocks,
          segments,
        });
        if (originId !== activeAssignmentIdRef.current
          || originEpoch !== assignmentEpoch.current
          || originImportRevision !== importRevision.current
          || originDraftRevision !== draftRevision.current
          || originExtractionRevision !== extractionRevision.current
          || requestId !== structureRequest.current) return;

        const groupings = draftResult.blocks.map((block) => ({
          segmentIds: block.segmentIds,
          guidanceIds: [...new Set(block.guidanceIds.filter((id) => allowedIds.has(id)))],
        }));
        nextBlocks = projectDraftIntoBlocks(startingDraft, groupings, allGuidanceIds).map((block) => ({
          id: uid("block"),
          heading: block.heading,
          headingSource: "student" as const,
          body: block.body,
          guidanceIds: block.guidanceIds,
        }));
      } else {
        nextBlocks = plannedBlocks.map((block) => ({ id: uid("block"), heading: block.heading, headingSource: "simplifii", body: "", guidanceIds: block.guidanceIds }));
      }

      if (!nextBlocks.length) throw new Error("Simplifii could not place the draft into blocks. Your writing is still safe on this screen.");
      try {
        const guidanceResult = await requestAi<{ allocations: GuidanceAllocation[] }>("allocate", {
          assignment,
          blocks: nextBlocks.map(({ id, heading, headingSource, body, guidanceIds }) => ({ id, heading, headingSource, body, guidanceIds })),
          plannedBlocks,
        });
        if (originId !== activeAssignmentIdRef.current
          || originEpoch !== assignmentEpoch.current
          || originImportRevision !== importRevision.current
          || originDraftRevision !== draftRevision.current
          || originExtractionRevision !== extractionRevision.current
          || requestId !== structureRequest.current) return;
        nextBlocks = applyGuidanceAllocations(nextBlocks, guidanceResult.allocations, assignment.requirements);
        lastGuidanceSignature.current = blockGuidanceSignature(nextBlocks);
      } catch {
        // The workspace still opens with imported guidance if the responsive guide refresh is unavailable.
      }
      documentRevision.current += 1;
      setStructurePlan(plannedBlocks);
      setBlocks(nextBlocks);
      latestBlocksRef.current = nextBlocks;
      setStage("workspace");
      setView("guide");
      setAnalysis("idle");
      setAnalysisResult(null);
      setAnalysisStale(false);
      setAnnotationStateById({});
      if (startingDraft.trim()) void runFullDraftAnalysis(nextBlocks, true);
    } catch (error) {
      if (originId === activeAssignmentIdRef.current
        && originEpoch === assignmentEpoch.current
        && originImportRevision === importRevision.current
        && originDraftRevision === draftRevision.current
        && originExtractionRevision === extractionRevision.current
        && requestId === structureRequest.current) {
        setStructureError(error instanceof Error ? error.message : "Simplifii could not create the blocks.");
      }
    } finally {
      if (originId === activeAssignmentIdRef.current && originEpoch === assignmentEpoch.current && requestId === structureRequest.current) setIsStructuring(false);
    }
  };

  const leaveStructureChoice = () => {
    structureRequest.current += 1;
    setIsStructuring(false);
    setStage("review");
  };

  const updateBody = (blockId: string, value: string, bodyHtml: string) => {
    documentRevision.current += 1;
    setBlocks((current) => {
      const next = current.map((block) => block.id === blockId ? { ...block, body: value, bodyHtml } : block);
      latestBlocksRef.current = next;
      return next;
    });
    if (analysisResult && analysisResult.overallComplete !== false) {
      setAnalysis("complete");
      setAnalysisStale(true);
    } else {
      setAnalysis("idle");
    }
    setBlockAnalysisErrors((current) => current[blockId] ? { ...current, [blockId]: "" } : current);
    setAnalysisError("");
    setSaveLabel("Saving locally…");
    scheduleGuidanceRefresh();
  };

  const updateHeading = (blockId: string, value: string) => {
    documentRevision.current += 1;
    setBlocks((current) => {
      const next = current.map((block) => block.id === blockId ? { ...block, heading: value } : block);
      latestBlocksRef.current = next;
      return next;
    });
    if (analysisResult && analysisResult.overallComplete !== false) {
      setAnalysis("complete");
      setAnalysisStale(true);
    } else {
      setAnalysis("idle");
    }
    setAnalysisError("");
    setSaveLabel("Saving locally…");
    scheduleGuidanceRefresh();
  };

  const insertBlock = (anchorId: string, position: "before" | "after") => {
    const newBlockId = uid("block");
    documentRevision.current += 1;
    setBlocks((current) => {
      const index = current.findIndex((block) => block.id === anchorId);
      if (index < 0) return current;
      const anchor = current[index];
      const newBlock: WritingBlock = { id: newBlockId, heading: "", headingSource: "student", body: "", guidanceIds: [...anchor.guidanceIds] };
      const next = [...current];
      next.splice(position === "before" ? index : index + 1, 0, newBlock);
      latestBlocksRef.current = next;
      return next;
    });
    if (analysisResult && analysisResult.overallComplete !== false) {
      setAnalysis("complete");
      setAnalysisStale(true);
    } else {
      setAnalysis("idle");
    }
    setAnalysisError("");
    setSaveLabel("Saving locally…");
    setFocusHeadingId(newBlockId);
    scheduleGuidanceRefresh();
  };

  const removeBlock = (blockId: string) => {
    const block = blocks.find((candidate) => candidate.id === blockId);
    if (!block) return;
    if ((block.heading.trim() || block.body.trim()) && !window.confirm(`Delete ${block.heading.trim() || "this block"}? Its writing will be removed from this browser workspace.`)) return;
    const replacementBlock = blocks.length === 1
      ? { id: uid("block"), heading: "", headingSource: "student" as const, body: "", guidanceIds: [...block.guidanceIds] }
      : null;
    documentRevision.current += 1;
    setBlocks((current) => {
      const remaining = current.filter((candidate) => candidate.id !== blockId);
      const next = remaining.length ? remaining : replacementBlock ? [replacementBlock] : remaining;
      latestBlocksRef.current = next;
      return next;
    });
    if (analysisResult && analysisResult.overallComplete !== false) {
      setAnalysis("complete");
      setAnalysisStale(true);
    } else {
      setAnalysis("idle");
    }
    setAnalysisError("");
    setSaveLabel("Saving locally…");
    setFocusHeadingId(replacementBlock?.id ?? null);
    scheduleGuidanceRefresh();
  };

  const markAnnotationsEdited = useCallback((annotationIds: string[]) => {
    if (!annotationIds.length) return;
    setAnnotationStateById((current) => {
      const next = { ...current };
      for (const annotationId of annotationIds) {
        if (next[annotationId] !== "resolved") next[annotationId] = "edited";
      }
      return next;
    });
  }, []);

  const resolveAnnotation = useCallback((annotationId: string) => {
    setAnnotationStateById((current) => ({ ...current, [annotationId]: "resolved" }));
  }, []);

  function scheduleGuidanceRefresh() {
    if (guidanceRefreshTimer.current) clearTimeout(guidanceRefreshTimer.current);
    guidanceRefreshTimer.current = setTimeout(() => {
      guidanceRefreshTimer.current = null;
      void refreshGuidance();
    }, 2200);
  }

  async function refreshGuidance() {
    if (guidanceRefreshTimer.current) {
      clearTimeout(guidanceRefreshTimer.current);
      guidanceRefreshTimer.current = null;
    }
    const sourceBlocks = latestBlocksRef.current;
    const guidanceSignature = blockGuidanceSignature(sourceBlocks);
    if (guidanceSignature === lastGuidanceSignature.current || guidanceSignature === pendingGuidanceSignature.current) return;
    pendingGuidanceSignature.current = guidanceSignature;
    const locallyAllocated = reallocateGuidance(sourceBlocks, assignment.requirements);
    setBlocks(locallyAllocated);
    latestBlocksRef.current = locallyAllocated;

    const originId = activeAssignmentIdRef.current;
    const originEpoch = assignmentEpoch.current;
    const originDocumentRevision = documentRevision.current;
    const requestId = ++guidanceRequest.current;
    try {
      const result = await requestAi<{ allocations: GuidanceAllocation[] }>("allocate", {
        assignment,
        blocks: locallyAllocated.map(({ id, heading, headingSource, body, guidanceIds }) => ({ id, heading, headingSource, body, guidanceIds })),
        plannedBlocks: structurePlan,
      });
      if (requestId !== guidanceRequest.current || originId !== activeAssignmentIdRef.current || originEpoch !== assignmentEpoch.current || originDocumentRevision !== documentRevision.current) return;
      setBlocks((current) => {
        const next = applyGuidanceAllocations(current, result.allocations, assignment.requirements);
        latestBlocksRef.current = next;
        return next;
      });
      lastGuidanceSignature.current = guidanceSignature;
    } catch {
      // The inherited/local allocation remains intact if the background AI refresh is unavailable.
    } finally {
      if (pendingGuidanceSignature.current === guidanceSignature) pendingGuidanceSignature.current = "";
    }
  }

  const analyse = () => {
    void runFullDraftAnalysis(latestBlocksRef.current);
  };

  const analyseBlock = async (blockId: string) => {
    const block = latestBlocksRef.current.find((candidate) => candidate.id === blockId);
    if (!block) return;
    if (writingBlockWordCount(block) < 8) {
      setBlockAnalysisErrors((current) => ({ ...current, [blockId]: "Write a little more in this block before asking Simplifii to review it." }));
      return;
    }

    const originId = activeAssignmentIdRef.current;
    const originEpoch = assignmentEpoch.current;
    const originDocumentRevision = documentRevision.current;
    const previousAnnotationIds = new Set((analysisResult?.annotations ?? [])
      .filter((annotation) => annotation.blockId === blockId)
      .map((annotation) => annotation.id));
    setAnalysingBlockId(blockId);
    setBlockAnalysisErrors((current) => ({ ...current, [blockId]: "" }));
    try {
      const result = await requestAi<DraftAnalysis>("analyse-block", {
        assignment,
        blocks: [{
          id: block.id,
          heading: block.heading,
          headingSource: block.headingSource,
          body: block.body,
          guidanceIds: block.guidanceIds,
        }],
      });
      if (originId !== activeAssignmentIdRef.current || originEpoch !== assignmentEpoch.current || originDocumentRevision !== documentRevision.current) return;

      const replacementAnnotations = result.annotations.map((annotation) => ({ ...annotation, id: uid("annotation") }));
      setAnalysisResult((current) => ({
        overallComplete: current ? current.overallComplete : false,
        summary: current?.summary ?? "",
        highestLeverageCriterionId: current?.highestLeverageCriterionId ?? "",
        criteria: current?.criteria ?? [],
        blockAnalysis: [
          ...(current?.blockAnalysis ?? []).filter((item) => item.blockId !== blockId),
          ...result.blockAnalysis,
        ],
        annotations: [
          ...(current?.annotations ?? []).filter((annotation) => annotation.blockId !== blockId),
          ...replacementAnnotations,
        ],
      }));
      setAnnotationStateById((current) => Object.fromEntries(
        Object.entries(current).filter(([annotationId]) => !previousAnnotationIds.has(annotationId)),
      ));
      setSaveLabel("Saving locally…");
    } catch (error) {
      if (originId === activeAssignmentIdRef.current && originEpoch === assignmentEpoch.current && originDocumentRevision === documentRevision.current) {
        setBlockAnalysisErrors((current) => ({
          ...current,
          [blockId]: error instanceof Error ? error.message : "Simplifii could not review this block.",
        }));
      }
    } finally {
      if (originId === activeAssignmentIdRef.current && originEpoch === assignmentEpoch.current) setAnalysingBlockId(null);
    }
  };

  const assignmentMenu = useMemo<AssignmentMenuProps>(() => ({
    ready: cacheReady,
    activeId: activeAssignmentId,
    activeTitle: stage === "import" ? "New assignment" : assignment.title.trim() || "Untitled assignment",
    storageNote: saveLabel === "Previous cache preserved" ? "Previous cache preserved; saving a clean copy" : saveLabel === "Local cache needs attention" ? "Existing browser cache was left untouched" : saveLabel === "Local save unavailable" ? "Browser storage is unavailable" : saveLabel.startsWith("Saving") ? "Saving on this browser…" : "Saved on this browser",
    assignments: [...assignmentCatalog]
      .sort((first, second) => second.updatedAt - first.updatedAt)
      .map((record) => ({
        id: record.id,
        title: record.stage === "import" ? "New assignment" : record.assignment.title.trim() || "Untitled assignment",
        updatedAt: record.updatedAt,
      })),
    onSelect: switchAssignment,
    onCreate: createNewAssignment,
    onDelete: deleteAssignment,
  }), [activeAssignmentId, assignment.title, assignmentCatalog, cacheReady, createNewAssignment, deleteAssignment, saveLabel, stage, switchAssignment]);

  if (cacheBlocked) return <CacheRecoveryScreen />;

  if (stage === "import") {
    return <ImportScreen files={files} pastedText={pastedText} onFiles={addFiles} onPaste={changePastedText} onRemove={removeFile} onContinue={readAssignment} isReading={isReading} error={importError} assignmentMenu={assignmentMenu} />;
  }
  if (stage === "review") {
    return <ReviewScreen assignment={assignment} files={files} onBack={() => setStage("import")} onContinue={() => setStage("choice")} assignmentMenu={assignmentMenu} />;
  }
  if (stage === "choice") {
    return (
      <ChoiceScreen
        choice={choice}
        draftText={draftText}
        hasDraftFile={files.some((file) => file.role === "Current draft")}
        hasReadableDraftFile={Boolean(attachedDraftText.trim())}
        hasDraft={Boolean(startingDraft.trim())}
        onChoice={changeStructureChoice}
        onDraftText={changeDraftText}
        onBack={leaveStructureChoice}
        onContinue={createWorkspace}
        isStructuring={isStructuring}
        error={structureError}
        assignmentMenu={assignmentMenu}
      />
    );
  }
  return (
    <Workspace
      key={activeAssignmentId}
      assignment={assignment}
      assignmentMenu={assignmentMenu}
      blocks={blocks}
      view={view}
      analysis={analysis}
      analysisResult={analysisResult}
      analysisStale={analysisStale}
      analysisError={analysisError}
      annotationStateById={annotationStateById}
      focusHeadingId={focusHeadingId}
      onView={setView}
      onHeading={updateHeading}
      onBody={updateBody}
      onBlur={refreshGuidance}
      onInsert={insertBlock}
      onRemove={removeBlock}
      onAnalyse={analyse}
      onAnalyseBlock={analyseBlock}
      analysingBlockId={analysingBlockId}
      blockAnalysisErrors={blockAnalysisErrors}
      onAnnotationsEdited={markAnnotationsEdited}
      onAnnotationResolved={resolveAnnotation}
      onAnnotationsRechecked={setAnnotationStateById}
      saveLabel={saveLabel}
    />
  );
}

export default function Home() {
  return <InviteBoundary />;
}
