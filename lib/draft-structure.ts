export type DraftSegment = {
  id: string;
  text: string;
};

export type DraftGrouping = {
  segmentIds: string[];
  guidanceIds: string[];
};

export type DraftContentBlock = {
  heading: string;
  body: string;
  guidanceIds: string[];
};

const MAX_DRAFT_BLOCKS = 8;
const SENTENCE_END = ".!?…";
const SENTENCE_CLOSERS = "\"'”’)]";

function nonEmpty(value: string) {
  return value.trim().length > 0;
}

function sentenceSegments(text: string) {
  const sentences: string[] = [];
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (!SENTENCE_END.includes(text[index])) continue;
    let end = index + 1;
    while (end < text.length && `${SENTENCE_END}${SENTENCE_CLOSERS}`.includes(text[end])) end += 1;
    if (end < text.length && !/\s/.test(text[end])) continue;
    const sentence = text.slice(start, end).trim();
    if (!/[\p{L}\p{N}]/u.test(sentence)) {
      index = end - 1;
      continue;
    }
    sentences.push(sentence);
    start = end;
    while (start < text.length && /\s/.test(text[start])) start += 1;
    index = start - 1;
  }
  const remainder = text.slice(start).trim();
  if (remainder) sentences.push(remainder);
  return sentences;
}

export function segmentDraft(value: string): DraftSegment[] {
  const draft = value.replace(/\r\n?/g, "\n").trim();
  if (!draft) return [];

  let parts = draft
    .split(/\n[\t ]*\n+/)
    .map((part) => part.trim())
    .filter(nonEmpty);

  if (parts.length === 1 && draft.includes("\n")) {
    const lines = draft.split("\n").map((line) => line.trim()).filter(nonEmpty);
    if (lines.length > 1) parts = lines;
  }

  if (parts.length === 1 && draft.length > 360) {
    const sentences = sentenceSegments(draft);
    if (sentences.length >= 3) parts = sentences;
  }

  return parts.map((text, index) => ({ id: `draft-segment-${index + 1}`, text }));
}

function looksLikeHeading(value: string) {
  const text = value.trim();
  const words = text.split(/\s+/);
  if (!text || text.includes("\n") || text.length > 110 || words.length > 14) return false;
  if (/^(introduction|background|method|methods|results?|discussion|conclusion|references?|abstract|analysis|recommendations?)\b/i.test(text)) return true;
  return !/[.!?][”’"')\]]?$/.test(text);
}

function splitFirstSentence(value: string) {
  const text = value.trim();
  const sentence = sentenceSegments(text)[0];
  if (sentence && sentence.length < text.length && text.startsWith(sentence)) {
    return { heading: sentence, remainder: text.slice(sentence.length).trimStart() };
  }

  if (text.length <= 180) return { heading: text, remainder: "" };
  const boundary = text.lastIndexOf(" ", 180);
  if (boundary <= 40) return { heading: text, remainder: "" };
  const end = boundary;
  return { heading: text.slice(0, end).trim(), remainder: text.slice(end).trimStart() };
}

function normaliseGroupings(segments: DraftSegment[], groupings: DraftGrouping[], fallbackGuidanceIds: string[]) {
  if (!segments.length) return [];

  const segmentIds = new Set(segments.map((segment) => segment.id));
  const validGroups = groupings
    .map((group) => ({
      segmentIds: [...new Set(group.segmentIds.filter((id) => segmentIds.has(id)))],
      guidanceIds: [...new Set(group.guidanceIds)],
    }))
    .filter((group) => group.segmentIds.length > 0);

  if (!validGroups.length) return [{ segmentIds: segments.map((segment) => segment.id), guidanceIds: fallbackGuidanceIds }];

  const ownerBySegment = new Map<string, number>();
  validGroups.forEach((group, groupIndex) => {
    group.segmentIds.forEach((id) => {
      if (!ownerBySegment.has(id)) ownerBySegment.set(id, groupIndex);
    });
  });

  const runs: Array<DraftGrouping & { owner: number }> = [];
  let lastOwner = 0;
  for (const segment of segments) {
    const owner = ownerBySegment.get(segment.id) ?? lastOwner;
    lastOwner = owner;
    const guidanceIds = validGroups[owner]?.guidanceIds.length ? validGroups[owner].guidanceIds : fallbackGuidanceIds;
    const current = runs.at(-1);
    if (current?.owner === owner) current.segmentIds.push(segment.id);
    else runs.push({ owner, segmentIds: [segment.id], guidanceIds: [...guidanceIds] });
  }

  if (runs.length <= MAX_DRAFT_BLOCKS) return runs.map(({ segmentIds, guidanceIds }) => ({ segmentIds, guidanceIds }));
  const kept = runs.slice(0, MAX_DRAFT_BLOCKS - 1).map(({ segmentIds, guidanceIds }) => ({ segmentIds, guidanceIds }));
  const overflow = runs.slice(MAX_DRAFT_BLOCKS - 1);
  kept.push({
    segmentIds: overflow.flatMap((group) => group.segmentIds),
    guidanceIds: [...new Set(overflow.flatMap((group) => group.guidanceIds))],
  });
  return kept;
}

export function projectDraftIntoBlocks(value: string, groupings: DraftGrouping[], fallbackGuidanceIds: string[]): DraftContentBlock[] {
  const segments = segmentDraft(value);
  const byId = new Map(segments.map((segment) => [segment.id, segment]));
  return normaliseGroupings(segments, groupings, fallbackGuidanceIds).map((group) => {
    const texts = group.segmentIds.map((id) => byId.get(id)?.text ?? "").filter(nonEmpty);
    const first = texts[0] ?? "";
    const rest = texts.slice(1);

    if (looksLikeHeading(first)) {
      return { heading: first.trim(), body: rest.join("\n\n"), guidanceIds: group.guidanceIds };
    }

    const { heading, remainder } = splitFirstSentence(first);
    return {
      heading,
      body: [remainder, ...rest].filter(nonEmpty).join("\n\n"),
      guidanceIds: group.guidanceIds,
    };
  });
}

export function projectDraftIntoOneBlock(value: string, guidanceIds: string[]): DraftContentBlock {
  return projectDraftIntoBlocks(
    value,
    [{ segmentIds: segmentDraft(value).map((segment) => segment.id), guidanceIds }],
    guidanceIds,
  )[0] ?? { heading: "", body: "", guidanceIds };
}

export function writingTokens(value: string) {
  return value.match(/\S+/g) ?? [];
}

export function blockTokens(blocks: DraftContentBlock[]) {
  return blocks.flatMap((block) => writingTokens([block.heading, block.body].filter(nonEmpty).join("\n\n")));
}
