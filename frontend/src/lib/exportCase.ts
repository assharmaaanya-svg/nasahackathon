import { scaleLinear } from "d3-scale";

import { buildModel } from "../charts/model";
import type { CaseRecord } from "../types";
import { coordinates, interval, isDetected, signed, stateLabel, timestamp } from "./format";

const INK = "#080c0d";
const PAPER = "#ecede6";
const DIM = "#a9b0ac";
const FAINT = "#7e8985";
const RULE = "#3a474a";
const SIGNAL = "#f2664a";
const QUIET = "#8fc1d4";

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function fileStem(record: CaseRecord): string {
  const place = record.case.place.name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return `long-watch_${place}_${record.case.variable.id}_${record.id}`;
}

export function downloadJson(record: CaseRecord) {
  download(new Blob([JSON.stringify(record, null, 1)], { type: "application/json" }), `${fileStem(record)}.json`);
}

export function downloadCsv(record: CaseRecord) {
  const variable = record.case.variable;
  const provenance = record.provenance;
  const days = provenance.valid_days_by_month;
  const place = record.case.place;
  const header = [
    `# The Long Watch: monthly series as analysed`,
    `# place: ${place.name}`,
    `# footprint: ${place.footprint.west} to ${place.footprint.east} E, ${place.footprint.south} to ${place.footprint.north} N`,
    `# variable: ${variable.name} (${variable.parameter}), ${variable.units}`,
    `# source: ${provenance.source}, ${provenance.source_kind}, ${provenance.product}`,
    `# request: ${provenance.request_url}`,
    `# retrieved: ${provenance.retrieved_at ?? "not recorded"}`,
    `# window: ${provenance.analysis_window ?? ""}, ${provenance.months_used} months used`,
    `# series_sha256: ${provenance.series_sha256 ?? ""}`,
    `# record: ${record.id}, ${record.schema}`,
    `# value: as supplied by the source. anomaly: value minus that calendar month's mean over this window (computed here).`,
    `# decimal_year: year + (month - 0.5) / 12. The trend is fitted to anomaly against decimal_year.`,
  ];
  const columns = ["year", "month", "decimal_year", "value", "anomaly"].concat(days ? ["valid_days"] : []);
  const rows = record.series.years.map((year, index) => {
    const month = record.series.months[index];
    const cells: (string | number)[] = [
      year,
      month,
      (year + (month - 0.5) / 12).toFixed(4),
      record.series.raw[index] ?? "",
      record.series.anomalies[index] ?? "",
    ];
    if (days) cells.push(days[`${year}-${String(month).padStart(2, "0")}`] ?? 0);
    return cells.join(",");
  });
  download(new Blob([[...header, columns.join(","), ...rows].join("\n") + "\n"], { type: "text/csv" }), `${fileStem(record)}.csv`);
}

function wrap(context: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number, maxLines = 6): number {
  const words = text.split(" ");
  let lineText = "";
  let lines = 0;
  for (const word of words) {
    const candidate = lineText ? `${lineText} ${word}` : word;
    if (context.measureText(candidate).width > maxWidth && lineText) {
      context.fillText(lineText, x, y + lines * lineHeight);
      lines += 1;
      lineText = word;
      if (lines >= maxLines) return y + lines * lineHeight;
    } else {
      lineText = candidate;
    }
  }
  if (lineText) {
    context.fillText(lineText, x, y + lines * lineHeight);
    lines += 1;
  }
  return y + lines * lineHeight;
}

