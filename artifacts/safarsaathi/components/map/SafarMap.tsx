import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Feather, MaterialIcons } from '@expo/vector-icons';
import type { LatLng } from '@workspace/safety-core';
import Colors, { Palette } from '@/constants/colors';
import type { MapReport, MapZone } from '@/services/map.service';

const NativeWebView = WebView as unknown as React.ComponentType<any>;

export interface SafarMapProps {
  center: LatLng;
  zoomLevel?: number;
  userLocation?: { lat: number; lng: number; accuracy?: number; ts?: number } | null;
  routePoints?: LatLng[];
  destination?: LatLng | null;
  zones?: MapZone[];
  reports?: MapReport[];
  sosState?: { active: boolean; lat?: number; lng?: number; source?: string; ts?: number } | null;
  nightMode?: boolean;
  interactive?: boolean;
  style?: object;
  onZonePress?: (zone: MapZone) => void;
  onReportPress?: (report: MapReport) => void;
  onMapPress?: (coord: LatLng) => void;
  onRecenter?: () => void;
}

/**
 * Real interactive, Google Maps-style map component.
 * Uses CartoDB Voyager tiles (Google Maps appearance with crisp roads, buildings, parks)
 * and CartoDB Dark Matter for night mode, with Google Maps blue pulsing location marker,
 * red destination pins, real turn-by-turn road polylines, and safety zone heat overlays.
 */
