import { useCallback, useEffect, useRef, useState } from "react";
import Globe, { type GlobeMethods } from "react-globe.gl";
import type { MotionValue } from "framer-motion";
import * as THREE from "three";
// India's boundary as India officially depicts it (includes all of J&K,
// Ladakh incl. Aksai Chin, and Arunachal Pradesh). Source: Natural Earth
// 1:10m admin-0 "India point-of-view" dataset (public domain), simplified.
// Mainland outline only: the Andaman & Nicobar islands are left unhighlighted
// on purpose (tiny glowing specks read as noise at this scale).
import indiaBoundary from "./india-boundary.json";
import type { StateMarker } from "./indiaStats";

// Minimal shapes of the three.js objects we touch (avoids adding @types/three).
type PhongLike = {
  isMeshPhongMaterial?: boolean;
  map: TextureLike | null;
  emissiveMap: TextureLike | null;
  emissive: { set: (color: string) => void };
  emissiveIntensity: number;
  shininess: number;
  needsUpdate: boolean;
};
type TextureLike = {
  image?: CanvasImageSource & { width: number; height: number };
  colorSpace?: string;
  needsUpdate?: boolean;
  constructor: new (image: HTMLCanvasElement) => TextureLike;
};
type CameraLike = {
  setViewOffset: (fw: number, fh: number, x: number, y: number, w: number, h: number) => void;
};

/**
 * Full-screen NASA night-lights globe whose CAMERA is driven by scroll.
 *
 * The parent passes a progress MotionValue (0 → 1) and a `getPose` function.
 * On every scroll frame we move the 3D camera (lat / lng / altitude) and
 * shift the projection centre (view offset) so the globe can sit
 * off-screen bottom-left at the start — the "close to the planet, horizon
 * glowing on the right" shot — and centred on India at the end.
 *
 * The globe is still at the opening shot and starts revolving (eastward,
 * like the real Earth) once the user scrolls, continuing to the login card.
 *
 * globe.gl's own render loop is paused; we drive rendering from one rAF
 * loop (which the browser pauses automatically in background tabs).
 *
 * Loaded via React.lazy() so three.js stays out of the main bundle.
 */

export const GLOBE_IMAGE_URL = "//unpkg.com/three-globe/example/img/earth-night.jpg";
/**
 * Optional sharper texture. If a file exists at frontend/public/textures/
 * earth-night-hires.jpg (e.g. NASA "Black Marble 2016", public domain), it's
 * used instead of the 4096px one above. three.js automatically downsizes it
 * if it's bigger than the GPU's max texture size.
 */
export const HIRES_GLOBE_IMAGE_URL = "/textures/earth-night-hires.jpg";

/** Degrees per second the globe revolves once the user scrolls. */
const SPIN_SPEED = 3;

/** India highlight: saffron glow that breathes (lifts up and down). */
const INDIA_GLOW = "#10b981";
const PULSE_SECONDS = 2.4; // one full up-and-down
const PULSE_LIFT = 0.018; // how far it rises off the surface (× globe radius)
/** Brightness of the world's city lights once scrolling has started. */
const CITY_LIGHTS = 1.8;

type GlowMaterial = {
  opacity: number;
  transparent: boolean;
  depthWrite: boolean;
  blending: number;
  userData: { baseOpacity?: number };
};
type Object3DLike = {
  scale: { setScalar: (v: number) => void };
  traverse: (cb: (o: { material?: GlowMaterial | GlowMaterial[] }) => void) => void;
};
const INDIA_FEATURE = indiaBoundary as { geometry: unknown; __threeObj?: Object3DLike };

/**
 * Opening-shot "network": light arcs between Indian cities plus ripple rings
 * at each city — support reaching people across the country. Shown only
 * while the page is at the top; it fades away as soon as the user scrolls.
 */
