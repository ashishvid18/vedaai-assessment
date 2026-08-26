import { z } from "zod";

/**
 * A bounding box.
 *
 * Coordinates are measured relative to the
 * rendered page/image dimensions.
 *
 * x: horizontal position from the left
 * y: vertical position from the top
 * width: box width
 * height: box height
 */
export const BoundingBoxSchema = z.object({
  x: z.number().min(0),
  y: z.number().min(0),
  width: z.number().min(0),
  height: z.number().min(0),
});

/**
 * A region of an answer on a particular page.
 *
 * An answer can have multiple regions when it:
 * - spans multiple pages
 * - has a continuation
 * - contains separated handwritten sections
 */
export const AnswerRegionSchema = z.object({
  page: z.number().int().positive(),
  bbox: BoundingBoxSchema,
});

/**
 * A question extracted from the printed question paper.
 */
export const QuestionSchema = z.object({
  id: z.string(),
  number: z.string(),
  text: z.string(),
  page: z.number().int().positive(),
  order: z.number().int().nonnegative(),
  marks: z.number().nonnegative().optional(),
  confidence: z.number().min(0).max(1),
});

/**
 * A handwritten answer detected on the student's answer sheet.
 */
export const StudentAnswerSchema = z.object({
  /**
   * Unique identifier for this detected answer.
   *
   * This is required by the mapping stage so that
   * one answer cannot accidentally be mapped to
   * multiple questions.
   */
  id: z.string(),

  /**
   * The question label detected near the handwritten answer.
   *
   * Examples:
   * "11(a)"
   * "Q5"
   * null when no label was detected.
   */
  detectedLabel: z.string().nullable(),

  /**
   * OCR/transcribed handwritten answer.
   */
  text: z.string(),

  /**
   * Exact visual regions occupied by the answer.
   */
  regions: z.array(AnswerRegionSchema).min(1),

  /**
   * Confidence of the handwritten-answer extraction.
   */
  confidence: z.number().min(0).max(1),
});

/**
 * How an answer was matched to a question.
 */
export const MappingMethodSchema = z.enum([
  "exact",
  "normalized",
  "fuzzy",
  "semantic",
  "manual",
]);

/**
 * Mapping between a question and student's answer.
 */
export const AnswerMappingSchema = z.object({
  questionId: z.string(),
  answerId: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  method: MappingMethodSchema,
  status: z.enum([
    "answered",
    "unanswered",
    "ambiguous",
  ]),
});

/**
 * AI grading result.
 */
export const EvaluationSchema = z.object({
  questionId: z.string(),
  score: z.number().nonnegative(),
  maxScore: z.number().positive(),
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
 * Complete assessment state.
 */
export const AssessmentSchema = z.object({
  id: z.string(),
  questions: z.array(QuestionSchema),
  answers: z.array(StudentAnswerSchema),
  mappings: z.array(AnswerMappingSchema),
  evaluations: z.array(EvaluationSchema),
  status: z.enum([
    "uploaded",
    "processing",
    "completed",
    "failed",
  ]),
});

/**
 * Inferred TypeScript types.
 */
export type BoundingBox = z.infer<
  typeof BoundingBoxSchema
>;

export type AnswerRegion = z.infer<
  typeof AnswerRegionSchema
>;

export type Question = z.infer<
  typeof QuestionSchema
>;

export type StudentAnswer = z.infer<
  typeof StudentAnswerSchema
>;

export type AnswerMapping = z.infer<
  typeof AnswerMappingSchema
>;

export type Evaluation = z.infer<
  typeof EvaluationSchema
>;

export type Assessment = z.infer<
  typeof AssessmentSchema
>;