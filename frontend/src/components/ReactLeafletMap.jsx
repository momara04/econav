import { useEffect, useRef, forwardRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker } from 'react-leaflet';
import L from 'leaflet';
import { renderToStaticMarkup } from 'react-dom/server';
import MapMarker from '../components/icons/MapMarker';
import MapMarkerAccount from '../components/icons/MapMarkerAccount';
import React from 'react';

const PolylineWrapper = forwardRef(({ route, pathOptions, eventHandlers }, ref) => {
  return (
    <Polyline
      positions={route.path}
      pathOptions={pathOptions}
      eventHandlers={eventHandlers}
      ref={ref}
    />
  );
});

const ReactLeafletMap = ({ routes, selectedIndex, setSelectedIndex, stops = [] }) => {
  const polylineRefs = useRef([]);

  useEffect(() => {
    polylineRefs.current = routes.map((_, i) => polylineRefs.current[i] || React.createRef());
  }, [routes]);

  useEffect(() => {
    routes.forEach((_, i) => {
      const polyline = polylineRefs.current[i]?.current;
      if (!polyline) return;

      polyline.setStyle({
        weight: selectedIndex === i ? 7 : 4,
        opacity: selectedIndex === i ? 1 : 0.8,
      });

      if (selectedIndex === i) {
        polyline.bringToFront();
      }
    });
  }, [selectedIndex, routes]);

  const originIcon = L.divIcon({
    html: renderToStaticMarkup(<MapMarkerAccount width={30} height={30} fill="#6a8a7a" />),
    className: '',
    iconSize: [30, 30],
    iconAnchor: [15, 30],
    popupAnchor: [0, -30],
  });

  const destinationIcon = L.divIcon({
    html: renderToStaticMarkup(<MapMarker width={30} height={30} fill="#6a8a7a" />),
    className: '',
    iconSize: [30, 30],
    iconAnchor: [15, 30],
    popupAnchor: [0, -30],
  });

  // compute bounds based on selected route or all paths
  const bounds = selectedIndex !== null
    ? L.latLngBounds(routes[selectedIndex].path)
    : L.latLngBounds(routes.flatMap(r => r.path));

  const origin = selectedIndex !== null
    ? routes[selectedIndex].path[0]
    : routes[0].path[0];

  const destination = selectedIndex !== null
    ? routes[selectedIndex].path.at(-1)
    : routes[0].path.at(-1);

  // helper: snap a stop to the nearest point on the selected route (so it sits on the polyline)
  const selectedRoute = selectedIndex !== null ? routes[selectedIndex] : routes[0];

  const nearestOnRoute = (latlng) => {
    if (!selectedRoute?.path?.length) return latlng;
    let best = selectedRoute.path[0];
    let bestD = Number.POSITIVE_INFINITY;

    for (const p of selectedRoute.path) {
      const dlat = latlng[0] - p[0];
      const dlng = latlng[1] - p[1];
      const d2 = dlat * dlat + dlng * dlng; // fast enough for city scale
      if (d2 < bestD) {
        bestD = d2;
        best = p;
      }
    }
    return best;
  };

  return (
    <MapContainer
      bounds={bounds}
      scrollWheelZoom={false}
      style={{ height: '300px', width: '100%', borderRadius: '12px' }}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      />

      {routes.map((route, i) => (
        <PolylineWrapper
          key={route.id ?? i}
          route={route}
          pathOptions={{
            color: route.color, // stable per-route color
            opacity: selectedIndex === null ? 0.8 : (i === selectedIndex ? 1 : 0.3),
            weight: selectedIndex === null ? 4 : (i === selectedIndex ? 7 : 4),
          }}
          eventHandlers={{
            click: () => setSelectedIndex(i),
          }}
          ref={polylineRefs.current[i]}
        />
      ))}

      {origin && (
        <Marker position={origin} icon={originIcon}>
          <Popup><div style={{ minWidth: '110px', textAlign: 'center' }}>Origin</div></Popup>
        </Marker>
      )}

      {destination && (
        <Marker position={destination} icon={destinationIcon}>
          <Popup><div style={{ minWidth: '110px', textAlign: 'center' }}>Destination</div></Popup>
        </Marker>
      )}

      {/* stop dots */}
      {stops.map((stop, i) => {
        if (!stop.path || !Array.isArray(stop.path) || stop.path.length === 0) return null;

        const rawPos = stop.path[0];          // [lat, lng] from backend
        const pos = nearestOnRoute(rawPos);   // snap to route so it sits on the line

        return (
          <CircleMarker
            key={`stop-${i}`}
            center={pos}
            radius={6}
            pathOptions={{
              color: '#333',
              weight: 2,
              fillColor: '#ffffff',
              fillOpacity: 1
            }}
            pane="markerPane"
          >
            <Popup>
              <div style={{ minWidth: '110px', textAlign: 'center' }}>
                Stop {i + 1}<br />
                {stop.address}
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
};

export default ReactLeafletMap;
