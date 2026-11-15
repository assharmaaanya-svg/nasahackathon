import { useRef, useState } from "react";

import { RequestFailed, rerunRecord } from "../lib/api";
import { downloadCard, downloadCsv, downloadJson } from "../lib/exportCase";
import { coordinates, footprintSize, interval, signed, timestamp } from "../lib/format";
import type { VerdictId } from "../types";

const SHORT_STATE: Record<VerdictId, string> = {
  detected_rising: "Detected, rising",
  detected_falling: "Detected, falling",
  suggestive: "Suggestive",
  not_detectable_yet: "No detection",
  not_enough_data: "Insufficient data",
};
import type { CaseRecord } from "../types";

interface Props {
  record: CaseRecord;
  revealed: boolean;
  onLoaded: (record: CaseRecord) => void;
}

export function RecordSheet({ record, revealed, onLoaded }: Props) {
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [loadNote, setLoadNote] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const { place, variable } = record.case;
  const provenance = record.provenance;
  const { west, south, east, north } = place.footprint;
  const aspect = ((east - west) * Math.cos((((south + north) / 2) * Math.PI) / 180)) / (north - south);
  const boxHeight = 54;
  const boxWidth = Math.min(Math.max(boxHeight * aspect, 30), 150);
  const px = ((place.longitude - west) / (east - west)) * boxWidth;
  const py = (1 - (place.latitude - south) / (north - south)) * boxHeight;

  const loadFile = async (file: File) => {
    setLoadNote(null);
    try {
      const parsed = JSON.parse(await file.text());
      const response = await rerunRecord(parsed);
      setLoadNote(
        response.reproduced
          ? { tone: "ok", text: "Re-run complete: every number in the file was reproduced from its stored data." }
          : { tone: "bad", text: `Re-run complete, but ${response.differences.length} value(s) differ from the file, starting with ${response.differences[0]}.` },
      );
      onLoaded(response.record);
    } catch (error) {
      const cause = error instanceof RequestFailed ? error.failure.cause : "That file is not a readable Long Watch record.";
      setLoadNote({ tone: "bad", text: cause });
    }
  };

  return (
    <div className="sheet">
      <section>
        <h3>Place</h3>
        <dl>
          <div>
            <dt>Name</dt>
            <dd>{place.name}</dd>
          </div>
          {record.case.kind === "power" && (
            <div>
              <dt>Point</dt>
              <dd className="num">{coordinates(place.latitude, place.longitude)}</dd>
            </div>
          )}
          <div>
            <dt>Footprint</dt>
            <dd className="num">
              {west.toFixed(3)}° to {east.toFixed(3)}° · {south.toFixed(3)}° to {north.toFixed(3)}°
            </dd>
          </div>
          <div>
            <dt>Extent</dt>
            <dd>
              <svg width={boxWidth + 2} height={boxHeight + 2} className="footprint" aria-hidden="true">
                <rect x={1} y={1} width={boxWidth} height={boxHeight} />
                {record.case.kind === "power" && (
                  <>
                    <line x1={px + 1} x2={px + 1} y1={1} y2={boxHeight + 1} />
                    <line x1={1} x2={boxWidth + 1} y1={py + 1} y2={py + 1} />
                    <circle cx={px + 1} cy={py + 1} r={2.5} />
                  </>
                )}
              </svg>
              {footprintSize(place.footprint)}. {place.footprint_note}
            </dd>
          </div>
        </dl>
      </section>

      <section>
        <h3>Dataset</h3>
        <dl>
          <div>
            <dt>Variable</dt>
            <dd>
              {variable.name} <span className="num">({variable.units})</span>
            </dd>
          </div>
          <div>
            <dt>Parameter</dt>
            <dd className="num">{provenance.parameter}</dd>
          </div>
          <div>
            <dt>Source</dt>
            <dd>{provenance.source}</dd>
          </div>
          <div>
            <dt>Type</dt>
            <dd className="sheet-kind">{provenance.source_kind}</dd>
          </div>
          <div>
            <dt>Product</dt>
            <dd>{provenance.product}</dd>
          </div>
          <div>
            <dt>Window</dt>
            <dd className="num">{provenance.analysis_window ?? "none usable"}</dd>
          </div>
          <div>
            <dt>Months</dt>
            <dd className="num">
              {provenance.months_used} of {provenance.months_expected} used · {provenance.months_missing} missing
            </dd>
          </div>
        </dl>
      </section>

      <section>
        <h3>Retrieval</h3>
        <dl>
          <div>
            <dt>Retrieved</dt>
            <dd className="num">{timestamp(provenance.retrieved_at)}</dd>
          </div>
          <div>
            <dt>Served</dt>
            <dd>
              {provenance.served_from === "live" && "Live from NASA"}
              {provenance.served_from === "cache" && "Stored copy of that retrieval"}
              {provenance.served_from === "bundled export" && "Bundled Giovanni export"}
              {provenance.served_from === "record snapshot" && "Loaded record file"}
            </dd>
          </div>
          <div>
            <dt>Request</dt>
            <dd>
              <a href={provenance.request_url} target="_blank" rel="noreferrer" className="sheet-link num">
                {provenance.request_url}
              </a>
            </dd>
          </div>
        </dl>
      </section>

      <section>
        <h3>Preparation</h3>
        <ol className="sheet-steps">
          {provenance.preprocessing.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>

      <section>
        <h3>Methods</h3>
        <dl>
          {Object.entries(provenance.methods)
            .filter(([, value]) => typeof value === "string")
            .map(([name, value]) => (
              <div key={name}>
                <dt>{name.replace(/_/g, " ")}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          <div>
            <dt>software</dt>
            <dd className="num">
              {Object.entries(provenance.software)
                .map(([name, version]) => `${name} ${version}`)
                .join(" · ")}
            </dd>
          </div>
        </dl>
      </section>

      {revealed && record.result && record.result.start_year_sensitivity.length > 1 && (
        <section>
          <h3>Start-year sensitivity</h3>
          <p className="sheet-note">The same analysis with the record started later. Each row is a shorter window ending in {record.coverage.last_year}.</p>
          <table className="sheet-table">
            <thead>
              <tr>
                <th scope="col">Start</th>
                <th scope="col">Years</th>
                <th scope="col">Rate / decade</th>
                <th scope="col">95% interval</th>
                <th scope="col">State</th>
              </tr>
            </thead>
            <tbody>
              {record.result.start_year_sensitivity.map((row) => (
                <tr key={row.start_year}>
                  <td className="num">{row.start_year}</td>
                  <td className="num">{row.years}</td>
                  <td className="num">{signed(row.slope, record.case.variable.decimals)}</td>
                  <td className="num">{interval(row.ci_low, row.ci_high, record.case.variable.decimals)}</td>
                  <td>{SHORT_STATE[row.verdict]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section>
        <h3>Limits</h3>
        <ol className="sheet-steps">
          {record.text.caveats.map((caveat) => (
            <li key={caveat}>{caveat}</li>
          ))}
        </ol>
      </section>

      <section className="sheet-actions">
        <h3>Export</h3>
        {revealed ? (
          <>
            <button className="text-button" onClick={() => void downloadCard(record)}>
              Case card (PNG)
            </button>
            <button className="text-button" onClick={() => downloadJson(record)}>
              Reproducible record (JSON)
            </button>
            <button className="text-button" onClick={() => downloadCsv(record)}>
              Monthly series (CSV)
            </button>
          </>
        ) : (
          <p className="sheet-note">Available after the replay has run.</p>
        )}
        <button className="text-button" onClick={() => fileInput.current?.click()}>
          Load record and re-run
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          tabIndex={-1}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void loadFile(file);
            event.target.value = "";
          }}
        />
        {loadNote && (
          <p className={loadNote.tone === "ok" ? "sheet-note sheet-ok" : "sheet-note sheet-bad"} role="status">
            {loadNote.text}
          </p>
        )}
      </section>
    </div>
  );
}
