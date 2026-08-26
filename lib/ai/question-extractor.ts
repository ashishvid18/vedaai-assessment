import { ThinkingLevel } from "@google/genai";
import { z } from "zod";

import {
  gemini,
  GEMINI_MODEL,
  GEMINI_FALLBACK_MODELS,
  isRetryableGeminiError,
  waitForRetry,
} from "./client";

/**
 * A single question extracted from the printed question paper.
 */
export const ExtractedQuestionSchema = z.object({
  /**
   * Original printed question number.
   *
   * Examples:
   * "1"
   * "2"
   * "11(a)"
   * "11(b)"
   * "5(i)"
   * "5(ii)"
   */
  number: z.string(),

  /**
   * Complete question text.
   */
  text: z.string(),

  /**
   * 1-based page number where the question begins.
   */
  page: z.number().int().positive(),

  /**
   * Zero-based position in the printed question order.
   */
  order: z.number().int().nonnegative(),

  /**
   * Marks explicitly associated with the question.
   * Null when marks are not visible.
   */
  marks: z.number().nonnegative().nullable(),

  /**
   * Model confidence from 0 to 1.
   */
  confidence: z.number().min(0).max(1),
});

export const QuestionExtractionResultSchema = z.object({
  questions: z.array(ExtractedQuestionSchema),
});

export type ExtractedQuestion = z.infer<
  typeof ExtractedQuestionSchema
>;

export type QuestionExtractionResult = z.infer<
  typeof QuestionExtractionResultSchema
>;

/**
 * JSON schema supplied to Gemini for structured output.
 *
 * This ensures that Gemini returns predictable JSON
 * rather than free-form prose.
 */
const questionExtractionJsonSchema = {
  type: "object",

  properties: {
    questions: {
      type: "array",

      description:
        "Every distinct question or labelled sub-question in exact printed reading order.",

      items: {
        type: "object",

        properties: {
          number: {
            type: "string",

            description:
              'Original printed question label. Examples: "1", "2", "11(a)", "11(b)", "5(i)", "5(ii)".',
          },

          text: {
            type: "string",

            description:
              "The complete text of the question. Include options and question-specific instructions that belong to this question.",
          },

          page: {
            type: "integer",

            description:
              "The 1-based page number on which this question begins.",
          },

          order: {
            type: "integer",

            description:
              "Zero-based position of this question in the printed question order.",
          },

          marks: {
            type: ["number", "null"],

            description:
              "Marks explicitly assigned to this question. Return null if marks are not visible.",
          },

          confidence: {
            type: "number",

            description:
              "Confidence that the question was correctly extracted, from 0 to 1.",
          },
        },

        required: [
          "number",
          "text",
          "page",
          "order",
          "marks",
          "confidence",
        ],
      },
    },
  },

  required: ["questions"],
} as const;

/**
 * Detailed extraction instructions.
 */
