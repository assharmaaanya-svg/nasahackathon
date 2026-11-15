import { useCallback, useEffect, useRef, useState } from "react";

import { Discovery } from "./components/Discovery";
import { Evidence, type Phase } from "./components/Evidence";
import { Logbook } from "./components/Logbook";
import { Methods } from "./components/Methods";
import { CallStep, PlaceStep, QuestionStep, type PlaceChoice } from "./components/Steps";
import { Wordmark } from "./components/VerdictMark";
import { RequestFailed, fetchCase, fetchCatalog } from "./lib/api";
import { usePrefersReducedMotion } from "./lib/useReplay";
import type { ApiFailure, CaseRecord, CaseRequest, Catalog, Prediction } from "./types";

type Mode = "discovery" | "observatory";
type Stage = "place" | "question" | "call" | "evidence";

interface Investigation {
  key: string;
  request: CaseRequest;
  status: "loading" | "ready" | "error";
  record?: CaseRecord;
  failure?: ApiFailure;
  prediction?: Prediction;
  phase: Phase;
  frame?: number;
}

const STORED_EXAMPLE: CaseRequest = { kind: "power", latitude: 40.42, longitude: -3.7, name: "Madrid", variableId: "temperature" };

function keyOf(request: CaseRequest): string {
  return request.kind === "region"
    ? `region/${request.regionId}`
    : `point/${request.latitude?.toFixed(2)},${request.longitude?.toFixed(2)}/${request.variableId}`;
}

function toHash(request: CaseRequest, mode: Mode): string {
  const prefix = mode === "observatory" ? "#/observatory" : "#";
  if (request.kind === "region") return `${prefix}/region/${request.regionId}`;
  if (request.latitude === undefined) return prefix;
  const name = request.name ? `/${encodeURIComponent(request.name)}` : "";
  return `${prefix}/point/${request.latitude},${request.longitude}/${request.variableId}${name}`;
}

function fromHash(hash: string): { request: CaseRequest | null; mode: Mode } {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  const mode: Mode = parts[0] === "observatory" ? "observatory" : "discovery";
  if (parts[0] === "observatory") parts.shift();
  if (parts[0] === "region" && parts[1]) return { mode, request: { kind: "region", regionId: parts[1], variableId: "no2" } };
  if (parts[0] === "point" && parts[1] && parts[2]) {
    const [latitude, longitude] = parts[1].split(",").map(Number);
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      return {
        mode,
        request: { kind: "power", latitude, longitude, variableId: parts[2], name: parts[3] ? decodeURIComponent(parts[3]) : undefined },
      };
    }
  }
  return { mode, request: null };
}

