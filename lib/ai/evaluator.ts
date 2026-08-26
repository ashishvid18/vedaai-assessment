import {
  gemini,
  GEMINI_MODELS,
  isRetryableGeminiError,
  waitForRetry,
} from "@/lib/ai/client";

import {
  EvaluationSchema,
  type Evaluation,
  type Question,
  type StudentAnswer,
} from "@/lib/schemas/assessment";

import { z } from "zod";

/**
 * ---------------------------------------------------------
 * Input types
 * ---------------------------------------------------------
 */

export type EvaluationInput = {
  question: Question;
  answer: StudentAnswer | null;
};

/**
 * ---------------------------------------------------------
 * Gemini response schema
 * ---------------------------------------------------------
 *
 * We validate Gemini's response before allowing it into
 * the application.
 */
const GeminiEvaluationSchema = z.object({
  score: z.number().nonnegative(),
  status: z.enum([
    "correct",
    "partial",
    "incorrect",
    "unanswered",
  ]),
  feedback: z.string(),
  confidence: z.number().min(0).max(1),
});

/**
 * ---------------------------------------------------------
 * Prompt
 * ---------------------------------------------------------
 */

function buildPrompt(
  question: Question,
  answer: StudentAnswer | null
): string {
  const maxScore =
    question.marks;

  if (
    maxScore === undefined ||
    maxScore === null
  ) {
    throw new Error(
      `Question ${question.number} does not have a marks value.`
    );
  }

  const answerText =
    answer?.text?.trim() ?? "";

  if (!answerText) {
    return `
You are evaluating a student's answer to an academic question.

The student did not provide a detected answer.

Question:
${question.text}

Question number:
${question.number}

Maximum marks:
${maxScore}

Return ONLY valid JSON.

The response must have exactly this structure:

{
  "score": 0,
  "status": "unanswered",
  "feedback": "No answer was detected for this question.",
  "confidence": 1
}

Rules:

- score must be exactly 0.
- status must be "unanswered".
- Do not invent a student response.
- Do not award marks for an answer that was not detected.
- confidence must be 1 because the system knows that no answer was provided.
    `.trim();
  }

  return `
You are an expert academic evaluator.

Evaluate the student's answer against the question.

==========================================================
QUESTION
==========================================================

Question number:
${question.number}

Question:
${question.text}

Maximum marks:
${maxScore}

==========================================================
STUDENT ANSWER
==========================================================

${answerText}

==========================================================
GRADING RULES
==========================================================

1. Evaluate ONLY the student's written answer provided above.

2. Do not invent information that the student did not write.

3. Do not assume that an omitted point was intended.

4. Award marks based on correctness, relevance, completeness,
   reasoning, and the requirements of the question.

5. Give partial credit when the answer demonstrates some correct
   knowledge but is incomplete or contains some errors.

6. Give full marks only when the answer sufficiently satisfies the
   question for the available marks.

7. Give zero marks when the answer is fundamentally incorrect,
   irrelevant, or does not answer the question.

8. The score MUST be between 0 and ${maxScore}.

9. Never exceed the maximum marks.

10. Do not change the maximum marks.

11. Do not penalize the student merely for grammar or spelling
    unless language accuracy is explicitly required by the question.

12. Do not penalize handwriting quality. The answer text provided to
    you is already the extracted transcription.

13. Keep feedback concise and useful to a teacher/student.

14. Explain briefly WHY the answer received its score.

==========================================================
STATUS RULES
==========================================================

Use:

"correct"
    when the answer is substantially correct and earns full marks.

"partial"
    when the answer contains meaningful correct information but
    does not deserve full marks.

"incorrect"
    when the answer is substantially wrong or irrelevant.

"unanswered"
    only when there is no student answer.

==========================================================
CONFIDENCE
==========================================================

Return confidence from 0 to 1.

Confidence represents how certain you are about the evaluation,
not how confident the student was.

==========================================================
OUTPUT
==========================================================

Return ONLY valid JSON.

Do not use markdown fences.

Do not include explanations outside JSON.

Use exactly this structure:

{
  "score": 2,
  "status": "correct",
  "feedback": "The answer correctly explains the main concept and addresses the requirements of the question.",
  "confidence": 0.95
}
  `.trim();
}

/**
 * ---------------------------------------------------------
 * JSON parsing
 * ---------------------------------------------------------
 */

function parseGeminiJson(
  text: string
): unknown {
  let cleaned =
    text.trim();

  if (
    cleaned.startsWith("```")
  ) {
    cleaned = cleaned
      .replace(
        /^```(?:json)?\s*/i,
        ""
      )
      .replace(
        /\s*```$/,
        ""
      )
      .trim();
  }

  try {
    return JSON.parse(
      cleaned
    );
  } catch {
    const firstBrace =
      cleaned.indexOf("{");

    const lastBrace =
      cleaned.lastIndexOf("}");

    if (
      firstBrace === -1 ||
      lastBrace === -1
    ) {
      throw new Error(
        "Gemini returned invalid JSON for evaluation."
      );
    }

    try {
      return JSON.parse(
        cleaned.slice(
          firstBrace,
          lastBrace + 1
        )
      );
    } catch {
      throw new Error(
        "Gemini returned invalid JSON for evaluation."
      );
    }
  }
}

