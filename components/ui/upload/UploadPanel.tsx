"use client";

import { useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { AnswerSheetViewer } from "./AnswerSheetViewer";

type UploadedFile = {
  file: File;
  id: string;
  previewUrl?: string;
};

type Question = {
  id: string;
  number: string;
  text: string;
  page: number;
  order: number;
  marks?: number;
  confidence: number;
};

type StudentAnswer = {
  id: string;
  detectedLabel: string | null;
  text: string;
  regions: Array<{
    page: number;
    bbox: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
  }>;
  confidence: number;
};

type AnswerMapping = {
  questionId: string;
  answerId: string | null;
  confidence: number;
  method:
    | "exact"
    | "normalized"
    | "fuzzy"
    | "semantic"
    | "manual";
  status:
    | "answered"
    | "unanswered"
    | "ambiguous";
};

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

type EvaluationMetadata = {
  questionCount: number;
  answeredCount: number;
  unansweredCount: number;
  correctCount: number;
  partialCount: number;
  incorrectCount: number;
  totalMarks: number;
  obtainedMarks: number;
  percentage: number;
};

type TeacherFeedback = {
  summary: string;
  strengths: string[];
  areasToImprove: string[];
  recommendation: string;
};

type ProcessingState =
  | "idle"
  | "processing"
  | "completed"
  | "error";

export function UploadPanel() {
  const [questionPaperFiles, setQuestionPaperFiles] =
    useState<UploadedFile[]>([]);

  const [answerSheetFiles, setAnswerSheetFiles] =
    useState<UploadedFile[]>([]);

  const [mobileReviewTab, setMobileReviewTab] =
    useState<"questions" | "answers">("questions");

  const [processingState, setProcessingState] =
    useState<ProcessingState>("idle");

  const [processingMessage, setProcessingMessage] =
    useState("");

  const [errorMessage, setErrorMessage] =
    useState("");

  const [questions, setQuestions] =
    useState<Question[]>([]);

  const [answers, setAnswers] =
    useState<StudentAnswer[]>([]);

  const [mappings, setMappings] =
    useState<AnswerMapping[]>([]);

  const [evaluations, setEvaluations] =
    useState<Evaluation[]>([]);

  const [mappingMetadata, setMappingMetadata] =
    useState<{
      questionCount: number;
      answerCount: number;
      answeredCount: number;
      unansweredCount: number;
      ambiguousCount: number;
    } | null>(null);

  const [evaluationMetadata, setEvaluationMetadata] =
    useState<EvaluationMetadata | null>(null);

  const [teacherFeedback, setTeacherFeedback] =
    useState<TeacherFeedback | null>(null);

  const [teacherFeedbackModel, setTeacherFeedbackModel] =
    useState<string | null>(null);

  const [selectedQuestionId, setSelectedQuestionId] =
    useState<string | null>(null);

  const selectedQuestion = questions.find(
    (question) =>
      question.id === selectedQuestionId
  );

  const selectedMapping = selectedQuestion
    ? mappings.find(
        (mapping) =>
          mapping.questionId ===
          selectedQuestion.id
      )
    : null;

  const selectedAnswer =
    selectedMapping?.answerId
      ? answers.find(
          (answer) =>
            answer.id ===
            selectedMapping.answerId
        ) ?? null
      : null;

  const selectedEvaluation =
    selectedQuestion
      ? evaluations.find(
          (evaluation) =>
            evaluation.questionId ===
            selectedQuestion.id
        ) ?? null
      : null;

  const createUploadedFile = (
    file: File
  ): UploadedFile => {
    return {
      file,
      id: `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`,
      previewUrl: file.type.startsWith("image/")
        ? URL.createObjectURL(file)
        : undefined,
    };
  };

  const addQuestionPaperFiles = (
    fileList: FileList | null
  ) => {
    if (!fileList) return;

    const incoming = Array.from(fileList);

    setQuestionPaperFiles((current) => [
      ...current,
      ...incoming.map(createUploadedFile),
    ]);

    setErrorMessage("");
  };

  const addAnswerSheetFiles = (
    fileList: FileList | null
  ) => {
    if (!fileList) return;

    const incoming = Array.from(fileList);

    setAnswerSheetFiles((current) => [
      ...current,
      ...incoming.map(createUploadedFile),
    ]);

    setErrorMessage("");
  };

  const removeQuestionPaperFile = (
    id: string
  ) => {
    setQuestionPaperFiles((current) =>
      current.filter(
        (item) => item.id !== id
      )
    );
  };

  const removeAnswerSheetFile = (
    id: string
  ) => {
    setAnswerSheetFiles((current) =>
      current.filter(
        (item) => item.id !== id
      )
    );
  };

  const canAnalyze = useMemo(() => {
    return (
      questionPaperFiles.length > 0 &&
      answerSheetFiles.length > 0 &&
      processingState !== "processing"
    );
  }, [
    questionPaperFiles.length,
    answerSheetFiles.length,
    processingState,
  ]);

  const handleAnalyze = async () => {
    if (
      questionPaperFiles.length === 0 ||
      answerSheetFiles.length === 0
    ) {
      setErrorMessage(
        "Please upload both the question paper and student answer sheet."
      );

      return;
    }

    try {
      setProcessingState("processing");

      setProcessingMessage(
        "Reading and extracting questions..."
      );

      setErrorMessage("");

      setQuestions([]);
      setAnswers([]);
      setMappings([]);
      setEvaluations([]);
      setMappingMetadata(null);
      setEvaluationMetadata(null);
      setTeacherFeedback(null);
      setTeacherFeedbackModel(null);
      setSelectedQuestionId(null);

      /*
       * -----------------------------------------------------
       * STEP 1: Question extraction
       * -----------------------------------------------------
       */

      const questionFormData = new FormData();

      questionPaperFiles.forEach((item) => {
        questionFormData.append(
          "questionPaper",
          item.file
        );
      });

      const questionResponse = await fetch(
        "/api/process/questions",
        {
          method: "POST",
          body: questionFormData,
        }
      );

      const questionResult =
        await questionResponse.json();

      if (
        !questionResponse.ok ||
        !questionResult.success
      ) {
        throw new Error(
          questionResult.error ||
            "Question extraction failed."
        );
      }

      const rawQuestions = Array.isArray(
        questionResult.questions
      )
        ? questionResult.questions
        : [];

      const extractedQuestions: Question[] =
        rawQuestions.map(
          (
            question: Partial<Question>,
            index: number
          ) => ({
            id:
              typeof question.id === "string" &&
              question.id.trim().length > 0
                ? question.id
                : `question-${index + 1}`,

            number:
              typeof question.number === "string"
                ? question.number
                : String(index + 1),

            text:
              typeof question.text === "string"
                ? question.text
                : "",

            page:
              typeof question.page === "number"
                ? question.page
                : 1,

            order:
              typeof question.order === "number"
                ? question.order
                : index,

            marks:
              typeof question.marks === "number"
                ? question.marks
                : undefined,

            confidence:
              typeof question.confidence === "number"
                ? question.confidence
                : 0,
          })
        );

      if (extractedQuestions.length === 0) {
        throw new Error(
          "No questions were extracted from the question paper."
        );
      }

      setQuestions(extractedQuestions);

      setSelectedQuestionId(
        extractedQuestions[0].id
      );

      console.log(
        "[Assessment] Questions extracted:",
        extractedQuestions
      );

      /*
       * -----------------------------------------------------
       * STEP 2: Student answer extraction
       * -----------------------------------------------------
       */

      setProcessingMessage(
        "Reading the student's handwritten answers..."
      );

      const answerFormData = new FormData();

      answerSheetFiles.forEach((item) => {
        answerFormData.append(
          "answerSheet",
          item.file
        );
      });

      const answerResponse = await fetch(
        "/api/process/answers",
        {
          method: "POST",
          body: answerFormData,
        }
      );

      const answerResult =
        await answerResponse.json();

      if (
        !answerResponse.ok ||
        !answerResult.success
      ) {
        throw new Error(
          answerResult.error ||
            "Answer extraction failed."
        );
      }

      const extractedAnswers =
        answerResult.answers as StudentAnswer[];

      if (extractedAnswers.length === 0) {
        throw new Error(
          "No handwritten answers were detected in the answer sheet."
        );
      }

      setAnswers(extractedAnswers);

      console.log(
        "[Assessment] Answers extracted:",
        extractedAnswers
      );

      /*
       * -----------------------------------------------------
       * STEP 3: Answer mapping
       * -----------------------------------------------------
       */

      setProcessingMessage(
        "Matching student answers to questions..."
      );

      const mappingResponse = await fetch(
        "/api/process/mapping",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            questions: extractedQuestions,
            answers: extractedAnswers,
          }),
        }
      );

      const mappingResult =
        await mappingResponse.json();

      if (
        !mappingResponse.ok ||
        !mappingResult.success
      ) {
        throw new Error(
          mappingResult.error ||
            "Answer mapping failed."
        );
      }

      const extractedMappings =
        mappingResult.mappings as AnswerMapping[];

      setMappings(extractedMappings);

      setMappingMetadata(
        mappingResult.metadata
      );

      console.log(
        "[Assessment] Answer mapping complete:",
        mappingResult.metadata
      );

      console.log(
        "[Assessment] Mappings:",
        extractedMappings
      );

      /*
       * -----------------------------------------------------
       * STEP 4: AI evaluation / grading
       * -----------------------------------------------------
       */

      setProcessingMessage(
        "Evaluating student answers with AI..."
      );

      const evaluationResponse =
        await fetch(
          "/api/process/evaluation",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              questions: extractedQuestions,
              answers: extractedAnswers,
              mappings: extractedMappings,
            }),
          }
        );

      const evaluationResult =
        await evaluationResponse.json();

      if (
        !evaluationResponse.ok ||
        !evaluationResult.success
      ) {
        throw new Error(
          evaluationResult.error ||
            "AI evaluation failed."
        );
      }

      const extractedEvaluations =
        evaluationResult.evaluations as Evaluation[];

      setEvaluations(
        extractedEvaluations
      );

      setEvaluationMetadata(
        evaluationResult.metadata
      );

      console.log(
        "[Assessment] AI evaluation complete:",
        evaluationResult.metadata
      );

      console.log(
        "[Assessment] Evaluations:",
        extractedEvaluations
      );

      /*
       * -----------------------------------------------------
       * STEP 5: Teacher feedback
       *
       * This is intentionally non-blocking for grading:
       * if Gemini is unavailable here, the completed
       * evaluation should still remain visible.
       * -----------------------------------------------------
       */

      setProcessingMessage(
        "Generating teacher feedback..."
      );

      try {
        const feedbackResponse = await fetch(
          "/api/process/feedback",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              evaluations: extractedEvaluations,
            }),
          }
        );

        const feedbackResult =
          await feedbackResponse.json();

        if (
          !feedbackResponse.ok ||
          !feedbackResult.success
        ) {
          console.warn(
            "[Assessment] Teacher feedback unavailable:",
            feedbackResult.error
          );
        } else if (
          feedbackResult.feedback
        ) {
          setTeacherFeedback(
            feedbackResult.feedback as TeacherFeedback
          );

          setTeacherFeedbackModel(
            typeof feedbackResult.model ===
              "string"
              ? feedbackResult.model
              : null
          );

          console.log(
            "[Assessment] Teacher feedback generated."
          );
        }
      } catch (feedbackError) {
        /*
         * Teacher feedback is an enhancement over
         * the core grading pipeline. Do not turn a
         * successful assessment into a failed one
         * because this optional request failed.
         */
        console.warn(
          "[Assessment] Teacher feedback request failed:",
          feedbackError
        );
      }

      /*
       * -----------------------------------------------------
       * Assessment complete
       * -----------------------------------------------------
       */

      setProcessingMessage(
        "Assessment grading complete."
      );

      setProcessingState("completed");
    } catch (error) {
      console.error(
        "[Assessment] Processing failed:",
        error
      );

      const message =
        error instanceof Error
          ? error.message
          : "Assessment processing failed.";

      setErrorMessage(message);
      setProcessingMessage("");
      setProcessingState("error");
    }
  };

  const formatFileSize = (
    size: number
  ) => {
    if (size < 1024 * 1024) {
      return `${(
        size / 1024
      ).toFixed(1)} KB`;
    }

    return `${(
      size /
      1024 /
      1024
    ).toFixed(2)} MB`;
  };

  const getFileIcon = (
    file: File
  ) => {
    if (
      file.type ===
      "application/pdf"
    ) {
      return (
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border bg-white">
          <svg
            width="25"
            height="25"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6" />
            <path d="M8 13h2" />
            <path d="M8 17h8" />
          </svg>
        </div>
      );
    }

    return (
      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-white">
        <svg
          width="25"
          height="25"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
        >
          <rect
            x="3"
            y="3"
            width="18"
            height="18"
            rx="2"
          />
          <circle
            cx="8.5"
            cy="8.5"
            r="1.5"
          />
          <path d="m21 15-5-5L5 21" />
        </svg>
      </div>
    );
  };

  const FileCard = ({
    item,
    onRemove,
  }: {
    item: UploadedFile;
    onRemove: () => void;
  }) => {
    return (
      <div className="rounded-xl border bg-white p-3">
        <div className="flex items-center gap-3">
          {item.previewUrl ? (
            <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl border bg-white">
              <img
                src={item.previewUrl}
                alt={item.file.name}
                className="h-full w-full object-cover"
              />
            </div>
          ) : (
            getFileIcon(item.file)
          )}

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              {item.file.name}
            </p>

            <p className="mt-0.5 text-xs text-muted-foreground">
              {formatFileSize(
                item.file.size
              )}
            </p>
          </div>

          <button
            type="button"
            onClick={onRemove}
            disabled={
              processingState ===
              "processing"
            }
            className="shrink-0 rounded-md px-2 py-1 text-sm text-red-600 transition hover:bg-red-50 disabled:opacity-40"
          >
            Remove
          </button>
        </div>
      </div>
    );
  };

  const UploadIcon = ({
    answer,
  }: {
    answer?: boolean;
  }) => {
    return (
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-muted/40">
        {answer ? (
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
          >
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z" />
          </svg>
        ) : (
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6" />
            <path d="M8 13h8" />
            <path d="M8 17h5" />
          </svg>
        )}
      </div>
    );
  };

  const getEvaluationStyle = (
    status:
      | Evaluation["status"]
      | undefined
  ) => {
    switch (status) {
      case "correct":
        return "bg-green-50 text-green-700 border-green-200";

      case "partial":
        return "bg-yellow-50 text-yellow-700 border-yellow-200";

      case "incorrect":
        return "bg-red-50 text-red-700 border-red-200";

      case "unanswered":
        return "bg-gray-50 text-gray-600 border-gray-200";

      default:
        return "bg-muted/20 text-muted-foreground";
    }
  };

  return (
    <div className="w-full space-y-8">

        {/* =====================================================
          Upload section
          ===================================================== */}

      <div className="grid gap-7 md:grid-cols-2">

        {/* QUESTION PAPER */}

        <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
          <div className="p-6">
            <div className="mb-5 flex items-start gap-4">
              <UploadIcon />

              <div>
                <h2 className="text-lg font-semibold">
                  Question paper
                </h2>

                <p className="mt-1 text-sm text-muted-foreground">
                  The printed assessment
                </p>
              </div>
            </div>

            <label
              htmlFor="question-paper-upload"
             className="block cursor-pointer rounded-xl border border-dashed bg-muted/20 p-5 transition hover:bg-muted/40"
            >
              <div className="flex flex-col items-center justify-center text-center">
                <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full border bg-white">
                  <svg
                    width="19"
                    height="19"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                  >
                    <path d="M12 16V4" />
                    <path d="m7 9 5-5 5 5" />
                    <path d="M5 20h14" />
                  </svg>
                </div>

                <p className="text-sm font-medium">
                  Upload question paper
                </p>

                <p className="mt-1 text-xs text-muted-foreground">
                  PDF, PNG, JPG or WebP
                </p>
              </div>

              <input
                id="question-paper-upload"
                type="file"
                accept=".pdf,image/png,image/jpeg,image/webp"
                multiple
                className="hidden"
                onChange={(event) => {
                  addQuestionPaperFiles(
                    event.target.files
                  );

                  event.currentTarget.value =
                    "";
                }}
              />
            </label>

            {questionPaperFiles.length >
              0 && (
              <div className="mt-4 space-y-2">
                {questionPaperFiles.map(
                  (item) => (
                    <FileCard
                      key={item.id}
                      item={item}
                      onRemove={() =>
                        removeQuestionPaperFile(
                          item.id
                        )
                      }
                    />
                  )
                )}
              </div>
            )}

            <div className="mt-5 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {questionPaperFiles.length}{" "}
                {questionPaperFiles.length ===
                1
                  ? "document"
                  : "documents"}
              </span>

              <span className="font-medium">
                {questionPaperFiles.length >
                0
                  ? "Ready"
                  : "Waiting for upload"}
              </span>
            </div>

            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full transition-all ${
                  questionPaperFiles.length >
                  0
                    ? "w-full bg-black"
                    : "w-0"
                }`}
              />
            </div>
          </div>
        </div>

        {/* STUDENT ANSWER SHEET */}

        <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
          <div className="p-6">
            <div className="mb-5 flex items-start gap-4">
              <UploadIcon answer />

              <div>
                <h2 className="text-lg font-semibold">
                  Student answer sheet
                </h2>

                <p className="mt-1 text-sm text-muted-foreground">
                  The handwritten responses
                </p>
              </div>
            </div>

            <label
              htmlFor="answer-sheet-upload"
              className="block cursor-pointer rounded-xl border border-dashed bg-muted/20 p-5 transition hover:bg-muted/40"
            >
              <div className="flex flex-col items-center justify-center text-center">
                <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full border bg-white">
                  <svg
                    width="19"
                    height="19"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                  >
                    <path d="M12 16V4" />
                    <path d="m7 9 5-5 5 5" />
                    <path d="M5 20h14" />
                  </svg>
                </div>

                <p className="text-sm font-medium">
                  Upload answer sheet
                </p>

                <p className="mt-1 text-xs text-muted-foreground">
                  PDF, PNG, JPG or WebP
                </p>
              </div>

              <input
                id="answer-sheet-upload"
                type="file"
                accept=".pdf,image/png,image/jpeg,image/webp"
                multiple
                className="hidden"
                onChange={(event) => {
                  addAnswerSheetFiles(
                    event.target.files
                  );

                  event.currentTarget.value =
                    "";
                }}
              />
            </label>

            {answerSheetFiles.length >
              0 && (
              <div className="mt-4 space-y-2">
                {answerSheetFiles.map(
                  (item) => (
                    <FileCard
                      key={item.id}
                      item={item}
                      onRemove={() =>
                        removeAnswerSheetFile(
                          item.id
                        )
                      }
                    />
                  )
                )}
              </div>
            )}

            <div className="mt-5 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {answerSheetFiles.length}{" "}
                {answerSheetFiles.length ===
                1
                  ? "document"
                  : "documents"}
              </span>

              <span className="font-medium">
                {answerSheetFiles.length >
                0
                  ? "Ready"
                  : "Waiting for upload"}
              </span>
            </div>

            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full transition-all ${
                  answerSheetFiles.length >
                  0
                    ? "w-full bg-black"
                    : "w-0"
                }`}
              />
            </div>
          </div>
        </div>
      </div>

      {/* =====================================================
          Analyze button
          ===================================================== */}

      <div className="flex justify-center">
        <button
          type="button"
          onClick={handleAnalyze}
          disabled={!canAnalyze}
          className="group flex items-center gap-3 rounded-xl bg-black px-8 py-3.5 text-sm font-medium text-white shadow-sm transition hover:bg-black/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {processingState ===
          "processing"
            ? "Processing..."
            : "Start Mapping"}

          {processingState !==
            "processing" && (
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              className="transition-transform group-hover:translate-x-1"
            >
              <path d="M5 12h14" />
              <path d="m13 6 6 6-6 6" />
            </svg>
          )}
        </button>
      </div>

      {/* =====================================================
          Processing status
          ===================================================== */}

            {processingState === "processing" && (
        <div className="flex min-h-[480px] w-full items-center justify-center rounded-2xl border border-black/10 bg-white shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
          <div className="flex flex-col items-center text-center">

            <div className="relative mb-7 flex size-24 items-center justify-center">
              <div className="absolute inset-2 rounded-[28px] bg-[#fff1eb]" />

              <div className="relative flex size-16 rotate-45 items-center justify-center rounded-[20px] bg-[#ef6a3a] shadow-sm">
                <div className="-rotate-45">
                  <Sparkles className="size-7 text-white" />
                </div>
              </div>

              <span className="absolute left-1 top-2 size-2.5 rounded-full bg-[#ef6a3a]" />

              <span className="absolute bottom-2 right-1 size-2 rounded-full bg-[#f3b9a5]" />
            </div>

            <h2 className="text-xl font-semibold tracking-tight">
              Extracting...
            </h2>

            <p className="mt-2 text-sm text-muted-foreground">
              This may take a while
            </p>

            <div className="mt-7 h-1.5 w-52 overflow-hidden rounded-full bg-muted">
              <div className="h-full w-2/3 animate-pulse rounded-full bg-[#ef6a3a]" />
            </div>

            <p className="mt-4 max-w-md text-xs leading-5 text-muted-foreground">
              {processingMessage ||
                "AI is processing the assessment documents."}
            </p>
          </div>
        </div>
      )}

      {/* =====================================================
          Extracted questions preview
          ===================================================== */}

      {questions.length > 0 && (
        <section className="overflow-hidden rounded-3xl border border-black/10 bg-white shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
          <div className="border-b border-black/10 px-6 py-6">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-orange-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-orange-600">
                    AI extraction
                  </span>

                  <span className="text-xs text-muted-foreground">
                    {questions.length} questions
                  </span>
                </div>

                <h2 className="mt-3 text-xl font-semibold tracking-tight">
                  Extracted questions
                </h2>

                <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">
                  Questions identified from the printed assessment. Select a
                  question to inspect its answer mapping.
                </p>
              </div>

              <div className="rounded-xl border bg-[#fafafa] px-3 py-2 text-xs font-medium text-muted-foreground">
                Click a question to inspect
              </div>
            </div>
          </div>

          <div>
            {[...questions]
              .sort(
                (a, b) =>
                  a.order - b.order
              )
              .map((question) => (
                <div
                  key={question.id}
                  onClick={() =>
                    setSelectedQuestionId(
                      question.id
                    )
                  }
                  className={`group cursor-pointer border-b border-black/5 px-6 py-5 transition last:border-b-0 ${
                    selectedQuestionId ===
                    question.id
                      ? "bg-orange-50/50"
                      : "hover:bg-[#fafafa]"
                  }`}
                >
                  <div className="flex gap-4">
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-semibold transition ${
                        selectedQuestionId ===
                        question.id
                          ? "bg-black text-white"
                          : "bg-black/5 text-foreground group-hover:bg-black/10"
                      }`}
                    >
                      {question.number}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
                        <p className="text-[15px] leading-7">
                          {question.text}
                        </p>

                        {question.marks !==
                          undefined && (
                          <span className="shrink-0 rounded-full border bg-white px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                            {question.marks}{" "}
                            {question.marks === 1
                              ? "mark"
                              : "marks"}
                          </span>
                        )}
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className="rounded-md border bg-[#fafafa] px-2.5 py-1 text-xs text-muted-foreground">
                          Page {question.page}
                        </span>

                        <span className="rounded-md border bg-[#fafafa] px-2.5 py-1 text-xs text-muted-foreground">
                          Confidence{" "}
                          {Math.round(
                            question.confidence *
                              100
                          )}
                          %
                        </span>

                        <span className="rounded-md border bg-[#fafafa] px-2.5 py-1 text-xs text-muted-foreground">
                          Order {question.order}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </section>
      )}

      {/* =====================================================
          Question mapping + Answer Sheet Viewer
          ===================================================== */}

      {questions.length > 0 && (
        <section className="space-y-5">
          {/* Section header */}

          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-orange-500" />

                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Assessment review
                </p>
              </div>

              <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                Question mapping
              </h2>

              <p className="mt-1 text-sm text-muted-foreground">
                Select a question to inspect the student's detected answer
                and its exact location on the answer sheet.
              </p>
            </div>

            <div className="w-fit rounded-full border bg-white px-3 py-1.5 text-xs font-medium text-muted-foreground">
              {questions.length} questions
            </div>
          </div>

          {/* Mobile review tabs */}

<div className="flex rounded-xl border bg-[#fafafa] p-1 lg:hidden">
  <button
    type="button"
    onClick={() => setMobileReviewTab("questions")}
    className={`flex-1 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
      mobileReviewTab === "questions"
        ? "bg-white text-black shadow-sm"
        : "text-muted-foreground"
    }`}
  >
    Questions
  </button>

  <button
    type="button"
    onClick={() => setMobileReviewTab("answers")}
    className={`flex-1 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
      mobileReviewTab === "answers"
        ? "bg-white text-black shadow-sm"
        : "text-muted-foreground"
    }`}
  >
    Answer Sheet
  </button>
</div>

{/* Main review workspace */}

<div className="grid overflow-hidden rounded-3xl border border-black/10 bg-white lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            {/* Question mapping */}

            <div
  className={`min-w-0 border-b border-black/10 lg:border-b-0 lg:border-r ${
    mobileReviewTab === "questions"
      ? "block"
      : "hidden lg:block"
  }`}
>
              <div className="border-b border-black/10 bg-[#fafafa] px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      Questions
                    </p>

                    <p className="mt-1 text-xs text-muted-foreground">
                      Click to inspect
                    </p>
                  </div>

                  <div className="rounded-lg border bg-white px-2.5 py-1 text-xs font-medium">
                    {mappings.length} mapped
                  </div>
                </div>
              </div>

              <div className="max-h-[680px] overflow-y-auto">
                {[...questions]
                  .sort(
                    (a, b) =>
                      a.order - b.order
                  )
                  .map((question) => {
                    const mapping =
                      mappings.find(
                        (item) =>
                          item.questionId ===
                          question.id
                      );

                    const answer =
                      mapping?.answerId
                        ? answers.find(
                            (item) =>
                              item.id ===
                              mapping.answerId
                          )
                        : null;

                    const evaluation =
                      evaluations.find(
                        (item) =>
                          item.questionId ===
                          question.id
                      );

                    const isSelected =
                      selectedQuestionId ===
                      question.id;

                    return (
                      <button
                        key={question.id}
                        type="button"
                        onClick={() =>
                          setSelectedQuestionId(
                            question.id
                          )
                        }
                        className={`group w-full border-b border-black/5 px-5 py-5 text-left transition last:border-b-0 ${
                          isSelected
                            ? "bg-orange-50/60"
                            : "hover:bg-[#fafafa]"
                        }`}
                      >
                        <div className="flex gap-3.5">
                          {/* Question number */}

                          <div
                            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-semibold transition ${
                              isSelected
                                ? "bg-black text-white shadow-sm"
                                : "bg-black/5 text-foreground group-hover:bg-black/10"
                            }`}
                          >
                            {question.number}
                          </div>

                          {/* Question information */}

                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-3">
                              <p className="text-sm font-medium leading-6">
                                {question.text}
                              </p>

                              {evaluation && (
                                <span
                                  className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-semibold ${getEvaluationStyle(
                                    evaluation.status
                                  )}`}
                                >
                                  {evaluation.status}
                                </span>
                              )}
                            </div>

                            <div className="mt-3 flex flex-wrap gap-1.5">
                              <span
                                className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                                  mapping?.status ===
                                  "answered"
                                    ? "border-green-200 bg-green-50 text-green-700"
                                    : mapping?.status ===
                                      "ambiguous"
                                    ? "border-yellow-200 bg-yellow-50 text-yellow-700"
                                    : "border-red-200 bg-red-50 text-red-700"
                                }`}
                              >
                                {mapping?.status ??
                                  "unmapped"}
                              </span>

                              <span className="rounded-full border bg-white px-2.5 py-1 text-[11px] text-muted-foreground">
                                {mapping?.method ??
                                  "manual"}
                              </span>

                              <span className="rounded-full border bg-white px-2.5 py-1 text-[11px] text-muted-foreground">
                                {mapping
                                  ? Math.round(
                                      mapping.confidence *
                                        100
                                    )
                                  : 0}
                                % match
                              </span>
                            </div>

                            <div className="mt-2 flex items-center justify-between gap-3">
                              <p className="truncate text-xs text-muted-foreground">
                                {answer
                                  ? answer.detectedLabel ??
                                    "Answer detected"
                                  : "No matching answer"}
                              </p>

                              {question.marks !==
                                undefined && (
                                <span className="shrink-0 text-xs font-medium text-muted-foreground">
                                  {question.marks}{" "}
                                  {question.marks === 1
                                    ? "mark"
                                    : "marks"}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
              </div>
            </div>

            {/* Answer sheet */}

            <div
  className={`min-w-0 bg-[#fafafa] ${
    mobileReviewTab === "answers"
      ? "block"
      : "hidden lg:block"
  }`}
>
              <div className="border-b border-black/10 bg-white px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      Student answer sheet
                    </p>

                    <p className="mt-1 text-xs text-muted-foreground">
                      Highlighted region shows the detected response
                    </p>
                  </div>

                  {selectedQuestionId && (
                    <span className="rounded-lg border bg-[#fafafa] px-2.5 py-1 text-xs font-medium">
                      Q
                      {
                        questions.find(
                          (question) =>
                            question.id ===
                            selectedQuestionId
                        )?.number
                      }
                    </span>
                  )}
                </div>
              </div>

              <div className="p-4 sm:p-5">
                <AnswerSheetViewer
                  file={
                    answerSheetFiles[0]?.file ??
                    null
                  }
                  answer={selectedAnswer}
                  initialPage={
                    selectedAnswer?.regions[0]
                      ?.page ?? 1
                  }
                />
              </div>
            </div>
          </div>

          {/* Mapping summary */}

          {mappingMetadata && (
            <div className="rounded-2xl border border-black/10 bg-white p-5 shadow-[0_6px_24px_rgba(0,0,0,0.035)]">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Mapping summary
                  </p>

                  <p className="mt-1 text-sm text-muted-foreground">
                    Coverage across extracted questions.
                  </p>
                </div>

                <span className="rounded-full border bg-[#fafafa] px-3 py-1.5 text-xs font-medium text-green-600">
                  Mapping complete
                </span>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border bg-[#fafafa] p-4">
                  <p className="text-xs text-muted-foreground">
                    Answered
                  </p>

                  <p className="mt-2 text-2xl font-semibold">
                    {mappingMetadata.answeredCount}
                  </p>
                </div>

                <div className="rounded-xl border bg-[#fafafa] p-4">
                  <p className="text-xs text-muted-foreground">
                    Unanswered
                  </p>

                  <p className="mt-2 text-2xl font-semibold">
                    {mappingMetadata.unansweredCount}
                  </p>
                </div>

                <div className="rounded-xl border bg-[#fafafa] p-4">
                  <p className="text-xs text-muted-foreground">
                    Ambiguous
                  </p>

                  <p className="mt-2 text-2xl font-semibold">
                    {mappingMetadata.ambiguousCount}
                  </p>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

            {/* =====================================================
          AI Evaluation Summary
          ===================================================== */}

      {evaluationMetadata && (
        <section className="overflow-hidden rounded-3xl border border-black/10 bg-white shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
          {/* Header */}

          <div className="border-b border-black/10 px-6 py-6">
            <div className="flex flex-col justify-between gap-5 md:flex-row md:items-center">
              <div>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-green-500" />

                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    AI evaluation
                  </p>

                  <span className="rounded-full border bg-green-50 px-2.5 py-1 text-[10px] font-semibold text-green-700">
                    Complete
                  </span>
                </div>

                <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                  Grading results
                </h2>

                <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                  AI evaluated the student's answers against the extracted
                  questions.
                </p>
              </div>

              {/* Main score */}

              <div className="flex items-center gap-5 rounded-2xl border bg-[#fafafa] px-5 py-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Overall score
                  </p>

                  <p className="mt-1 text-3xl font-bold tracking-tight">
                    {evaluationMetadata.percentage}%
                  </p>
                </div>

                <div className="h-10 w-px bg-black/10" />

                <div>
                  <p className="text-xs text-muted-foreground">
                    Marks
                  </p>

                  <p className="mt-1 text-lg font-semibold">
                    {evaluationMetadata.obtainedMarks}
                    <span className="text-sm font-medium text-muted-foreground">
                      {" "}
                      / {evaluationMetadata.totalMarks}
                    </span>
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Score distribution */}

          <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
            {/* Correct */}

            <div className="rounded-2xl border border-green-200 bg-green-50/50 p-5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wide text-green-700">
                  Correct
                </p>

                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-green-100 text-sm font-semibold text-green-700">
                  âœ“
                </span>
              </div>

              <p className="mt-3 text-3xl font-semibold tracking-tight text-green-700">
                {evaluationMetadata.correctCount}
              </p>

              <p className="mt-1 text-xs text-muted-foreground">
                Fully correct answers
              </p>
            </div>

            {/* Partial */}

            <div className="rounded-2xl border border-yellow-200 bg-yellow-50/50 p-5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wide text-yellow-700">
                  Partial
                </p>

                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-yellow-100 text-sm font-semibold text-yellow-700">
                  â—
                </span>
              </div>

              <p className="mt-3 text-3xl font-semibold tracking-tight text-yellow-700">
                {evaluationMetadata.partialCount}
              </p>

              <p className="mt-1 text-xs text-muted-foreground">
                Partially correct answers
              </p>
            </div>

            {/* Incorrect */}

            <div className="rounded-2xl border border-red-200 bg-red-50/50 p-5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wide text-red-700">
                  Incorrect
                </p>

                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-red-100 text-sm font-semibold text-red-700">
                  Ã—
                </span>
              </div>

              <p className="mt-3 text-3xl font-semibold tracking-tight text-red-700">
                {evaluationMetadata.incorrectCount}
              </p>

              <p className="mt-1 text-xs text-muted-foreground">
                Incorrect answers
              </p>
            </div>

            {/* Unanswered */}

            <div className="rounded-2xl border border-black/10 bg-[#fafafa] p-5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Unanswered
                </p>

                <span className="flex h-7 w-7 items-center justify-center rounded-full border bg-white text-xs font-semibold text-muted-foreground">
                  â€”
                </span>
              </div>

              <p className="mt-3 text-3xl font-semibold tracking-tight">
                {evaluationMetadata.unansweredCount}
              </p>

              <p className="mt-1 text-xs text-muted-foreground">
                Questions left unanswered
              </p>
            </div>
          </div>

          {/* Score progress */}

          <div className="px-5 pb-6">
            <div className="rounded-2xl border bg-[#fafafa] p-4">
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="font-medium">
                  Overall performance
                </span>

                <span className="text-muted-foreground">
                  {evaluationMetadata.obtainedMarks} /{" "}
                  {evaluationMetadata.totalMarks} marks
                </span>
              </div>

              <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/5">
                <div
                  className="h-full rounded-full bg-black transition-all"
                  style={{
                    width: `${Math.min(
                      Math.max(
                        evaluationMetadata.percentage,
                        0
                      ),
                      100
                    )}%`,
                  }}
                />
              </div>
            </div>
          </div>
        </section>
      )}

            {/* =====================================================
          Teacher feedback
          ===================================================== */}

      {teacherFeedback && (
        <section className="overflow-hidden rounded-3xl border border-black/10 bg-white shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
          {/* Header */}

          <div className="border-b border-black/10 px-6 py-6">
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
              <div>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-orange-500" />

                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Teacher feedback
                  </p>
                </div>

                <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                  Overall assessment
                </h2>

                <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">
                  AI-generated feedback based on the completed grading
                  results.
                </p>
              </div>

              {teacherFeedbackModel && (
                <div className="flex items-center gap-2 rounded-full border bg-[#fafafa] px-3 py-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-500" />

                  <span className="text-xs font-medium text-muted-foreground">
                    {teacherFeedbackModel}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Summary */}

          <div className="p-5 sm:p-6">
            <div className="rounded-2xl border bg-[#fafafa] p-5">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-black text-xs font-semibold text-white">
                  AI
                </span>

                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Summary
                </p>
              </div>

              <p className="mt-4 text-sm leading-7">
                {teacherFeedback.summary}
              </p>
            </div>

            {/* Strengths + Improvements */}

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {/* Strengths */}

              <div className="rounded-2xl border border-green-200 bg-green-50/40 p-5">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-green-100 text-sm font-semibold text-green-700">
                    âœ“
                  </span>

                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-green-700">
                    Strengths
                  </p>
                </div>

                <ul className="mt-4 space-y-3 text-sm leading-6">
                  {teacherFeedback.strengths.map(
                    (strength, index) => (
                      <li
                        key={`strength-${index}`}
                        className="flex gap-3"
                      >
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-green-600" />

                        <span>{strength}</span>
                      </li>
                    )
                  )}
                </ul>
              </div>

              {/* Areas to improve */}

              <div className="rounded-2xl border border-yellow-200 bg-yellow-50/40 p-5">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-yellow-100 text-sm font-semibold text-yellow-700">
                    !
                  </span>

                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-yellow-700">
                    Areas to improve
                  </p>
                </div>

                <ul className="mt-4 space-y-3 text-sm leading-6">
                  {teacherFeedback.areasToImprove.map(
                    (area, index) => (
                      <li
                        key={`improvement-${index}`}
                        className="flex gap-3"
                      >
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-yellow-600" />

                        <span>{area}</span>
                      </li>
                    )
                  )}
                </ul>
              </div>
            </div>

            {/* Recommendation */}

            <div className="mt-4 rounded-2xl border border-black/10 bg-white p-5">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg border bg-[#fafafa] text-xs font-semibold">
                  â†’
                </span>

                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Recommendation
                </p>
              </div>

              <p className="mt-4 text-sm leading-7">
                {teacherFeedback.recommendation}
              </p>
            </div>
          </div>
        </section>
      )}

            {/* =====================================================
          Evaluation details
          ===================================================== */}

      {evaluations.length > 0 && (
        <section className="overflow-hidden rounded-3xl border border-black/10 bg-white shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
          {/* Header */}

          <div className="border-b border-black/10 px-6 py-6">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-black" />

                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    AI grading details
                  </p>
                </div>

                <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                  Question-by-question evaluation
                </h2>

                <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">
                  Review the score, result, confidence, and AI feedback for
                  every evaluated question.
                </p>
              </div>

              <span className="w-fit rounded-full border bg-[#fafafa] px-3 py-1.5 text-xs font-medium text-muted-foreground">
                {evaluations.length} evaluated
              </span>
            </div>
          </div>

          {/* Evaluations */}

          <div className="divide-y divide-black/5">
            {[...questions]
              .sort(
                (a, b) =>
                  a.order - b.order
              )
              .map((question) => {
                const evaluation =
                  evaluations.find(
                    (item) =>
                      item.questionId ===
                      question.id
                  );

                if (!evaluation) {
                  return null;
                }

                const isSelected =
                  selectedQuestionId ===
                  question.id;

                return (
                  <button
                    key={question.id}
                    type="button"
                    onClick={() =>
                      setSelectedQuestionId(
                        question.id
                      )
                    }
                    className={`group w-full px-6 py-5 text-left transition ${
                      isSelected
                        ? "bg-orange-50/50"
                        : "hover:bg-[#fafafa]"
                    }`}
                  >
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                      {/* Question + feedback */}

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start gap-3">
                          <span
                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-semibold transition ${
                              isSelected
                                ? "bg-black text-white"
                                : "bg-black/5 text-foreground group-hover:bg-black/10"
                            }`}
                          >
                            {question.number}
                          </span>

                          <div className="min-w-0 flex-1">
                            <p className="font-medium leading-6">
                              {question.text}
                            </p>

                            <div className="mt-3 flex flex-wrap gap-2">
                              <span
                                className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getEvaluationStyle(
                                  evaluation.status
                                )}`}
                              >
                                {evaluation.status}
                              </span>

                              <span className="rounded-full border bg-[#fafafa] px-2.5 py-1 text-[11px] text-muted-foreground">
                                Confidence{" "}
                                {Math.round(
                                  evaluation.confidence *
                                    100
                                )}
                                %
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* AI feedback */}

                        <div className="ml-12 mt-4 rounded-xl border bg-[#fafafa] p-4">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                            AI feedback
                          </p>

                          <p className="mt-2 text-sm leading-6 text-muted-foreground">
                            {evaluation.feedback}
                          </p>
                        </div>
                      </div>

                      {/* Score */}

                      <div className="flex shrink-0 items-center gap-3 lg:ml-6 lg:flex-col lg:items-end">
                        <div className="rounded-2xl border bg-white px-5 py-3 text-center shadow-sm">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                            Score
                          </p>

                          <p className="mt-1 text-2xl font-semibold tracking-tight">
                            {evaluation.score}
                            <span className="text-sm font-medium text-muted-foreground">
                              {" "}
                              /{" "}
                              {evaluation.maxScore}
                            </span>
                          </p>
                        </div>

                        {question.marks !==
                          undefined && (
                          <p className="text-xs text-muted-foreground">
                            {question.marks}{" "}
                            {question.marks === 1
                              ? "mark"
                              : "marks"}{" "}
                            possible
                          </p>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
          </div>
        </section>
      )}

           {/* =====================================================
          Selected answer evaluation
          ===================================================== */}

      {selectedQuestion &&
        selectedEvaluation && (
          <section className="overflow-hidden rounded-3xl border border-black/10 bg-white shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
            {/* Header */}

            <div className="border-b border-black/10 px-6 py-6">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-orange-500" />

                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Selected evaluation
                    </p>
                  </div>

                  <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                    Question {selectedQuestion.number}
                  </h2>

                  <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">
                    Detailed grading information for the currently selected
                    question.
                  </p>
                </div>

                <div
                  className={`w-fit rounded-full border px-3 py-1.5 text-xs font-semibold ${getEvaluationStyle(
                    selectedEvaluation.status
                  )}`}
                >
                  {selectedEvaluation.status}
                </div>
              </div>
            </div>

            {/* Question */}

            <div className="p-5 sm:p-6">
              <div className="rounded-2xl border bg-[#fafafa] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Question
                </p>

                <p className="mt-3 text-sm leading-7">
                  {selectedQuestion.text}
                </p>
              </div>

              {/* Metrics */}

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                {/* Score */}

                <div className="rounded-2xl border bg-white p-5">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Score
                  </p>

                  <p className="mt-2 text-3xl font-semibold tracking-tight">
                    {selectedEvaluation.score}
                    <span className="text-base font-medium text-muted-foreground">
                      {" "}
                      /{" "}
                      {selectedEvaluation.maxScore}
                    </span>
                  </p>

                  <p className="mt-1 text-xs text-muted-foreground">
                    Marks awarded
                  </p>
                </div>

                {/* Evaluation confidence */}

                <div className="rounded-2xl border bg-white p-5">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Evaluation confidence
                  </p>

                  <p className="mt-2 text-3xl font-semibold tracking-tight">
                    {Math.round(
                      selectedEvaluation.confidence *
                        100
                    )}
                    %
                  </p>

                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-black/5">
                    <div
                      className="h-full rounded-full bg-black transition-all"
                      style={{
                        width: `${Math.min(
                          Math.max(
                            selectedEvaluation.confidence *
                              100,
                            0
                          ),
                          100
                        )}%`,
                      }}
                    />
                  </div>
                </div>

                {/* Mapping confidence */}

                <div className="rounded-2xl border bg-white p-5">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Mapping confidence
                  </p>

                  <p className="mt-2 text-3xl font-semibold tracking-tight">
                    {selectedMapping
                      ? Math.round(
                          selectedMapping.confidence *
                            100
                        )
                      : 0}
                    %
                  </p>

                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-black/5">
                    <div
                      className="h-full rounded-full bg-black transition-all"
                      style={{
                        width: `${
                          selectedMapping
                            ? Math.min(
                                Math.max(
                                  selectedMapping.confidence *
                                    100,
                                  0
                                ),
                                100
                              )
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* AI feedback */}

              <div className="mt-4 rounded-2xl border border-black/10 bg-[#fafafa] p-5">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-black text-[10px] font-semibold text-white">
                    AI
                  </span>

                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    AI feedback
                  </p>
                </div>

                <p className="mt-4 text-sm leading-7">
                  {selectedEvaluation.feedback}
                </p>
              </div>
            </div>
          </section>
        )}

      {/* =====================================================
          Mapping details
          ===================================================== */}

      {mappings.length > 0 && (
        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="mb-5">
            <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
              Mapping details
            </p>

            <h2 className="mt-1 text-xl font-semibold">
              All mappings
            </h2>
          </div>

          <div className="space-y-3">
            {mappings.map(
              (mapping) => {
                const question =
                  questions.find(
                    (item) =>
                      item.id ===
                      mapping.questionId
                  );

                const answer =
                  answers.find(
                    (item) =>
                      item.id ===
                      mapping.answerId
                  );

                const evaluation =
                  evaluations.find(
                    (item) =>
                      item.questionId ===
                      mapping.questionId
                  );

                return (
                  <button
                    key={mapping.questionId}
                    type="button"
                    onClick={() =>
                      setSelectedQuestionId(
                        mapping.questionId
                      )
                    }
                    className={`w-full rounded-xl border p-4 text-left transition ${
                      selectedQuestionId ===
                      mapping.questionId
                        ? "border-black bg-muted/10"
                        : "hover:bg-muted/10"
                    }`}
                  >
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                      <div className="min-w-0">
                        <div className="flex items-center gap-3">
                          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/50 text-xs font-semibold">
                            {question?.number ??
                              "?"}
                          </span>

                          <p className="font-medium">
                            {question?.text ??
                              "Unknown question"}
                          </p>
                        </div>

                        <p className="mt-2 text-sm text-muted-foreground">
                          {answer
                            ? answer.detectedLabel ||
                              "Answer detected"
                            : "No matching answer"}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span
                          className={`rounded-full border px-2.5 py-1 ${
                            mapping.status ===
                            "answered"
                              ? "bg-green-50 text-green-700"
                              : mapping.status ===
                                "ambiguous"
                              ? "bg-yellow-50 text-yellow-700"
                              : "bg-red-50 text-red-700"
                          }`}
                        >
                          {mapping.status}
                        </span>

                        <span className="rounded-full border bg-muted/20 px-2.5 py-1">
                          {mapping.method}
                        </span>

                        <span className="rounded-full border bg-muted/20 px-2.5 py-1">
                          {Math.round(
                            mapping.confidence *
                              100
                          )}
                          %
                        </span>

                        {evaluation && (
                          <span
                            className={`rounded-full border px-2.5 py-1 ${getEvaluationStyle(
                              evaluation.status
                            )}`}
                          >
                            {evaluation.score}/
                            {evaluation.maxScore}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              }
            )}
          </div>
        </div>
      )}

      {/* =====================================================
          Completion status
          ===================================================== */}

      {processingState ===
        "completed" && (
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-green-100 text-green-700">
              âœ“
            </div>

            <div>
              <p className="text-sm font-medium">
                Assessment grading complete.
              </p>

              <p className="mt-1 text-xs text-muted-foreground">
                Questions, handwritten answers,
                mappings, and AI evaluation have been
                processed successfully.
                {teacherFeedback
                  ? " Teacher feedback is also available below."
                  : ""}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
