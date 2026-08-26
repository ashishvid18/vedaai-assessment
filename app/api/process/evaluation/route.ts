import { NextResponse } from "next/server";

import {
  AnswerMappingSchema,
  EvaluationSchema,
  QuestionSchema,
  StudentAnswerSchema,
  type AnswerMapping,
  type Evaluation,
  type Question,
  type StudentAnswer,
} from "@/lib/schemas/assessment";

import {
  evaluateAnswers,
  type EvaluationInput,
} from "@/lib/ai/evaluator";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // -------------------------------------------------------
    // Validate request shape
    // -------------------------------------------------------

    if (!Array.isArray(body.questions)) {
      return NextResponse.json(
        {
          success: false,
          error: "Questions must be an array.",
        },
        { status: 400 }
      );
    }

    if (!Array.isArray(body.answers)) {
      return NextResponse.json(
        {
          success: false,
          error: "Answers must be an array.",
        },
        { status: 400 }
      );
    }

    if (!Array.isArray(body.mappings)) {
      return NextResponse.json(
        {
          success: false,
          error: "Mappings must be an array.",
        },
        { status: 400 }
      );
    }

    // -------------------------------------------------------
    // Validate questions
    // -------------------------------------------------------

    const questions: Question[] = body.questions.map(
      (question: unknown) =>
        QuestionSchema.parse(question)
    );

    // -------------------------------------------------------
    // Validate answers
    // -------------------------------------------------------

    const answers: StudentAnswer[] = body.answers.map(
      (answer: unknown) =>
        StudentAnswerSchema.parse(answer)
    );

    // -------------------------------------------------------
    // Validate mappings
    // -------------------------------------------------------

    const mappings: AnswerMapping[] = body.mappings.map(
      (mapping: unknown) =>
        AnswerMappingSchema.parse(mapping)
    );

    console.log(
      `[AI Evaluation] Preparing ${questions.length} questions for evaluation...`
    );

    console.log(
      `[AI Evaluation] Received ${answers.length} student answers.`
    );

    console.log(
      `[AI Evaluation] Received ${mappings.length} mappings.`
    );

    // -------------------------------------------------------
    // Build answer lookup map
    // -------------------------------------------------------

    const answerById = new Map<string, StudentAnswer>(
      answers.map(
        (answer: StudentAnswer) => [
          answer.id,
          answer,
        ]
      )
    );

    // -------------------------------------------------------
    // Build evaluation inputs
    // -------------------------------------------------------

    const inputs: EvaluationInput[] =
      questions.map(
        (question: Question) => {
          const mapping =
            mappings.find(
              (item: AnswerMapping) =>
                item.questionId ===
                question.id
            );

          // No mapping means unanswered.
          if (
            !mapping ||
            !mapping.answerId ||
            mapping.status !== "answered"
          ) {
            return {
              question,
              answer: null,
            };
          }

          const answer =
            answerById.get(
              mapping.answerId
            );

          return {
            question,
            answer: answer ?? null,
          };
        }
      );

    // -------------------------------------------------------
    // Evaluate answers
    // -------------------------------------------------------

    console.log(
      "[AI Evaluation] Starting answer evaluation..."
    );

    const evaluations: Evaluation[] =
      await evaluateAnswers(inputs);

    // -------------------------------------------------------
    // Final validation
    // -------------------------------------------------------

    const validatedEvaluations: Evaluation[] =
      evaluations.map(
        (evaluation: Evaluation) =>
          EvaluationSchema.parse(
            evaluation
          )
      );

    // -------------------------------------------------------
    // Statistics
    // -------------------------------------------------------

    const totalMarks =
      validatedEvaluations.reduce(
        (
          sum: number,
          evaluation: Evaluation
        ) =>
          sum + evaluation.maxScore,
        0
      );

    const obtainedMarks =
      validatedEvaluations.reduce(
        (
          sum: number,
          evaluation: Evaluation
        ) =>
          sum + evaluation.score,
        0
      );

    const correctCount =
      validatedEvaluations.filter(
        (evaluation: Evaluation) =>
          evaluation.status === "correct"
      ).length;

    const partialCount =
      validatedEvaluations.filter(
        (evaluation: Evaluation) =>
          evaluation.status === "partial"
      ).length;

    const incorrectCount =
      validatedEvaluations.filter(
        (evaluation: Evaluation) =>
          evaluation.status === "incorrect"
      ).length;

    const unansweredCount =
      validatedEvaluations.filter(
        (evaluation: Evaluation) =>
          evaluation.status === "unanswered"
      ).length;

    const answeredCount =
      validatedEvaluations.length -
      unansweredCount;

    const percentage =
      totalMarks > 0
        ? Number(
            (
              (obtainedMarks /
                totalMarks) *
              100
            ).toFixed(2)
          )
        : 0;

    console.log(
      `[AI Evaluation] Complete: ${obtainedMarks}/${totalMarks} (${percentage}%).`
    );

    console.log(
      `[AI Evaluation] Correct: ${correctCount}, Partial: ${partialCount}, Incorrect: ${incorrectCount}, Unanswered: ${unansweredCount}`
    );

    // -------------------------------------------------------
    // Return evaluation result
    // -------------------------------------------------------

    return NextResponse.json({
      success: true,

      evaluations:
        validatedEvaluations,

      metadata: {
        questionCount:
          questions.length,

        answeredCount,

        unansweredCount,

        correctCount,

        partialCount,

        incorrectCount,

        totalMarks,

        obtainedMarks,

        percentage,
      },
    });
  } catch (error) {
    console.error(
      "[AI Evaluation] Error:",
      error
    );

    const message =
      error instanceof Error
        ? error.message
        : "AI evaluation failed.";

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      {
        status: 500,
      }
    );
  }
}