const CITIES = [
  { name: "Delhi", lat: 28.61, lng: 77.21 },
  { name: "Mumbai", lat: 19.08, lng: 72.88 },
  { name: "Kolkata", lat: 22.57, lng: 88.36 },
  { name: "Chennai", lat: 13.08, lng: 80.27 },
  { name: "Bengaluru", lat: 12.97, lng: 77.59 },
  { name: "Hyderabad", lat: 17.39, lng: 78.49 },
  { name: "Ahmedabad", lat: 23.02, lng: 72.57 },
  { name: "Lucknow", lat: 26.85, lng: 80.95 },
  { name: "Bhopal", lat: 23.26, lng: 77.41 },
  { name: "Guwahati", lat: 26.14, lng: 91.74 },
  { name: "Srinagar", lat: 34.08, lng: 74.8 },
  { name: "Thiruvananthapuram", lat: 8.52, lng: 76.94 },
];
const cityAt = (n: string) => CITIES.find((c) => c.name === n)!;
const ARCS = [
  ["Delhi", "Mumbai"], ["Delhi", "Kolkata"], ["Delhi", "Srinagar"], ["Delhi", "Lucknow"],
  ["Mumbai", "Bengaluru"], ["Mumbai", "Ahmedabad"], ["Bengaluru", "Chennai"], ["Chennai", "Kolkata"],
  ["Hyderabad", "Delhi"], ["Kolkata", "Guwahati"], ["Bhopal", "Hyderabad"], ["Bengaluru", "Thiruvananthapuram"],
  ["Ahmedabad", "Bhopal"], ["Lucknow", "Kolkata"],
].map(([a, b], i) => {
  const s = cityAt(a), e = cityAt(b);
  return { startLat: s.lat, startLng: s.lng, endLat: e.lat, endLng: e.lng, gap: (i * 0.37) % 1 };
});
/** Scroll progress after which the opening network fades away. */
const NETWORK_UNTIL = 0.04;

export const BACKGROUND_IMAGE_URL = "//unpkg.com/three-globe/example/img/night-sky.png";

export interface GlobePose {
  lat: number;
  lng: number;
  altitude: number;
  /** Where the globe's centre sits on screen, in CSS px from the top-left. */
  cx: number;
  cy: number;
}

interface IndiaGlobeProps {
  width: number;
  height: number;
  progress: MotionValue<number>;
  getPose: (progress: number, width: number, height: number) => GlobePose;
  onReady?: () => void;
  /** Data pins pinned to places on the globe (they follow the rotation). */
  markers?: StateMarker[];
  /** 0..1 visibility of the pins for a given scroll progress. */
  markerOpacity?: (progress: number) => number;
}

function preload(src: string) {
  return new Promise<void>((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve();
    img.onerror = () => resolve(); // never block the page on a texture
    img.src = src;
  });
}

/**
 * Builds a black texture with only the city lights kept. Runs once, at
 * load, before the page is interactive with the globe.
 */
function buildCityLightsMap(map: TextureLike): TextureLike | null {
  const img = map.image;
  if (!img || !img.width) return null;
  try {
    // Full resolution up to 8192px wide (bigger textures would make this
    // one-off pass slow and exceed many GPUs' texture limit anyway).
    const scale = Math.min(1, 8192 / img.width);
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h);
    const px = data.data;
    for (let i = 0; i < px.length; i += 4) {
      // In this texture land/sea are dark blue (red ≈ 0) and city lights
      // are grey-white, so the red channel isolates the lights cleanly.
      const k = Math.max(0, Math.min(1, (px[i] - 14) / 70));
      px[i] = px[i + 1] = px[i + 2] = Math.round(255 * k);
    }
    ctx.putImageData(data, 0, 0);
    const tex = new map.constructor(canvas);
    tex.colorSpace = map.colorSpace;
    tex.needsUpdate = true;
    return tex;
  } catch {
    return null; // e.g. texture served without CORS — fall back to plain texture
  }
}

/**
 * Blue atmosphere that hugs the planet: a thin bright rim ON the globe's
 * edge plus a halo just outside it that fades outward. (globe.gl's built-in
 * atmosphere peaks away from the surface, which leaves a dark gap.)
 */
function buildAtmosphere(radius: number) {
  const group = new THREE.Group();
  const vertexShader = `
    varying vec3 vNormal;
    varying vec3 vViewPos;
    void main() {
      vNormal = normalize(normalMatrix * normal);
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vViewPos = mv.xyz;
      gl_Position = projectionMatrix * mv;
    }`;
  // Rim: brightest exactly at the limb, on the planet itself.
  const rim = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 1.004, 96, 96),
    new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader: `
        varying vec3 vNormal;
        varying vec3 vViewPos;
        void main() {
          float f = 1.0 - max(dot(vNormal, normalize(-vViewPos)), 0.0);
          float i = pow(f, 3.2) * 1.35;
          gl_FragColor = vec4(vec3(0.33, 0.66, 1.0) * i, i);
        }`,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    }),
  );
  // Halo: starts at the limb and fades out into space — no gap.
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 1.13, 96, 96),
    new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader: `
        varying vec3 vNormal;
        varying vec3 vViewPos;
        void main() {
          float d = dot(vNormal, normalize(-vViewPos)); // ~0 at halo edge, <0 toward the planet
          float i = pow(clamp(0.62 - d, 0.0, 2.0), 6.0) * 0.16;
          gl_FragColor = vec4(vec3(0.28, 0.6, 1.0) * i, i);
        }`,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    }),
  );
  group.add(halo, rim);
  return group;
}

