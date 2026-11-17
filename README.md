# MajiWatch

MajiWatch is a lightweight Cape Town community water-point status finder. People can search mapped points, optionally sort by device location, open the source map, and share a status update with a short note.

## Run the demo

Serve this folder over localhost or HTTPS (for example, `python -m http.server 8000`) and open it in a browser. The app has no build step or API key. After the first visit, its app shell is cached for offline use; reports are saved in that browser's local storage. Map tiles and walking directions require an internet connection.

## Data and status

The four seed locations are OpenStreetMap community map records: three communal outdoor taps and the Jack Marais drinking fountain. Each point links to its OSM record. OpenStreetMap is not a City of Cape Town verified inventory, and the mapped records do not establish whether a point is operating, potable, or accessible today. Seeded service status is therefore **unverified**; only reports submitted in this app change the displayed status, and those reports stay in this browser on this device.

Map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), available under the [Open Database License (ODbL)](https://opendatacommons.org/licenses/odbl/1-0/). Do not rely on this prototype for trip planning; check water availability locally.

## Walking routes and location privacy

Choose **Walking route** on a water point, then explicitly request a route. The browser asks for location permission; the app sends the current coordinates and selected water point to the [FOSSGIS foot-routing service](https://routing.openstreetmap.de/about.html) and requests map tiles from [OpenStreetMap](https://operations.osmfoundation.org/policies/tiles/). These providers may log requests; MajiWatch does not save the location. The public routing service is best-effort, rate-limited, and has no availability guarantee, so routes are estimates and may be unavailable.
