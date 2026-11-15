import { FunnelStrip } from "../charts/FunnelStrip";
import { VERDICT_LABEL, interval, isDetected, signed } from "../lib/format";
import type { CaseRecord, Catalog } from "../types";
import { VerdictMark } from "./VerdictMark";

interface Props {
  entries: CaseRecord[];
  activeId: string;
  catalog: Catalog;
  onOpen: (record: CaseRecord) => void;
  onAskHere: (variableId: string) => void;
  onNewPlace: () => void;
}

export function Logbook({ entries, activeId, catalog, onOpen, onAskHere, onNewPlace }: Props) {
  const active = entries.find((entry) => entry.id === activeId);
  const tested = entries.filter((entry) => entry.result !== null);
  const years: [number, number] = [
    Math.min(...entries.map((entry) => entry.coverage.first_year ?? 9999)),
    Math.max(...entries.map((entry) => (entry.coverage.last_year ?? 0) + 1)),
  ];
  const asked = new Set(
    entries
      .filter((entry) => active && entry.case.place.name === active.case.place.name)
      .map((entry) => entry.case.variable.id),
  );
  const others = active?.case.kind === "power" ? catalog.variables.filter((v) => v.live && !asked.has(v.id)) : [];
  const expectedFalseAlarms = tested.length * 0.05;

  return (
    <section className="logbook" aria-labelledby="logbook-title">
      <header>
        <h2 className="label" id="logbook-title">
          Session logbook
        </h2>
        <p className="logbook-count">
          {tested.length} {tested.length === 1 ? "test" : "tests"} run this session. At a 5% significance level, chance
          alone would be expected to flag about {expectedFalseAlarms.toFixed(2)} of them even if nothing were changing.
        </p>
      </header>

      <ol className="logbook-rows">
        {entries.map((entry, index) => {
          const variable = entry.case.variable;
          const result = entry.result;
          return (
            <li key={entry.id} className={entry.id === activeId ? "logbook-row logbook-row-on" : "logbook-row"}>
              <div className="logbook-id">
                <span className="num">{String(index + 1).padStart(2, "0")}</span>
                <button className="logbook-open" onClick={() => onOpen(entry)} aria-current={entry.id === activeId}>
                  <span className="logbook-place">{entry.case.place.name}</span>
                  <span className="logbook-question">{variable.question}</span>
                </button>
              </div>
              <div className="logbook-verdict">
                <span className={result && isDetected(result.verdict) ? "logbook-label logbook-label-on" : "logbook-label"}>
                  <VerdictMark verdict={result?.verdict ?? "not_enough_data"} size={15} />
                  {VERDICT_LABEL[result?.verdict ?? "not_enough_data"]}
                </span>
                {result && (
                  <span className="num">
                    {signed(result.rank.slope, variable.decimals)} {variable.units}/decade
                    <br />
                    <small>{interval(result.rank.ci_low, result.rank.ci_high, variable.decimals)}</small>
                  </span>
                )}
                {result?.detection.detection_year != null && <span className="logbook-since">
                    {result.detection.at_first_endpoint ? "by" : "since"} {result.detection.detection_year}
                  </span>}
              </div>
              <div className="logbook-strip">
                {result ? <FunnelStrip record={entry} height={74} years={years} showStamp /> : <p className="sheet-note">{entry.coverage.reason}</p>}
              </div>
            </li>
          );
        })}
        <li className="logbook-axis" aria-hidden="true">
          <div />
          <div />
          <div className="logbook-years num">
            <span>{years[0]}</span>
            <span>each ribbon has its own vertical scale; all share this time axis</span>
            <span>{years[1] - 1}</span>
          </div>
        </li>
      </ol>

      <div className="logbook-next">
        {others.length > 0 && (
          <div>
            <p className="label">Same place, another question</p>
            <ul>
              {others.map((variable) => (
                <li key={variable.id}>
                  <button className="text-button" onClick={() => onAskHere(variable.id)}>
                    {variable.question}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div>
          <p className="label">Somewhere else</p>
          <button className="text-button" onClick={onNewPlace}>
            Choose another place
          </button>
        </div>
      </div>
    </section>
  );
}
