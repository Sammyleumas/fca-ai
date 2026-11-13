import type { MaterialFileType } from "@/types/db";
import { extractDocx } from "./docx";
import { extractPdf } from "./pdf";
import { extractText } from "./text";
import type { ExtractionResult } from "./types";

export function extract(fileType: MaterialFileType, bytes: Uint8Array): Promise<ExtractionResult> {
  switch (fileType) {
    case "pdf":
      return extractPdf(bytes);
    case "docx":
      return extractDocx(bytes);
    case "txt":
      return extractText(bytes);
  }
}

export * from "./types";
