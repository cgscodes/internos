// Synthetic selectable-text PDF for parser/browser verification; no external library.
export function jobPdf(lines = [], pages = 1, width = 612, padding = 0) {
  const stream = `BT /F1 12 Tf 50 750 Td ${lines.map((line, index) => `${index ? "0 -18 Td " : ""}(${line.replace(/[\\()]/g, "\\$&")}) Tj`).join(" ")} ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${Array(pages).fill("3 0 R").join(" ")}] /Count ${pages} >>`,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let result = "%PDF-1.4\n" + "%" + " ".repeat(padding) + "\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(result));
    result += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(result);
  result += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join(
      "",
    )}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(result);
}
export const jobLines = [
  "Company: Import Test Studio",
  "Job title: Engineering Intern",
  "Location: Remote",
  "Employment type: Internship",
  "Deadline: 2099-12-01",
  "Salary: $25 per hour",
  "Source URL: https://example.test/intern",
  "Build thoughtful software. Selectable job description.",
];

export function tenMegabyteJobPdf() {
  const target = 10 * 1024 * 1024;
  let padding = target - jobPdf(jobLines).length;
  let file = jobPdf(jobLines, 1, 612, padding);
  while (file.length !== target) {
    padding += target - file.length;
    file = jobPdf(jobLines, 1, 612, padding);
  }
  return file;
}

// Browser-print-style table: separate positioned text objects, repeated page headers.
export function trackerPdf(
  pages = [
    [
      [
        "Example Studio",
        "Engineering Intern",
        "Nov 10, 2026",
        "Remote",
        "Applied",
      ],
      ["Truncated...", "Software Intern...", "", "New York...", "Closed"],
    ],
    [
      [
        "Another Studio",
        "Design Intern",
        "11/09/2026",
        "Boston",
        "Interviewing",
      ],
      [
        "Reviewed Studio",
        "Research Intern",
        "2026-11-08",
        "Remote",
        "Reviewed",
      ],
    ],
  ],
) {
  const xs = [40, 190, 380, 495, 610];
  const streams = pages.map((rows) =>
    [
      [40, 755, "Handshake"],
      ...["Company", "Role", "Date applied", "Location", "Status"].map(
        (text, index) => [xs[index], 710, text],
      ),
      ...rows.flatMap((row, index) =>
        row.map((text, column) => [xs[column], 670 - index * 60, text]),
      ),
      [40, 20, "https://app.joinhandshake.com/myjobs"],
      [660, 20, "1 / 2"],
    ]
      .map(
        ([x, y, text]) =>
          `BT /F1 10 Tf 1 0 0 1 ${x} ${y} Tm (${String(text).replace(/[\\()]/g, "\\$&")}) Tj ET`,
      )
      .join("\n"),
  );
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${streams.map((_, i) => `${4 + i * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  for (const [index, stream] of streams.entries())
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 760 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + index * 2} 0 R >>`,
      `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    );
  let result = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(result));
    result += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(result);
  result += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join(
      "",
    )}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(result);
}
