import {
  ArrowLeft,
  Bell,
  BookOpen,
  ClipboardList,
  Grid2X2,
  Menu,
  Settings,
  Sparkles,
} from "lucide-react";

import { UploadPanel } from "./UploadPanel";

export function UploadPage() {
  return (
    <main className="min-h-screen bg-[#f4f4f4] text-foreground">
      <div className="flex min-h-screen w-full">

        {/* =====================================================
            Desktop Sidebar
            ===================================================== */}

        <aside className="hidden w-[220px] shrink-0 border-r bg-white lg:flex lg:flex-col">
          {/* Brand */}
          <div className="px-5 pb-5 pt-6">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-xl bg-black text-white">
                <Sparkles className="size-4" />
              </div>

              <div>
                <div className="text-sm font-semibold tracking-tight">
                  VedaAI
                </div>

                <div className="text-[10px] text-muted-foreground">
                  Assessment workspace
                </div>
              </div>
            </div>
          </div>

          {/* AI Toolkit */}
          <div className="px-4">
            <div className="flex items-center gap-2 rounded-full border border-black bg-black px-4 py-2.5 text-xs font-medium text-white shadow-sm">
              <Sparkles className="size-3.5" />
              <span>AI Teacher's Toolkit</span>
            </div>
          </div>

          {/* Navigation */}
          <nav className="mt-6 px-3">
            <p className="mb-2 px-3 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
              Workspace
            </p>

            <div className="space-y-1">
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs text-muted-foreground transition hover:bg-black/5"
              >
                <Grid2X2 className="size-4" />
                Home
              </button>

              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs text-muted-foreground transition hover:bg-black/5"
              >
                <BookOpen className="size-4" />
                My Classroom
              </button>

              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs text-muted-foreground transition hover:bg-black/5"
              >
                <ClipboardList className="size-4" />
                Assignments
              </button>

              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-lg bg-black/[0.06] px-3 py-2.5 text-left text-xs font-medium text-foreground"
              >
                <ClipboardList className="size-4" />
                Exams
              </button>

              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs text-muted-foreground transition hover:bg-black/5"
              >
                <BookOpen className="size-4" />
                My Library
              </button>
            </div>
          </nav>

          {/* Bottom */}
          <div className="mt-auto px-4 pb-5">
            <button
              type="button"
              className="mb-4 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs text-muted-foreground transition hover:bg-black/5"
            >
              <Settings className="size-4" />
              Settings
            </button>

            <div className="rounded-xl border bg-[#fafafa] p-3">
              <div className="flex items-center gap-3">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full border bg-white text-[10px] font-semibold">
                  DP
                </div>

                <div className="min-w-0">
                  <p className="truncate text-[11px] font-semibold">
                    Delhi Public School
                  </p>

                  <p className="truncate text-[10px] text-muted-foreground">
                    Bokaro Steel City
                  </p>
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* =====================================================
            Main Application Area
            ===================================================== */}

        <div className="flex min-w-0 flex-1 flex-col">

          {/* ===================================================
              Top Header
              =================================================== */}

          <header className="border-b bg-white">
            <div className="flex h-[72px] items-center justify-between px-5 sm:px-7 lg:px-8">

              {/* Left */}
              <div className="flex items-center gap-3">
                {/* Mobile menu */}
                <button
                  type="button"
                  className="flex size-9 items-center justify-center rounded-lg border lg:hidden"
                  aria-label="Open menu"
                >
                  <Menu className="size-4" />
                </button>

                {/* Desktop back */}
                <button
                  type="button"
                  className="hidden size-9 items-center justify-center rounded-lg border transition hover:bg-black/5 lg:flex"
                  aria-label="Go back"
                >
                  <ArrowLeft className="size-4" />
                </button>

                <div className="lg:hidden">
                  <div className="text-base font-semibold tracking-tight">
                    VedaAI
                  </div>
                </div>

                <div className="hidden lg:block">
                  <p className="text-xs text-muted-foreground">
                    Exams
                  </p>

                  <p className="text-sm font-medium">
                    Upload assessment
                  </p>
                </div>
              </div>

              {/* Right */}
              <div className="flex items-center gap-2 sm:gap-3">
                <button
                  type="button"
                  className="relative flex size-9 items-center justify-center rounded-full border bg-white transition hover:bg-black/5"
                  aria-label="Notifications"
                >
                  <Bell className="size-4" />

                  <span className="absolute right-[7px] top-[6px] size-1.5 rounded-full bg-orange-500" />
                </button>

                <div className="hidden size-9 items-center justify-center rounded-full bg-black text-xs font-semibold text-white sm:flex">
                  T
                </div>

                <button
                  type="button"
                  className="flex size-9 items-center justify-center rounded-lg border lg:hidden"
                  aria-label="Open navigation"
                >
                  <Menu className="size-4" />
                </button>

                <span className="hidden rounded-full border bg-white px-4 py-2 text-xs font-medium text-muted-foreground lg:block">
                  Teacher workspace
                </span>
              </div>
            </div>
          </header>

          {/* ===================================================
              Page Content
              =================================================== */}

          <section className="flex-1 px-4 py-8 sm:px-6 sm:py-10 lg:px-10 lg:py-12">

            <div className="mx-auto w-full max-w-[1180px]">

              {/* Page heading */}
              <div className="mb-8 text-center lg:mb-10">
                <p className="mb-3 text-xs font-medium text-muted-foreground">
                  Exams
                </p>

                <h1 className="text-3xl font-semibold tracking-[-0.03em] sm:text-4xl lg:text-5xl">
                  Upload{" "}
                  <span className="text-[#ef6a3a]">
                    Question Paper
                  </span>{" "}
                  &{" "}
                  <span className="text-[#ef6a3a]">
                    Answer Sheets
                  </span>
                </h1>

                <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
                  Upload both files to get started
                </p>
              </div>

              {/* =================================================
                  Illustration
                  ================================================= */}

              <div className="mb-8 flex justify-center">
                <div className="relative flex size-28 items-center justify-center rounded-full bg-[#f8d9cd] sm:size-32">
                  <div className="absolute inset-3 rounded-full border-[10px] border-[#f3b9a5]" />

                  <div className="relative z-10 flex size-16 items-center justify-center rounded-full border-4 border-white bg-white shadow-sm sm:size-20">
                    <div className="flex size-12 items-center justify-center rounded-full bg-[#f3eee9] sm:size-14">
                      <span className="text-2xl sm:text-3xl">
                        👩🏻‍🏫
                      </span>
                    </div>
                  </div>

                  <span className="absolute right-1 top-3 flex size-5 items-center justify-center rounded-full bg-[#ef6a3a] text-[9px] text-white">
                    ✦
                  </span>

                  <span className="absolute bottom-3 left-1 flex size-5 items-center justify-center rounded-full bg-[#ef6a3a] text-[9px] text-white">
                    ✦
                  </span>
                </div>
              </div>

              {/* =================================================
                  Existing UploadPanel
                  ================================================= */}

              <UploadPanel />

              {/* Security note */}
              <p className="mt-8 text-center text-xs text-muted-foreground">
                Your files are processed securely for this assessment
                session.
              </p>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}