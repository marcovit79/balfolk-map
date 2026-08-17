## Application description
The application is composed of a Leaflet map that uses the entire browser viewport.
The map uses OpenStreetMap layers.
On page load, the frontend calls the `GET` API at `/api/be_fa/events` provided by the
Festival Aggregator service.
For each returned event, a marker must be placed on the map with a popup that opens when 
the marker is clicked.
The marker's latitude and longitude are contained in the `lat` and `lng` fields; the popup
text is in the `content` field of the event.  
