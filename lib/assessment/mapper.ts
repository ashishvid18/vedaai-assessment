import type {
  AnswerMapping,
  Question,
  StudentAnswer,
} from "@/lib/schemas/assessment";

/**
 * Normalize a question/answer label so equivalent labels
 * can be compared reliably.
 *
 * Examples:
 * "Q10(b)"          -> "10(b)"
 * "10 (b)"          -> "10(b)"
 * "Question 10(b)"  -> "10(b)"
 * "10-b"            -> "10b"
 */
function normalizeLabel(
  label: string | null | undefined
): string {
  if (!label) {
    return "";
  }

  return label
    .toLowerCase()
    .replace(/^question\s*/i, "")
    .replace(/^q\s*/i, "")
    .replace(/\s+/g, "")
    .replace(/[-_]/g, "")
    .replace(/[.:]/g, "")
    .trim();
}

/**
 * Extract the question number/label from an answer label.
 *
 * Examples:
 * "11(a)"          -> "11(a)"
 * "Q11(a)"         -> "11(a)"
 * "Question 11(a)" -> "11(a)"
 * "11 (a)"         -> "11(a)"
 * "Q5"             -> "5"
 * "Question 5"     -> "5"
 */
function extractLabel(value: string): string {
  const normalized = value
    .replace(/\s+/g, " ")
    .trim();

  const match = normalized.match(
    /(?:question\s*|q\s*)?(\d+(?:\s*\([a-zA-Z]\))?)/i
  );

  return match?.[1] ?? "";
}

/**
 * Find an exact label match.
 */
function findExactMatch(
  question: Question,
  answers: StudentAnswer[]
): StudentAnswer | null {
  const questionLabel = normalizeLabel(
    question.number
  );

  if (!questionLabel) {
    return null;
  }

  for (const answer of answers) {
    const answerLabel = normalizeLabel(
      answer.detectedLabel
    );

    if (
      answerLabel &&
      answerLabel === questionLabel
    ) {
      return answer;
    }
  }

  return null;
}

/**
 * Find a normalized label match.
 */
function findNormalizedMatch(
  question: Question,
  answers: StudentAnswer[]
): StudentAnswer | null {
  const questionLabel = normalizeLabel(
    question.number
  );

  if (!questionLabel) {
    return null;
  }

  for (const answer of answers) {
    if (!answer.detectedLabel) {
      continue;
    }

    const extracted = extractLabel(
      answer.detectedLabel
    );

    if (
      normalizeLabel(extracted) ===
      questionLabel
    ) {
      return answer;
    }
  }

  return null;
}

/**
 * Map extracted student answers to extracted questions.
 *
 * Matching priority:
 *
 * 1. Exact label
 * 2. Normalized label
 * 3. Ambiguous
 * 4. Unanswered
 */
export function mapAnswersToQuestions(
  questions: Question[],
  answers: StudentAnswer[]
): AnswerMapping[] {
  const usedAnswerIds = new Set<string>();

  /**
   * Preserve the original question order.
   */
  const sortedQuestions = [...questions].sort(
    (a, b) => a.order - b.order
  );

  return sortedQuestions.map(
    (question): AnswerMapping => {
      /**
       * ---------------------------------------------------
       * 1. Exact matching
       * ---------------------------------------------------
       */
      const exactCandidates = answers.filter(
        (answer) =>
          !usedAnswerIds.has(answer.id) &&
          normalizeLabel(
            answer.detectedLabel
          ) ===
            normalizeLabel(question.number)
      );

      if (exactCandidates.length === 1) {
        const answer = exactCandidates[0];

        usedAnswerIds.add(answer.id);

        return {
          questionId: question.id,
          answerId: answer.id,
          confidence: Math.min(
            1,
            answer.confidence
          ),
          method: "exact",
          status: "answered",
        };
      }

      /**
       * ---------------------------------------------------
       * 2. Normalized matching
       * ---------------------------------------------------
       */
      const normalizedCandidates =
        answers.filter((answer) => {
          if (
            usedAnswerIds.has(answer.id) ||
            !answer.detectedLabel
          ) {
            return false;
          }

          const extracted = extractLabel(
            answer.detectedLabel
          );

          return (
            normalizeLabel(extracted) ===
            normalizeLabel(question.number)
          );
        });

      if (normalizedCandidates.length === 1) {
        const answer =
          normalizedCandidates[0];

        usedAnswerIds.add(answer.id);

        return {
          questionId: question.id,
          answerId: answer.id,
          confidence: Math.min(
            0.98,
            answer.confidence
          ),
          method: "normalized",
          status: "answered",
        };
      }

      /**
       * ---------------------------------------------------
       * 3. Ambiguous match
       * ---------------------------------------------------
       */
      if (
        exactCandidates.length > 1 ||
        normalizedCandidates.length > 1
      ) {
        return {
          questionId: question.id,
          answerId: null,
          confidence: 0.5,
          method: "manual",
          status: "ambiguous",
        };
      }

      /**
       * ---------------------------------------------------
       * 4. No matching answer
       * ---------------------------------------------------
       */
      return {
        questionId: question.id,
        answerId: null,
        confidence: 1,
        method: "manual",
        status: "unanswered",
      };
    }
  );
}