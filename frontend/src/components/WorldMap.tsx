import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, MapLayerMouseEvent, MapMouseEvent, StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";

import { borders, land } from "../lib/world";
import type { Bounds, Place, Region } from "../types";

interface Props {
  places: Place[];
  regions: Region[];
  point: { latitude: number; longitude: number } | null;
  footprint: Bounds | null;
  onPick: (latitude: number, longitude: number) => void;
  onPickPlace: (place: Place) => void;
  reducedMotion: boolean;
}

maplibregl.setWorkerUrl(workerUrl);


function graticule(): GeoJSON.FeatureCollection {
  const lines: GeoJSON.Feature[] = [];
  for (let lon = -180; lon <= 180; lon += 30) {
    lines.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[lon, -85], [lon, 85]] } });
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    lines.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[-180, lat], [180, lat]] } });
  }
  return { type: "FeatureCollection", features: lines };
}

function box(bounds: Bounds, properties: GeoJSON.GeoJsonProperties = {}): GeoJSON.Feature {
  const { west, south, east, north } = bounds;
  return {
    type: "Feature",
    properties,
    geometry: { type: "Polygon", coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]] },
  };
}

function collection(features: GeoJSON.Feature[]): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features };
}

const STYLE: StyleSpecification = {
  version: 8,
  sources: {
    land: { type: "geojson", data: land as GeoJSON.GeoJSON },
    borders: { type: "geojson", data: borders as GeoJSON.GeoJSON },
    graticule: { type: "geojson", data: graticule() },
    regions: { type: "geojson", data: collection([]) },
    footprint: { type: "geojson", data: collection([]) },
    places: { type: "geojson", data: collection([]) },
    point: { type: "geojson", data: collection([]) },
  },
  layers: [
    { id: "sea", type: "background", paint: { "background-color": "#0f2a35" } },
    { id: "graticule", type: "line", source: "graticule", paint: { "line-color": "#1b3b47", "line-width": 1 } },
    { id: "land", type: "fill", source: "land", paint: { "fill-color": "#b7ab8a" } },
    { id: "coast", type: "line", source: "land", paint: { "line-color": "#efe7cf", "line-width": 0.8 } },
    { id: "borders", type: "line", source: "borders", paint: { "line-color": "#8c8369", "line-width": 0.6 } },
    { id: "regions", type: "line", source: "regions", paint: { "line-color": "#8fc1d4", "line-width": 1, "line-dasharray": [3, 2] } },
    { id: "footprint-fill", type: "fill", source: "footprint", paint: { "fill-color": "#ecede6", "fill-opacity": 0.12 } },
    { id: "footprint-line", type: "line", source: "footprint", paint: { "line-color": "#ecede6", "line-width": 1.2 } },
    {
      id: "places",
      type: "circle",
      source: "places",
      paint: { "circle-radius": 3.2, "circle-color": "#080c0d", "circle-stroke-color": "#ecede6", "circle-stroke-width": 1.2 },
    },
    {
      id: "point",
      type: "circle",
      source: "point",
      paint: { "circle-radius": 4.5, "circle-color": "#ecede6", "circle-stroke-color": "#080c0d", "circle-stroke-width": 1.5 },
    },
  ],
};

export function WorldMap({ places, regions, point, footprint, onPick, onPickPlace, reducedMotion }: Props) {
  const container = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [hover, setHover] = useState<{ name: string; x: number; y: number } | null>(null);
  const handlers = useRef({ onPick, onPickPlace, places });
  handlers.current = { onPick, onPickPlace, places };

  useEffect(() => {
    if (!container.current) return;
    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container: container.current,
        style: STYLE,
        center: [20, 22],
        zoom: 1.15,
        minZoom: 0.6,
        maxZoom: 6.5,
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
      });
    } catch {
      setFailed(true);
      return;
    }
    mapRef.current = map;
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    map.on("load", () => setReady(true));
    map.on("click", (event: MapMouseEvent) => {
      const hits = map.queryRenderedFeatures(event.point, { layers: ["places"] });
      const id = hits[0]?.properties?.id as string | undefined;
      const place = handlers.current.places.find((p) => p.id === id);
      if (place) handlers.current.onPickPlace(place);
      else handlers.current.onPick(Math.max(Math.min(event.lngLat.lat, 89), -89), event.lngLat.wrap().lng);
    });
    map.on("mousemove", "places", (event: MapLayerMouseEvent) => {
      map.getCanvas().style.cursor = "pointer";
      const name = event.features?.[0]?.properties?.name as string | undefined;
      if (name) setHover({ name, x: event.point.x, y: event.point.y });
    });
    map.on("mouseleave", "places", () => {
      map.getCanvas().style.cursor = "crosshair";
      setHover(null);
    });
    map.getCanvas().style.cursor = "crosshair";
    return () => {
      mapRef.current = null;
      map.remove();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    (map.getSource("places") as GeoJSONSource).setData(
      collection(
        places.map((place) => ({
          type: "Feature",
          properties: { id: place.id, name: place.name },
          geometry: { type: "Point", coordinates: [place.lon, place.lat] },
        })),
      ),
    );
    (map.getSource("regions") as GeoJSONSource).setData(
      collection(regions.filter((region) => region.available).map((region) => box(region))),
    );
  }, [places, regions, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    (map.getSource("point") as GeoJSONSource).setData(
      collection(
        point
          ? [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [point.longitude, point.latitude] } }]
          : [],
      ),
    );
    (map.getSource("footprint") as GeoJSONSource).setData(collection(footprint ? [box(footprint)] : []));
    if (point) {
      const target = { center: [point.longitude, point.latitude] as [number, number], zoom: Math.max(map.getZoom(), footprint && footprint.east - footprint.west > 1.5 ? 4.6 : 5.4) };
      if (reducedMotion) map.jumpTo(target);
      else map.easeTo({ ...target, duration: 900 });
    }
  }, [point, footprint, ready, reducedMotion]);

  if (failed) {
    return (
      <div className="map map-failed">
        <p>The interactive map needs WebGL, which this browser has turned off. Choose a place from the index or enter coordinates instead.</p>
      </div>
    );
  }

  return (
    <div className="map">
      <div ref={container} className="map-canvas" role="application" aria-label="World map. Click to choose a point; the place index beside the map offers the same choices by keyboard." />
      {hover && (
        <span className="map-hover" style={{ left: hover.x + 12, top: hover.y - 10 }}>
          {hover.name}
        </span>
      )}
      <p className="map-credit">Coastlines and borders: Natural Earth</p>
    </div>
  );
}
