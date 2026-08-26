\# VedaAI Assessment



AI-powered assessment review system that converts a printed question paper and a student's handwritten answer sheet into a structured, reviewable assessment.



\## Live Demo



https://vedaai-assessment-tau.vercel.app/



\## GitHub Repository



https://github.com/ashishvid18/vedaai-assessment



\---



\## Overview



VedaAI helps teachers review handwritten assessments using AI.



The application takes two inputs:



1\. A printed question paper

2\. A student's handwritten answer sheet



It then uses AI to:



\- Extract questions from the question paper

\- Detect and transcribe handwritten answers

\- Locate answer regions on the original answer sheet

\- Match answers to the correct questions

\- Evaluate answers and assign marks

\- Generate question-level feedback

\- Generate an overall teacher feedback summary



The goal is to turn an otherwise manual assessment-review process into a structured and reviewable workflow.



\---



\## How It Works



```text

Question Paper

&#x20;     │

&#x20;     ▼

Question Extraction

&#x20;     │

&#x20;     ▼

Structured Questions

&#x20;     │

&#x20;     │

&#x20;     │

Student Answer Sheet

&#x20;     │

&#x20;     ▼

Handwritten Answer Extraction

&#x20;     │

&#x20;     ▼

Answer Regions + Transcription

&#x20;     │

&#x20;     ▼

Question → Answer Mapping

&#x20;     │

&#x20;     ▼

AI Evaluation / Grading

&#x20;     │

&#x20;     ▼

Question-level Feedback

&#x20;     │

&#x20;     ▼

Overall Teacher Feedback





AI Pipeline



The application uses Google's Gemini API for the AI-powered parts of the pipeline.



Question Extraction



The question paper is uploaded and processed by Gemini to identify the individual questions.



Answer Extraction



The student's answer sheet is processed to detect handwritten responses, transcribe them, and identify their locations.



Mapping



Extracted answers are matched against the extracted questions using question labels and mapping logic.



Evaluation



The mapped question-answer pairs are sent to Gemini for grading based on:



The question

Available marks

Student answer



The model returns structured evaluation results that are validated before being displayed.



Teacher Feedback



The completed evaluation results are passed through a feedback generation step to produce a teacher-oriented summary.



Tech Stack

Frontend

Next.js

React

TypeScript

Tailwind CSS

AI

Google Gemini API

@google/genai

Validation

Zod

Document Processing

PDF rendering

PDF.js worker

Deployment

Vercel





Project Structure

vedaai-assessment/

│

├── app/

│   ├── api/

│   │   └── process/

│   │       ├── questions/

│   │       ├── answers/

│   │       ├── mapping/

│   │       ├── evaluation/

│   │       └── feedback/

│   │

│   └── ...

│

├── components/

│   └── ui/

│       └── upload/

│

├── lib/

│   ├── ai/

│   │   ├── client.ts

│   │   ├── question-extractor.ts

│   │   ├── answer-extractor.ts

│   │   └── evaluator.ts

│   │

│   └── schemas/

│       └── assessment.ts

│

├── public/

│   └── pdf.worker.min.mjs

│

├── .env.example

├── package.json

└── README.md

