import { NextResponse } from "next/server";

import { gemini } from "@/lib/ai/client";
import { extractAnswers } from "@/lib/ai/answer-extractor";

const MAX_FILES = 20;

const MAX_FILE_SIZE = 20 * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);

const PDF_TYPE = "application/pdf";

/**
 * Upload one answer-sheet file to Gemini.
 */
async function uploadToGemini(file: File) {
  const bytes = await file.arrayBuffer();

  const blob = new Blob([bytes], {
    type: file.type,
  });

  const uploaded = await gemini.files.upload({
    file: blob,

    config: {
      mimeType: file.type,
      displayName: file.name,
    },
  });

  if (!uploaded.name || !uploaded.uri) {
    throw new Error(
      `Gemini failed to upload "${file.name}".`
    );
  }

  return uploaded;
}

/**
 * Wait until Gemini has finished processing
 * the uploaded document.
 */
async function waitForFileReady(
  fileName: string,
  timeoutMs = 60_000
) {
  const startTime = Date.now();

  while (
    Date.now() - startTime <
    timeoutMs
  ) {
    const file = await gemini.files.get({
      name: fileName,
    });

    const state = String(
      file.state ?? ""
    );

    if (state === "ACTIVE") {
      return file;
    }

    if (state === "FAILED") {
      const errorMessage =
        file.error?.message ||
        `Gemini failed while processing ${fileName}.`;

      throw new Error(errorMessage);
    }

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 750);
    });
  }

  throw new Error(
    `Timed out while waiting for Gemini to process ${fileName}.`
  );
}

/**
 * Validate answer-sheet files.
 */
function validateFiles(files: File[]) {
  if (files.length === 0) {
    throw new Error(
      "Student answer sheet is required."
    );
  }

  if (files.length > MAX_FILES) {
    throw new Error(
      `A maximum of ${MAX_FILES} files is allowed.`
    );
  }

  const hasPdf = files.some(
    (file) => file.type === PDF_TYPE
  );

  const hasImage = files.some((file) =>
    ALLOWED_IMAGE_TYPES.has(file.type)
  );

  /**
   * Like the question-paper route:
   *
   * Either:
   * - one PDF
   *
   * OR:
   * - multiple images
   */
  if (hasPdf && hasImage) {
    throw new Error(
      "Upload either one PDF or multiple images, not both."
    );
  }

  if (hasPdf && files.length !== 1) {
    throw new Error(
      "Only one answer-sheet PDF can be uploaded."
    );
  }

  for (const file of files) {
    if (file.size === 0) {
      throw new Error(
        `"${file.name}" is empty.`
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new Error(
        `"${file.name}" exceeds the 20 MB per-file limit.`
      );
    }

    const validType =
      file.type === PDF_TYPE ||
      ALLOWED_IMAGE_TYPES.has(file.type);

    if (!validType) {
      throw new Error(
        `"${file.name}" is not a supported file type.`
      );
    }
  }
}

export async function POST(
  request: Request
) {
  const uploadedFiles: Array<{
    name: string;
    uri: string;
    mimeType: string;
  }> = [];

  try {
    /**
     * Read multipart/form-data.
     */
    const formData =
      await request.formData();

    /**
     * The frontend should send the answer
     * sheet under "answerSheet".
     */
    const answerSheetFiles =
      formData
        .getAll("answerSheet")
        .filter(
          (value): value is File =>
            value instanceof File
        );

    /**
     * Validate incoming files.
     */
    validateFiles(answerSheetFiles);

    /**
     * Upload all answer-sheet pages/files
     * to Gemini.
     */
    for (const file of answerSheetFiles) {
      const uploaded =
        await uploadToGemini(file);

      uploadedFiles.push({
        name: uploaded.name!,
        uri: uploaded.uri!,
        mimeType:
          uploaded.mimeType ||
          file.type,
      });
    }

    /**
     * Wait for Gemini to finish processing
     * each uploaded document.
     */
    for (const file of uploadedFiles) {
      await waitForFileReady(
        file.name
      );
    }

    /**
     * Extract handwritten answers.
     */
    const extractionResult =
      await extractAnswers(
        uploadedFiles.map(
          (file) => ({
            uri: file.uri,
            mimeType: file.mimeType,
          })
        )
      );

    const answers =
      extractionResult.answers;

    if (answers.length === 0) {
      throw new Error(
        "No handwritten answers were detected in the answer sheet."
      );
    }

    /**
     * Return extracted answers.
     */
    return NextResponse.json({
      success: true,

      answers,

      metadata: {
        sourceFileCount:
          answerSheetFiles.length,

        sourceType:
          answerSheetFiles.length === 1 &&
          answerSheetFiles[0].type ===
            PDF_TYPE
            ? "pdf"
            : "images",

        answerCount:
          answers.length,
      },
    });
  } catch (error) {
    console.error(
      "Answer extraction error:",
      error
    );

    const message =
      error instanceof Error
        ? error.message
        : "Answer extraction failed.";

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      {
        status: 500,
      }
    );
  } finally {
    /**
     * Gemini Files are temporary for this
     * processing workflow.
     *
     * Delete them after extraction.
     */
    await Promise.allSettled(
      uploadedFiles.map(
        (file) =>
          gemini.files.delete({
            name: file.name,
          })
      )
    );
  }
}