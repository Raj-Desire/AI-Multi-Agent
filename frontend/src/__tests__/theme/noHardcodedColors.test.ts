import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const SRC_DIR = path.resolve(__dirname, "../../");

function getFiles(dir: string, fileList: string[] = []): string[] {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      if (!fullPath.includes("node_modules") && !fullPath.includes("__tests__")) {
        getFiles(fullPath, fileList);
      }
    } else if (file.endsWith(".tsx") && !file.includes("ColorPicker.tsx")) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

describe("Hardcoded Color Elimination Audit", () => {
  it("contains zero hardcoded indigo color utility classes across product views", () => {
    const files = getFiles(SRC_DIR);
    const violations: { file: string; line: number; match: string }[] = [];

    const indigoRegex = /\b(bg|text|border|ring|from|to|via)-indigo-[0-9]{2,3}\b/g;

    for (const file of files) {
      const content = fs.readFileSync(file, "utf8");
      const lines = content.split("\n");
      lines.forEach((line, idx) => {
        const matches = line.match(indigoRegex);
        if (matches) {
          violations.push({
            file: path.relative(SRC_DIR, file),
            line: idx + 1,
            match: matches.join(", "),
          });
        }
      });
    }

    expect(violations).toEqual([]);
  });
});
