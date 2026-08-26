import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  throw new Error("GEMINI_API_KEY is not configured.");
}

const gemini = new GoogleGenAI({
  apiKey,
  httpOptions: {
    timeout: 600_000,
  },
});

const MODELS = [
  "gemini-3.6-flash",
  "gemini-3.5-flash-lite",
] as const;

type Evaluation = {
  questionId: string;
  score: number;
  maxScore: number;
  status:
    | "correct"
    | "partial"
    | "incorrect"
    | "unanswered";
  feedback: string;
  confidence: number;
};

type FeedbackResult = {
  summary: string;
  strengths: string[];
  areasToImprove: string[];
  recommendation: string;
};

function extractJson(text: string): string {
  const cleaned = text
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1) {
    throw new Error("Gemini did not return valid JSON.");
  }

  return cleaned.slice(firstBrace, lastBrace + 1);
}

function createFallbackFeedback(
  evaluations: Evaluation[]
): FeedbackResult {
  const answered = evaluations.filter(
    (evaluation) =>
      evaluation.status !== "unanswered"
  );

  const correct = evaluations.filter(
    (evaluation) =>
      evaluation.status === "correct"
  );

  const partial = evaluations.filter(
    (evaluation) =>
      evaluation.status === "partial"
  );

  const incorrect = evaluations.filter(
    (evaluation) =>
      evaluation.status === "incorrect"
  );

  const totalMarks = evaluations.reduce(
    (sum, evaluation) =>
      sum + evaluation.maxScore,
    0
  );

  const obtainedMarks = evaluations.reduce(
    (sum, evaluation) =>
      sum + evaluation.score,
    0
  );

  const percentage =
    totalMarks > 0
      ? (obtainedMarks / totalMarks) * 100
      : 0;

  let summary = "";

  if (percentage >= 80) {
    summary =
      "The student has demonstrated a strong understanding of the assessed topics and performed well overall.";
  } else if (percentage >= 60) {
    summary =
      "The student has demonstrated a reasonable understanding of the assessed topics, with some areas requiring further improvement.";
  } else {
    summary =
      "The student shows partial understanding of the assessed topics and would benefit from additional revision and practice.";
  }

  const strengths: string[] = [];

  if (correct.length > 0) {
    strengths.push(
      `Successfully answered ${correct.length} question${
        correct.length === 1 ? "" : "s"
      } correctly.`
    );
  }

  if (answered.length > 0) {
    strengths.push(
      `Attempted ${answered.length} of ${evaluations.length} questions.`
    );
  }

  if (strengths.length === 0) {
    strengths.push(
      "No clear strengths could be identified from the available answers."
    );
  }

  const areasToImprove: string[] = [];

  if (partial.length > 0) {
    areasToImprove.push(
      `Review the concepts covered in the ${partial.length} partially correct question${
        partial.length === 1 ? "" : "s"
      }.`
    );
  }

  if (incorrect.length > 0) {
    areasToImprove.push(
      `Revise the topics related to the ${incorrect.length} incorrectly answered question${
        incorrect.length === 1 ? "" : "s"
      }.`
    );
  }

  const unanswered = evaluations.filter(
    (evaluation) =>
      evaluation.status === "unanswered"
  );

  if (unanswered.length > 0) {
    areasToImprove.push(
      `Try to attempt all questions where possible; ${unanswered.length} question${
        unanswered.length === 1 ? " was" : "s were"
      } left unanswered.`
    );
  }

  if (areasToImprove.length === 0) {
    areasToImprove.push(
      "Continue practising to maintain accuracy and consistency."
    );
  }

  return {
    summary,
    strengths,
    areasToImprove,
    recommendation:
      "Continue practising the assessed concepts and focus especially on questions where marks were partially or not fully awarded.",
  };
}