export default function SafarMap({
  center,
  zoomLevel = 14,
  userLocation,
  routePoints = [],
  destination = null,
  zones = [],
  reports = [],
  sosState = null,
  nightMode = false,
  interactive = true,
  style,
  onZonePress,
  onReportPress,
  onMapPress,
  onRecenter,
}: SafarMapProps) {
  const webViewRef = useRef<WebView>(null);
  const [mapReady, setMapReady] = useState(false);
  const [internalNightMode, setInternalNightMode] = useState(nightMode);

  useEffect(() => {
    setInternalNightMode(nightMode);
  }, [nightMode]);

  const activeCenter = userLocation
    ? { lat: userLocation.lat, lng: userLocation.lng }
    : center;

  // Generate initial map HTML with Leaflet and CartoDB Voyager Google Maps-style tiles
  const mapHtml = useMemo(() => {
    const tileUrl = internalNightMode
      ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
      : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    html, body, #map {
      width: 100%;
      height: 100%;
      margin: 0;
      padding: 0;
      background: ${internalNightMode ? '#0A0D18' : '#E8ECEF'};
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    .leaflet-control-zoom, .leaflet-control-attribution {
      display: none !important;
    }

    /* Google Maps Blue Location Marker */
    .user-marker-wrap {
      position: relative;
      width: 24px;
      height: 24px;
    }
    .user-pulse-ring {
      position: absolute;
      top: -12px;
      left: -12px;
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: rgba(26, 115, 232, 0.28);
      animation: gmapPulse 2.2s infinite ease-out;
      pointer-events: none;
    }
    .user-core-dot {
      position: absolute;
      top: 3px;
      left: 3px;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: #1A73E8;
      border: 3px solid #FFFFFF;
      box-shadow: 0 1px 6px rgba(0, 0, 0, 0.45);
    }
    @keyframes gmapPulse {
      0% { transform: scale(0.5); opacity: 1; }
      100% { transform: scale(1.6); opacity: 0; }
    }

    /* Google Maps Red Destination Pin */
    .dest-pin-wrap {
      width: 32px;
      height: 42px;
      margin-top: -38px;
      margin-left: -16px;
    }
    .dest-pin-svg {
      filter: drop-shadow(0px 3px 4px rgba(0, 0, 0, 0.4));
    }

    /* SOS Alert Distress Ripple */
    .sos-beacon-wrap {
      position: relative;
      width: 28px;
      height: 28px;
    }
    .sos-pulse-ring {
      position: absolute;
      top: -18px;
      left: -18px;
      width: 64px;
      height: 64px;
      border-radius: 50%;
      background: rgba(239, 68, 68, 0.4);
      animation: sosPulse 1.2s infinite ease-out;
    }
    .sos-core-dot {
      position: absolute;
      top: 4px;
      left: 4px;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: #EF4444;
      border: 3px solid #FFFFFF;
      box-shadow: 0 0 12px rgba(239, 68, 68, 0.9);
    }
    @keyframes sosPulse {
      0% { transform: scale(0.4); opacity: 1; }
      100% { transform: scale(1.7); opacity: 0; }
    }

    /* Custom Zone Popup */
    .leaflet-popup-content-wrapper {
      background: #161B2F;
      color: #FFFFFF;
      border: 1px solid #2D3450;
      border-radius: 12px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
      padding: 4px;
    }
    .leaflet-popup-tip {
      background: #161B2F;
    }
    .zone-popup-title {
      font-weight: 700;
      font-size: 13px;
      margin-bottom: 2px;
    }
    .zone-popup-sub {
      font-size: 11px;
      color: #94A3B8;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map = L.map('map', {
      center: [${activeCenter.lat}, ${activeCenter.lng}],
      zoom: ${zoomLevel},
      zoomControl: false,
      attributionControl: false,
      dragging: ${interactive},
      touchZoom: ${interactive},
      doubleClickZoom: ${interactive},
      scrollWheelZoom: ${interactive}
    });

    var tileLayer = L.tileLayer('${tileUrl}', {
      subdomains: ['a', 'b', 'c', 'd'],
      maxZoom: 19
    }).addTo(map);

    var userMarker = null;
    var destMarker = null;
    var sosMarker = null;
    var routePolylineBg = null;
    var routePolyline = null;
    var zoneLayers = [];

    // User Location Icon (Google Maps pulsing blue dot)
    var userIcon = L.divIcon({
      className: '',
      html: '<div class="user-marker-wrap"><div class="user-pulse-ring"></div><div class="user-core-dot"></div></div>',
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });

    // Destination Pin (Google Maps red pin)
    var destIcon = L.divIcon({
      className: '',
      html: '<div class="dest-pin-wrap"><svg class="dest-pin-svg" viewBox="0 0 32 42" width="32" height="42"><path fill="#EA4335" d="M16 0C7.16 0 0 7.16 0 16c0 12 16 26 16 26s16-14 16-26c0-8.84-7.16-16-16-16z"/><circle fill="#FFFFFF" cx="16" cy="15" r="5.5"/></svg></div>',
      iconSize: [32, 42],
      iconAnchor: [16, 40]
    });

    // SOS Alarm Icon (Red emergency distress beacon)
    var sosIcon = L.divIcon({
      className: '',
      html: '<div class="sos-beacon-wrap"><div class="sos-pulse-ring"></div><div class="sos-core-dot"></div></div>',
      iconSize: [28, 28],
      iconAnchor: [14, 14]
    });

    function post(type, data) {
      var msg = JSON.stringify(Object.assign({ type: type }, data || {}));
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(msg);
      }
    }

    map.on('click', function(e) {
      post('map_press', { lat: e.latlng.lat, lng: e.latlng.lng });
    });

    function updateMap(data) {
      if (!data) return;

      // 1. User Location
      if (data.userLocation && typeof data.userLocation.lat === 'number') {
        var ulat = data.userLocation.lat;
        var ulng = data.userLocation.lng;
        if (!userMarker) {
          userMarker = L.marker([ulat, ulng], { icon: userIcon, zIndexOffset: 1000 }).addTo(map);
        } else {
          userMarker.setLatLng([ulat, ulng]);
        }
      } else if (userMarker) {
        map.removeLayer(userMarker);
        userMarker = null;
      }

      // 2. Destination Pin
      if (data.destination && typeof data.destination.lat === 'number') {
        var dlat = data.destination.lat;
        var dlng = data.destination.lng;
        if (!destMarker) {
          destMarker = L.marker([dlat, dlng], { icon: destIcon, zIndexOffset: 950 }).addTo(map);
        } else {
          destMarker.setLatLng([dlat, dlng]);
        }
      } else if (destMarker) {
        map.removeLayer(destMarker);
        destMarker = null;
      }

      // 3. SOS Distress Beacon
      if (data.sosState && data.sosState.active && typeof data.sosState.lat === 'number') {
        var slat = data.sosState.lat;
        var slng = data.sosState.lng;
        if (!sosMarker) {
          sosMarker = L.marker([slat, slng], { icon: sosIcon, zIndexOffset: 1100 }).addTo(map);
        } else {
          sosMarker.setLatLng([slat, slng]);
        }
      } else if (sosMarker) {
        map.removeLayer(sosMarker);
        sosMarker = null;
      }

      // 4. Route Polyline (Google Maps road blue)
      if (Array.isArray(data.routePoints) && data.routePoints.length >= 2) {
        var latlngs = data.routePoints.map(function(p) { return [p.lat, p.lng]; });
        if (!routePolyline) {
          routePolylineBg = L.polyline(latlngs, {
            color: '#0D47A1',
            weight: 8,
            opacity: 0.45,
            lineJoin: 'round',
            lineCap: 'round'
          }).addTo(map);

          routePolyline = L.polyline(latlngs, {
            color: '#1A73E8',
            weight: 5.5,
            opacity: 0.95,
            lineJoin: 'round',
            lineCap: 'round'
          }).addTo(map);
        } else {
          routePolylineBg.setLatLngs(latlngs);
          routePolyline.setLatLngs(latlngs);
        }

        // Auto-fit camera to route with padding
        try {
          var bounds = routePolyline.getBounds();
          if (bounds.isValid()) {
            map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
          }
        } catch(e) {}
      } else {
        if (routePolyline) {
          map.removeLayer(routePolyline);
          map.removeLayer(routePolylineBg);
          routePolyline = null;
          routePolylineBg = null;
        }
      }

      // 5. Safety Zones Heatmap Circles
      zoneLayers.forEach(function(l) { map.removeLayer(l); });
      zoneLayers = [];

      if (Array.isArray(data.zones)) {
        data.zones.forEach(function(z) {
          if (typeof z.lat !== 'number' || typeof z.lng !== 'number') return;
          var color = z.severity === 'high' ? '#EF4444' : z.severity === 'medium' ? '#F59E0B' : '#10B981';
          var circle = L.circle([z.lat, z.lng], {
            radius: z.radiusM || 150,
            color: color,
            fillColor: color,
            fillOpacity: 0.22,
            weight: 2,
            dashArray: '4, 4'
          }).addTo(map);

          circle.on('click', function(e) {
            L.DomEvent.stopPropagation(e);
            post('zone_press', { id: z.id, category: z.category, severity: z.severity });
          });

          zoneLayers.push(circle);
        });
      }

      // 6. Camera Center (if no route points)
      if ((!data.routePoints || data.routePoints.length < 2) && data.center) {
        map.panTo([data.center.lat, data.center.lng], { animate: true, duration: 0.5 });
      }
    }

    window.addEventListener('message', function(e) {
      try {
        var msg = JSON.parse(e.data);
        if (msg.type === 'init' || msg.type === 'update') {
          updateMap(msg.payload);
        } else if (msg.type === 'fly_to') {
          map.flyTo([msg.lat, msg.lng], msg.zoom || 15, { duration: 0.8 });
        } else if (msg.type === 'zoom_in') {
          map.zoomIn();
        } else if (msg.type === 'zoom_out') {
          map.zoomOut();
        }
      } catch(err) {}
    });

    document.addEventListener('message', function(e) {
      try {
        var msg = JSON.parse(e.data);
        if (msg.type === 'init' || msg.type === 'update') {
          updateMap(msg.payload);
        } else if (msg.type === 'fly_to') {
          map.flyTo([msg.lat, msg.lng], msg.zoom || 15, { duration: 0.8 });
        } else if (msg.type === 'zoom_in') {
          map.zoomIn();
        } else if (msg.type === 'zoom_out') {
          map.zoomOut();
        }
      } catch(err) {}
    });

    post('map_ready');
  </script>
</body>
</html>
    `;
  }, [internalNightMode, interactive, zoomLevel]);

  // Sync state updates to the WebView map
  const sendStateUpdate = () => {
    const payload = {
      center: activeCenter,
      zoomLevel,
      userLocation,
      destination,
      routePoints,
      zones,
      reports,
      sosState,
    };
    const code = `
      if (window.updateMap) {
        window.updateMap(${JSON.stringify(payload)});
      }
      true;
    `;
    webViewRef.current?.injectJavaScript(code);
  };

  useEffect(() => {
    if (mapReady) {
      sendStateUpdate();
    }
  }, [
    mapReady,
    userLocation?.lat,
    userLocation?.lng,
    activeCenter.lat,
    activeCenter.lng,
    destination?.lat,
    destination?.lng,
    routePoints.length,
    zones.length,
    sosState?.active,
  ]);

  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'map_ready') {
        setMapReady(true);
        sendStateUpdate();
      } else if (data.type === 'map_press' && onMapPress) {
        onMapPress({ lat: data.lat, lng: data.lng });
      } else if (data.type === 'zone_press' && onZonePress) {
        const found = zones.find((z) => z.id === data.id);
        if (found) onZonePress(found);
      }
    } catch {
      // Ignore invalid JSON
    }
  };

  const handleRecenter = () => {
    if (onRecenter) {
      onRecenter();
    }
    const target = userLocation ? { lat: userLocation.lat, lng: userLocation.lng } : activeCenter;
    const code = `
      if (window.map) {
        window.map.flyTo([${target.lat}, ${target.lng}], 15, { duration: 0.7 });
      }
      true;
    `;
    webViewRef.current?.injectJavaScript(code);
  };

  const handleZoomIn = () => {
    webViewRef.current?.injectJavaScript('if(window.map) window.map.zoomIn(); true;');
  };

  const handleZoomOut = () => {
    webViewRef.current?.injectJavaScript('if(window.map) window.map.zoomOut(); true;');
  };

  return (
    <View style={[styles.container, style]}>
      {Platform.OS === 'web' ? (
        <iframe
          srcDoc={mapHtml}
          style={{ width: '100%', height: '100%', border: 'none' }}
          title="SafarSaathi Map"
        />
      ) : (
        <NativeWebView
          ref={webViewRef}
          source={{ html: mapHtml }}
          originWhitelist={['*']}
          onMessage={handleMessage}
          style={styles.webView}
          javaScriptEnabled
          domStorageEnabled
          scrollEnabled={false}
          bounces={false}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Floating Google Maps-style Controls */}
      <View style={styles.floatingControls} pointerEvents="box-none">
        {/* Top Right: Night / Day toggle */}
        <TouchableOpacity
          style={styles.controlBtn}
          onPress={() => setInternalNightMode(!internalNightMode)}
          activeOpacity={0.8}
        >
          <Feather
            name={internalNightMode ? 'sun' : 'moon'}
            size={18}
            color={Palette.primaryText}
          />
        </TouchableOpacity>

        {/* Bottom Right: Zoom controls and Recenter */}
        <View style={styles.bottomRightGroup} pointerEvents="box-none">
          <View style={styles.zoomGroup}>
            <TouchableOpacity style={styles.zoomBtnTop} onPress={handleZoomIn} activeOpacity={0.8}>
              <Feather name="plus" size={18} color={Palette.primaryText} />
            </TouchableOpacity>
            <View style={styles.zoomDivider} />
            <TouchableOpacity style={styles.zoomBtnBottom} onPress={handleZoomOut} activeOpacity={0.8}>
              <Feather name="minus" size={18} color={Palette.primaryText} />
            </TouchableOpacity>
          </View>

          {/* Google Maps My Location GPS Button */}
          <TouchableOpacity
            style={styles.recenterFab}
            onPress={handleRecenter}
            activeOpacity={0.85}
          >
            <MaterialIcons name="my-location" size={20} color={Palette.primaryViolet} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: 240,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#0F1222',
    borderWidth: 1,
    borderColor: '#2D3450',
    position: 'relative',
  },
  webView: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  floatingControls: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    padding: 12,
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  controlBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(22, 27, 47, 0.9)',
    borderWidth: 1,
    borderColor: '#2D3450',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 4,
  },
  bottomRightGroup: {
    alignItems: 'flex-end',
    gap: 10,
  },
  zoomGroup: {
    backgroundColor: 'rgba(22, 27, 47, 0.92)',
    borderWidth: 1,
    borderColor: '#2D3450',
    borderRadius: 10,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 4,
  },
  zoomBtnTop: {
    width: 34,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomDivider: {
    height: 1,
    backgroundColor: '#2D3450',
  },
  zoomBtnBottom: {
    width: 34,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recenterFab: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(22, 27, 47, 0.95)',
    borderWidth: 1.5,
    borderColor: 'rgba(124, 77, 255, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Palette.primaryViolet,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 6,
  },
});