/**
 * ---------------------------------------------------------
 * Normalize evaluation
 * ---------------------------------------------------------
 *
 * Gemini is not allowed to control maxScore.
 *
 * maxScore ALWAYS comes from QuestionSchema.marks.
 */
function normalizeEvaluation(
  question: Question,
  raw: z.infer<
    typeof GeminiEvaluationSchema
  >
): Evaluation {
  if (
    question.marks === undefined ||
    question.marks === null
  ) {
    throw new Error(
      `Question ${question.number} does not have a marks value.`
    );
  }

  const maxScore =
    question.marks;

  /*
   * Clamp score so a model mistake can never produce
   * more marks than the question is worth.
   */
  const score = Math.min(
    maxScore,
    Math.max(
      0,
      raw.score
    )
  );

  /*
   * Make sure "unanswered" is always zero.
   */
  if (
    raw.status ===
    "unanswered"
  ) {
    return EvaluationSchema.parse(
      {
        questionId:
          question.id,

        score: 0,

        maxScore,

        status:
          "unanswered",

        feedback:
          raw.feedback ||
          "No answer was detected for this question.",

        confidence:
          raw.confidence,
      }
    );
  }

  /*
   * Prevent an obviously inconsistent result:
   *
   * score = maxScore but status = partial
   *
   * We normalize this rather than trusting the model.
   */
  let status =
    raw.status;

  if (
    score === maxScore &&
    status === "partial"
  ) {
    status = "correct";
  }

  if (
    score === 0 &&
    status === "correct"
  ) {
    status = "incorrect";
  }

  return EvaluationSchema.parse(
    {
      questionId:
        question.id,

      score,

      maxScore,

      status,

      feedback:
        raw.feedback.trim(),

      confidence:
        raw.confidence,
    }
  );
}

/**
 * ---------------------------------------------------------
 * Evaluate one question
 * ---------------------------------------------------------
 */

export async function evaluateAnswer(
  input: EvaluationInput
): Promise<Evaluation> {
  const {
    question,
    answer,
  } = input;

  if (
    question.marks === undefined ||
    question.marks === null
  ) {
    throw new Error(
      `Question ${question.number} does not have a marks value.`
    );
  }

  /*
   * An unanswered question does not need an AI request.
   *
   * This saves Gemini calls and makes the result deterministic.
   */
  if (
    !answer ||
    !answer.text.trim()
  ) {
    return EvaluationSchema.parse(
      {
        questionId:
          question.id,

        score: 0,

        maxScore:
          question.marks,

        status:
          "unanswered",

        feedback:
          "No answer was detected for this question.",

        confidence: 1,
      }
    );
  }

  let lastError:
    unknown = null;

  for (
    let modelIndex = 0;
    modelIndex <
    GEMINI_MODELS.length;
    modelIndex++
  ) {
    const model =
      GEMINI_MODELS[
        modelIndex
      ];

    for (
      let attempt = 0;
      attempt < 2;
      attempt++
    ) {
      try {
        console.log(
          `[AI Evaluation] Evaluating ${question.number} with ${model}, attempt ${
            attempt + 1
          }/2`
        );

        const response =
          await gemini.models.generateContent(
            {
              model,

              contents: [
                {
                  text: buildPrompt(
                    question,
                    answer
                  ),
                },
              ],

              config: {
                responseMimeType:
                  "application/json",
              },
            }
          );

        const text =
          response.text;

        if (!text) {
          throw new Error(
            `Gemini returned an empty evaluation for question ${question.number}.`
          );
        }

        const parsed =
          parseGeminiJson(text);

        const raw =
          GeminiEvaluationSchema.parse(
            parsed
          );

        const evaluation =
          normalizeEvaluation(
            question,
            raw
          );

        console.log(
          `[AI Evaluation] ${question.number}: ${evaluation.score}/${evaluation.maxScore} (${evaluation.status})`
        );

        return evaluation;
      } catch (error) {
        lastError =
          error;

        console.error(
          `[AI Evaluation] ${question.number} failed with ${model}:`,
          error
        );

        const canRetry =
          isRetryableGeminiError(
            error
          );

        if (
          canRetry &&
          attempt === 0
        ) {
          await waitForRetry(
            attempt
          );

          continue;
        }

        break;
      }
    }

    if (
      modelIndex <
      GEMINI_MODELS.length - 1
    ) {
      console.log(
        `[AI Evaluation] ${model} unavailable. Moving to fallback model.`
      );
    }
  }

  throw (
    lastError instanceof Error
      ? lastError
      : new Error(
          `AI evaluation failed for question ${question.number}.`
        )
  );
}

/**
 * ---------------------------------------------------------
 * Evaluate multiple questions
 * ---------------------------------------------------------
 *
 * Evaluations are performed sequentially.
 *
 * This is intentional for now:
 *
 * - easier debugging
 * - predictable API usage
 * - lower burst rate
 * - easier handling of model failures
 */
export async function evaluateAnswers(
  inputs: EvaluationInput[]
): Promise<Evaluation[]> {
  const evaluations: Evaluation[] =
    [];

  for (const input of inputs) {
    const evaluation =
      await evaluateAnswer(
        input
      );

    evaluations.push(
      evaluation
    );
  }

  return evaluations;
}