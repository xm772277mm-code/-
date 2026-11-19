/// <reference types="google.maps" />
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  APIProvider,
  AdvancedMarker,
  InfoWindow,
  Map as GoogleMap,
  Pin,
  useMap,
} from "@vis.gl/react-google-maps";
import {
  ExternalLink,
  Loader2,
  MapPin,
  Navigation,
  Search,
  Sparkles,
  Star,
} from "lucide-react";
import { useUiSettings } from "../contexts/UiSettingsContext.tsx";
import { getGoogleAuthHeaders, recordCloudUsageInFirestore } from "../firebase.ts";

interface PlaceItem {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  rating?: number | null;
  openNow?: boolean | null;
}

interface AutocompleteItem {
  id: string;
  text: string;
  toPlace: () => google.maps.places.Place;
}

interface RouteSummary {
  distanceText: string;
  durationText: string;
  path: google.maps.LatLngLiteral[];
}

interface GroundingLink {
  title: string;
  uri: string;
  kind?: "web" | "maps";
  snippet?: string;
}

const DEFAULT_CENTER = { lat: 30.0444, lng: 31.2357 }; // Cairo

function RoutePolylineOverlay({ path }: { path: google.maps.LatLngLiteral[] }) {
  const map = useMap();
  const polyRef = useRef<google.maps.Polyline | null>(null);

  useEffect(() => {
    if (!map || !window.google?.maps?.Polyline) return;
    if (polyRef.current) {
      polyRef.current.setMap(null);
      polyRef.current = null;
    }
    if (path.length === 0) return;

    const poly = new window.google.maps.Polyline({
      path,
      geodesic: true,
      strokeColor: "#2563EB",
      strokeOpacity: 0.92,
      strokeWeight: 5,
    });
    poly.setMap(map);
    polyRef.current = poly;

    const bounds = new window.google.maps.LatLngBounds();
    path.forEach((pt) => bounds.extend(pt));
    map.fitBounds(bounds, 56);

    return () => {
      poly.setMap(null);
    };
  }, [map, path]);

  return null;
}