function drawFunnel(context: CanvasRenderingContext2D, record: CaseRecord, left: number, top: number, width: number, height: number) {
  const model = buildModel(record);
  if (!model.frames.length) return;
  const x = scaleLinear().domain([model.firstYear, model.lastYear + 1]).range([left, left + width]);
  const y = scaleLinear().domain(model.rateDomain).range([top + height, top]);
  const [low, high] = model.rateDomain;
  const reach = (high - low) * 4;

  context.save();
  context.beginPath();
  context.rect(left, top, width, height);
  context.clip();

  const trace = () => {
    context.beginPath();
    model.frames.forEach((f, i) => {
      const px = x(f.end_year + 1);
      const py = y(f.rank.ci_high ?? high + reach);
      if (i === 0) context.moveTo(px, py);
      else context.lineTo(px, py);
    });
    [...model.frames].reverse().forEach((f) => context.lineTo(x(f.end_year + 1), y(f.rank.ci_low ?? low - reach)));
    context.closePath();
  };

  trace();
  context.fillStyle = "rgba(143,193,212,0.15)";
  context.fill();
  context.strokeStyle = QUIET;
  context.lineWidth = 1.5;
  context.stroke();

  model.detectedRuns.forEach(([from, to]) => {
    const start = x(model.frames[from].end_year + 0.5);
    const end = to === model.frames.length - 1 ? left + width : x(model.frames[to].end_year + 1.5);
    context.save();
    context.beginPath();
    context.rect(start, top, end - start, height);
    context.clip();
    trace();
    context.fillStyle = INK;
    context.fill();
    context.fillStyle = "rgba(242,102,74,0.22)";
    context.fill();
    context.strokeStyle = SIGNAL;
    context.stroke();
    context.restore();
  });

  context.beginPath();
  model.frames.forEach((f, i) => {
    if (i === 0) context.moveTo(x(f.end_year + 1), y(f.rank.slope));
    else context.lineTo(x(f.end_year + 1), y(f.rank.slope));
  });
  context.strokeStyle = PAPER;
  context.lineWidth = 2.2;
  context.stroke();
  context.restore();

  context.setLineDash([5, 6]);
  context.strokeStyle = PAPER;
  context.lineWidth = 1.2;
  context.beginPath();
  context.moveTo(left, y(0));
  context.lineTo(left + width, y(0));
  context.stroke();
  context.setLineDash([]);

  const detectionYear = record.result?.detection.detection_year;
  if (detectionYear != null) {
    context.strokeStyle = SIGNAL;
    context.lineWidth = 1.5;
    context.beginPath();
    context.moveTo(x(detectionYear + 1), top);
    context.lineTo(x(detectionYear + 1), top + height);
    context.stroke();
  }

  context.strokeStyle = RULE;
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(left, top + height);
  context.lineTo(left + width, top + height);
  context.stroke();
  context.fillStyle = FAINT;
  context.font = "400 17px 'IBM Plex Mono'";
  context.textAlign = "center";
  for (let year = Math.ceil(model.firstYear / 5) * 5; year <= model.lastYear + 1; year += 5) {
    context.beginPath();
    context.moveTo(x(year), top + height);
    context.lineTo(x(year), top + height + 8);
    context.stroke();
    context.fillText(String(year), x(year), top + height + 28);
  }
  context.textAlign = "left";
}

