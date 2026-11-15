# Third-party notices

## Data

| Dataset | Provider | Use | Terms |
| --- | --- | --- | --- |
| NASA POWER Monthly API v2 | NASA Langley Research Center, POWER Project, funded through the NASA Earth Science Directorate Applied Science Program | Live monthly records for any point | Open; acknowledgement requested |
| MERRA-2 (T2M, PRECTOTCORR, GWETROOT) | NASA Global Modeling and Assimilation Office (GMAO) | Served through POWER | Open |
| CERES SYN1deg (ALLSKY_SFC_SW_DWN) | NASA Langley Research Center | Served through POWER, 2001 onward | Open |
| OMI/Aura NO2 Cloud-Screened Total and Tropospheric Column L3 Global Gridded 0.25° (OMNO2d) version 004 | NASA Goddard Earth Sciences Data and Information Services Center (GES DISC); Krotkov, N. A., et al. | Three area-averaged time series exported from NASA Giovanni | Open; citation requested |
| NASA Blue Marble composite and NASA Earth at Night composite, with an elevation map, as distributed in the `three-globe` package (MIT) | NASA Earth Observatory / NASA Goddard Space Flight Center | Day surface, night surface and terrain relief of the globe. Reference imagery, not data | NASA imagery is generally not copyrighted; credit requested |
| GHCN-Daily, station SP000003195 (Madrid Retiro); the station series is contributed to GHCN-D by the European Climate Assessment & Dataset (ECA&D) | NOAA National Centers for Environmental Information; ECA&D / Agencia Estatal de Meteorología | Offline validation only: monthly means derived from it are stored in `backend/data/independent/`. Not shown as a data source in the application | GHCN-D is open; ECA&D data are for non-commercial research and education. Citation: Menne, M. J., et al. (2012), J. Atmos. Oceanic Technol. 29; Klein Tank, A. M. G., et al. (2002), Int. J. Climatol. 22 |
| Natural Earth 1:50m and 1:110m land, lakes, rivers and countries, via the `sane-topojson` package (MIT) | Natural Earth | Borders on the globe; vector fallback Earth; Observatory map | Public domain |

"These data were obtained from the NASA Langley Research Center POWER Project funded through the NASA Earth Science Directorate Applied Science Program."

Analyses and visualisations of OMI NO₂ used in this project were produced from data distributed through the Giovanni online data system, developed and maintained by the NASA GES DISC.

Earth imagery: NASA Earth Observatory (Blue Marble; Earth at Night). The files in `frontend/public/earth/` were taken from the `three-globe` package because NASA's image server was unreachable from the build environment; they have not been compared byte-for-byte with NASA's originals. To replace them with direct downloads, see NASA Visible Earth (Blue Marble Next Generation; Black Marble) and save equirectangular JPEGs under the same names.

## Software

| Package | Licence |
| --- | --- |
| React, React DOM | MIT |
| Vite, @vitejs/plugin-react | MIT |
| TypeScript | Apache-2.0 |
| MapLibre GL JS | BSD-3-Clause |
| three.js | MIT |
| d3-geo | ISC |
| d3-array, d3-scale, d3-shape | ISC |
| topojson-client | ISC |
| sane-topojson | MIT |
| FastAPI, Uvicorn, Pydantic, HTTPX | MIT / BSD-3-Clause |
| NumPy, SciPy | BSD-3-Clause |
| pymannkendall (Hussain & Mahmud, 2019) | MIT |
| pytest | MIT |

## Typefaces

| Typeface | Designer / foundry | Licence |
| --- | --- | --- |
| Barlow, Barlow Semi Condensed | Jeremy Tribby | SIL Open Font License 1.1 |
| IBM Plex Mono | IBM | SIL Open Font License 1.1 |
