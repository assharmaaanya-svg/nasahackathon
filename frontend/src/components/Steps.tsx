import { useState } from "react";

import { coordinates, footprintSize } from "../lib/format";
import type { Bounds, CaseRequest, Catalog, Place, Prediction, Region, Variable } from "../types";
import { VerdictMark } from "./VerdictMark";
import { WorldMap } from "./WorldMap";

export interface PlaceChoice {
  kind: "point" | "region";
  name: string;
  latitude: number;
  longitude: number;
  region?: Region;
  named: boolean;
}

export function merraCell(latitude: number, longitude: number): Bounds {
  const latCentre = Math.round(latitude / 0.5) * 0.5;
  const lonCentre = Math.round((longitude + 180) / 0.625) * 0.625 - 180;
  return { west: lonCentre - 0.3125, south: latCentre - 0.25, east: lonCentre + 0.3125, north: latCentre + 0.25 };
}

interface PlaceStepProps {
  catalog: Catalog;
  choice: PlaceChoice | null;
  onChoose: (choice: PlaceChoice | null) => void;
  onContinue: () => void;
  reducedMotion: boolean;
}

export function PlaceStep({ catalog, choice, onChoose, onContinue, reducedMotion }: PlaceStepProps) {
  const [latText, setLatText] = useState("");
  const [lonText, setLonText] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const pickPlace = (place: Place) =>
    onChoose({ kind: "point", name: place.name, latitude: place.lat, longitude: place.lon, named: true });
  const pickPoint = (latitude: number, longitude: number) => {
    const lat = Math.round(latitude * 100) / 100;
    const lon = Math.round(longitude * 100) / 100;
    onChoose({ kind: "point", name: coordinates(lat, lon), latitude: lat, longitude: lon, named: false });
  };
  const pickRegion = (region: Region) =>
    onChoose({
      kind: "region",
      name: region.name,
      latitude: (region.south + region.north) / 2,
      longitude: (region.west + region.east) / 2,
      region,
      named: true,
    });

  const submitCoordinates = (event: React.FormEvent) => {
    event.preventDefault();
    const lat = Number(latText);
    const lon = Number(lonText);
    if (latText.trim() === "" || lonText.trim() === "" || Number.isNaN(lat) || Number.isNaN(lon)) {
      setFormError("Enter both numbers, for example 48.86 and 2.35.");
      return;
    }
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      setFormError("Latitude runs from −90 to 90 and longitude from −180 to 180.");
      return;
    }
    setFormError(null);
    pickPoint(lat, lon);
  };

  const footprint: Bounds | null = choice ? (choice.region ?? merraCell(choice.latitude, choice.longitude)) : null;

  return (
    <main className="page">
      <header className="step-head">
        <h1>Where on Earth should we look?</h1>
        <p>
          Click the map, pick a city from the index, or type coordinates. NASA's records describe areas, not street
          corners: the outlined box shows the patch of Earth your record will stand for.
        </p>
      </header>
      <div className="place-layout">
        <div className="place-map">
          <WorldMap
            places={catalog.places}
            regions={catalog.regions}
            point={choice ? { latitude: choice.latitude, longitude: choice.longitude } : null}
            footprint={footprint}
            onPick={pickPoint}
            onPickPlace={pickPlace}
            reducedMotion={reducedMotion}
          />
          <div className="place-selection" aria-live="polite">
            {choice ? (
              <>
                <div>
                  <p className="label">Selected</p>
                  <p className="place-name">{choice.name}</p>
                  <p className="num place-coords">
                    {choice.kind === "region" && footprint
                      ? `${footprint.west}° to ${footprint.east}° E, ${footprint.south}° to ${footprint.north}° N`
                      : coordinates(choice.latitude, choice.longitude)}
                  </p>
                </div>
                <p className="place-footprint">
                  {choice.kind === "region"
                    ? `A fixed satellite region, ${footprint ? footprintSize(footprint) : ""}, averaged by NASA Giovanni.`
                    : `Your record will describe the grid cell around this point, ${footprint ? footprintSize(footprint) : ""}, not the city alone.`}
                </p>
                <button className="action" onClick={onContinue}>
                  Choose a question <span className="arrow" />
                </button>
              </>
            ) : (
              <p className="place-footprint">No place selected yet.</p>
            )}
          </div>
        </div>
        <aside className="place-index">
          <h2 className="label">Index of cities</h2>
          <ul className="city-list">
            {catalog.places.map((place) => (
              <li key={place.id}>
                <button
                  onClick={() => pickPlace(place)}
                  aria-pressed={choice?.named === true && choice.name === place.name}
                  className={choice?.name === place.name ? "city city-on" : "city"}
                >
                  <span>{place.name}</span>
                  <span className="num">{coordinates(place.lat, place.lon)}</span>
                </button>
              </li>
            ))}
          </ul>

          <h2 className="label index-gap">Satellite regions</h2>
          <ul className="region-list">
            {catalog.regions.map((region) =>
              region.available ? (
                <li key={region.id}>
                  <button onClick={() => pickRegion(region)} className={choice?.region?.id === region.id ? "city city-on" : "city"}>
                    <span>{region.name}</span>
                    <span className="num">
                      OMI NO₂ · {region.product} v{region.version}
                    </span>
                  </button>
                </li>
              ) : (
                <li key={region.id} className="region-missing">
                  <span>{region.name}</span>
                  <span>no export supplied in this build</span>
                </li>
              ),
            )}
          </ul>

          <h2 className="label index-gap">Coordinates</h2>
          <form className="coordinate-form" onSubmit={submitCoordinates} noValidate>
            <label>
              <span className="label">Latitude</span>
              <input className="num" inputMode="decimal" value={latText} onChange={(e) => setLatText(e.target.value)} placeholder="48.86" />
            </label>
            <label>
              <span className="label">Longitude</span>
              <input className="num" inputMode="decimal" value={lonText} onChange={(e) => setLonText(e.target.value)} placeholder="2.35" />
            </label>
            <button className="action action-quiet" type="submit">
              Set
            </button>
            {formError && (
              <p className="form-error" role="alert">
                {formError}
              </p>
            )}
          </form>
        </aside>
      </div>
    </main>
  );
}

