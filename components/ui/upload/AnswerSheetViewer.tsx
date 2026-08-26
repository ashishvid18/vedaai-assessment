"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Minus,
  Plus,
  FileText,
} from "lucide-react";

type BoundingBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type AnswerRegion = {
  page: number;
  bbox: BoundingBox;
};

type StudentAnswer = {
  id: string;
  detectedLabel: string | null;
  text: string;
  regions: AnswerRegion[];
  confidence: number;
};

type AnswerSheetViewerProps = {
  file: File | null;
  answer: StudentAnswer | null;
  initialPage?: number;
};

type PdfDocument = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfPage>;
};

type PdfPage = {
  getViewport: (options: { scale: number }) => {
    width: number;
    height: number;
  };

  render: (options: {
    canvasContext: CanvasRenderingContext2D;
    viewport: {
      width: number;
      height: number;
    };
  }) => {
    promise: Promise<void>;
    cancel?: () => void;
  };
};

type PdfLoadingTask = {
  promise: Promise<PdfDocument>;
  destroy: () => Promise<void> | void;
};

type PdfJsModule = {
  getDocument: (options: {
    data: Uint8Array;
  }) => PdfLoadingTask;

  GlobalWorkerOptions: {
    workerSrc: string;
  };
};

export function AnswerSheetViewer({
  file,
  answer,
  initialPage = 1,
}: AnswerSheetViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const pdfRef = useRef<PdfDocument | null>(null);

  const loadingTaskRef =
    useRef<PdfLoadingTask | null>(null);

  const renderTaskRef =
    useRef<{ cancel?: () => void } | null>(null);

  const [pageNumber, setPageNumber] =
    useState(initialPage);

  const [pageCount, setPageCount] =
    useState(0);

  const [scale, setScale] =
    useState(1);

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  /*
   * Find the answer region that belongs to
   * the currently displayed page.
   */
  const pageRegion = useMemo(() => {
    if (!answer) {
      return null;
    }

    return (
      answer.regions.find(
        (region) =>
          region.page === pageNumber
      ) ?? null
    );
  }, [answer, pageNumber]);

  /*
   * ---------------------------------------------------------
   * Load PDF
   * ---------------------------------------------------------
   *
   * PDF.js is imported dynamically so that it never executes
   * during Next.js server/module evaluation.
   *
   * This prevents browser-only APIs such as DOMMatrix from
   * being accessed on the server.
   */
  useEffect(() => {
    let cancelled = false;

    async function loadPdf() {
      /*
       * Cancel an existing page render.
       */
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel?.();
        } catch {
          // Ignore cancellation errors.
        }

        renderTaskRef.current = null;
      }

      /*
       * Destroy the previous loading task.
       */
      if (loadingTaskRef.current) {
        try {
          await loadingTaskRef.current.destroy();
        } catch (err) {
          console.warn(
            "[AnswerSheetViewer] Previous PDF cleanup failed:",
            err
          );
        }

        loadingTaskRef.current = null;
      }

      pdfRef.current = null;

      /*
       * No file selected.
       */
      if (!file) {
        setPageCount(0);
        setPageNumber(1);
        setLoading(false);
        setError("");
        return;
      }

      setLoading(true);
      setError("");

      try {
        /*
         * IMPORTANT:
         *
         * Do NOT import pdfjs-dist at the top of this file.
         *
         * The import happens only in the browser effect.
         */
        const pdfjs =
          (await import(
            "pdfjs-dist/legacy/build/pdf.mjs"
          )) as unknown as PdfJsModule;

        /*
         * PDF.js worker.
         *
         * Make sure this file exists:
         *
         * public/pdf.worker.min.mjs
         */
        pdfjs.GlobalWorkerOptions.workerSrc =
          "/pdf.worker.min.mjs";

        if (cancelled) {
          return;
        }

        /*
         * Read the uploaded PDF directly into memory.
         *
         * This is more reliable than passing an object URL
         * to PDF.js and avoids object URL lifecycle problems.
         */
        const fileData =
          new Uint8Array(
            await file.arrayBuffer()
          );

        if (cancelled) {
          return;
        }

        /*
         * PDF.js 6.x expects DocumentInitParameters.
         *
         * Passing { data } is compatible with PDF.js 6.x.
         */
        const loadingTask =
          pdfjs.getDocument({
            data: fileData,
          });

        loadingTaskRef.current =
          loadingTask;

        const pdf =
          await loadingTask.promise;

        if (cancelled) {
          try {
            await loadingTask.destroy();
          } catch {
            // Ignore cleanup errors.
          }

          return;
        }

        pdfRef.current = pdf;

        setPageCount(pdf.numPages);

        /*
         * Keep the initial page inside the valid range.
         */
        const safeInitialPage =
          Math.min(
            Math.max(initialPage, 1),
            pdf.numPages
          );

        setPageNumber(
          safeInitialPage
        );
      } catch (err) {
        console.error(
          "[AnswerSheetViewer] PDF load error:",
          err
        );

        if (!cancelled) {
          setError(
            "Unable to render the answer-sheet PDF."
          );

          setPageCount(0);
          pdfRef.current = null;
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadPdf();

    /*
     * Cleanup when the file changes or component
     * unmounts.
     */
    return () => {
      cancelled = true;

      /*
       * Cancel current render.
       */
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel?.();
        } catch {
          // Ignore cancellation errors.
        }

        renderTaskRef.current = null;
      }

      /*
       * Destroy PDF loading task.
       */
      const loadingTask =
        loadingTaskRef.current;

      loadingTaskRef.current = null;
      pdfRef.current = null;

      if (loadingTask) {
        try {
          void loadingTask.destroy();
        } catch {
          // Ignore cleanup errors.
        }
      }
    };
  }, [file, initialPage]);

  /*
   * ---------------------------------------------------------
   * Render selected PDF page
   * ---------------------------------------------------------
   */
  useEffect(() => {
    let cancelled = false;

    async function renderPage() {
      const pdf = pdfRef.current;
      const canvas = canvasRef.current;

      if (!pdf || !canvas) {
        return;
      }

      if (
        pageNumber < 1 ||
        pageNumber > pdf.numPages
      ) {
        return;
      }

      /*
       * Cancel previous render if one exists.
       */
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel?.();
        } catch {
          // Ignore cancellation errors.
        }

        renderTaskRef.current = null;
      }

      setLoading(true);
      setError("");

      try {
        const page =
          await pdf.getPage(pageNumber);

        if (cancelled) {
          return;
        }

        const viewport =
          page.getViewport({
            scale,
          });

        const context =
          canvas.getContext("2d");

        if (!context) {
          throw new Error(
            "Unable to create canvas context."
          );
        }

        /*
         * Support high-DPI screens while keeping
         * the displayed size equal to the viewport.
         */
        const outputScale =
          window.devicePixelRatio || 1;

        canvas.width =
          Math.floor(
            viewport.width *
              outputScale
          );

        canvas.height =
          Math.floor(
            viewport.height *
              outputScale
          );

        canvas.style.width =
          `${viewport.width}px`;

        canvas.style.height =
          `${viewport.height}px`;

        /*
         * Reset the transform before rendering.
         */
        context.setTransform(
          outputScale,
          0,
          0,
          outputScale,
          0,
          0
        );

        context.clearRect(
          0,
          0,
          viewport.width,
          viewport.height
        );

        /*
         * Render the PDF page.
         */
        const renderTask =
          page.render({
            canvasContext: context,
            viewport,
          });

        renderTaskRef.current =
          renderTask;

        await renderTask.promise;

        if (
          renderTaskRef.current ===
          renderTask
        ) {
          renderTaskRef.current = null;
        }
      } catch (err) {
        /*
         * PDF.js throws when a render is cancelled.
         * That is expected during fast navigation/zooming.
         */
        if (
          cancelled ||
          String(err).toLowerCase().includes(
            "cancel"
          )
        ) {
          return;
        }

        console.error(
          "[AnswerSheetViewer] Page render error:",
          err
        );

        if (!cancelled) {
          setError(
            "Unable to render this PDF page."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void renderPage();

    return () => {
      cancelled = true;

      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel?.();
        } catch {
          // Ignore cancellation errors.
        }

        renderTaskRef.current = null;
      }
    };
  }, [pageNumber, scale]);

  /*
   * ---------------------------------------------------------
   * Keep viewer aligned with selected answer
   * ---------------------------------------------------------
   */
  useEffect(() => {
    if (!answer) {
      return;
    }

    const firstRegion =
      answer.regions[0];

    if (!firstRegion) {
      return;
    }

    if (
      firstRegion.page !== pageNumber
    ) {
      setPageNumber(
        Math.min(
          Math.max(
            firstRegion.page,
            1
          ),
          pageCount ||
            firstRegion.page
        )
      );
    }
  }, [
    answer,
    pageCount,
    pageNumber,
  ]);

  /*
   * ---------------------------------------------------------
   * Page navigation
   * ---------------------------------------------------------
   */
  const goPrevious = () => {
    setPageNumber(
      (current) =>
        Math.max(
          1,
          current - 1
        )
    );
  };

  const goNext = () => {
    setPageNumber(
      (current) =>
        Math.min(
          pageCount,
          current + 1
        )
    );
  };

  /*
   * ---------------------------------------------------------
   * Zoom
   * ---------------------------------------------------------
   */
  const zoomOut = () => {
    setScale(
      (current) =>
        Math.max(
          0.5,
          Number(
            (
              current - 0.1
            ).toFixed(2)
          )
        )
    );
  };

  const zoomIn = () => {
    setScale(
      (current) =>
        Math.min(
          2.5,
          Number(
            (
              current + 0.1
            ).toFixed(2)
          )
        )
    );
  };

  const zoomPercentage =
    Math.round(scale * 100);

  /*
   * ---------------------------------------------------------
   * UI
   * ---------------------------------------------------------
   */
  return (
    <div className="overflow-hidden rounded-2xl border bg-white">
      {/* HEADER */}
      <div className="flex items-center justify-between gap-4 border-b px-5 py-4">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
            Answer sheet
          </p>

          <div className="mt-1 flex items-center gap-2">
            <FileText className="size-4 shrink-0" />

            <p className="truncate text-sm font-medium">
              {file?.name ??
                "No answer sheet selected"}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {/* PREVIOUS */}
          <button
            type="button"
            onClick={goPrevious}
            disabled={
              pageNumber <= 1
            }
            className="rounded-lg border px-3 py-2 text-sm transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Previous page"
          >
            <ChevronLeft className="size-4" />
          </button>

          {/* PAGE NUMBER */}
          <span className="min-w-[80px] text-center text-sm">
            Page {pageNumber} /{" "}
            {pageCount || "—"}
          </span>

          {/* NEXT */}
          <button
            type="button"
            onClick={goNext}
            disabled={
              pageCount === 0 ||
              pageNumber >=
                pageCount
            }
            className="rounded-lg border px-3 py-2 text-sm transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Next page"
          >
            <ChevronRight className="size-4" />
          </button>

          {/* ZOOM OUT */}
          <button
            type="button"
            onClick={zoomOut}
            disabled={scale <= 0.5}
            className="rounded-lg border p-2 transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Zoom out"
          >
            <Minus className="size-4" />
          </button>

          <span className="min-w-[48px] text-center text-xs">
            {zoomPercentage}%
          </span>

          {/* ZOOM IN */}
          <button
            type="button"
            onClick={zoomIn}
            disabled={scale >= 2.5}
            className="rounded-lg border p-2 transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Zoom in"
          >
            <Plus className="size-4" />
          </button>
        </div>
      </div>

      {/* PDF VIEWER */}
      <div className="relative max-h-[720px] overflow-auto bg-muted/20 p-6">
        {/* ERROR */}
        {error && (
          <div className="flex min-h-[500px] items-center justify-center">
            <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
              {error}
            </div>
          </div>
        )}

        {/* NO FILE */}
        {!error && !file && (
          <div className="flex min-h-[500px] items-center justify-center text-sm text-muted-foreground">
            Upload an answer sheet to preview it.
          </div>
        )}

        {/* PDF */}
        {!error && file && (
          <div className="flex min-w-full justify-center">
            <div className="relative inline-block bg-white shadow-md">
              <canvas
                ref={canvasRef}
                className="block"
              />

              {/* ANSWER REGION */}
              {pageRegion && (
                <div
                  className="pointer-events-none absolute border-2 border-red-500 bg-red-500/10 shadow-[0_0_0_2px_rgba(255,255,255,0.7)]"
                  style={{
                    left: `${
                      pageRegion.bbox.x *
                      100
                    }%`,
                    top: `${
                      pageRegion.bbox.y *
                      100
                    }%`,
                    width: `${
                      pageRegion.bbox.width *
                      100
                    }%`,
                    height: `${
                      pageRegion.bbox.height *
                      100
                    }%`,
                  }}
                >
                  <div className="absolute -top-7 left-0 whitespace-nowrap rounded-md bg-red-500 px-2 py-1 text-[11px] font-medium text-white">
                    Answer region
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* LOADING */}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/60">
            <div className="rounded-full border bg-white px-4 py-2 text-sm shadow-sm">
              Rendering page...
            </div>
          </div>
        )}
      </div>

      {/* REGION INFORMATION */}
      <div className="border-t px-5 py-4">
        {pageRegion ? (
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">
                Answer region detected
              </p>

              <p className="mt-1 text-xs text-muted-foreground">
                Page{" "}
                {pageRegion.page}
                {" · "}
                {Math.round(
                  pageRegion.bbox.x *
                    100
                )}
                % from left
                {" · "}
                {Math.round(
                  pageRegion.bbox.y *
                    100
                )}
                % from top
              </p>
            </div>

            <span className="rounded-full border bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700">
              {Math.round(
                (
                  answer?.confidence ??
                  0
                ) * 100
              )}
              % confidence
            </span>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No answer region detected
            on this page.
          </p>
        )}
      </div>
    </div>
  );
}