async function generateFeedback(
  evaluations: Evaluation[],
  model: string
): Promise<FeedbackResult> {
  const totalMarks = evaluations.reduce(
    (sum, evaluation) =>
      sum + evaluation.maxScore,
    0
  );

  const obtainedMarks = evaluations.reduce(
    (sum, evaluation) =>
      sum + evaluation.score,
    0
  );

  const percentage =
    totalMarks > 0
      ? Number(
          (
            (obtainedMarks / totalMarks) *
            100
          ).toFixed(2)
        )
      : 0;

  const prompt = `
You are an experienced teacher reviewing a student's assessment.

Your task is to generate concise, constructive teacher feedback based ONLY on the evaluation data provided below.

Assessment statistics:
- Total marks: ${totalMarks}
- Obtained marks: ${obtainedMarks}
- Percentage: ${percentage}%

Question evaluations:
${JSON.stringify(evaluations, null, 2)}

Return ONLY valid JSON in exactly this structure:

{
  "summary": "A concise overall assessment of the student's performance.",
  "strengths": [
    "Specific strength 1",
    "Specific strength 2"
  ],
  "areasToImprove": [
    "Specific improvement area 1",
    "Specific improvement area 2"
  ],
  "recommendation": "A concise recommendation for the student."
}

Rules:
- Do not invent information that is not supported by the evaluations.
- Keep the feedback professional and teacher-like.
- Mention strong performance where appropriate.
- Mention weaknesses constructively.
- If questions were unanswered, mention that.
- Do not include markdown.
- Do not include code fences.
- Return JSON only.
`;

  const response =
    await gemini.models.generateContent({
      model,
      contents: prompt,
      config: {
        temperature: 0.2,
      },
    });

  const text =
    response.text?.trim() ?? "";

  if (!text) {
    throw new Error(
      `${model} returned an empty feedback response.`
    );
  }

  const jsonText = extractJson(text);

  const parsed = JSON.parse(
    jsonText
  ) as Partial<FeedbackResult>;

  if (
    typeof parsed.summary !== "string" ||
    !Array.isArray(parsed.strengths) ||
    !Array.isArray(parsed.areasToImprove) ||
    typeof parsed.recommendation !==
      "string"
  ) {
    throw new Error(
      `${model} returned an invalid feedback structure.`
    );
  }

  return {
    summary: parsed.summary,
    strengths: parsed.strengths.filter(
      (item): item is string =>
        typeof item === "string"
    ),
    areasToImprove:
      parsed.areasToImprove.filter(
        (item): item is string =>
          typeof item === "string"
      ),
    recommendation:
      parsed.recommendation,
  };
}

export async function POST(
  request: Request
) {
  try {
    const body = await request.json();

    if (!Array.isArray(body.evaluations)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Evaluations must be an array.",
        },
        { status: 400 }
      );
    }

    const evaluations =
      body.evaluations as Evaluation[];

    if (evaluations.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error:
            "No evaluations were provided.",
        },
        { status: 400 }
      );
    }

    console.log(
      `[Teacher Feedback] Preparing feedback for ${evaluations.length} evaluations...`
    );

    let lastError: unknown = null;

    for (
      let modelIndex = 0;
      modelIndex < MODELS.length;
      modelIndex++
    ) {
      const model = MODELS[modelIndex];

      console.log(
        `[Teacher Feedback] Trying model ${model}`
      );

      try {
        const feedback =
          await generateFeedback(
            evaluations,
            model
          );

        console.log(
          `[Teacher Feedback] Successfully generated feedback with ${model}`
        );

        return NextResponse.json({
          success: true,
          feedback,
          model,
        });
      } catch (error) {
        lastError = error;

        console.error(
          `[Teacher Feedback] ${model} failed:`,
          error
        );

        if (
          modelIndex <
          MODELS.length - 1
        ) {
          console.log(
            `[Teacher Feedback] Moving to fallback model.`
          );
        }
      }
    }

    console.warn(
      "[Teacher Feedback] Gemini unavailable. Using deterministic fallback feedback."
    );

    const fallback =
      createFallbackFeedback(
        evaluations
      );

    return NextResponse.json({
      success: true,
      feedback: fallback,
      model: "deterministic-fallback",
      warning:
        lastError instanceof Error
          ? lastError.message
          : "Gemini feedback generation failed.",
    });
  } catch (error) {
    console.error(
      "[Teacher Feedback] Error:",
      error
    );

    const message =
      error instanceof Error
        ? error.message
        : "Teacher feedback generation failed.";

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 }
    );
  }
}