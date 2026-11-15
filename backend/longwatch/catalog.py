from __future__ import annotations

from dataclasses import asdict, dataclass


@dataclass(frozen=True)
class Variable:
    id: str
    question: str
    name: str
    parameter: str
    units: str
    decimals: int
    definition: str
    source_kind: str
    source_label: str
    source_detail: str
    caveat: str
    first_year: int
    grid: tuple[float, float] | None
    scale: float = 1.0
    live: bool = True

    def as_dict(self) -> dict:
        return asdict(self)


VARIABLES: dict[str, Variable] = {
    v.id: v
    for v in [
        Variable(
            id="temperature",
            question="Is it getting hotter?",
            name="Air temperature at 2 m",
            parameter="T2M",
            units="°C",
            decimals=2,
            definition="The monthly average temperature of the air two metres above the ground.",
            source_kind="reanalysis",
            source_label="MERRA-2 reanalysis via NASA POWER",
            source_detail=(
                "MERRA-2 blends satellite and conventional observations with a weather model to "
                "estimate conditions everywhere. It is a reanalysis, not a direct measurement."
            ),
            caveat="Changes in the observations fed into a reanalysis can leave small artificial shifts in its record.",
            first_year=1981,
            grid=(0.5, 0.625),
        ),
        Variable(
            id="precipitation",
            question="Is it getting wetter or drier?",
            name="Precipitation",
            parameter="PRECTOTCORR",
            units="mm/day",
            decimals=2,
            definition="The monthly average rain and snowfall, expressed as millimetres of water per day.",
            source_kind="reanalysis",
            source_label="MERRA-2 bias-corrected precipitation via NASA POWER",
            source_detail=(
                "MERRA-2 model precipitation, corrected towards gauge and satellite-based estimates. "
                "It is a reanalysis product, not a direct measurement."
            ),
            caveat=(
                "Reanalysis precipitation is especially sensitive to changes in its input observations; "
                "a trend here deserves a second opinion from an observation-based product."
            ),
            first_year=1981,
            grid=(0.5, 0.625),
        ),
        Variable(
            id="soil_wetness",
            question="Is the soil drying?",
            name="Root-zone soil wetness",
            parameter="GWETROOT",
            units="fraction",
            decimals=3,
            definition=(
                "How full of water the top metre of soil is, from 0 (completely dry) to 1 (saturated)."
            ),
            source_kind="model",
            source_label="MERRA-2 land model via NASA POWER",
            source_detail=(
                "Soil wetness is calculated by the MERRA-2 land-surface model from its rainfall, "
                "evaporation and runoff. It is model output, not a measurement of the soil."
            ),
            caveat="Because it is modelled, this record inherits any artificial shifts in MERRA-2 precipitation.",
            first_year=1981,
            grid=(0.5, 0.625),
        ),
        Variable(
            id="sunlight",
            question="Is sunlight at the surface changing?",
            name="All-sky surface solar irradiance",
            parameter="ALLSKY_SFC_SW_DWN",
            units="MJ/m²/day",
            decimals=2,
            definition="The solar energy reaching each square metre of ground per day, averaged over the month, clouds included.",
            source_kind="satellite-derived",
            source_label="CERES SYN1deg via NASA POWER",
            source_detail=(
                "Derived from CERES satellite measurements of reflected and emitted radiation combined "
                "with cloud and aerosol data. It is a satellite-derived product, not a ground sensor."
            ),
            caveat=(
                "NASA POWER switches source in 2001 (GEWEX SRB before, CERES SYN1deg after). "
                "Only the CERES period is analysed so the two sources are never joined into one trend."
            ),
            first_year=2001,
            grid=(1.0, 1.0),
        ),
        Variable(
            id="no2",
            question="Is the air getting cleaner?",
            name="Tropospheric NO₂ column",
            parameter="ColumnAmountNO2TropCloudScreened",
            units="10¹⁵ molecules/cm²",
            decimals=2,
            definition=(
                "The amount of nitrogen dioxide in the lower atmosphere above each square centimetre of ground, "
                "seen from orbit. NO₂ comes largely from burning fuel."
            ),
            source_kind="satellite retrieval",
            source_label="OMI/Aura OMNO2d via NASA Giovanni",
            source_detail=(
                "Retrieved from sunlight measured by the Ozone Monitoring Instrument on NASA's Aura satellite, "
                "keeping scenes with less than 30% cloud."
            ),
            caveat=(
                "This is a column amount through the lower atmosphere, not the concentration people breathe at "
                "ground level. OMI is an ageing sensor; a row anomaly has reduced its coverage since 2007."
            ),
            first_year=2005,
            grid=None,
            scale=1e-15,
            live=False,
        ),
    ]
}