export async function downloadCard(record: CaseRecord) {
  await Promise.all([
    document.fonts.load("600 64px 'Barlow Semi Condensed'"),
    document.fonts.load("600 24px 'Barlow'"),
    document.fonts.load("500 16px 'Barlow'"),
    document.fonts.load("400 16px 'IBM Plex Mono'"),
  ]);
  const width = 1600;
  const height = 1120;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return;
  const variable = record.case.variable;
  const result = record.result;
  const margin = 72;

  context.fillStyle = INK;
  context.fillRect(0, 0, width, height);
  context.textBaseline = "alphabetic";

  const label = (text: string, x: number, y: number, color = FAINT) => {
    context.font = "500 15px 'Barlow'";
    context.fillStyle = color;
    context.fillText(text, x, y);
  };

  label("The Long Watch · case record", margin, 84, PAPER);
  context.font = "400 16px 'IBM Plex Mono'";
  context.fillStyle = FAINT;
  context.textAlign = "right";
  context.fillText(`No. ${record.id}`, width - margin, 84);
  context.textAlign = "left";
  context.strokeStyle = RULE;
  context.beginPath();
  context.moveTo(margin, 104);
  context.lineTo(width - margin, 104);
  context.stroke();

  context.font = "600 60px 'Barlow Semi Condensed'";
  context.fillStyle = PAPER;
  context.fillText(variable.question, margin, 196);
  context.font = "400 24px 'Barlow'";
  context.fillStyle = DIM;
  const where =
    record.case.kind === "power"
      ? `${record.case.place.name} · ${coordinates(record.case.place.latitude, record.case.place.longitude)} · ${record.coverage.first_year}–${record.coverage.last_year}`
      : `${record.case.place.name} · ${record.coverage.first_year}–${record.coverage.last_year}`;
  context.fillText(where, margin, 240);

  const verdict = result?.verdict ?? "not_enough_data";
  const tone = isDetected(verdict) ? SIGNAL : QUIET;
  label("Finding", margin, 316);
  context.font = "600 44px 'Barlow Semi Condensed'";
  context.fillStyle = tone;
  context.fillText(stateLabel(verdict, record.coverage.span_years), margin, 376);
  let textBottom = 400;
  if (result) {
    context.font = "400 34px 'IBM Plex Mono'";
    context.fillStyle = PAPER;
    context.fillText(`${signed(result.rank.slope, variable.decimals)} ${variable.units} per decade`, margin, 432);
    context.font = "400 20px 'IBM Plex Mono'";
    context.fillStyle = DIM;
    context.fillText(`95% interval ${interval(result.rank.ci_low, result.rank.ci_high, variable.decimals)}`, margin, 466);
    context.font = "400 23px 'Barlow'";
    context.fillStyle = PAPER;
    const statement = record.text.detection ?? record.text.years_needed ?? "";
    textBottom = wrap(context, statement, margin, 516, 640, 34, 4);
  } else {
    context.font = "400 22px 'Barlow'";
    context.fillStyle = DIM;
    textBottom = wrap(context, record.coverage.reason ?? "", margin, 432, 640, 32, 4);
  }

  const chartLeft = 800;
  const chartWidth = width - margin - chartLeft;
  label("Evidence: rate per decade if the record had ended in each year", chartLeft, 316);
  drawFunnel(context, record, chartLeft, 340, chartWidth, 260);

  const tableTop = Math.max(textBottom + 30, 690);
  context.strokeStyle = RULE;
  context.beginPath();
  context.moveTo(margin, tableTop);
  context.lineTo(width - margin, tableTop);
  context.stroke();

  const rows: [string, string][] = [
    ["Variable", `${variable.name} (${variable.units})`],
    ["Source", `${record.provenance.source} · ${record.provenance.source_kind}`],
    ["Product", record.provenance.product],
    ["Window", `${record.provenance.analysis_window} · ${record.provenance.months_used} of ${record.provenance.months_expected} months`],
    ["Retrieved", `${timestamp(record.provenance.retrieved_at)} · ${record.provenance.served_from}`],
  ];
  if (result) {
    rows.push([
      "Tests",
      `Mann–Kendall p ${result.rank.p_adjusted < 0.001 ? "< 0.001" : result.rank.p_adjusted.toFixed(3)} · least-squares p ${
        result.least_squares.p_adjusted < 0.001 ? "< 0.001" : result.least_squares.p_adjusted.toFixed(3)
      } · lag-1 autocorrelation ${result.least_squares.r1.toFixed(2)} (both tests autocorrelation-aware)`,
    ]);
  }
  let rowY = tableTop + 40;
  rows.forEach(([name, value]) => {
    label(name, margin, rowY);
    context.font = "400 18px 'IBM Plex Mono'";
    context.fillStyle = PAPER;
    let text = value;
    while (context.measureText(text).width > width - margin * 2 - 190 && text.length > 10) text = `${text.slice(0, -2)}…`;
    context.fillText(text, margin + 190, rowY);
    rowY += 36;
  });

  context.font = "400 14px 'IBM Plex Mono'";
  context.fillStyle = FAINT;
  let url = record.provenance.request_url;
  while (context.measureText(url).width > width - margin * 2 && url.length > 20) url = `${url.slice(0, -2)}…`;
  context.fillText(url, margin, rowY + 8);

  context.font = "400 17px 'Barlow'";
  context.fillStyle = DIM;
  wrap(
    context,
    `${variable.caveat} Detection is not attribution. Years of sustained detection are found in hindsight from the full record.`,
    margin,
    height - 96,
    width - margin * 2,
    27,
    3,
  );

  canvas.toBlob((blob) => {
    if (blob) download(blob, `${fileStem(record)}.png`);
  }, "image/png");
}