interface QuestionStepProps {
  catalog: Catalog;
  choice: PlaceChoice;
  onAsk: (request: CaseRequest) => void;
}

export function QuestionStep({ catalog, choice, onAsk }: QuestionStepProps) {
  const isRegion = choice.kind === "region";
  const ask = (variable: Variable) => {
    if (isRegion && choice.region) onAsk({ kind: "region", regionId: choice.region.id, variableId: variable.id });
    else
      onAsk({
        kind: "power",
        latitude: choice.latitude,
        longitude: choice.longitude,
        name: choice.named ? choice.name : undefined,
        variableId: variable.id,
      });
  };
  return (
    <main className="page">
      <header className="step-head">
        <p className="label">{choice.name}</p>
        <h1>What do you suspect is changing?</h1>
        <p>Ask in plain words. Each question is answered by one NASA record, described beside it.</p>
      </header>
      <ol className="question-list">
        {catalog.variables.map((variable) => {
          const available = isRegion ? !variable.live : variable.live;
          const years = catalog.last_complete_year - variable.first_year + 1;
          return (
            <li key={variable.id} className={available ? "question" : "question question-off"}>
              <button disabled={!available} onClick={() => ask(variable)}>
                <span className="question-text">{variable.question}</span>
                <span className="question-detail">
                  <span className="question-variable">
                    {variable.name} <span className="num">({variable.units})</span>
                  </span>
                  <span className="question-definition">{variable.definition}</span>
                  {!available && (
                    <span className="question-why">
                      {isRegion
                        ? "Not part of this satellite region. Choose a city or a point to ask this."
                        : "Answered by satellite for curated regions only. Choose a region under “Satellite regions” to ask this."}
                    </span>
                  )}
                </span>
                <span className="question-source">
                  <span className="label">{variable.source_kind}</span>
                  <span className="num">
                    {variable.first_year}–{catalog.last_complete_year} · {years} yr
                  </span>
                  <span className="question-product">{variable.source_label}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </main>
  );
}

interface CallStepProps {
  variable: Variable;
  placeName: string;
  status: "loading" | "ready" | "error";
  monthCount: number | null;
  kind: "power" | "region";
  onCall: (prediction: Prediction) => void;
}

const CALLS: { id: Prediction; title: string; meaning: string; verdict: "detected_rising" | "detected_falling" | "not_detectable_yet" }[] = [
  { id: "rising", title: "Rising", meaning: "The record will show a detectable upward trend.", verdict: "detected_rising" },
  { id: "falling", title: "Falling", meaning: "The record will show a detectable downward trend.", verdict: "detected_falling" },
  { id: "none", title: "No detectable change", meaning: "Whatever is happening, the record cannot yet tell it from noise.", verdict: "not_detectable_yet" },
];

export function CallStep({ variable, placeName, status, monthCount, kind, onCall }: CallStepProps) {
  return (
    <main className="page">
      <header className="step-head">
        <p className="label">{placeName}</p>
        <h1>{variable.question}</h1>
        <p>
          Before you see a single measurement: what do you think the observations will show? Committing first is what
          separates testing an idea from finding a story in a chart.
        </p>
      </header>
      <div className="call-list" role="group" aria-label="Your prediction">
        {CALLS.map((call) => (
          <button key={call.id} className="call" onClick={() => onCall(call.id)}>
            <VerdictMark verdict={call.verdict} size={26} />
            <span className="call-title">{call.title}</span>
            <span className="call-meaning">{call.meaning}</span>
          </button>
        ))}
      </div>
      <p className="call-status num" aria-live="polite">
        {status === "loading" &&
          (kind === "power"
            ? "Asking NASA POWER for the monthly record at this point…"
            : "Reading the NASA Giovanni export for this region…")}
        {status === "ready" && `${monthCount} monthly values are ready. They stay hidden until you call it.`}
        {status === "error" && "The record could not be retrieved. Make your call to see what went wrong."}
      </p>
    </main>
  );
}
