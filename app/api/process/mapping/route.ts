import { NextResponse } from "next/server";

import {
  AnswerMappingSchema,
  QuestionSchema,
  StudentAnswerSchema,
} from "@/lib/schemas/assessment";

import { mapAnswersToQuestions } from "@/lib/assessment/mapper";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // ---------------------------------------------------------
    // Validate basic request structure
    // ---------------------------------------------------------

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

    // ---------------------------------------------------------
    // Normalize question IDs
    //
    // Gemini extraction may return the question information
    // without an id. The mapping stage requires every question
    // to have one, so create a deterministic fallback ID.
    // ---------------------------------------------------------

    const normalizedQuestions = body.questions.map(
      (question: unknown, index: number) => {
        if (
          typeof question !== "object" ||
          question === null
        ) {
          throw new Error(
            `Invalid question at index ${index}.`
          );
        }

        const questionObject = question as Record<
          string,
          unknown
        >;

        return {
          ...questionObject,

          id:
            typeof questionObject.id === "string" &&
            questionObject.id.trim().length > 0
              ? questionObject.id
              : `question-${index + 1}`,
        };
      }
    );

    // ---------------------------------------------------------
    // Validate questions after normalization
    // ---------------------------------------------------------

    const questions = normalizedQuestions.map(
      (question: unknown) =>
        QuestionSchema.parse(question)
    );

    // ---------------------------------------------------------
    // Validate student answers
    // ---------------------------------------------------------

    const answers = body.answers.map(
      (answer: unknown) =>
        StudentAnswerSchema.parse(answer)
    );

    console.log(
      `[Answer Mapping] Mapping ${questions.length} questions to ${answers.length} answers...`
    );

    // ---------------------------------------------------------
    // Run deterministic answer mapping
    // ---------------------------------------------------------

    const mappings = mapAnswersToQuestions(
      questions,
      answers
    );

    // ---------------------------------------------------------
    // Validate every mapping before returning
    // ---------------------------------------------------------

    const validatedMappings = mappings.map(
      (mapping) =>
        AnswerMappingSchema.parse(mapping)
    );

    // ---------------------------------------------------------
    // Calculate mapping statistics
    // ---------------------------------------------------------

    const answeredCount =
      validatedMappings.filter(
        (mapping) =>
          mapping.status === "answered"
      ).length;

    const unansweredCount =
      validatedMappings.filter(
        (mapping) =>
          mapping.status === "unanswered"
      ).length;

    const ambiguousCount =
      validatedMappings.filter(
        (mapping) =>
          mapping.status === "ambiguous"
      ).length;

    console.log(
      `[Answer Mapping] Complete: ${answeredCount} answered, ${unansweredCount} unanswered, ${ambiguousCount} ambiguous.`
    );

    // ---------------------------------------------------------
    // Return successful mapping result
    // ---------------------------------------------------------

    return NextResponse.json({
      success: true,
      mappings: validatedMappings,
      metadata: {
        questionCount: questions.length,
        answerCount: answers.length,
        answeredCount,
        unansweredCount,
        ambiguousCount,
      },
    });
  } catch (error) {
    console.error(
      "[Answer Mapping] Error:",
      error
    );

    const message =
      error instanceof Error
        ? error.message
        : "Answer mapping failed.";

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