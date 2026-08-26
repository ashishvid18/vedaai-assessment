"use client";

import { useCallback } from "react";
import {
  AlertCircle,
  FileText,
  Image as ImageIcon,
  Upload,
  X,
} from "lucide-react";
import {
  useDropzone,
  type FileRejection,
} from "react-dropzone";

type FileDropzoneProps = {
  title: string;
  description: string;
  files: File[];
  onFilesChange: (files: File[]) => void;
};

const IMAGE_TYPES = {
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/webp": [".webp"],
};

const ACCEPTED_TYPES = {
  "application/pdf": [".pdf"],
  ...IMAGE_TYPES,
};

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB per file
const MAX_FILES = 20;

export function FileDropzone({
  title,
  description,
  files,
  onFilesChange,
}: FileDropzoneProps) {
  const onDrop = useCallback(
    (acceptedFiles: File[], fileRejections: FileRejection[]) => {
      if (fileRejections.length > 0 || acceptedFiles.length === 0) {
        return;
      }

      const containsPdf = acceptedFiles.some(
        (file) => file.type === "application/pdf"
      );

      const containsImages = acceptedFiles.some(
        (file) => file.type.startsWith("image/")
      );

      // A PDF represents the complete document by itself.
      // Don't allow mixing a PDF with individual page images.
      if (containsPdf && containsImages) {
        return;
      }

      // Only one PDF is allowed.
      if (containsPdf && acceptedFiles.length > 1) {
        onFilesChange([acceptedFiles[0]]);
        return;
      }

      // Multiple images are allowed.
      onFilesChange(acceptedFiles);
    },
    [onFilesChange]
  );

  const {
    getRootProps,
    getInputProps,
    isDragActive,
    isDragReject,
  } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    maxFiles: MAX_FILES,
    maxSize: MAX_FILE_SIZE,
    multiple: true,
  });

  const removeFile = (index: number) => {
    onFilesChange(files.filter((_, fileIndex) => fileIndex !== index));
  };

  if (files.length > 0) {
    const isPdf = files.length === 1 && files[0].type === "application/pdf";

    return (
      <div className="relative flex min-h-[240px] flex-col rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl bg-muted">
              {isPdf ? (
                <FileText className="size-5" />
              ) : (
                <ImageIcon className="size-5" />
              )}
            </div>

            <div>
              <p className="text-sm font-medium">
                {isPdf
                  ? "PDF uploaded"
                  : `${files.length} image${files.length > 1 ? "s" : ""} uploaded`}
              </p>

              <p className="mt-1 text-xs text-muted-foreground">
                Ready to analyze
              </p>
            </div>
          </div>
        </div>

        <div className="mt-5 flex-1 space-y-2 overflow-auto">
          {files.map((file, index) => (
            <div
              key={`${file.name}-${file.lastModified}`}
              className="flex items-center justify-between rounded-xl border bg-muted/30 px-3 py-2"
            >
              <div className="flex min-w-0 items-center gap-2">
                {file.type === "application/pdf" ? (
                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                ) : (
                  <ImageIcon className="size-4 shrink-0 text-muted-foreground" />
                )}

                <span className="truncate text-xs">
                  {file.name}
                </span>
              </div>

              <button
                type="button"
                onClick={() => removeFile(index)}
                className="ml-2 rounded-lg p-1.5 text-muted-foreground transition hover:bg-background hover:text-foreground"
                aria-label={`Remove ${file.name}`}
              >
                <X className="size-4" />
              </button>
            </div>
          ))}
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              {isPdf ? "1 document" : `${files.length} pages`}
            </span>

            <span className="font-medium">Ready</span>
          </div>

          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full w-full rounded-full bg-foreground" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      {...getRootProps()}
      className={[
        "flex min-h-[240px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition-all",
        isDragActive && !isDragReject
          ? "scale-[1.01] border-foreground bg-muted/60"
          : "border-border bg-card hover:border-foreground/30 hover:bg-muted/20",
        isDragReject ? "border-destructive bg-destructive/5" : "",
      ].join(" ")}
    >
      <input {...getInputProps()} />

      <div className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-muted">
        {isDragReject ? (
          <AlertCircle className="size-6 text-destructive" />
        ) : (
          <Upload className="size-6" />
        )}
      </div>

      {isDragReject ? (
        <>
          <p className="font-medium text-destructive">
            Unsupported file
          </p>

          <p className="mt-2 max-w-xs text-sm text-muted-foreground">
            Upload one PDF or up to 20 page images.
          </p>
        </>
      ) : isDragActive ? (
        <>
          <p className="font-medium">
            Drop your files here
          </p>

          <p className="mt-2 text-sm text-muted-foreground">
            Release to upload
          </p>
        </>
      ) : (
        <>
          <p className="font-medium">{title}</p>

          <p className="mt-2 max-w-xs text-sm text-muted-foreground">
            {description}
          </p>

          <div className="mt-5 inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium">
            <Upload className="size-4" />
            Browse files
          </div>

          <p className="mt-4 text-xs text-muted-foreground">
            1 PDF or up to 20 images · 20 MB per file
          </p>
        </>
      )}
    </div>
  );
}