import { db, schema } from "../db/client";
import { eq } from "drizzle-orm";
import { chatCompletion } from "./llm";
import { newId } from "./nanoid";

const ANALYSIS_PROMPT = `You are a writing style analyst. Analyze the following writing samples and produce a detailed writing style guide that captures the author's unique voice. This guide will be used to instruct an AI to write in the same style.

Your analysis should cover:

## Voice & Tone
- Overall tone (formal, conversational, authoritative, casual, academic, etc.)
- Use of first/second/third person
- Emotional register (enthusiastic, measured, dry, warm, etc.)
- Use of humor, sarcasm, or wit

## Sentence Structure
- Average sentence length tendency (short & punchy, medium, long & complex, varied)
- Use of fragments or run-ons as stylistic choice
- Preferred sentence openings (subject-first, dependent clauses, transitions, etc.)
- Use of rhetorical questions

## Word Choice & Vocabulary
- Vocabulary level (simple, moderate, sophisticated, technical)
- Use of jargon or domain-specific terms (list recurring ones)
- Contractions (don't vs. do not)
- Preferred transitions and connectors
- Any distinctive phrases, idioms, or verbal tics

## Paragraph & Document Structure
- Paragraph length tendency
- How they open sections/pieces
- How they close/conclude
- Use of headers, subheaders, and hierarchy
- Use of lists (bullet vs. numbered, frequency)

## Formatting & Emphasis
- Use of bold, italic, or other emphasis
- How they handle quotes and citations
- Use of parenthetical asides
- Punctuation habits (em dashes, semicolons, exclamation marks, Oxford comma)

## Key Examples
Extract 3-5 short passages (1-3 sentences each) that are most representative of this author's distinctive voice. These will be used as reference examples.

Format the guide as clear, actionable instructions that could be given to a writer to replicate this style. Be specific — cite actual patterns from the samples rather than generic advice. If a pattern appears in some samples but not others, note the variation.`;

export async function generateStyleGuide(projectId: string): Promise<{
  guide: string;
  examples: string[];
  metadata: { sourceCount: number; totalWords: number };
}> {
  // Gather all style sources for this project
  const sources = await db
    .select()
    .from(schema.styleSources)
    .where(eq(schema.styleSources.projectId, projectId));

  if (sources.length === 0) {
    throw new Error("No style sources found. Add writing samples first (upload documents, paste URLs, or select project documents).");
  }

  // Build the samples text, capping at ~30k chars to stay within context
  const MAX_SAMPLE_CHARS = 30000;
  let samplesText = "";
  let totalWords = 0;

  for (const source of sources) {
    const header = `\n\n--- Sample: "${source.name}" ---\n\n`;
    const remaining = MAX_SAMPLE_CHARS - samplesText.length;
    if (remaining <= 0) break;

    const content = source.content.slice(0, remaining);
    samplesText += header + content;
    totalWords += source.wordCount ?? 0;
  }

  // Ask the LLM to analyze
  const result = await chatCompletion([
    { role: "system", content: ANALYSIS_PROMPT },
    { role: "user", content: `Here are the writing samples to analyze:\n${samplesText}` },
  ]);

  const guide = result?.choices?.[0]?.message?.content || "Style analysis failed.";

  // Extract example passages (the LLM includes them in the guide, but also extract for structured storage)
  const examples: string[] = [];
  const exampleMatches = guide.match(/["""]([^"""]{20,200})["""]/g);
  if (exampleMatches) {
    for (const match of exampleMatches.slice(0, 5)) {
      examples.push(match.replace(/^["""]|["""]$/g, ""));
    }
  }

  const metadata = { sourceCount: sources.length, totalWords };

  // Save to DB (upsert — one profile per project)
  const existing = await db
    .select()
    .from(schema.styleProfiles)
    .where(eq(schema.styleProfiles.projectId, projectId));

  const now = new Date().toISOString();

  if (existing.length > 0) {
    await db
      .update(schema.styleProfiles)
      .set({
        guide,
        examples: JSON.stringify(examples),
        metadata: JSON.stringify(metadata),
        updatedAt: now,
      })
      .where(eq(schema.styleProfiles.projectId, projectId));
  } else {
    await db.insert(schema.styleProfiles).values({
      id: newId(),
      projectId,
      guide,
      examples: JSON.stringify(examples),
      metadata: JSON.stringify(metadata),
      createdAt: now,
      updatedAt: now,
    });
  }

  return { guide, examples, metadata };
}

export async function getStyleProfile(projectId: string): Promise<{
  guide: string;
  examples: string[];
  metadata: any;
} | null> {
  const [profile] = await db
    .select()
    .from(schema.styleProfiles)
    .where(eq(schema.styleProfiles.projectId, projectId));

  if (!profile) return null;

  return {
    guide: profile.guide,
    examples: profile.examples ? JSON.parse(profile.examples) : [],
    metadata: profile.metadata ? JSON.parse(profile.metadata) : {},
  };
}
