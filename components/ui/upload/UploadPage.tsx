import { Sparkles } from "lucide-react";

import { UploadPanel } from "./UploadPanel";

export function UploadPage() {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-10 md:px-10">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-xl bg-foreground text-background">
              <Sparkles className="size-4" />
            </div>

            <span className="text-sm font-semibold tracking-tight">
              VedaAI Assessment
            </span>
          </div>

          <span className="rounded-full border px-3 py-1.5 text-xs text-muted-foreground">
            Teacher workspace
          </span>
        </header>

        <section className="flex flex-1 flex-col items-center justify-center py-20">
          <div className="mb-10 max-w-2xl text-center">
            <p className="mb-4 text-sm font-medium text-muted-foreground">
              AI-powered assessment review
            </p>

            <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">
              Turn handwritten answers into a{" "}
              <span className="text-muted-foreground">
                reviewable assessment.
              </span>
            </h1>

            <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-muted-foreground">
              Upload the question paper and a student's answer sheet.
              We'll extract questions, find the corresponding answers,
              and highlight exactly where each response appears.
            </p>
          </div>

          <UploadPanel />

          <p className="mt-10 text-center text-xs text-muted-foreground">
            Your files are processed securely for this assessment session.
          </p>
        </section>
      </div>
    </main>
  );
}