POWER_VARIABLES = [v for v in VARIABLES.values() if v.live]


@dataclass(frozen=True)
class Place:
    id: str
    name: str
    country: str
    lat: float
    lon: float

    def as_dict(self) -> dict:
        return asdict(self)


PLACES: list[Place] = [
    Place("delhi", "Delhi", "India", 28.61, 77.21),
    Place("new-york", "New York", "United States", 40.71, -74.01),
    Place("london", "London", "United Kingdom", 51.51, -0.13),
    Place("tokyo", "Tokyo", "Japan", 35.68, 139.69),
    Place("nairobi", "Nairobi", "Kenya", -1.29, 36.82),
    Place("sao-paulo", "São Paulo", "Brazil", -23.55, -46.63),
    Place("sydney", "Sydney", "Australia", -33.87, 151.21),
    Place("cairo", "Cairo", "Egypt", 30.04, 31.24),
    Place("moscow", "Moscow", "Russia", 55.76, 37.62),
    Place("mexico-city", "Mexico City", "Mexico", 19.43, -99.13),
    Place("lagos", "Lagos", "Nigeria", 6.52, 3.38),
    Place("jakarta", "Jakarta", "Indonesia", -6.21, 106.85),
    Place("cape-town", "Cape Town", "South Africa", -33.92, 18.42),
    Place("reykjavik", "Reykjavík", "Iceland", 64.15, -21.94),
    Place("phoenix", "Phoenix", "United States", 33.45, -112.07),
    Place("mumbai", "Mumbai", "India", 19.08, 72.88),
    Place("beijing", "Beijing", "China", 39.90, 116.41),
    Place("lima", "Lima", "Peru", -12.05, -77.04),
    Place("anchorage", "Anchorage", "United States", 61.22, -149.90),
    Place("madrid", "Madrid", "Spain", 40.42, -3.70),
    Place("tehran", "Tehran", "Iran", 35.69, 51.39),
    Place("singapore", "Singapore", "Singapore", 1.35, 103.82),
]


@dataclass(frozen=True)
class Region:
    id: str
    name: str
    filename: str
    west: float
    south: float
    east: float
    north: float

    def as_dict(self) -> dict:
        return asdict(self)


REGIONS: list[Region] = [
    Region("new-york-region", "New York region", "new_york_no2.csv", -74.556, 40.218, -72.589, 41.289),
    Region("north-china-plain", "North China Plain", "north_china_no2.csv", 114.0, 35.0, 119.0, 40.0),
    Region("delhi-region", "Delhi region", "delhi_no2.csv", 76.0, 27.0, 79.0, 30.0),
]


def grid_cell(lat: float, lon: float, grid: tuple[float, float]) -> dict:
    dlat, dlon = grid
    if dlat == 1.0:
        south = float(int(lat // 1))
        west = float(int(lon // 1))
        return {"west": west, "south": south, "east": west + 1.0, "north": south + 1.0}
    lat_centre = round(lat / dlat) * dlat
    lon_centre = round((lon + 180.0) / dlon) * dlon - 180.0
    return {
        "west": lon_centre - dlon / 2,
        "south": lat_centre - dlat / 2,
        "east": lon_centre + dlon / 2,
        "north": lat_centre + dlat / 2,
    }
