import { geoOrthographic, geoPath, type GeoPermissibleObjects } from "d3-geo";
import { useEffect, useRef, useState } from "react";

import { subsolarPoint } from "../lib/sun";
import { createEarth, type Earth } from "./earthGL";
import { borders, lakes, lakesCoarse, land, landCoarse, rivers, riversCoarse } from "../lib/world";
import type { Bounds, Place, Region } from "../types";

export interface GlobeView {
  lon: number;
  lat: number;
  cx: number;
  cy: number;
  scale: number;
}

export interface Anchor {
  x: number;
  y: number;
  visible: boolean;
}

interface Props {
  width: number;
  height: number;
  view: GlobeView;
  spin: boolean;
  zoomable: boolean;
  zoomStep: { id: number; factor: number };
  labels: boolean;
  places: Place[];
  regions: Region[];
  point: { latitude: number; longitude: number } | null;
  footprint: Bounds | null;
  interactive: boolean;
  reducedMotion: boolean;
  onPick: (latitude: number, longitude: number) => void;
  onPickPlace: (place: Place) => void;
  onPickRegion: (region: Region) => void;
  onAnchor: (anchor: Anchor | null) => void;
  onCursor: (position: { latitude: number; longitude: number } | null) => void;
}

const TRAVEL_MS = 1700;
const SPIN_DEGREES_PER_SECOND = 1.6;
const LIGHT_SIZE = 220;
const MAX_ZOOM = 5;
const RAD = Math.PI / 180;
const COLOURS = {
  ocean: "#245c70",
  land: "#d9cca6",
  lake: "#2f6b80",
  river: "rgba(47,107,128,0.85)",
  coast: "rgba(20,24,22,0.55)",
  border: "rgba(64,54,34,0.38)",
  graticule: "rgba(236,237,230,0.09)",
  limb: "rgba(196,230,244,0.85)",
  chalk: "#f4f5f0",
  void: "#05080c",
  region: "#8ec8e8",
};