export function App() {
  const reducedMotion = usePrefersReducedMotion();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [catalogFailure, setCatalogFailure] = useState<ApiFailure | null>(null);
  const [mode, setMode] = useState<Mode>("discovery");
  const [stage, setStage] = useState<Stage>("place");
  const [place, setPlace] = useState<PlaceChoice | null>(null);
  const [investigations, setInvestigations] = useState<Investigation[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [companionKey, setCompanionKey] = useState<string | null>(null);
  const [methodsOpen, setMethodsOpen] = useState(false);
  const started = useRef(false);
  const modeRef = useRef<Mode>("discovery");
  modeRef.current = mode;
  const listRef = useRef<Investigation[]>([]);
  listRef.current = investigations;

  const patch = useCallback((key: string, change: Partial<Investigation>) => {
    setInvestigations((list) => list.map((item) => (item.key === key ? { ...item, ...change } : item)));
  }, []);

  const begin = useCallback(
    (request: CaseRequest, keepCompanion = false) => {
      const key = keyOf(request);
      if (!keepCompanion) setCompanionKey(null);
      const existing = listRef.current.find((item) => item.key === key);
      const usable = existing !== undefined && existing.status !== "error";
      setActiveKey(key);
      window.history.replaceState(null, "", toHash(request, modeRef.current));
      window.scrollTo({ top: 0 });
      setStage(usable && existing.prediction ? "evidence" : "call");
      if (usable) return;
      setInvestigations((list) => [...list.filter((item) => item.key !== key), { key, request, status: "loading", phase: "measured" }]);
      fetchCase(request).then(
        (record) => patch(key, { status: "ready", record }),
        (error) =>
          patch(key, {
            status: "error",
            failure:
              error instanceof RequestFailed
                ? error.failure
                : { step: "Analysing the record", cause: "Something unexpected went wrong.", advice: null },
          }),
      );
    },
    [patch],
  );

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    fetchCatalog().then(setCatalog, (error) =>
      setCatalogFailure(error instanceof RequestFailed ? error.failure : { step: "Loading", cause: "Unknown failure.", advice: null }),
    );
    const followHash = () => {
      const linked = fromHash(window.location.hash);
      setMode(linked.mode);
      modeRef.current = linked.mode;
      if (linked.request) {
        setCompanionKey(null);
        begin(linked.request);
      }
    };
    followHash();
    window.addEventListener("hashchange", followHash);
  }, [begin]);

  const active = investigations.find((item) => item.key === activeKey) ?? null;
  const companion = investigations.find((item) => item.key === companionKey) ?? null;
  const revealed = investigations.filter((item) => item.record && item.phase === "result").map((item) => item.record as CaseRecord);

  const switchMode = (next: Mode) => {
    setMode(next);
    modeRef.current = next;
    if (next === "observatory") {
      if (active?.prediction) setStage("evidence");
      else if (active) setStage("call");
      else if (place) setStage("question");
      else setStage("place");
    }
    window.history.replaceState(null, "", active ? toHash(active.request, next) : next === "observatory" ? "#/observatory" : window.location.pathname);
    window.scrollTo({ top: 0 });
  };

  const choosePlace = (choice: PlaceChoice | null) => {
    setPlace(choice);
    if (mode === "discovery") {
      setActiveKey(null);
      setCompanionKey(null);
      window.history.replaceState(null, "", window.location.pathname);
    }
  };

  const openRecord = (record: CaseRecord) => {
    const target = investigations.find((item) => item.record?.id === record.id);
    if (!target) return;
    setCompanionKey(null);
    setActiveKey(target.key);
    window.history.replaceState(null, "", toHash(target.request, mode));
    window.scrollTo({ top: 0 });
  };

  const adoptLoaded = (record: CaseRecord) => {
    const key = `loaded/${record.id}`;
    const request: CaseRequest = { kind: "power", variableId: record.case.variable.id };
    setInvestigations((list) => [...list.filter((item) => item.key !== key), { key, request, status: "ready", record, phase: "measured" }]);
    setCompanionKey(null);
    setActiveKey(key);
    setStage("call");
    window.scrollTo({ top: 0 });
  };

  const variableFor = (item: Investigation) => catalog?.variables.find((v) => v.id === item.request.variableId) ?? item.record?.case.variable;
  const placeNameFor = (item: Investigation) =>
    item.record?.case.place.name ??
    item.request.name ??
    catalog?.regions.find((r) => r.id === item.request.regionId)?.name ??
    `${item.request.latitude}, ${item.request.longitude}`;

  const asDiscovery = (item: Investigation | null) => (item ? { ...item, revealed: item.phase === "result" } : null);

  return (
    <>
      <header className="masthead">
        <button onClick={() => (mode === "discovery" ? choosePlace(null) : switchMode("discovery"))} aria-label="The Long Watch, start">
          <Wordmark />
        </button>
        <div className="mode-switch" role="group" aria-label="View">
          <button aria-pressed={mode === "discovery"} onClick={() => switchMode("discovery")}>
            Discovery
          </button>
          <button aria-pressed={mode === "observatory"} onClick={() => switchMode("observatory")}>
            Observatory
          </button>
        </div>
        <nav className="masthead-nav" aria-label="Investigation">
          <button className="text-button" onClick={() => setMethodsOpen(true)}>
            Methods
          </button>
        </nav>
      </header>

      {catalogFailure && !catalog && (
        <div className="page">
          <div className="notice step-head" role="alert">
            <p className="label">{catalogFailure.step}</p>
            <p>{catalogFailure.cause}</p>
            {catalogFailure.advice && <p>{catalogFailure.advice}</p>}
          </div>
        </div>
      )}

      {mode === "discovery" && (
        <Discovery
          catalog={catalog}
          place={place}
          active={asDiscovery(active)}
          companion={asDiscovery(companion)}
          reducedMotion={reducedMotion}
          onPlace={choosePlace}
          onAsk={(request, pair) => {
            const pairWith = pair && activeKey !== keyOf(request) ? activeKey : null;
            begin(request, true);
            setCompanionKey(pairWith);
          }}
          onCall={(key, prediction) => patch(key, { prediction })}
          onRevealed={(keys) => keys.forEach((key) => patch(key, { phase: "result" }))}
          onFrame={(key, frame) => patch(key, { frame })}
          onObservatory={() => switchMode("observatory")}
          onRetry={(request) => begin(request)}
        />
      )}

      {mode === "observatory" && stage === "place" && catalog && (
        <PlaceStep catalog={catalog} choice={place} onChoose={(choice) => {
            setPlace(choice);
            setCompanionKey(null);
          }} onContinue={() => setStage("question")} reducedMotion={reducedMotion} />
      )}

      {mode === "observatory" && stage === "question" && catalog && place && <QuestionStep catalog={catalog} choice={place} onAsk={(request) => begin(request)} />}

      {mode === "observatory" && stage === "call" && active && variableFor(active) && (
        <CallStep
          variable={variableFor(active)!}
          placeName={placeNameFor(active)}
          status={active.status}
          monthCount={active.record ? active.record.series.raw.filter((v) => v !== null).length : null}
          kind={active.request.kind}
          onCall={(prediction) => {
            patch(active.key, { prediction });
            setStage("evidence");
            window.scrollTo({ top: 0 });
          }}
        />
      )}

      {mode === "observatory" && stage === "evidence" && active && (
        <main className="page">
          {active.status === "loading" && (
            <div className="step-head">
              <h1>Retrieving the record…</h1>
              <p className="num">
                {active.request.kind === "power"
                  ? "Asking NASA POWER (power.larc.nasa.gov) for every month since 1981 at this point."
                  : "Reading the bundled NASA Giovanni export for this region."}
              </p>
            </div>
          )}
          {active.status === "error" && active.failure && (
            <div className="step-head">
              <h1>This record could not be retrieved.</h1>
              <div className="notice" role="alert">
                <p className="label">Failed step: {active.failure.step}</p>
                <p>{active.failure.cause}</p>
                {active.failure.advice && <p>{active.failure.advice}</p>}
              </div>
              <div className="narration-actions" style={{ marginTop: 28 }}>
                <button className="action" onClick={() => begin(active.request)}>
                  Try again <span className="arrow" />
                </button>
                <button className="text-button" onClick={() => begin(STORED_EXAMPLE)}>
                  Open a stored example instead
                </button>
              </div>
            </div>
          )}
          {active.status === "ready" && active.record && active.prediction && (
            <div className="workspace">
              <Evidence
                key={active.key}
                record={active.record}
                prediction={active.prediction}
                phase={active.phase}
                initialFrame={active.frame}
                onFrame={(frame) => patch(active.key, { frame })}
                onPhase={(phase) => patch(active.key, { phase })}
                onLoaded={adoptLoaded}
                onChangeRecord={() => setStage("place")}
                reducedMotion={reducedMotion}
              />
              {active.phase === "result" && catalog && (
                <Logbook
                  entries={revealed}
                  activeId={active.record.id}
                  catalog={catalog}
                  onOpen={openRecord}
                  onAskHere={(variableId) => begin({ ...active.request, variableId })}
                  onNewPlace={() => setStage("place")}
                />
              )}
            </div>
          )}
        </main>
      )}

      {methodsOpen && <Methods onClose={() => setMethodsOpen(false)} />}
    </>
  );
}
