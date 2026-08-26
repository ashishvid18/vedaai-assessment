import { NextResponse } from "next/server";

import {
  gemini,
  GEMINI_MODEL,
} from "@/lib/ai/client";

import { extractQuestions } from "@/lib/ai/question-extractor";

const MAX_FILES = 20;

const MAX_FILE_SIZE = 20 * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);

const PDF_TYPE = "application/pdf";

/**
 * ---------------------------------------------------------
 * Upload a file to Gemini
 * ---------------------------------------------------------
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
 * ---------------------------------------------------------
 * Wait until Gemini has finished processing a file
 * ---------------------------------------------------------
 */

async function waitForFileReady(
  fileName: string,
  timeoutMs = 60_000
) {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const file = await gemini.files.get({
      name: fileName,
    });

    const state = String(file.state ?? "");

    if (state === "ACTIVE") {
      return file;
    }

    if (state === "FAILED") {
      const errorMessage =
        file.error?.message ||
        `Gemini failed while processing ${fileName}.`;

      throw new Error(errorMessage);
    }

    await new Promise<void>((resolve) =>
      setTimeout(resolve, 750)
    );
  }

  throw new Error(
    `Timed out while waiting for Gemini to process ${fileName}.`
  );
}

/**
 * ---------------------------------------------------------
 * Validate uploaded files
 * ---------------------------------------------------------
 */

function validateFiles(files: File[]) {
  if (files.length === 0) {
    throw new Error(
      "Question paper is required."
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

  if (hasPdf && hasImage) {
    throw new Error(
      "Upload either one PDF or multiple images, not both."
    );
  }

  if (hasPdf && files.length !== 1) {
    throw new Error(
      "Only one question-paper PDF can be uploaded."
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

/**
 * ---------------------------------------------------------
 * POST /api/process/questions
 * ---------------------------------------------------------
 */

export async function POST(request: Request) {
  const uploadedFiles: Array<{
    name: string;
    uri: string;
    mimeType: string;
  }> = [];

  try {
    /**
     * Read multipart form data.
     */

    const formData = await request.formData();

    const questionPaperFiles = formData
      .getAll("questionPaper")
      .filter(
        (value): value is File =>
          value instanceof File
      );

    /**
     * Validate files before sending anything to Gemini.
     */

    validateFiles(questionPaperFiles);

    /**
     * -----------------------------------------------------
     * Upload all pages/documents to Gemini.
     * -----------------------------------------------------
     *
     * A single PDF becomes one Gemini file.
     * Multiple images become multiple Gemini files.
     */

    for (const file of questionPaperFiles) {
      console.log(
        `[Question Extraction] Uploading ${file.name}...`
      );

      const uploaded =
        await uploadToGemini(file);

      uploadedFiles.push({
        name: uploaded.name!,
        uri: uploaded.uri!,
        mimeType:
          uploaded.mimeType || file.type,
      });

      console.log(
        `[Question Extraction] Uploaded ${file.name}`
      );
    }

    /**
     * -----------------------------------------------------
     * Wait for Gemini file processing.
     * -----------------------------------------------------
     */

    for (const file of uploadedFiles) {
      console.log(
        `[Question Extraction] Waiting for ${file.name}...`
      );

      await waitForFileReady(file.name);

      console.log(
        `[Question Extraction] ${file.name} is ready.`
      );
    }

    /**
     * -----------------------------------------------------
     * Run structured question extraction.
     * -----------------------------------------------------
     */

    console.log(
      `[Question Extraction] Using model: ${GEMINI_MODEL}`
    );

    const extractionResult =
      await extractQuestions(
        uploadedFiles.map((file) => ({
          uri: file.uri,
          mimeType: file.mimeType,
        }))
      );

    /**
     * -----------------------------------------------------
     * Final server-side validation.
     * -----------------------------------------------------
     */

    const questions =
      extractionResult.questions;

    if (questions.length === 0) {
      throw new Error(
        "No questions were detected in the question paper."
      );
    }

    console.log(
      `[Question Extraction] Successfully extracted ${questions.length} questions.`
    );

    /**
     * -----------------------------------------------------
     * Return successful response.
     * -----------------------------------------------------
     */

    return NextResponse.json({
      success: true,

      questions,

      metadata: {
        sourceFileCount:
          questionPaperFiles.length,

        sourceType:
          questionPaperFiles.length === 1 &&
          questionPaperFiles[0].type === PDF_TYPE
            ? "pdf"
            : "images",

        model: GEMINI_MODEL,

        questionCount:
          questions.length,
      },
    });
  } catch (error) {
    /**
     * -----------------------------------------------------
     * Error handling
     * -----------------------------------------------------
     */

    console.error(
      "[Question Extraction] Error:",
      error
    );

    const message =
      error instanceof Error
        ? error.message
        : "Question extraction failed.";

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
     * -----------------------------------------------------
     * Cleanup Gemini files.
     * -----------------------------------------------------
     *
     * Gemini Files are temporary for this workflow.
     */

    await Promise.allSettled(
      uploadedFiles.map((file) =>
        gemini.files.delete({
          name: file.name,
        })
      )
    );
  }
}