function ease(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function shortestTurn(from: number, to: number): number {
  return ((((to - from) % 360) + 540) % 360) - 180;
}

function ring(bounds: Bounds): GeoPermissibleObjects {
  const { west, south, east, north } = bounds;
  const steps = 12;
  const coordinates: [number, number][] = [];
  for (let i = 0; i <= steps; i += 1) coordinates.push([west, south + ((north - south) * i) / steps]);
  for (let i = 1; i <= steps; i += 1) coordinates.push([west + ((east - west) * i) / steps, north]);
  for (let i = 1; i <= steps; i += 1) coordinates.push([east, north - ((north - south) * i) / steps]);
  for (let i = 1; i <= steps; i += 1) coordinates.push([east - ((east - west) * i) / steps, south]);
  return { type: "Polygon", coordinates: [coordinates] };
}

function graticule(): GeoPermissibleObjects {
  const lines: [number, number][][] = [];
  for (let lon = -180; lon < 180; lon += 15) {
    const line: [number, number][] = [];
    for (let lat = -88; lat <= 88; lat += 2) line.push([lon, lat]);
    lines.push(line);
  }
  for (let lat = -75; lat <= 75; lat += 15) {
    const line: [number, number][] = [];
    for (let lon = -180; lon <= 180; lon += 2) line.push([lon, lat]);
    lines.push(line);
  }
  return { type: "MultiLineString", coordinates: lines };
}

const GRATICULE = graticule();

function towardViewer(lon: number, lat: number, view: GlobeView): [number, number, number] {
  const dLon = (lon - view.lon) * RAD;
  const phi = lat * RAD;
  const phi0 = view.lat * RAD;
  return [
    Math.cos(phi) * Math.sin(dLon),
    Math.cos(phi0) * Math.sin(phi) - Math.sin(phi0) * Math.cos(phi) * Math.cos(dLon),
    Math.sin(phi0) * Math.sin(phi) + Math.cos(phi0) * Math.cos(phi) * Math.cos(dLon),
  ];
}

function smoothstep(low: number, high: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
}

export function Globe(props: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const glCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const earthRef = useRef<Earth | null>(null);
  const lightRef = useRef<HTMLCanvasElement | null>(null);
  const current = useRef<GlobeView>(props.view);
  const zoom = useRef(1);
  const latest = useRef(props);
  latest.current = props;
  const travel = useRef<{ from: GlobeView; to: GlobeView; fromZoom: number; started: number } | null>(null);
  const drag = useRef<{ x: number; y: number; moved: boolean; time: number } | null>(null);
  const momentum = useRef({ lon: 0, lat: 0 });
  const userTurned = useRef(false);
  const lastAnchor = useRef<Anchor | null>(null);
  const settled = useRef(false);
  const [hover, setHover] = useState<{ name: string; x: number; y: number } | null>(null);
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<number | null>(null);
  const { width, height, view, reducedMotion } = props;

  useEffect(() => {
    userTurned.current = false;
    momentum.current = { lon: 0, lat: 0 };
    if (reducedMotion) {
      current.current = view;
      zoom.current = 1;
      travel.current = null;
    } else {
      travel.current = { from: { ...current.current, scale: current.current.scale * zoom.current }, to: view, fromZoom: zoom.current, started: performance.now() };
      zoom.current = 1;
      current.current = { ...current.current, scale: travel.current.from.scale };
    }
    settled.current = false;
  }, [view.lon, view.lat, view.cx, view.cy, view.scale, reducedMotion]);

  useEffect(() => {
    const glCanvas = glCanvasRef.current;
    if (!glCanvas) return;
    const earth = createEarth(glCanvas, window.innerWidth < 860, () => {
      settled.current = false;
    });
    earthRef.current = earth;
    return () => {
      earth?.dispose();
      earthRef.current = null;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    earthRef.current?.resize(width, height, ratio);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const context = canvas.getContext("2d");
    if (!context) return;
    if (!lightRef.current) {
      lightRef.current = document.createElement("canvas");
      lightRef.current.width = LIGHT_SIZE;
      lightRef.current.height = LIGHT_SIZE;
    }
    const lightContext = lightRef.current.getContext("2d");
    const lightImage = lightContext?.createImageData(LIGHT_SIZE, LIGHT_SIZE) ?? null;
    settled.current = false;
    let handle = 0;
    let previous = performance.now();

    const renderLight = (now: GlobeView) => {
      if (!lightContext || !lightImage) return;
      const [sunLon, sunLat] = subsolarPoint(new Date());
      const [sx, sy, sz] = towardViewer(sunLon, sunLat, now);
      const data = lightImage.data;
      for (let j = 0; j < LIGHT_SIZE; j += 1) {
        const py = 1 - ((j + 0.5) / LIGHT_SIZE) * 2;
        for (let i = 0; i < LIGHT_SIZE; i += 1) {
          const px = ((i + 0.5) / LIGHT_SIZE) * 2 - 1;
          const r2 = px * px + py * py;
          const offset = (j * LIGHT_SIZE + i) * 4;
          if (r2 > 1) {
            data[offset + 3] = 255;
            data[offset] = 5;
            data[offset + 1] = 8;
            data[offset + 2] = 10;
            continue;
          }
          const pz = Math.sqrt(1 - r2);
          const day = smoothstep(-0.12, 0.32, sx * px + sy * py + sz * pz);
          const limb = 0.5 + 0.5 * Math.pow(pz, 0.55);
          const brightness = (0.17 + 0.83 * day) * limb;
          data[offset] = 5;
          data[offset + 1] = 8;
          data[offset + 2] = 10;
          data[offset + 3] = Math.round((1 - brightness) * 255);
        }
      }
      lightContext.putImageData(lightImage, 0, 0);
    };

    const draw = (detail: boolean) => {
      const base = current.current;
      const now = { ...base, scale: base.scale * zoom.current };
      const state = latest.current;
      const projection = geoOrthographic()
        .rotate([-now.lon, -now.lat])
        .translate([now.cx, now.cy])
        .scale(now.scale)
        .clipAngle(90)
        .precision(0.3);
      const path = geoPath(projection, context);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);

      const earth = earthRef.current;
      const imagery = earth !== null && earth.ready();
      if (imagery && earth) {
        earth.render(now, subsolarPoint(new Date()));
        context.beginPath();
        path(GRATICULE);
        context.strokeStyle = "rgba(244,245,240,0.07)";
        context.lineWidth = 1;
        context.stroke();
        if (now.scale > 700) {
          context.beginPath();
          path(borders);
          context.strokeStyle = "rgba(244,245,240,0.3)";
          context.lineWidth = 0.8;
          context.stroke();
        }
      } else {
        const halo = context.createRadialGradient(now.cx, now.cy, now.scale * 0.99, now.cx, now.cy, now.scale * 1.06);
        halo.addColorStop(0, "rgba(159,214,238,0.42)");
        halo.addColorStop(0.3, "rgba(159,214,238,0.14)");
        halo.addColorStop(1, "rgba(159,214,238,0)");
        context.beginPath();
        context.arc(now.cx, now.cy, now.scale * 1.06, 0, Math.PI * 2);
        context.fillStyle = halo;
        context.fill();

        context.beginPath();
        path({ type: "Sphere" });
        context.fillStyle = COLOURS.ocean;
        context.fill();

        const fine = detail || now.scale > 900;
        context.beginPath();
        path(fine ? land : landCoarse);
        context.fillStyle = COLOURS.land;
        context.fill();
        context.strokeStyle = COLOURS.coast;
        context.lineWidth = 0.8;
        context.stroke();

        context.beginPath();
        path(fine ? lakes : lakesCoarse);
        context.fillStyle = COLOURS.lake;
        context.fill();
        if (now.scale > 420) {
          context.beginPath();
          path(fine ? rivers : riversCoarse);
          context.strokeStyle = COLOURS.river;
          context.lineWidth = now.scale > 1400 ? 1.1 : 0.7;
          context.stroke();
        }
        if (now.scale > 700) {
          context.beginPath();
          path(borders);
          context.strokeStyle = COLOURS.border;
          context.lineWidth = 0.8;
          context.stroke();
        }

        context.beginPath();
        path(GRATICULE);
        context.strokeStyle = COLOURS.graticule;
        context.lineWidth = 1;
        context.stroke();

        renderLight(now);
        if (lightRef.current) {
          context.save();
          context.beginPath();
          path({ type: "Sphere" });
          context.clip();
          context.imageSmoothingEnabled = true;
          context.drawImage(lightRef.current, now.cx - now.scale, now.cy - now.scale, now.scale * 2, now.scale * 2);
          context.restore();
        }

        context.beginPath();
        path({ type: "Sphere" });
        context.strokeStyle = COLOURS.limb;
        context.lineWidth = 1.1;
        context.stroke();
      }

      const facing = (lon: number, lat: number) => towardViewer(lon, lat, now)[2] > 0.04;
      const taken: [number, number][] = [];
      const label = (text: string, x: number, y: number) => {
        if (taken.some(([tx, ty]) => Math.abs(tx - x) < 76 && Math.abs(ty - y) < 15)) return;
        taken.push([x, y]);
        context.font = "600 13px 'Barlow Semi Condensed', sans-serif";
        context.lineWidth = 3;
        context.strokeStyle = "rgba(8,12,13,0.85)";
        context.strokeText(text, x + 8, y + 4);
        context.fillStyle = COLOURS.chalk;
        context.fillText(text, x + 8, y + 4);
      };

      state.regions
        .filter((region) => region.available)
        .forEach((region) => {
          context.beginPath();
          path(ring(region));
          context.strokeStyle = "rgba(8,12,13,0.8)";
          context.lineWidth = 3;
          context.stroke();
          context.strokeStyle = COLOURS.region;
          context.lineWidth = 1.4;
          context.stroke();
          const lon = (region.west + region.east) / 2;
          const lat = (region.south + region.north) / 2;
          const xy = projection([lon, lat]);
          if (state.labels && xy && facing(lon, lat)) label(region.name, xy[0] + (now.scale * (region.east - region.west) * RAD) / 2, xy[1]);
        });

      state.places.forEach((place) => {
        if (!facing(place.lon, place.lat)) return;
        const xy = projection([place.lon, place.lat]);
        if (!xy) return;
        context.beginPath();
        context.arc(xy[0], xy[1], 3.4, 0, Math.PI * 2);
        context.fillStyle = COLOURS.void;
        context.fill();
        context.strokeStyle = COLOURS.chalk;
        context.lineWidth = 1.4;
        context.stroke();
        if (state.labels) label(place.name, xy[0], xy[1]);
      });

      if (state.footprint) {
        context.beginPath();
        path(ring(state.footprint));
        context.fillStyle = "rgba(8,12,13,0.28)";
        context.fill();
        context.strokeStyle = "rgba(8,12,13,0.9)";
        context.lineWidth = 3.6;
        context.stroke();
        context.strokeStyle = COLOURS.chalk;
        context.lineWidth = 1.5;
        context.stroke();
      }
      let anchor: Anchor | null = null;
      if (state.point) {
        const xy = projection([state.point.longitude, state.point.latitude]);
        const visible = facing(state.point.longitude, state.point.latitude);
        if (xy) {
          anchor = { x: xy[0], y: xy[1], visible };
          if (visible) {
            context.beginPath();
            context.arc(xy[0], xy[1], 3, 0, Math.PI * 2);
            context.fillStyle = COLOURS.chalk;
            context.fill();
            context.strokeStyle = COLOURS.void;
            context.lineWidth = 1.2;
            context.stroke();
          }
        }
      }
      const before = lastAnchor.current;
      const changed =
        (anchor === null) !== (before === null) ||
        (anchor !== null && before !== null && (Math.abs(anchor.x - before.x) > 0.5 || Math.abs(anchor.y - before.y) > 0.5 || anchor.visible !== before.visible));
      if (changed) {
        lastAnchor.current = anchor;
        state.onAnchor(anchor);
      }
    };

    const tick = (time: number) => {
      const elapsed = Math.min(time - previous, 80);
      previous = time;
      const state = latest.current;
      let moving = false;
      const journey = travel.current;
      if (journey) {
        const progress = Math.min((time - journey.started) / TRAVEL_MS, 1);
        const k = ease(progress);
        current.current = {
          lon: journey.from.lon + shortestTurn(journey.from.lon, journey.to.lon) * k,
          lat: journey.from.lat + (journey.to.lat - journey.from.lat) * k,
          cx: journey.from.cx + (journey.to.cx - journey.from.cx) * k,
          cy: journey.from.cy + (journey.to.cy - journey.from.cy) * k,
          scale: journey.from.scale * Math.pow(journey.to.scale / journey.from.scale, k),
        };
        moving = true;
        if (progress >= 1) travel.current = null;
      } else if (drag.current?.moved) {
        moving = true;
      } else if (Math.abs(momentum.current.lon) + Math.abs(momentum.current.lat) > 0.0004) {
        current.current = {
          ...current.current,
          lon: current.current.lon + momentum.current.lon * elapsed,
          lat: Math.max(-85, Math.min(85, current.current.lat + momentum.current.lat * elapsed)),
        };
        const decay = Math.pow(0.9, elapsed / 16);
        momentum.current = { lon: momentum.current.lon * decay, lat: momentum.current.lat * decay };
        moving = true;
      } else if (state.spin && !state.reducedMotion && !userTurned.current) {
        current.current = { ...current.current, lon: current.current.lon + (SPIN_DEGREES_PER_SECOND * elapsed) / 1000 };
        moving = true;
      }
      if (moving) {
        settled.current = false;
        draw(false);
      } else if (!settled.current) {
        settled.current = true;
        draw(true);
      }
      handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);

    const onWheel = (event: WheelEvent) => {
      if (!latest.current.zoomable) return;
      event.preventDefault();
      zoom.current = Math.max(1, Math.min(MAX_ZOOM, zoom.current * Math.exp(-event.deltaY * 0.0016)));
      userTurned.current = true;
      settled.current = false;
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      cancelAnimationFrame(handle);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, [width, height]);

  useEffect(() => {
    settled.current = false;
  }, [props.point, props.footprint, props.places, props.regions, props.labels]);

  useEffect(() => {
    if (props.zoomStep.id === 0) return;
    zoom.current = props.zoomStep.factor === 0 ? 1 : Math.max(1, Math.min(MAX_ZOOM, zoom.current * props.zoomStep.factor));
    userTurned.current = true;
    settled.current = false;
  }, [props.zoomStep.id]);

  const projectionNow = () => {
    const now = current.current;
    return geoOrthographic().rotate([-now.lon, -now.lat]).translate([now.cx, now.cy]).scale(now.scale * zoom.current).clipAngle(90);
  };

  const local = (event: React.PointerEvent) => {
    const box = canvasRef.current?.getBoundingClientRect();
    return { x: event.clientX - (box?.left ?? 0), y: event.clientY - (box?.top ?? 0) };
  };

  const onSphere = (x: number, y: number) => {
    const now = current.current;
    return Math.hypot(x - now.cx, y - now.cy) <= now.scale * zoom.current;
  };

  const nearestPlace = (x: number, y: number): Place | null => {
    const projection = projectionNow();
    const now = current.current;
    let best: Place | null = null;
    let bestDistance = 15;
    props.places.forEach((place) => {
      if (towardViewer(place.lon, place.lat, now)[2] <= 0.04) return;
      const xy = projection([place.lon, place.lat]);
      if (!xy) return;
      const distance = Math.hypot(xy[0] - x, xy[1] - y);
      if (distance < bestDistance) {
        best = place;
        bestDistance = distance;
      }
    });
    return best;
  };

  const regionAt = (lon: number, lat: number) =>
    props.regions.find((r) => r.available && lon >= r.west && lon <= r.east && lat >= r.south && lat <= r.north);

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!props.interactive) return;
    const { x, y } = local(event);
    touches.current.set(event.pointerId, { x, y });
    if (touches.current.size === 2) {
      const [a, b] = [...touches.current.values()];
      pinch.current = Math.hypot(a.x - b.x, a.y - b.y);
      drag.current = null;
      return;
    }
    drag.current = { x, y, moved: false, time: performance.now() };
    momentum.current = { lon: 0, lat: 0 };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!props.interactive) return;
    const { x, y } = local(event);
    if (touches.current.has(event.pointerId)) touches.current.set(event.pointerId, { x, y });
    if (touches.current.size === 2 && pinch.current !== null) {
      const [a, b] = [...touches.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (props.zoomable && pinch.current > 0) {
        zoom.current = Math.max(1, Math.min(MAX_ZOOM, (zoom.current * distance) / pinch.current));
        userTurned.current = true;
        settled.current = false;
      }
      pinch.current = distance;
      return;
    }
    const active = drag.current;
    if (!active) {
      const place = nearestPlace(x, y);
      const lonLat = onSphere(x, y) ? projectionNow().invert?.([x, y]) : null;
      const region = lonLat ? regionAt(lonLat[0], lonLat[1]) : undefined;
      setHover(place ? { name: place.name, x, y } : region ? { name: region.name, x, y } : null);
      props.onCursor(lonLat ? { latitude: lonLat[1], longitude: ((((lonLat[0] + 180) % 360) + 360) % 360) - 180 } : null);
      return;
    }
    const dx = x - active.x;
    const dy = y - active.y;
    if (!active.moved && Math.hypot(dx, dy) < 4) return;
    const time = performance.now();
    const dt = Math.max(time - active.time, 1);
    const degrees = 180 / (Math.PI * current.current.scale * zoom.current);
    active.moved = true;
    active.x = x;
    active.y = y;
    active.time = time;
    userTurned.current = true;
    travel.current = null;
    momentum.current = { lon: (-dx * degrees) / dt, lat: (dy * degrees) / dt };
    current.current = {
      ...current.current,
      lon: current.current.lon - dx * degrees,
      lat: Math.max(-85, Math.min(85, current.current.lat + dy * degrees)),
    };
    setHover(null);
  };

  const onPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    touches.current.delete(event.pointerId);
    if (touches.current.size < 2) pinch.current = null;
    const active = drag.current;
    drag.current = null;
    if (!props.interactive || !active) return;
    if (active.moved) {
      if (performance.now() - active.time > 90 || props.reducedMotion) momentum.current = { lon: 0, lat: 0 };
      return;
    }
    const { x, y } = local(event);
    const place = nearestPlace(x, y);
    if (place) {
      props.onPickPlace(place);
      return;
    }
    if (!onSphere(x, y)) return;
    const lonLat = projectionNow().invert?.([x, y]);
    if (!lonLat) return;
    const [lon, lat] = lonLat;
    const region = regionAt(lon, lat);
    if (region) props.onPickRegion(region);
    else props.onPick(lat, ((((lon + 180) % 360) + 360) % 360) - 180);
  };

  return (
    <div className="globe" style={{ width, height }}>
      <canvas ref={glCanvasRef} className="globe-earth" style={{ width, height }} aria-hidden="true" />
      <canvas
        ref={canvasRef}
        className="globe-overlay"
        style={{ width, height, cursor: props.interactive ? (hover ? "pointer" : "crosshair") : "default" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={(event) => {
          touches.current.delete(event.pointerId);
          pinch.current = null;
          drag.current = null;
        }}
        onPointerLeave={() => {
          setHover(null);
          props.onCursor(null);
        }}
        aria-hidden="true"
      />
      {hover && (
        <span className="globe-hover" style={{ left: hover.x + 14, top: hover.y - 14 }}>
          {hover.name}
        </span>
      )}
    </div>
  );
}