function MapsInnerWorkspace({
  apiKey,
}: {
  apiKey: string;
}) {
  const map = useMap();
  const { user, signInWithGoogle, refreshDailyQuota } = useUiSettings();

  const [center, setCenter] = useState(DEFAULT_CENTER);
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const [searchQuery, setSearchQuery] = useState("مطاعم ومقاهي مميزة");
  const [suggestions, setSuggestions] = useState<AutocompleteItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [places, setPlaces] = useState<PlaceItem[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<PlaceItem | null>(null);
  const [routeSummary, setRouteSummary] = useState<RouteSummary | null>(null);
  const [routingBusy, setRoutingBusy] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  // Maps Grounding Assistant state
  const [aiQuestion, setAiQuestion] = useState("ما أفضل الأماكن الهادئة للعمل أو القهوة في هذه المنطقة؟");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiReply, setAiReply] = useState<string | null>(null);
  const [aiSources, setAiSources] = useState<GroundingLink[]>([]);

  // Request user geolocation safely
  const locateMe = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserPos(coords);
        setCenter(coords);
        map?.panTo(coords);
        map?.setZoom(14);
      },
      () => {
        setMapError("تعذر تحديد موقعك الحالي؛ يتم العرض على الموقع الافتراضي.");
      },
      { enableHighAccuracy: false, timeout: 6000 }
    );
  };

  // Places API (New): AutocompleteSuggestion
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (trimmed.length < 2 || !window.google?.maps?.importLibrary) {
      setSuggestions([]);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const placesLib = (await window.google.maps.importLibrary("places")) as google.maps.PlacesLibrary;
        const AutocompleteSuggestion = placesLib.AutocompleteSuggestion;
        if (!AutocompleteSuggestion) return;
        const { suggestions: rawSuggestions } =
          await AutocompleteSuggestion.fetchAutocompleteSuggestions({
            input: trimmed,
            locationBias: {
              center: userPos || center,
              radius: 15000,
            },
            language: "ar",
          });
        if (cancelled) return;
        const mapped: AutocompleteItem[] = rawSuggestions
          .filter((s) => s.placePrediction)
          .slice(0, 5)
          .map((s) => {
            const pred = s.placePrediction!;
            return {
              id: pred.placeId,
              text: pred.text.text,
              toPlace: () => pred.toPlace(),
            };
          });
        setSuggestions(mapped);
      } catch {
        // ignore autocomplete errors silently
      }
    }, 320);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [searchQuery, userPos, center]);

  // Places API (New): Place.searchByText
  const handleSearchPlaces = useCallback(
    async (queryText?: string) => {
      const q = (queryText ?? searchQuery).trim();
      if (!q || !window.google?.maps?.importLibrary) return;
      setSearching(true);
      setMapError(null);
      setSuggestions([]);
      try {
        const placesLib = (await window.google.maps.importLibrary("places")) as google.maps.PlacesLibrary;
        const { Place } = placesLib;
        const { places: found } = await Place.searchByText({
          textQuery: q,
          fields: ["id", "displayName", "location", "formattedAddress", "rating", "regularOpeningHours"],
          locationBias: {
            center: userPos || center,
            radius: 15000,
          },
          maxResultCount: 8,
          language: "ar",
        });

        const parsed: PlaceItem[] = [];
        const bounds = new window.google.maps.LatLngBounds();

        for (const p of found || []) {
          if (!p.location) continue;
          const lat = typeof p.location.lat === "function" ? p.location.lat() : Number(p.location.lat);
          const lng = typeof p.location.lng === "function" ? p.location.lng() : Number(p.location.lng);
          const item: PlaceItem = {
            id: p.id || `${lat}_${lng}`,
            name: p.displayName || "مكان",
            address: p.formattedAddress || "",
            lat,
            lng,
            rating: p.rating ?? null,
            openNow: null,
          };
          parsed.push(item);
          bounds.extend({ lat, lng });
        }

        setPlaces(parsed);
        if (parsed.length > 0) {
          setSelectedPlace(parsed[0]);
          map?.fitBounds(bounds, 64);
        } else {
          setMapError("لم يتم العثور على أماكن مطابقة في هذه المنطقة.");
        }
      } catch (err) {
        setMapError(err instanceof Error ? err.message : "تعذر البحث في أماكن Google Maps.");
      } finally {
        setSearching(false);
      }
    },
    [searchQuery, userPos, center, map]
  );

  const handleSelectAutocomplete = async (item: AutocompleteItem) => {
    setSuggestions([]);
    setSearchQuery(item.text);
    try {
      const place = item.toPlace();
      await place.fetchFields({
        fields: ["id", "displayName", "location", "formattedAddress", "rating"],
      });
      if (place.location) {
        const lat = place.location.lat();
        const lng = place.location.lng();
        const resolved: PlaceItem = {
          id: place.id || item.id,
          name: place.displayName || item.text,
          address: place.formattedAddress || "",
          lat,
          lng,
          rating: place.rating ?? null,
        };
        setPlaces((prev) => [resolved, ...prev.filter((p) => p.id !== resolved.id)].slice(0, 8));
        setSelectedPlace(resolved);
        map?.panTo({ lat, lng });
        map?.setZoom(15);
      }
    } catch {
      void handleSearchPlaces(item.text);
    }
  };

  // Modern Routes API: Route.computeRoutes()
  const handleComputeRoute = async (dest: PlaceItem) => {
    if (!window.google?.maps?.importLibrary) return;
    setRoutingBusy(true);
    setMapError(null);
    try {
      const routesLib = (await window.google.maps.importLibrary("routes")) as unknown as {
        Route?: {
          computeRoutes: (req: Record<string, unknown>) => Promise<{
            routes?: Array<{
              path?: google.maps.LatLng[];
              distanceMeters?: number;
              localizedValues?: { distance?: string; duration?: string };
              durationMillis?: number;
            }>;
          }>;
        };
      };

      const origin = userPos || center;
      if (!routesLib.Route?.computeRoutes) {
        throw new Error("مكتبة المسارات الحديثة غير متاحة حالياً.");
      }

      const result = await routesLib.Route.computeRoutes({
        origin,
        destination: { lat: dest.lat, lng: dest.lng },
        travelMode: "DRIVING",
        fields: ["path", "distanceMeters", "durationMillis", "localizedValues"],
      });

      const firstRoute = result.routes?.[0];
      if (!firstRoute?.path || firstRoute.path.length === 0) {
        throw new Error("لم يتم إرجاع مسار بين النقطتين.");
      }

      const pathPoints = firstRoute.path.map((pt) => ({
        lat: typeof pt.lat === "function" ? pt.lat() : Number((pt as unknown as { lat: number }).lat),
        lng: typeof pt.lng === "function" ? pt.lng() : Number((pt as unknown as { lng: number }).lng),
      }));

      const km = firstRoute.distanceMeters ? (firstRoute.distanceMeters / 1000).toFixed(1) : "—";
      const mins = firstRoute.durationMillis ? Math.max(1, Math.round(firstRoute.durationMillis / 60000)) : 0;

      setRouteSummary({
        distanceText: firstRoute.localizedValues?.distance || `${km} كم`,
        durationText: firstRoute.localizedValues?.duration || `${mins} دقيقة`,
        path: pathPoints,
      });
    } catch (err) {
      setMapError(err instanceof Error ? err.message : "تعذر حساب المسار.");
    } finally {
      setRoutingBusy(false);
    }
  };

  // Gemini 4 Hydrogen + Maps Grounding
  const handleAskMapsGrounding = async () => {
    if (!aiQuestion.trim() || aiBusy) return;
    if (!user) {
      await signInWithGoogle();
      return;
    }
    setAiBusy(true);
    setMapError(null);
    setAiReply(null);
    setAiSources([]);

    try {
      const headers = await getGoogleAuthHeaders();
      const targetCoords = selectedPlace
        ? { latitude: selectedPlace.lat, longitude: selectedPlace.lng }
        : userPos
          ? { latitude: userPos.lat, longitude: userPos.lng }
          : { latitude: center.lat, longitude: center.lng };

      const res = await fetch("/api/llm/chat", {
        method: "POST",
        headers,
        body: JSON.stringify({
          message: aiQuestion,
          session_id: "maps_grounding_panel",
          engineMode: "cloud",
          modelId: "gemini-4-hydrogen",
          groundingMode: "maps",
          userLocation: targetCoords,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "تعذر جلب بيانات خرائط Google.");
      }
      setAiReply(data.reply || "");
      setAiSources(Array.isArray(data.groundingSources) ? data.groundingSources : []);
      if (user) {
        void recordCloudUsageInFirestore(user, Number(data.usageTokens || 400), "gemini-4-hydrogen");
        void refreshDailyQuota();
      }
    } catch (err) {
      setMapError(err instanceof Error ? err.message : "خطأ غير متوقع");
    } finally {
      setAiBusy(false);
    }
  };

  if (!apiKey) {
    return null;
  }

  return (
    <div className="grid h-full grid-cols-1 gap-4 p-4 lg:grid-cols-[1.35fr_0.95fr] lg:p-6">
      {/* Map Column */}
      <div
        className="flex min-h-[440px] flex-col overflow-hidden rounded-2xl border"
        style={{
          backgroundColor: "var(--nawa-surface)",
          borderColor: "var(--nawa-border)",
        }}
      >
        {/* Map Search Toolbar */}
        <div
          className="relative flex flex-wrap items-center gap-2 border-b p-3"
          style={{ borderColor: "var(--nawa-border)" }}
        >
          <div className="relative flex-1 min-w-[210px]">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleSearchPlaces();
                }
              }}
              placeholder="ابحث عن مكان، مطعم، مستشفى، أو شارع..."
              className="h-10 w-full rounded-xl border pe-3 ps-9 text-xs focus:outline-none"
              style={{
                backgroundColor: "var(--nawa-elevated)",
                borderColor: "var(--nawa-border)",
                color: "var(--nawa-text)",
              }}
            />
            <Search
              className="pointer-events-none absolute start-3 top-3 h-4 w-4"
              style={{ color: "var(--nawa-muted)" }}
            />

            {suggestions.length > 0 && (
              <div
                className="absolute inset-x-0 top-11 z-30 rounded-xl border p-1 shadow-xl"
                style={{
                  backgroundColor: "var(--nawa-surface)",
                  borderColor: "var(--nawa-border)",
                }}
              >
                {suggestions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => void handleSelectAutocomplete(s)}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-right text-xs transition-colors hover:opacity-80"
                    style={{ color: "var(--nawa-text)" }}
                  >
                    <MapPin className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--nawa-accent)" }} />
                    <span className="truncate">{s.text}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            disabled={searching}
            onClick={() => void handleSearchPlaces()}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl px-4 text-xs font-semibold text-white whitespace-nowrap shrink-0 disabled:opacity-50"
            style={{ backgroundColor: "var(--nawa-accent)" }}
          >
            {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
            <span>بحث الأماكن</span>
          </button>

          <button
            type="button"
            onClick={locateMe}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border px-3 text-xs font-medium whitespace-nowrap shrink-0"
            style={{
              backgroundColor: "var(--nawa-elevated)",
              borderColor: "var(--nawa-border)",
              color: "var(--nawa-text)",
            }}
          >
            <Navigation className="h-3.5 w-3.5" style={{ color: "var(--nawa-accent)" }} />
            <span>موقعي</span>
          </button>
        </div>

        {/* Interactive Google Map Canvas */}
        <div className="relative min-h-[380px] flex-1">
          <GoogleMap
            defaultCenter={DEFAULT_CENTER}
            defaultZoom={12}
            mapId="DEMO_MAP_ID"
            internalUsageAttributionIds={["gmp_mcp_codeassist_v1_aistudio"]}
            gestureHandling="greedy"
            className="h-full w-full"
          >
            {userPos && (
              <AdvancedMarker position={userPos} title="موقعي الحالي">
                <Pin background="#059669" borderColor="#FFFFFF" glyphColor="#FFFFFF" />
              </AdvancedMarker>
            )}

            {places.map((p) => (
              <AdvancedMarker
                key={p.id}
                position={{ lat: p.lat, lng: p.lng }}
                title={p.name}
                onClick={() => setSelectedPlace(p)}
              >
                <Pin
                  background={selectedPlace?.id === p.id ? "#2563EB" : "#C96442"}
                  borderColor="#FFFFFF"
                  glyphColor="#FFFFFF"
                />
              </AdvancedMarker>
            ))}

            {selectedPlace && (
              <InfoWindow
                position={{ lat: selectedPlace.lat, lng: selectedPlace.lng }}
                onCloseClick={() => setSelectedPlace(null)}
              >
                <div className="max-w-[230px] space-y-1.5 text-right text-slate-900" dir="rtl">
                  <div className="text-xs font-bold">{selectedPlace.name}</div>
                  {selectedPlace.address && (
                    <div className="text-[11px] text-slate-600">{selectedPlace.address}</div>
                  )}
                  {selectedPlace.rating && (
                    <div className="flex items-center gap-1 text-[11px] font-semibold text-amber-600">
                      <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                      <span>{selectedPlace.rating}</span>
                    </div>
                  )}
                  <button
                    type="button"
                    disabled={routingBusy}
                    onClick={() => void handleComputeRoute(selectedPlace)}
                    className="mt-1 inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1 text-[11px] font-semibold text-white"
                  >
                    <Navigation className="h-3 w-3" />
                    <span>{routingBusy ? "جاري الحساب..." : "رسم المسار إليه"}</span>
                  </button>
                </div>
              </InfoWindow>
            )}

            {routeSummary && <RoutePolylineOverlay path={routeSummary.path} />}
          </GoogleMap>

          {routeSummary && (
            <div
              className="absolute bottom-3 start-3 z-20 flex items-center gap-3 rounded-xl border px-3.5 py-2 text-xs shadow-lg"
              style={{
                backgroundColor: "var(--nawa-surface)",
                borderColor: "var(--nawa-border)",
                color: "var(--nawa-text)",
              }}
            >
              <Navigation className="h-4 w-4 shrink-0" style={{ color: "var(--nawa-accent)" }} />
              <span>
                المسافة: <strong>{routeSummary.distanceText}</strong> · الزمن المتوقع:{" "}
                <strong>{routeSummary.durationText}</strong>
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Places List + Maps Grounding AI Assistant Column */}
      <div className="flex flex-col gap-4">
        {mapError && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-500">
            {mapError}
          </div>
        )}

        {/* Maps Grounding Panel */}
        <div
          className="rounded-2xl border p-4 space-y-3"
          style={{
            backgroundColor: "var(--nawa-surface)",
            borderColor: "var(--nawa-border)",
          }}
        >
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" style={{ color: "var(--nawa-accent)" }} />
            <h3 className="font-display text-sm font-bold">
              مساعد استكشاف خرائط Google الذكي
            </h3>
          </div>
          <p className="text-xs leading-relaxed" style={{ color: "var(--nawa-muted)" }}>
            اسأل عن الأماكن والتقييمات والاتجاهات المحيطة بموقعك مع روابط موثقة من خرائط Google.
          </p>

          <div className="flex gap-2">
            <input
              type="text"
              value={aiQuestion}
              onChange={(e) => setAiQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleAskMapsGrounding();
                }
              }}
              placeholder="مثال: رشحلي أقرب مقهى هادئ بتقييم ممتاز..."
              className="h-10 flex-1 rounded-xl border px-3 text-xs focus:outline-none"
              style={{
                backgroundColor: "var(--nawa-elevated)",
                borderColor: "var(--nawa-border)",
                color: "var(--nawa-text)",
              }}
            />
            <button
              type="button"
              disabled={aiBusy || !aiQuestion.trim()}
              onClick={() => void handleAskMapsGrounding()}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl px-4 text-xs font-semibold text-white whitespace-nowrap shrink-0 disabled:opacity-50"
              style={{ backgroundColor: "var(--nawa-accent)" }}
            >
              {aiBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              <span>{user ? "اسأل الخرائط" : "دخول Google"}</span>
            </button>
          </div>

          {aiReply && (
            <div
              className="max-h-64 overflow-y-auto rounded-xl border p-3.5 text-xs leading-relaxed space-y-2.5"
              style={{
                backgroundColor: "var(--nawa-elevated)",
                borderColor: "var(--nawa-border)",
                color: "var(--nawa-text)",
              }}
            >
              <div className="whitespace-pre-wrap">{aiReply}</div>
              {aiSources.length > 0 && (
                <div className="space-y-1.5 border-t pt-2" style={{ borderColor: "var(--nawa-border)" }}>
                  <div className="text-[11px] font-semibold" style={{ color: "var(--nawa-muted)" }}>
                    مواقع وتقييمات من خرائط Google:
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {aiSources.map((src) => (
                      <a
                        key={src.uri}
                        href={src.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-medium hover:opacity-85"
                        style={{
                          backgroundColor: "var(--nawa-surface)",
                          borderColor: "var(--nawa-border)",
                          color: "var(--nawa-accent)",
                        }}
                      >
                        <ExternalLink className="h-3 w-3 shrink-0" />
                        <span>{src.title}</span>
                      </a>
                    ))}
                  </div>
                  {aiSources.some((s) => s.snippet) && (
                    <div className="space-y-1 pt-1">
                      {aiSources
                        .filter((s) => s.snippet)
                        .slice(0, 2)
                        .map((s) => (
                          <div
                            key={`${s.uri}_snip`}
                            className="text-[11px] italic"
                            style={{ color: "var(--nawa-muted)" }}
                          >
                            «{s.snippet}» — {s.title}
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Places Results List */}
        <div
          className="flex-1 rounded-2xl border p-4 space-y-2.5 overflow-y-auto max-h-[320px]"
          style={{
            backgroundColor: "var(--nawa-surface)",
            borderColor: "var(--nawa-border)",
          }}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold">نتائج البحث ({places.length})</span>
            <span className="text-[11px]" style={{ color: "var(--nawa-muted)" }}>
              اضغط لعرض التفاصيل أو رسم المسار
            </span>
          </div>

          {places.length === 0 ? (
            <div className="py-6 text-center text-xs" style={{ color: "var(--nawa-muted)" }}>
              ابحث عن أي وجهة لعرض العلامات على الخريطة وحساب المسار بالسيارة.
            </div>
          ) : (
            <div className="space-y-2">
              {places.map((p) => {
                const active = selectedPlace?.id === p.id;
                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-2 rounded-xl border p-2.5 text-xs transition-colors"
                    style={{
                      backgroundColor: active ? "var(--nawa-accent-soft)" : "var(--nawa-elevated)",
                      borderColor: active ? "var(--nawa-accent)" : "var(--nawa-border)",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedPlace(p);
                        map?.panTo({ lat: p.lat, lng: p.lng });
                        map?.setZoom(15);
                      }}
                      className="min-w-0 flex-1 text-right"
                    >
                      <div className="truncate font-semibold">{p.name}</div>
                      {p.address && (
                        <div className="truncate text-[11px]" style={{ color: "var(--nawa-muted)" }}>
                          {p.address}
                        </div>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleComputeRoute(p)}
                      className="inline-flex h-8 items-center gap-1 rounded-lg border px-2.5 text-[11px] font-medium shrink-0"
                      style={{
                        backgroundColor: "var(--nawa-surface)",
                        borderColor: "var(--nawa-border)",
                        color: "var(--nawa-accent)",
                      }}
                    >
                      <Navigation className="h-3 w-3" />
                      <span>مسار</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function GoogleMapsView() {
  const [apiKey, setApiKey] = useState<string>(
    () => (import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "").trim()
  );
  const [loadingKey, setLoadingKey] = useState(!apiKey);

  useEffect(() => {
    if (apiKey) return;
    let active = true;
    fetch("/api/maps/config")
      .then((r) => r.json())
      .then((d) => {
        if (active && typeof d?.apiKey === "string") {
          setApiKey(d.apiKey.trim());
        }
      })
      .catch(() => null)
      .finally(() => {
        if (active) setLoadingKey(false);
      });
    return () => {
      active = false;
    };
  }, [apiKey]);

  if (loadingKey) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm" style={{ color: "var(--nawa-muted)" }}>
        <Loader2 className="me-2 h-4 w-4 animate-spin" />
        <span>جاري تحميل خرائط Google...</span>
      </div>
    );
  }

  if (!apiKey) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <div
          className="rounded-2xl border p-6 text-center space-y-3"
          style={{
            backgroundColor: "var(--nawa-surface)",
            borderColor: "var(--nawa-border)",
          }}
        >
          <MapPin className="mx-auto h-8 w-8" style={{ color: "var(--nawa-accent)" }} />
          <h2 className="font-display text-lg font-bold">خرائط Google التفاعلية</h2>
          <p className="text-xs leading-relaxed" style={{ color: "var(--nawa-muted)" }}>
            مفتاح خرائط Google غير متوفر في هذه البيئة حالياً. تأكد من تفعيل مفتاح الخرائط في إعدادات المشروع لإظهار الخريطة التفاعلية والمسارات.
          </p>
        </div>
      </div>
    );
  }

  return (
    <APIProvider
      apiKey={apiKey}
      language="ar"
    >
      <MapsInnerWorkspace apiKey={apiKey} />
    </APIProvider>
  );
}
