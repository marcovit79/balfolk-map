## Application description
The application is composed by a Leaflet map that use all the browser viewport.
The map use the OpenStreetMap layers.
At page load the frontend call the `GET` api at `/api/be_fa/events` provided by the
Festival Aggregator service.
For each event returned must be placed a marker and a popup that will be opened when 
the marker will be clicked.
The marker latitude and longitude are contained in the `lat` and `lng` fileds; the popup
text is in the `content` field of the event.  
