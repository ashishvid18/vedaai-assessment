import {
  gemini,
  GEMINI_MODELS,
  isRetryableGeminiError,
  waitForRetry,
} from "@/lib/ai/client";
import { StudentAnswerSchema } from "@/lib/schemas/assessment";
import { z } from "zod";

const AnswerExtractionResultSchema = z.object({
  answers: z.array(StudentAnswerSchema),
});

export type AnswerExtractionResult = z.infer<
  typeof AnswerExtractionResultSchema
>;

type UploadedFile = {
  uri: string;
  mimeType: string;
};

/**
 * Build the Gemini request contents.
 */
function buildContents(files: UploadedFile[]) {
  return [
    {
      text: `
You are extracting handwritten answers from a student's answer sheet.

Your task is to identify every distinct handwritten answer visible in the
provided document(s).

IMPORTANT RULES:

1. Do NOT invent answers.
2. Preserve the student's wording as closely as possible.
3. Transcribe handwritten text as accurately as possible.
4. Identify the question label written near each answer when visible.
5. If no question label is visible, use null for detectedLabel.
6. An answer may span multiple pages.
7. If an answer spans multiple pages, create multiple regions for that answer.
8. Every answer must have at least one region.
9. Page numbers must refer to the original uploaded document pages.
10. Bounding boxes must be normalized between 0 and 1.
11. x and y represent the top-left corner of the region.
12. width and height represent the size of the region.
13. Do not merge two clearly separate answers into one answer.
14. Do not create an answer for printed question text.
15. Only return actual student-written responses.
16. Carefully inspect every page of the PDF.
17. Handwritten text may be faint, small, or difficult to read.
18. Do not assume that a page contains no answers simply because the
    handwriting is difficult to recognize.
19. Look for handwriting throughout the entire page, not only near the
    question number.
20. Return an answer whenever there is reasonable visual evidence of
    student handwriting.

For each answer return:

- id: a unique stable identifier such as "answer-1", "answer-2"
- detectedLabel: the question number/label if visible, otherwise null
- text: the transcription of the student's handwritten answer
- regions: one or more page/bounding-box regions containing that answer
- confidence: your confidence from 0 to 1

Return ONLY valid JSON.

The JSON must have exactly this top-level structure:

{
  "answers": [
    {
      "id": "answer-1",
      "detectedLabel": "1",
      "text": "transcribed handwritten answer",
      "regions": [
        {
          "page": 1,
          "bbox": {
            "x": 0.1,
            "y": 0.2,
            "width": 0.7,
            "height": 0.15
          }
        }
      ],
      "confidence": 0.95
    }
  ]
}

If there are genuinely no handwritten answers visible after inspecting
the entire document, return:

{
  "answers": []
}

Do not include markdown fences.
Do not include explanations outside the JSON.
      `.trim(),
    },

    ...files.map((file) => ({
      fileData: {
        fileUri: file.uri,
        mimeType: file.mimeType,
      },
    })),
  ];
}

/**
 * Parse Gemini's JSON response safely.
 */
function parseGeminiJson(text: string): unknown {
  let cleaned = text.trim();

  if (cleaned.startsWith("```")) {
    cleaned = cleaned
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();
  }

  try {
    return JSON.parse(cleaned);
  } catch {
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");

    if (firstBrace === -1 || lastBrace === -1) {
      throw new Error(
        "Gemini returned invalid JSON for answer extraction."
      );
    }

    try {
      return JSON.parse(
        cleaned.slice(firstBrace, lastBrace + 1)
      );
    } catch {
      throw new Error(
        "Gemini returned invalid JSON for answer extraction."
      );
    }
  }
}

/**
 * Extract handwritten answers from uploaded answer-sheet files.
 */
export async function extractAnswers(
  uploadedFiles: UploadedFile[]
): Promise<AnswerExtractionResult> {
  if (uploadedFiles.length === 0) {
    throw new Error(
      "No answer-sheet files were provided."
    );
  }

  console.log(
    `[Answer Extraction] Input files: ${uploadedFiles.length}`
  );

  uploadedFiles.forEach((file, index) => {
    console.log(
      `[Answer Extraction] File ${index + 1}: ${file.mimeType} | ${file.uri}`
    );
  });

  let lastError: unknown = null;

  for (
    let modelIndex = 0;
    modelIndex < GEMINI_MODELS.length;
    modelIndex++
  ) {
    const model = GEMINI_MODELS[modelIndex];

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        console.log(
          `[Answer Extraction] Trying model ${model}, attempt ${
            attempt + 1
          }/2`
        );

        const response =
          await gemini.models.generateContent({
            model,
            contents: buildContents(uploadedFiles),
            config: {
              responseMimeType: "application/json",
            },
          });

        const text = response.text;

        /**
         * IMPORTANT:
         * Log the exact raw response so we can diagnose cases
         * where Gemini returns a valid but empty answer list.
         */
        console.log(
          `[Answer Extraction] ${model} returned ${
            text?.length ?? 0
          } characters.`
        );

        console.log(
          `[Answer Extraction] Raw response from ${model}:`,
          JSON.stringify(text)
        );

        if (!text) {
          throw new Error(
            "Gemini returned an empty response for answer extraction."
          );
        }

        const parsed = parseGeminiJson(text);

        const result =
          AnswerExtractionResultSchema.parse(parsed);

        console.log(
          `[Answer Extraction] ${model} returned ${
            result.answers.length
          } answers.`
        );

        /**
         * If Gemini returns valid JSON but zero answers,
         * treat it as an unsuccessful extraction rather than
         * accepting an empty assessment.
         */
        if (result.answers.length === 0) {
          lastError = new Error(
            `${model} returned 0 handwritten answers.`
          );

          console.warn(
            `[Answer Extraction] ${model} returned 0 handwritten answers.`
          );

          /**
           * Retry once before moving to another model.
           */
          if (attempt === 0) {
            console.log(
              `[Answer Extraction] Retrying ${model} because no handwritten answers were detected.`
            );

            await waitForRetry(attempt);
            continue;
          }

          break;
        }

        console.log(
          `[Answer Extraction] Success with ${model}. Found ${result.answers.length} answers.`
        );

        return result;
      } catch (error) {
        lastError = error;

        console.error(
          `[Answer Extraction] ${model} failed${
            attempt === 0
              ? ` on attempt ${attempt + 1}/2`
              : ""
          }:`,
          error
        );

        const canRetry =
          isRetryableGeminiError(error);

        if (
          canRetry &&
          attempt === 0
        ) {
          await waitForRetry(attempt);
          continue;
        }

        break;
      }
    }

    if (modelIndex < GEMINI_MODELS.length - 1) {
      console.log(
        `[Answer Extraction] ${model} unavailable or returned no usable answers. Moving to fallback model.`
      );
    }
  }

  throw (
    lastError instanceof Error
      ? lastError
      : new Error(
          "Answer extraction failed."
        )
  );
}