const EXTRACTION_PROMPT = `
You are an expert assessment-paper parsing engine.

Your job is to inspect the supplied question paper and extract EVERY
actual question from it.

The output will be used by a teacher-facing assessment application.

========================
QUESTION EXTRACTION RULES
========================

1. EXTRACT EVERY QUESTION

Read the entire supplied document from the first page to the last page.

Extract every actual question that a student is expected to answer.

Do not stop after the first page.

Do not stop after a section.

Do not skip questions because they appear difficult,
unusual, or visually separated.

========================
2. PRESERVE ORIGINAL NUMBERING
========================

Preserve the question number exactly as printed.

Examples:

1
2
3
10
11(a)
11(b)
5(i)
5(ii)
Q1
Q2

Do NOT renumber questions yourself.

Do NOT convert:

11(a) -> 11.1

Do NOT convert:

11(b) -> 11.2

Keep the original printed label.

========================
3. SUB-PARTS ARE SEPARATE QUESTIONS
========================

This is extremely important.

If the paper contains:

11 (a) Explain photosynthesis.

11 (b) Explain respiration.

Return TWO separate question objects:

11(a)
11(b)

Never merge labelled sub-parts into one question.

The same applies to:

(i)
(ii)
(iii)

(a)
(b)
(c)

(A)
(B)

and similar labelled sub-parts.

========================
4. PRESERVE PRINTED ORDER
========================

The "order" field must represent the physical printed order
in the question paper.

Start from:

order = 0

Then:

order = 1

Then:

order = 2

and so on.

Do not sort by the numeric value of the question number.

If the paper physically prints:

1
2
3(a)
3(b)
4

the order must be:

1 -> 0
2 -> 1
3(a) -> 2
3(b) -> 3
4 -> 4

========================
5. DO NOT INVENT QUESTIONS
========================

Never create a question that does not exist in the paper.

Do not infer missing questions.

Do not transform headings into questions.

Do not transform marks information into questions.

========================
6. QUESTION TEXT
========================

Extract the complete question text.

Preserve important mathematical notation, terminology,
symbols, equations, and instructions as accurately as possible.

If a question contains multiple-choice options, include those
options in the question's text.

========================
7. SECTION HEADINGS
========================

Do NOT treat section headings as questions.

Examples:

SECTION A
Part I
Very Short Answer Questions
Instructions
Answer any five questions.
Maximum Marks: 50

========================
8. PAGE NUMBER
========================

The "page" field is the 1-based page where the question BEGINS.

If Question 4 begins on page 2:

"page": 2

If Question 4 continues onto page 3, it is still ONE question.

Do not duplicate the question because it continues onto another page.

========================
9. MARKS
========================

If the paper explicitly shows marks associated with a question,
extract the numeric value.

Examples:

[2 marks]
(5)
[10]

Return the numeric value.

If marks cannot confidently be associated with the question,
return:

"marks": null

Never invent marks.

========================
10. CONFIDENCE
========================

Return a confidence value between 0 and 1.

Use high confidence when:

- question numbering is clear
- question text is clearly readable
- question boundaries are obvious

Use lower confidence when:

- text is blurry
- numbering is ambiguous
- the page is poorly scanned
- question boundaries are uncertain

Do not artificially give every question 1.0 confidence.

========================
11. HANDLING CONTINUATIONS
========================

A question can span multiple pages.

For example:

Page 3:
12. Explain the following...

Page 4:
...continued...

This is ONE question:

12

Do not create a second question for the continuation.

========================
12. UNUSUAL FORMATTING
========================

The document may contain:

- unusual fonts
- scanned pages
- tables
- columns
- images
- mathematical notation
- uneven spacing
- handwritten annotations
- page headers
- page footers

Use the visual layout and surrounding context to determine
question boundaries.

========================
13. FINAL VALIDATION
========================

Before returning the result, internally verify:

- Every question was extracted.
- Every labelled sub-part is separate.
- Original numbering is preserved.
- Printed order is preserved.
- Order starts at 0.
- No duplicate questions were created.
- No section headings were treated as questions.
- Page numbers are 1-based.
- Questions spanning pages remain one question.
- Marks are null when uncertain.
- Confidence values are between 0 and 1.

Return ONLY the structured JSON requested by the response schema.
`;

/**
 * Converts Gemini Files API references into the content format
 * expected by generateContent().
 */
function buildContents(
  uploadedFiles: Array<{
    uri: string;
    mimeType: string;
  }>
) {
  return [
    {
      text: EXTRACTION_PROMPT,
    },

    ...uploadedFiles.map((file) => ({
      fileData: {
        fileUri: file.uri,
        mimeType: file.mimeType,
      },
    })),
  ];
}

/**
 * Extract JSON from Gemini and validate it.
 */
