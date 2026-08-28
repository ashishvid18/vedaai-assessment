import { Sparkles } from "lucide-react";

import { UploadPanel } from "./UploadPanel";

export function UploadPage() {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-8 md:px-10">
        {/* Header */}
        <header className="flex items-center justify-between border-b pb-6">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-foreground text-background shadow-sm">
              <Sparkles className="size-4" />
            </div>

            <div>
              <div className="text-base font-semibold tracking-tight">
                VedaAI
              </div>

              <div className="text-xs text-muted-foreground">
                Assessment workspace
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="rounded-full border bg-background px-4 py-2 text-xs font-medium text-muted-foreground">
              Teacher workspace
            </span>

            <div className="flex size-9 items-center justify-center rounded-full border text-xs font-semibold">
              T
            </div>
          </div>
        </header>

        {/* Main content */}
        <section className="flex flex-1 flex-col items-center py-20 md:py-24">
          {/* Hero */}
          <div className="mb-12 max-w-4xl text-center">
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border bg-background px-4 py-2 text-xs font-medium text-muted-foreground shadow-sm">
              <span className="size-1.5 rounded-full bg-orange-500" />
              AI-powered assessment review
            </div>

            <h1 className="text-5xl font-semibold leading-[1.05] tracking-[-0.035em] md:text-6xl lg:text-7xl">
              Turn handwritten answers
              <br />
              <span className="text-muted-foreground">
                into a reviewable assessment.
              </span>
            </h1>

            <p className="mx-auto mt-7 max-w-2xl text-base leading-7 text-muted-foreground md:text-lg">
              Upload the question paper and a student's answer sheet.
              We'll extract questions, find the corresponding answers,
              and highlight exactly where each response appears.
            </p>
          </div>

          {/* Upload workspace */}
          <UploadPanel />

          {/* Security note */}
          <p className="mt-10 text-center text-xs text-muted-foreground">
            Your files are processed securely for this assessment session.
          </p>
        </section>
      </div>
    </main>
  );
}