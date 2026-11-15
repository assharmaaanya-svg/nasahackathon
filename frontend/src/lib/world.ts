import { feature, mesh } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import coarse from "sane-topojson/dist/world_110m.json";
import detailed from "sane-topojson/dist/world_50m.json";

type World = Topology<{
  land: GeometryCollection;
  lakes: GeometryCollection;
  rivers: GeometryCollection;
  countries: GeometryCollection;
}>;

const fine = detailed as unknown as World;
const rough = coarse as unknown as World;

export const land = feature(fine, fine.objects.land);
export const landCoarse = feature(rough, rough.objects.land);
export const lakes = feature(fine, fine.objects.lakes);
export const lakesCoarse = feature(rough, rough.objects.lakes);
export const rivers = mesh(fine, fine.objects.rivers);
export const riversCoarse = mesh(rough, rough.objects.rivers);
export const borders = mesh(fine, fine.objects.countries, (a, b) => a !== b);