function parseExtractionResponse(
  response: {
    text?: string;
  }
): QuestionExtractionResult {
  if (!response.text) {
    throw new Error(
      "Gemini returned an empty question extraction response."
    );
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(response.text);
  } catch {
    throw new Error(
      "Gemini returned invalid JSON for question extraction."
    );
  }

  const result =
    QuestionExtractionResultSchema.parse(parsed);

  /**
   * Application-level validation.
   *
   * Gemini should return the correct order,
   * but we never blindly trust model output.
   */
  result.questions.forEach(
    (question, index) => {
      if (question.order !== index) {
        throw new Error(
          `Question order validation failed. Expected order ${index}, received ${question.order} for question ${question.number}.`
        );
      }
    }
  );

  return result;
}

/**
 * Returns true when the model returned a transient
 * service-capacity error.
 */
function shouldRetry(
  error: unknown
): boolean {
  return isRetryableGeminiError(error);
}

/**
 * Attempt one extraction request with one model.
 */
async function extractWithModel(
  model: string,
  uploadedFiles: Array<{
    uri: string;
    mimeType: string;
  }>
): Promise<QuestionExtractionResult> {
  const response =
    await gemini.models.generateContent({
      model,

      contents: buildContents(uploadedFiles),

      config: {
        responseMimeType: "application/json",

        responseSchema:
          questionExtractionJsonSchema,

        thinkingConfig: {
          thinkingLevel:
            ThinkingLevel.MEDIUM,
        },
      },
    });

  return parseExtractionResponse(response);
}

/**
 * Extract every printed question from the supplied
 * question paper.
 *
 * Resilience strategy:
 *
 * 1. Try Gemini 3.7 Flash.
 * 2. Retry transient 503/availability failures.
 * 3. Fall back to Gemini 3.6 Flash.
 * 4. Fall back to Gemini 3.5 Flash.
 * 5. Fall back to Gemini 3.5 Flash-Lite.
 *
 * We only retry transient provider failures.
 * Invalid requests, authentication failures,
 * schema errors, etc. are surfaced immediately.
 */
export async function extractQuestions(
  uploadedFiles: Array<{
    uri: string;
    mimeType: string;
  }>
): Promise<QuestionExtractionResult> {
  if (uploadedFiles.length === 0) {
    throw new Error(
      "No question-paper files were provided."
    );
  }

  const models = [
    GEMINI_MODEL,
    ...GEMINI_FALLBACK_MODELS,
  ];

  let lastError: unknown = null;

  for (
    let modelIndex = 0;
    modelIndex < models.length;
    modelIndex++
  ) {
    const model = models[modelIndex];

    /*
 * We allow up to 2 attempts per model.
 *
 * Attempt 1:
 * immediate request
 *
 * Attempt 2:
 * wait + retry
 */
const maxAttempts = 2;

    for (
      let attempt = 0;
      attempt < maxAttempts;
      attempt++
    ) {
      try {
        console.log(
          `[Question Extraction] Trying model ${model}, attempt ${
            attempt + 1
          }/${maxAttempts}`
        );

        const result =
          await extractWithModel(
            model,
            uploadedFiles
          );

        console.log(
          `[Question Extraction] Success with ${model}`
        );

        return result;
      } catch (error) {
        lastError = error;

        console.error(
          `[Question Extraction] ${model} failed on attempt ${
            attempt + 1
          }/${maxAttempts}:`,
          error
        );

        /*
         * Only retry transient service errors.
         *
         * Do not repeatedly retry malformed requests,
         * invalid API keys, or schema problems.
         */
        if (!shouldRetry(error)) {
          throw error;
        }

        /*
         * If this was the final attempt for this model,
         * move to the next fallback model.
         */
        if (attempt === maxAttempts - 1) {
          console.warn(
            `[Question Extraction] ${model} unavailable. Moving to fallback model.`
          );

          break;
        }

        /*
         * Wait before retrying.
         *
         * client.ts provides exponential backoff.
         */
        await waitForRetry(attempt);
      }
    }
  }

  /*
   * All models failed after retries.
   */
  if (lastError instanceof Error) {
    throw new Error(
      `Question extraction failed after trying all available Gemini models. Last error: ${lastError.message}`
    );
  }

  throw new Error(
    "Question extraction failed after trying all available Gemini models."
  );
}