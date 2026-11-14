import { env } from '../../config/env.js';

export interface TrackingPageData {
  userName: string;
  tripStatus: string;
  lastLat?: number;
  lastLng?: number;
  lastSeenAt?: number;
  isExpired: boolean;
  token: string;
  ridePlate?: string;
  rideDriver?: string;
}

/**
 * Server-rendered HTML tracking page for guardians (TRD section 8.2, FR-04, FR-07).
 * Powered by MapLibre GL JS + OpenFreeMap Liberty style with vector rendering.
 * Includes No-JS fallback meta-refresh, staleness alerts, and SOS banner.
 */
export function renderTrackingPage(data: TrackingPageData): string {
  if (data.isExpired) {
    return renderExpiredPage();
  }

  const styleUrl = env.GUARDIAN_MAP_STYLE_URL || 'https://tiles.openfreemap.org/styles/liberty';
  const lat = data.lastLat ?? 28.6139;
  const lng = data.lastLng ?? 77.2090;
  const isSos = data.tripStatus.toLowerCase().includes('sos');
  const safeUserName = encodeHtml(data.userName || 'SafarSaathi User');
  const initialStatus = isSos ? 'EMERGENCY SOS ACTIVE' : 'Safe Trip in Progress';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <!-- No-JS fallback meta-refresh every 10 seconds -->
  <noscript><meta http-equiv="refresh" content="10"></noscript>
  <title>SafarSaathi Live Guardian Track - ${safeUserName}</title>

  <!-- MapLibre GL JS & CSS -->
  <link rel="stylesheet" href="https://unpkg.com/maplibre-gl@^4.0.0/dist/maplibre-gl.css" />
  <script src="https://unpkg.com/maplibre-gl@^4.0.0/dist/maplibre-gl.js"></script>

  <style>
    * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    body, html { margin: 0; padding: 0; width: 100%; height: 100%; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #0C101B; color: #FFFFFF; overflow: hidden; }
    
    #app-container { display: flex; flex-direction: column; width: 100%; height: 100%; position: relative; }
    
    /* Header Bar */
    #header {
      background: #111827;
      border-bottom: 1px solid #1F2937;
      padding: 12px 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      z-index: 10;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    }
    .brand { display: flex; align-items: center; gap: 8px; }
    .brand-logo { width: 28px; height: 28px; border-radius: 8px; background: #635BFF; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 14px; color: #FFF; }
    .brand-title { font-size: 16px; font-weight: 700; color: #F3F4F6; margin: 0; }
    .brand-user { font-size: 12px; color: #9CA3AF; margin: 0; }
    
    .status-pill {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border-radius: 9999px;
      font-size: 12px;
      font-weight: 600;
      background: ${isSos ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.15)'};
      color: ${isSos ? '#EF4444' : '#10B981'};
      border: 1px solid ${isSos ? 'rgba(239, 68, 68, 0.4)' : 'rgba(16, 185, 129, 0.3)'};
    }
    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: ${isSos ? '#EF4444' : '#10B981'};
      box-shadow: 0 0 8px ${isSos ? '#EF4444' : '#10B981'};
      animation: pulse 1.5s infinite;
    }
    
    /* Emergency Banner */
    #sos-banner {
      display: ${isSos ? 'flex' : 'none'};
      background: #DC2626;
      color: white;
      padding: 10px 16px;
      justify-content: space-between;
      align-items: center;
      font-weight: 600;
      font-size: 14px;
      z-index: 15;
    }
    .sos-call-btn {
      background: #FFFFFF;
      color: #DC2626;
      text-decoration: none;
      padding: 6px 14px;
      border-radius: 6px;
      font-weight: 700;
      font-size: 13px;
    }
    
    /* Map Container */
    #map { flex: 1; width: 100%; position: relative; background: #0C101B; }
    
    /* Custom Map Marker */
    .user-marker-container {
      position: relative;
      width: 44px;
      height: 44px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .marker-pulse {
      position: absolute;
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: ${isSos ? 'rgba(239, 68, 68, 0.35)' : 'rgba(16, 185, 129, 0.25)'};
      animation: ripple 2s infinite ease-out;
    }
    .marker-inner {
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: ${isSos ? '#EF4444' : '#10B981'};
      border: 3px solid #FFFFFF;
      box-shadow: 0 2px 10px rgba(0,0,0,0.5);
      z-index: 2;
    }
    
    /* Footer Tray */
    #footer {
      background: #111827;
      border-top: 1px solid #1F2937;
      padding: 12px 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      z-index: 10;
    }
    .meta-info { display: flex; flex-direction: column; gap: 2px; }
    .last-seen { font-size: 12px; color: #E5E7EB; font-weight: 500; }
    .coords-text { font-size: 11px; color: #6B7280; font-family: monospace; }
    .stale-badge { color: #F59E0B; font-weight: 600; display: none; }
    
    .recenter-btn {
      background: #1F2937;
      color: #F3F4F6;
      border: 1px solid #374151;
      padding: 8px 14px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .recenter-btn:active { background: #374151; }

    /* No-JS Warning */
    .no-js-panel {
      background: #FEF3C7;
      color: #92400E;
      padding: 12px;
      font-size: 14px;
      text-align: center;
      border-bottom: 1px solid #F59E0B;
    }
    .no-js-panel a { color: #1D4ED8; font-weight: 600; }

    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(0.9); }
    }
    @keyframes ripple {
      0% { transform: scale(0.5); opacity: 0.8; }
      100% { transform: scale(1.6); opacity: 0; }
    }
  </style>
</head>
<body>
  <div id="app-container">
    <div id="header">
      <div class="brand">
        <div class="brand-logo">S</div>
        <div>
          <h1 class="brand-title">SafarSaathi 2.0</h1>
          <p class="brand-user">Tracking: <strong>${safeUserName}</strong></p>
        </div>
      </div>
      <div class="status-pill" id="statusPill">
        <div class="status-dot" id="statusDot"></div>
        <span id="statusText">${initialStatus}</span>
      </div>
    </div>

    <div id="sos-banner">
      <span>⚠️ Emergency SOS Alert Triggered!</span>
      <a href="tel:112" class="sos-call-btn">📞 Call Police (112)</a>
    </div>

    ${data.ridePlate ? `
    <div style="background: rgba(99, 91, 255, 0.15); border-bottom: 1px solid rgba(99, 91, 255, 0.3); padding: 8px 16px; display: flex; align-items: center; justify-content: space-between; font-size: 13px;">
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 16px;">🚗</span>
        <span>Vehicle: <strong style="color: #A78BFA; letter-spacing: 0.5px;">${encodeHtml(data.ridePlate)}</strong>${data.rideDriver ? ` · Driver: <strong>${encodeHtml(data.rideDriver)}</strong>` : ''}</span>
      </div>
      <span style="background: rgba(16, 185, 129, 0.2); color: #10B981; padding: 2px 8px; border-radius: 6px; font-size: 11px; font-weight: 700;">VERIFIED RIDE</span>
    </div>
    ` : ''}

    <noscript>
      <div class="no-js-panel">
        JavaScript disabled. Auto-refreshing every 10s.<br>
        Last known fix: <strong>${lat.toFixed(5)}, ${lng.toFixed(5)}</strong><br>
        <a href="https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}" target="_blank">View on OpenStreetMap</a>
      </div>
    </noscript>

    <div id="map"></div>

    <div id="footer">
      <div class="meta-info">
        <span class="last-seen" id="lastSeenText">Live tracking active</span>
        <span class="coords-text" id="coordsText">${lat.toFixed(5)}, ${lng.toFixed(5)}</span>
      </div>
      <button class="recenter-btn" id="recenterBtn" onclick="recenterMap()">
        🎯 Center Marker
      </button>
    </div>
  </div>

  <script>
    var token = "${data.token}";
    var currentLng = ${lng};
    var currentLat = ${lat};
    var isSosActive = ${isSos ? 'true' : 'false'};

    // Initialize MapLibre GL map with OpenFreeMap Liberty style
    var map = new maplibregl.Map({
      container: 'map',
      style: '${styleUrl}',
      center: [currentLng, currentLat],
      zoom: 15,
      attributionControl: false
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: true, showZoom: true }), 'top-right');
    map.addControl(new maplibregl.AttributionControl({
      customAttribution: '© <a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>',
      compact: false
    }), 'bottom-left');

    // Create custom user pin element
    var el = document.createElement('div');
    el.className = 'user-marker-container';
    el.innerHTML = '<div class="marker-pulse" id="markerPulse"></div><div class="marker-inner" id="markerInner"></div>';

    var marker = new maplibregl.Marker({ element: el })
      .setLngLat([currentLng, currentLat])
      .addTo(map);

    function recenterMap() {
      map.easeTo({
        center: [currentLng, currentLat],
        zoom: 15.5,
        duration: 800
      });
    }

    // Function to calculate a circle polygon for accuracy visualization
    function createCircleGeoJSON(center, radiusInMeters) {
      var points = 48;
      var km = radiusInMeters / 1000;
      var ret = [];
      var distanceX = km / (111.320 * Math.cos(center[1] * Math.PI / 180));
      var distanceY = km / 110.574;
      for (var i = 0; i < points; i++) {
        var theta = (i / points) * (2 * Math.PI);
        var x = distanceX * Math.cos(theta);
        var y = distanceY * Math.sin(theta);
        ret.push([center[0] + x, center[1] + y]);
      }
      ret.push(ret[0]);
      return {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [ret] },
          properties: {}
        }]
      };
    }

    map.on('load', function() {
      map.addSource('accuracy-source', {
        type: 'geojson',
        data: createCircleGeoJSON([currentLng, currentLat], 40)
      });

      map.addLayer({
        id: 'accuracy-fill',
        type: 'fill',
        source: 'accuracy-source',
        paint: {
          'fill-color': isSosActive ? '#EF4444' : '#10B981',
          'fill-opacity': 0.15
        }
      });

      map.addLayer({
        id: 'accuracy-stroke',
        type: 'line',
        source: 'accuracy-source',
        paint: {
          'line-color': isSosActive ? '#EF4444' : '#10B981',
          'line-width': 1.5,
          'line-dasharray': [3, 2]
        }
      });
    });

    function handleLocationUpdate(res) {
      if (res.isExpired) {
        document.getElementById('statusText').innerText = 'Session Ended';
        document.getElementById('statusDot').style.background = '#6B7280';
        document.getElementById('lastSeenText').innerText = 'Trip completed / expired';
        return;
      }

      if (res.lastLat && res.lastLng) {
        currentLat = res.lastLat;
        currentLng = res.lastLng;
        marker.setLngLat([currentLng, currentLat]);

        document.getElementById('coordsText').innerText = currentLat.toFixed(5) + ', ' + currentLng.toFixed(5);

        // Update accuracy circle source
        if (map.getSource('accuracy-source')) {
          map.getSource('accuracy-source').setData(createCircleGeoJSON([currentLng, currentLat], res.accuracyM || 35));
        }
      }

      // Staleness check (> 60s)
      var now = Date.now();
      if (res.lastSeenAt && (now - res.lastSeenAt) > 60000) {
        var minsAgo = Math.floor((now - res.lastSeenAt) / 60000);
        document.getElementById('lastSeenText').innerHTML = '<span style="color: #F59E0B;">⚠️ Signal delayed (' + minsAgo + 'm ago)</span>';
      } else {
        document.getElementById('lastSeenText').innerHTML = '<span style="color: #10B981;">⚡ Real-time stream active</span>';
      }

      // Check SOS state
      var isSos = res.tripStatus && res.tripStatus.toLowerCase().indexOf('sos') !== -1;
      if (isSos) {
        document.getElementById('sos-banner').style.display = 'flex';
        document.getElementById('statusText').innerText = 'EMERGENCY SOS ACTIVE';
        document.getElementById('statusPill').style.background = 'rgba(239, 68, 68, 0.2)';
        document.getElementById('statusPill').style.color = '#EF4444';
        document.getElementById('statusDot').style.background = '#EF4444';
        document.getElementById('markerInner').style.background = '#EF4444';
        document.getElementById('markerPulse').style.background = 'rgba(239, 68, 68, 0.35)';
      }
    }

    // Connect to Server-Sent Events (SSE) for instantaneous real-time location streaming
    var pollFallbackInterval = null;
    function startPollingFallback() {
      if (pollFallbackInterval) return;
      pollFallbackInterval = setInterval(function() {
        fetch('/public/track/' + token)
          .then(function(r) { return r.json(); })
          .then(handleLocationUpdate)
          .catch(function(err) {});
      }, 5000);
    }

    if (window.EventSource) {
      try {
        var eventSource = new EventSource('/public/track/' + token + '/stream');
        eventSource.onmessage = function(event) {
          try {
            var data = JSON.parse(event.data);
            handleLocationUpdate(data);
          } catch(e) {}
        };
        eventSource.onerror = function() {
          startPollingFallback();
        };
      } catch(e) {
        startPollingFallback();
      }
    } else {
      startPollingFallback();
    }
  </script>
</body>
</html>`;
}

export function renderExpiredPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SafarSaathi - Tracking Link Expired</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0C101B; margin: 0; padding: 24px; text-align: center; color: #FFFFFF; }
    .card { background: #111827; max-width: 480px; margin: 60px auto; padding: 36px 24px; border-radius: 16px; border: 1px solid #1F2937; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.5); }
    .icon { font-size: 40px; margin-bottom: 16px; }
    h1 { color: #F3F4F6; font-size: 22px; margin-bottom: 12px; }
    p { color: #9CA3AF; font-size: 15px; line-height: 1.6; }
    .hindi { color: #6B7280; font-size: 14px; margin-top: 12px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">🔒</div>
    <h1>Link Expired / लिंक समाप्त हो गया</h1>
    <p>This tracking session has ended or the link has been safely revoked.</p>
    <p class="hindi">यह ट्रैकिंग सत्र समाप्त हो गया है या लिंक को सुरक्षा कारणों से समाप्त कर दिया गया है।</p>
  </div>
</body>
</html>`;
}

function encodeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