export default function IndiaGlobe({ width, height, progress, getPose, onReady, markers = [], markerOpacity }: IndiaGlobeProps) {
  const markerRefs = useRef<(HTMLDivElement | null)[]>([]);
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const texturesLoaded = useRef<Promise<unknown> | null>(null);
  const [ready, setReady] = useState(false);
  const [showNetwork, setShowNetwork] = useState(true);
  const showNetworkRef = useRef(true);
  const earthMaterial = useRef<PhongLike | null>(null);
  const [globeImageUrl, setGlobeImageUrl] = useState<string | null>(null);

  // Use the high-res texture if the project ships one. (A missing file comes
  // back as Vite's index.html, hence the content-type check.)
  useEffect(() => {
    let cancelled = false;
    fetch(HIRES_GLOBE_IMAGE_URL, { method: "HEAD" })
      .then((r) => (r.ok && (r.headers.get("content-type") || "").startsWith("image/") ? HIRES_GLOBE_IMAGE_URL : GLOBE_IMAGE_URL))
      .catch(() => GLOBE_IMAGE_URL)
      .then((url) => {
        if (cancelled) return;
        texturesLoaded.current = Promise.all([preload(url), preload(BACKGROUND_IMAGE_URL)]);
        setGlobeImageUrl(url);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleGlobeReady = useCallback(() => {
    const globe = globeRef.current;
    if (!globe) return;

    // Camera is scroll-driven only: no drag / zoom / pan. enableZoom=false also
    // stops OrbitControls from preventDefault-ing wheel events (page scroll).
    // Don't set controls.enabled=false — globe.gl needs controls.update().
    const controls = globe.controls();
    controls.autoRotate = false;
    controls.enableRotate = false;
    controls.enableZoom = false;
    controls.enablePan = false;

    // Canvas is full-viewport: cap DPR so weaker GPUs aren't filling 4-9x pixels.
    globe.renderer().setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));

    globe.scene().add(buildAtmosphere(globe.getGlobeRadius()));

    texturesLoaded.current!.then(() => {
      // Let globe.gl upload the textures, then stop its render loop.
      window.setTimeout(() => {
        // Textures are applied by now (they aren't yet at onGlobeReady).
        // Reference look: deep-navy land, warm gold city lights that glow on
        // their own. Dim the scene lights so land/sea go dark, then add an
        // emissive map that contains ONLY the city lights.
        globe.lights().forEach((light) => {
          const l = light as unknown as { isAmbientLight?: boolean; intensity: number };
          l.intensity *= l.isAmbientLight ? 0.45 : 0.7;
        });
        globe.scene().traverse((obj: { material?: unknown }) => {
          const mat = obj.material as PhongLike | undefined;
          if (!mat) return;
          // The night-sky sphere (MeshBasicMaterial): dim the same texture so
          // the star field reads as sparse and deep, like the reference.
          const basic = mat as unknown as { isMeshBasicMaterial?: boolean; color?: { set: (c: string) => void } };
          if (basic.isMeshBasicMaterial && mat.map && basic.color) {
            basic.color.set("#5a5f6e");
            return;
          }
          if (!mat.isMeshPhongMaterial || !mat.map || !mat.emissive) return;
          mat.shininess = 4;
          const lights = buildCityLightsMap(mat.map);
          // Sharper texture near the horizon, where it's seen at a grazing angle.
          const aniso = globe.renderer().capabilities.getMaxAnisotropy();
          (mat.map as { anisotropy?: number }).anisotropy = aniso;
          if (lights) {
            (lights as { anisotropy?: number }).anisotropy = aniso;
            mat.emissiveMap = lights;
            mat.emissive.set("#ffc46b");
            mat.emissiveIntensity = 0; // off until the user scrolls — only India glows
            earthMaterial.current = mat;
          }
          mat.needsUpdate = true;
        });
        globeRef.current?.pauseAnimation();
        // pauseAnimation() also freezes the layers' own tickers (arc dashes,
        // ripple rings). Our loop renders every frame, so let those run.
        globe.scene().children.forEach((o: unknown) => {
          const layer = o as unknown as { resumeAnimation?: () => void };
          if (typeof layer.resumeAnimation === "function") layer.resumeAnimation();
        });
        setReady(true);
        onReady?.();
      }, 400);
    });
  }, [onReady]);

  // One rAF loop drives the camera: scroll position (via getPose) plus a
  // continuous spin.
  useEffect(() => {
    if (!ready) return;
    let raf = 0;
    let spin = 0; // degrees of longitude added on top of the scroll pose
    let last = performance.now();

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const globe = globeRef.current;
      if (!globe) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      const p = progress.get();
      const wantNetwork = p < NETWORK_UNTIL;
      if (wantNetwork !== showNetworkRef.current) {
        showNetworkRef.current = wantNetwork;
        setShowNetwork(wantNetwork);
      }
      // Still at the opening shot; starts revolving once the user scrolls and
      // keeps revolving through to the login card. Back at the very top, the
      // spin eases back so the opening shot looks the same again.
      const spinWeight = Math.min(1, Math.max(0, (p - 0.01) / 0.1));
      if (spinWeight > 0) {
        // Camera moving west = the planet turning east, like the real Earth.
        spin -= SPIN_SPEED * spinWeight * dt;
        if (spin < -360) spin += 360;
      } else if (spin !== 0) {
        let d = ((spin % 360) + 540) % 360 - 180; // shortest way back
        d *= Math.exp(-dt * 5);
        spin = Math.abs(d) < 0.01 ? 0 : d;
      }

      // India glow: breathe up and down, brightening as it rises.
      const pulse = (1 - Math.cos((now / 1000 / PULSE_SECONDS) * Math.PI * 2)) / 2; // 0..1
      const indiaObj = INDIA_FEATURE.__threeObj;
      if (indiaObj) {
        indiaObj.scale.setScalar(1 + PULSE_LIFT * pulse);
        indiaObj.traverse((o) => {
          const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
          for (const m of mats) {
            if (m.userData.baseOpacity === undefined) {
              m.userData.baseOpacity = m.opacity;
              m.transparent = true;
              m.depthWrite = false;
              m.blending = 2; // THREE.AdditiveBlending — reads as light, not paint
            }
            m.opacity = m.userData.baseOpacity * (0.45 + 0.55 * pulse);
          }
        });
      }

      const A = (window as any).__atmo; if (A) { globe.scene().traverse((o: any) => { const u = o.material?.uniforms; if (u?.coefficient) { u.coefficient.value = A.c; u.power.value = A.p; } }); }
      // Opening shot: only India glows. The rest of the world's city lights
      // fade in as the user starts scrolling.
      if (earthMaterial.current) {
        earthMaterial.current.emissiveIntensity = CITY_LIGHTS * Math.min(1, Math.max(0, (p - 0.01) / 0.2));
      }

      const pose = getPose(p, width, height);

      globe.pointOfView({ lat: pose.lat, lng: pose.lng + spin, altitude: pose.altitude }, 0);
      // pointOfView only moves the camera and the controls' target; with
      // globe.gl's loop paused nobody re-aims it, so do that here.
      globe.controls().update();
      const camera = globe.camera() as unknown as CameraLike;
      camera.setViewOffset(width, height, width / 2 - pose.cx, height / 2 - pose.cy, width, height);
      globe.renderer().render(globe.scene(), globe.camera());

      // Pins: project each place to the screen; hide it when it's round the
      // back of the planet or the scroll isn't in the data section.
      const mo = markerOpacity ? markerOpacity(p) : 0;
      const cam = (globe.camera() as unknown as { position: { x: number; y: number; z: number } }).position;
      markers.forEach((m, i) => {
        const el = markerRefs.current[i];
        if (!el) return;
        if (mo <= 0.001) {
          el.style.opacity = "0";
          return;
        }
        const pt = globe.getCoords(m.lat, m.lng, 0);
        const facing = pt.x * (cam.x - pt.x) + pt.y * (cam.y - pt.y) + pt.z * (cam.z - pt.z) > 0;
        const s = globe.getScreenCoords(m.lat, m.lng, 0.01);
        el.style.transform = `translate3d(${s.x}px, ${s.y}px, 0)`;
        el.style.opacity = facing ? String(mo) : "0";
      });
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ready, width, height, getPose, progress, markers, markerOpacity]);

  // Before the loop is paused, keep the camera on the start pose.
  const initial = getPose(progress.get(), width, height);

  if (!globeImageUrl) return null;

  return (
    <div className="relative" style={{ width, height }}>
    <Globe
      ref={globeRef}
      width={width}
      height={height}
      globeOffset={[initial.cx - width / 2, initial.cy - height / 2]}
      globeImageUrl={globeImageUrl}
      backgroundImageUrl={BACKGROUND_IMAGE_URL}
      backgroundColor="#000000"
      showAtmosphere={false} // custom one in buildAtmosphere()
      polygonsData={[INDIA_FEATURE]}
      polygonCapColor={() => "rgba(16,185,129,0.24)"}
      polygonSideColor={() => "rgba(16,185,129,0.22)"}
      polygonStrokeColor={() => INDIA_GLOW}
      polygonAltitude={0.006}
      polygonsTransitionDuration={0}
      // Opening network: arcs of light between cities + ripples at each city
      arcsData={showNetwork ? ARCS : []}
      arcColor={() => ["rgba(167,243,208,0.15)", "rgba(236,253,245,1)", "rgba(167,243,208,0.15)"]}
      arcStroke={0.4}
      arcAltitudeAutoScale={0.4}
      arcDashLength={0.45}
      arcDashGap={0.9}
      arcDashInitialGap={(d: object) => (d as { gap: number }).gap * 1.35}
      arcDashAnimateTime={2600}
      arcsTransitionDuration={900}
      ringsData={showNetwork ? CITIES : []}
      ringColor={() => (t: number) => `rgba(209,250,229,${Math.max(0, 1 - t)})`}
      ringMaxRadius={2}
      ringPropagationSpeed={1.2}
      ringRepeatPeriod={1400}
      // above India's glowing cap even at the top of its pulse
      ringAltitude={0.03}
      animateIn={false}
      enablePointerInteraction={false}
      rendererConfig={{ antialias: true, powerPreference: "high-performance" }}
      onGlobeReady={() => {
        const p = getPose(progress.get(), width, height);
        globeRef.current?.pointOfView({ lat: p.lat, lng: p.lng, altitude: p.altitude }, 0);
        handleGlobeReady();
      }}
    />
      {/* Data pins (positioned every frame in the loop above) */}
      <div aria-hidden className="absolute inset-0 pointer-events-none overflow-hidden">
        {markers.map((m, i) => {
          // Phones: shorter leader lines and state codes so labels stay on screen.
          const compact = width < 640;
          const [lx, ly] = compact ? [m.label[0] * 0.42, m.label[1] * 0.55] : m.label;
          return (
          <div
            key={m.name}
            ref={(el) => {
              markerRefs.current[i] = el;
            }}
            className="absolute left-0 top-0 transition-opacity duration-300"
            style={{ opacity: 0, willChange: "transform, opacity" }}
          >
            {/* dot sits exactly on the place; a leader line runs out to its label */}
            <svg className="absolute overflow-visible" width="1" height="1" style={{ left: 0, top: 0 }}>
              <line x1="0" y1="0" x2={lx} y2={ly} stroke="#34d399" strokeOpacity="0.7" strokeWidth="1" />
            </svg>
            <span className="absolute -left-[5px] -top-[5px] w-2.5 h-2.5 rounded-full bg-[#34d399] shadow-[0_0_12px_4px_rgba(16,185,129,0.7)]" />
            <span className="absolute -left-[5px] -top-[5px] w-2.5 h-2.5 rounded-full bg-[#10b981] animate-ping" />
            <span
              className="absolute whitespace-nowrap rounded-lg border border-[#10b981]/35 bg-black/70 backdrop-blur-sm px-2.5 py-1"
              style={{
                left: lx,
                top: ly,
                transform: `translate(${lx < 0 ? "-100%" : "0"}, -50%)`,
              }}
            >
              <span className="block text-[13px] font-semibold text-white tabular-nums" style={{ fontFamily: '"Plus Jakarta Sans", Inter, sans-serif' }}>
                {m.cases.toLocaleString("en-IN")}
              </span>
              <span className="block text-[10px] uppercase tracking-[0.14em] text-[#a7f3d0]">{compact ? m.short : m.name}</span>
            </span>
          </div>
          );
        })}
      </div>
    </div>
  );
}
