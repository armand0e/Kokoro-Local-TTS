/**
 * Document extraction pipeline abstraction.
 *
 * This module provides a model-agnostic interface for extracting structured
 * markdown from images. The default backend uses the existing TrOCR pipeline.
 * It can be swapped for MinerU2.5-Pro or other vision-language models.
 */

export interface ExtractedDocument {
  /** Full markdown representation of the image content */
  markdown: string;
  /** A TTS-friendly description/summary for non-text elements */
  ttsDescription: string;
  /** Detected element types in the image */
  elements: DetectedElement[];
}

export interface DetectedElement {
  type: "text" | "table" | "formula" | "diagram" | "chart" | "code" | "heading";
  /** Raw content or LaTeX/markdown representation */
  content: string;
  /** Human-readable description for TTS */
  ttsText: string;
}

/**
 * Builds a TTS-friendly description from extracted elements.
 * Tables become summaries, formulas get read-aloud versions, etc.
 */
export function buildTTSDescription(elements: DetectedElement[]): string {
  if (elements.length === 0) return "";

  const parts: string[] = [];

  for (const el of elements) {
    switch (el.type) {
      case "text":
      case "heading":
        parts.push(el.ttsText || el.content);
        break;
      case "table":
        parts.push(el.ttsText || "This image contains a table.");
        break;
      case "formula":
        parts.push(el.ttsText || "This image contains a mathematical formula.");
        break;
      case "diagram":
        parts.push(el.ttsText || "This image contains a diagram.");
        break;
      case "chart":
        parts.push(el.ttsText || "This image contains a chart.");
        break;
      case "code":
        parts.push(el.ttsText || "This image contains a code snippet.");
        break;
    }
  }

  return parts.join(" ");
}

/**
 * Converts plain OCR text to a basic structured document.
 * Used as a fallback when no advanced model is available.
 */
export function plainTextToDocument(text: string): ExtractedDocument {
  if (!text.trim()) {
    return { markdown: "", ttsDescription: "", elements: [] };
  }

  const elements: DetectedElement[] = [
    {
      type: "text",
      content: text,
      ttsText: text,
    },
  ];

  return {
    markdown: text,
    ttsDescription: text,
    elements,
  };
}

/**
 * Post-processes raw model output into structured elements.
 * Detects tables (markdown table syntax), formulas (LaTeX), code blocks, etc.
 */
export function parseModelOutput(rawMarkdown: string): ExtractedDocument {
  if (!rawMarkdown.trim()) {
    return { markdown: "", ttsDescription: "", elements: [] };
  }

  const elements: DetectedElement[] = [];
  const lines = rawMarkdown.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Detect code blocks
    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      const code = codeLines.join("\n");
      elements.push({
        type: "code",
        content: code,
        ttsText: `Code block${lang ? ` in ${lang}` : ""}: ${summarizeCode(code)}`,
      });
      continue;
    }

    // Detect tables (lines with | separators)
    if (line.includes("|") && line.trim().startsWith("|")) {
      const tableLines: string[] = [line];
      i++;
      while (i < lines.length && lines[i].includes("|")) {
        tableLines.push(lines[i]);
        i++;
      }
      const tableMarkdown = tableLines.join("\n");
      elements.push({
        type: "table",
        content: tableMarkdown,
        ttsText: summarizeTable(tableLines),
      });
      continue;
    }

    // Detect LaTeX formulas ($$...$$)
    if (line.trim().startsWith("$$")) {
      const formulaLines: string[] = [line];
      if (!line.trim().endsWith("$$") || line.trim() === "$$") {
        i++;
        while (i < lines.length && !lines[i].trim().endsWith("$$")) {
          formulaLines.push(lines[i]);
          i++;
        }
        if (i < lines.length) formulaLines.push(lines[i]);
      }
      i++;
      const formula = formulaLines.join("\n").replace(/\$\$/g, "").trim();
      elements.push({
        type: "formula",
        content: formula,
        ttsText: `Mathematical formula: ${formula.slice(0, 100)}`,
      });
      continue;
    }

    // Detect headings
    if (line.startsWith("#")) {
      const match = line.match(/^(#{1,6})\s+(.+)/);
      if (match) {
        elements.push({
          type: "heading",
          content: match[2],
          ttsText: match[2],
        });
        i++;
        continue;
      }
    }

    // Regular text paragraph
    if (line.trim()) {
      const textLines: string[] = [line];
      i++;
      while (i < lines.length && lines[i].trim() && !lines[i].startsWith("#") && !lines[i].startsWith("```") && !lines[i].startsWith("$$") && !(lines[i].includes("|") && lines[i].trim().startsWith("|"))) {
        textLines.push(lines[i]);
        i++;
      }
      const text = textLines.join(" ");
      elements.push({
        type: "text",
        content: text,
        ttsText: text,
      });
      continue;
    }

    i++;
  }

  return {
    markdown: rawMarkdown,
    ttsDescription: buildTTSDescription(elements),
    elements,
  };
}

function summarizeTable(lines: string[]): string {
  // Extract header row
  const headerLine = lines[0];
  const headers = headerLine
    .split("|")
    .map((h) => h.trim())
    .filter(Boolean);

  const dataRows = lines.filter(
    (l) => !l.match(/^\s*\|[\s\-:|]+\|\s*$/) && l !== headerLine
  );

  if (headers.length > 0) {
    return `Table with columns: ${headers.join(", ")}. Contains ${dataRows.length} rows of data.`;
  }
  return `Table with ${lines.length} rows.`;
}

function summarizeCode(code: string): string {
  const lineCount = code.split("\n").length;
  const firstLine = code.split("\n")[0]?.trim() ?? "";
  if (lineCount <= 3) return code.replace(/\n/g, " ");
  return `${lineCount} lines starting with "${firstLine.slice(0, 60)}"`;
}
