import * as THREE from "three";
import type { DrinkRecipe } from "../app/recipes";
import type { PortraitRig } from "../character/portrait";
import { createBar } from "./bar";
import { createCabinet } from "./cabinet";
import {
  GlassCarousel,
  type AudioBands,
  type GlassScreenInfo,
} from "./glasses";
import { LapplandCharacter } from "./lappland";
import { BAR } from "./layout";
import { PostFX, type Quality } from "./post";
import { createRoom } from "./room";
import { makeCoasterTexture, makeEnvironmentTexture } from "./textures";
import { damp, hexToRgb01, smoothstep } from "./util";

export interface FrameInfo {
  width: number;
  height: number;
  glasses: GlassScreenInfo[];
  /** Front lip of the counter in CSS pixels, left to right. */
  barEdge: [number, number][];
  /** Where the counter's front fascia starts under the current glass. */
  plaque: { x: number; y: number };
  /** Head of Lappland in CSS pixels (for keeping UI off her face). */
  face: { x: number; y: number };
}

export interface SceneOptions {
  quality?: Quality;
  reducedMotion?: boolean;
  getAnalyser?: () => AnalyserNode | undefined;
  onFrame?: (info: FrameInfo) => void;
  onQualityChange?: (quality: Quality) => void;
  /** Test hook: do not run the animation loop; frames are produced by `advance()`. */
  manual?: boolean;
}

const SILENCE: AudioBands = { bass: 0, mid: 0, high: 0, level: 0 };
/** Frame cap in performance mode. */
const SAVER_FPS = 20;
/** After the pointer moves over an unfocused window, keep drawing this long (ms). */
const SAVER_WAKE_MS = 4000;

export class TavernScene {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(32, 1, 0.1, 40);
  private post: PostFX;
  private carousel: GlassCarousel;
  private character?: LapplandCharacter;
  private cabinet: ReturnType<typeof createCabinet>;
  private room: ReturnType<typeof createRoom>;
  private bar: ReturnType<typeof createBar>;
  private envTexture: THREE.DataTexture;
  private envTarget: THREE.WebGLRenderTarget;
  private spot: THREE.SpotLight;
  private candleLights: THREE.PointLight[] = [];
  private frame = 0;
  private last = performance.now();
  private time = 0;
  private width = 1;
  private height = 1;
  private pointer = new THREE.Vector2();
  private pointerSmooth = new THREE.Vector2();
  private playing = false;
  private progress = 0;
  private audio: AudioBands = { ...SILENCE };
  private audioData?: Uint8Array<ArrayBuffer>;
  private bassAverage = 0;
  private beat = 0;
  private cameraKick = 0;
  private cameraKickVel = 0;
  private spotDip = 0;
  private currentDrink = new THREE.Color(0.8, 0.2, 0.3);
  private reduced: boolean;
  private quality: Quality;
  private frameTimes: number[] = [];
  private qualityLocked = false;
  private saver = false;
  private sleeping = false;
  private wokeAt = 0;
  private beforeSaver?: { quality: Quality; locked: boolean };
  private disposed = false;
  private raycaster = new THREE.Raycaster();
  private portraitToken = 0;
  private resizeObserver: ResizeObserver;
  private baseCamera = {
    fov: 32,
    pos: new THREE.Vector3(),
    target: new THREE.Vector3(),
  };

  constructor(
    private host: HTMLElement,
    private options: SceneOptions = {},
  ) {
    this.reduced = options.reducedMotion ?? false;
    this.quality = options.quality ?? "high";
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: false,
      powerPreference: "high-performance",
      stencil: false,
    });
    this.renderer.setClearColor(0x070404, 1);
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.domElement.setAttribute("aria-hidden", "true");
    this.renderer.domElement.className = "tavern-canvas";
    host.appendChild(this.renderer.domElement);

    this.envTexture = makeEnvironmentTexture();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envTarget = pmrem.fromEquirectangular(this.envTexture);
    pmrem.dispose();
    this.scene.environment = this.envTarget.texture;
    this.scene.environmentIntensity = 0.55;
    this.scene.fog = new THREE.FogExp2(0x0b0505, 0.03);

    const brass = new THREE.MeshStandardMaterial({
      color: 0xc89a55,
      metalness: 1,
      roughness: 0.27,
      envMapIntensity: 1.25,
    });
    const darkBrass = new THREE.MeshStandardMaterial({
      color: 0x3a2716,
      metalness: 0.85,
      roughness: 0.4,
    });
    this.bar = createBar({ brass, darkBrass });
    this.cabinet = createCabinet(this.envTexture, { brass, darkBrass });
    this.room = createRoom();
    this.scene.add(this.bar.group, this.cabinet.group, this.room.group);

    // Lighting: a warm spot crowning the current glass, a rim from the bottle wall,
    // low fill from the room and flickering candles.
    this.scene.add(new THREE.HemisphereLight(0xffd6a0, 0x1a0806, 0.16));
    const rim = new THREE.DirectionalLight(0xffb565, 0.9);
    rim.position.set(0, 4.2, -4);
    rim.target.position.set(0, 1, 2.5);
    this.scene.add(rim, rim.target);
    const fill = new THREE.DirectionalLight(0xffd2a8, 0.22);
    fill.position.set(-3, 3, 7);
    this.scene.add(fill);
    this.spot = new THREE.SpotLight(0xffd29c, 62, 0, 0.13, 0.75, 2);
    this.spot.position.copy(this.room.beamTop);
    this.spot.target.position.copy(this.room.beamBottom);
    this.scene.add(this.spot, this.spot.target);
    for (const candle of this.room.candles.slice(0, 2)) {
      const light = new THREE.PointLight(0xff9a4a, 1.6, 2.6, 2);
      light.position.copy(candle.position).add(new THREE.Vector3(0, 0.16, 0));
      light.intensity = 1.1;
      this.candleLights.push(light);
      this.scene.add(light);
    }
    for (const lamp of this.room.pendants) {
      const light = new THREE.PointLight(0xffb870, 0.7, 3.6, 2);
      light.position.copy(lamp).add(new THREE.Vector3(0, -0.05, 0));
      this.scene.add(light);
    }

    const coaster = new THREE.MeshStandardMaterial({
      map: makeCoasterTexture(),
      roughness: 0.6,
      metalness: 0.1,
    });
    this.carousel = new GlassCarousel(
      this.envTexture,
      coaster,
      this.spot.position,
    );
    this.scene.add(this.carousel.group);

    this.post = new PostFX(this.renderer, this.quality);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();
    this.renderer.domElement.addEventListener(
      "webglcontextlost",
      this.onContextLost,
    );
    if (options.manual) this.qualityLocked = true;
    else this.frame = requestAnimationFrame(this.tick);
    window.addEventListener("focus", this.wake);
    document.addEventListener("visibilitychange", this.wake);
  }

  /**
   * Performance mode: lowest quality without glow, a smaller drawing buffer,
   * ~20 fps, and no frames at all while the window is unfocused or hidden.
   */
  setPowerSaver(on: boolean) {
    if (on === this.saver) return;
    this.saver = on;
    if (on) {
      this.beforeSaver = { quality: this.quality, locked: this.qualityLocked };
      this.qualityLocked = true;
      this.setQuality("low");
    } else if (this.beforeSaver) {
      this.qualityLocked = this.beforeSaver.locked;
      this.frameTimes = [];
      this.setQuality(this.beforeSaver.quality);
    }
    this.post.skipBloom = on;
    this.resize();
    this.wake();
  }

  /** Resume drawing after the window regains focus or the pointer moves over it. */
  private wake = () => {
    this.wokeAt = performance.now();
    if (!this.sleeping || this.disposed || this.options.manual) return;
    this.sleeping = false;
    this.last = performance.now();
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(this.tick);
  };

  /** Deterministically step the simulation (used by visual tests). Renders once at the end. */
  advance(seconds: number, steps = Math.ceil(seconds * 30)) {
    const dt = seconds / Math.max(1, steps);
    for (let i = 0; i < steps; i++) this.step(dt, i === steps - 1);
  }

  private onContextLost = (event: Event) => {
    event.preventDefault();
    cancelAnimationFrame(this.frame);
  };

  /** Device pixel ratio capped by a pixel budget so 4K / HiDPI screens stay smooth. */
  private pixelRatio() {
    const dpr = window.devicePixelRatio || 1;
    const budget = this.saver
      ? 0.55e6
      : this.quality === "high"
        ? 3.2e6
        : this.quality === "medium"
          ? 2.0e6
          : 1.1e6;
    const cap = Math.sqrt(budget / Math.max(1, this.width * this.height));
    return Math.max(
      this.saver ? 0.45 : 0.6,
      Math.min(dpr, this.saver ? 1 : this.quality === "high" ? 2 : 1.5, cap),
    );
  }

  /** "auto" adapts to the measured frame time; a fixed level disables adaptation. */
  setQualityPreference(preference: Quality | "auto") {
    if (this.saver) {
      // remembered for when performance mode is switched off again
      this.beforeSaver =
        preference === "auto"
          ? { quality: "high", locked: false }
          : { quality: preference, locked: true };
      return;
    }
    if (preference === "auto") {
      this.qualityLocked = false;
      this.frameTimes = [];
      this.setQuality("high");
    } else {
      this.qualityLocked = true;
      this.setQuality(preference);
    }
  }

  private resize() {
    const rect = this.host.getBoundingClientRect();
    this.width = Math.max(1, rect.width);
    this.height = Math.max(1, rect.height);
    if (this.width < 2 || this.height < 2) return;
    const ratio = this.pixelRatio();
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(this.width, this.height, false);
    this.post.setSize(this.width, this.height, ratio);
    this.fitCamera();
  }

  /** Keep the counter, the hero glass and Lappland's upper body framed for any aspect ratio. */
  private fitCamera() {
    const aspect = this.width / this.height;
    const t = smoothstep(0.55, 1.6, aspect);
    const fov = 54 - 11 * t;
    this.baseCamera.fov = fov;
    this.baseCamera.pos.set(0, 2.45 - 0.15 * t, 6.8 - 1.2 * t);
    this.baseCamera.target.set(0, 1.15 - 0.07 * t, 0.3);
    this.camera.aspect = aspect;
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
  }

  setQuality(quality: Quality) {
    if (quality === this.quality) return;
    this.quality = quality;
    this.post.dispose();
    this.post = new PostFX(this.renderer, quality);
    this.post.skipBloom = this.saver;
    this.resize();
    this.options.onQualityChange?.(quality);
  }

  setReducedMotion(reduced: boolean) {
    this.reduced = reduced;
  }

  setPointer(x: number, y: number) {
    if (this.saver) this.wake();
    this.pointer.set(
      THREE.MathUtils.clamp(x, -1, 1),
      THREE.MathUtils.clamp(y, -1, 1),
    );
  }

  setPlaying(playing: boolean) {
    if (playing && !this.playing) this.character?.poke(0.8);
    this.playing = playing;
  }

  setProgress(progress: number) {
    this.progress = Number.isFinite(progress) ? progress : 0;
  }

  setQueue(
    recipes: DrinkRecipe[],
    currentId: string | undefined,
    direction: "next" | "prev" | "pick",
  ) {
    const current = recipes.find((r) => r.id === currentId) ?? recipes[0];
    if (current)
      this.currentDrink
        .setRGB(...hexToRgb01(current.palette.top))
        .convertSRGBToLinear();
    const previous = this.carousel.currentId;
    this.carousel.setQueue(recipes, currentId, direction);
    if (previous && currentId && previous !== currentId && !this.reduced) {
      this.cameraKickVel += direction === "prev" ? -0.9 : 0.9;
      this.spotDip = 1;
      this.character?.poke(1);
    }
  }

  setHover(id?: string) {
    if (id && id !== this.carousel.hoveredId) this.character?.poke(0.35);
    this.carousel.hoveredId = id;
  }

  /** Map a pointer position to an angle on the glass ring. */
  pointerTheta(clientX: number, clientY: number) {
    const rect = this.host.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const plane = new THREE.Plane(
      new THREE.Vector3(0, 1, 0),
      -(BAR.top + 0.12),
    );
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(plane, hit)) return 0;
    return Math.atan2(hit.x, hit.z);
  }

  beginDrag(id: string) {
    return this.carousel.beginDrag(id);
  }

  dragTo(clientX: number, clientY: number) {
    return this.carousel.dragTo(this.pointerTheta(clientX, clientY));
  }

  endDrag() {
    this.carousel.endDrag();
  }

  async setPortrait(url: string | undefined, rig: PortraitRig | undefined) {
    const token = ++this.portraitToken;
    if (!url || !rig) {
      this.removeCharacter();
      return;
    }
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    if (this.disposed || token !== this.portraitToken) return;
    this.removeCharacter();
    this.character = new LapplandCharacter(
      image,
      rig,
      this.renderer.capabilities.getMaxAnisotropy(),
    );
    this.scene.add(this.character.mesh);
  }

  updateRig(rig: PortraitRig) {
    this.character?.applyPlacement(rig);
  }

  setCharacterVisible(visible: boolean) {
    if (this.character) this.character.mesh.visible = visible;
  }

  private removeCharacter() {
    if (!this.character) return;
    this.scene.remove(this.character.mesh);
    this.character.dispose();
    this.character = undefined;
  }

  private readAudio(dt: number) {
    const analyser = this.playing ? this.options.getAnalyser?.() : undefined;
    let bass = 0,
      mid = 0,
      high = 0;
    if (analyser) {
      if (
        !this.audioData ||
        this.audioData.length !== analyser.frequencyBinCount
      )
        this.audioData = new Uint8Array(
          new ArrayBuffer(analyser.frequencyBinCount),
        );
      analyser.getByteFrequencyData(this.audioData);
      const bins = this.audioData;
      const hz = analyser.context.sampleRate / 2 / bins.length;
      const band = (lo: number, hi: number) => {
        const a = Math.max(1, Math.floor(lo / hz)),
          b = Math.min(bins.length - 1, Math.ceil(hi / hz));
        let sum = 0;
        for (let i = a; i <= b; i++) sum += bins[i];
        return sum / Math.max(1, b - a + 1) / 255;
      };
      bass = band(30, 180);
      mid = band(250, 2500);
      high = band(3000, 11000);
    }
    const shape = (v: number) => Math.pow(Math.min(1, v * 1.25), 1.5);
    this.audio.bass = damp(
      this.audio.bass,
      shape(bass),
      bass > this.audio.bass ? 30 : 8,
      dt,
    );
    this.audio.mid = damp(this.audio.mid, shape(mid), 12, dt);
    this.audio.high = damp(this.audio.high, shape(high * 1.6), 12, dt);
    this.audio.level = damp(
      this.audio.level,
      shape(bass * 0.5 + mid * 0.35 + high * 0.15),
      8,
      dt,
    );
    this.bassAverage = damp(this.bassAverage, bass, 1.5, dt);
    if (bass > this.bassAverage * 1.25 + 0.06) this.beat = 1;
    this.beat = Math.max(0, this.beat - dt * 5);
  }

  private tick = (now: number) => {
    if (this.disposed) return;
    if (
      this.saver &&
      (document.hidden ||
        (!document.hasFocus() && now - this.wokeAt > SAVER_WAKE_MS))
    ) {
      // asleep: no further frames until focus / visibility / pointer wakes us
      this.sleeping = true;
      return;
    }
    this.frame = requestAnimationFrame(this.tick);
    const elapsed = (now - this.last) / 1000;
    if (this.saver && elapsed < 1 / SAVER_FPS - 0.004) return;
    this.last = now;
    if (document.hidden) return;
    this.step(Math.min(this.saver ? 0.1 : 0.05, elapsed), true);
  };

  private step(dt: number, render: boolean) {
    this.time += this.reduced ? dt * 0.25 : dt;
    this.readAudio(dt);
    this.monitorPerformance(dt);

    // Camera: base framing + pointer parallax + a small swing in the direction of the pour.
    this.pointerSmooth.x = damp(
      this.pointerSmooth.x,
      this.reduced ? 0 : this.pointer.x,
      3,
      dt,
    );
    this.pointerSmooth.y = damp(
      this.pointerSmooth.y,
      this.reduced ? 0 : this.pointer.y,
      3,
      dt,
    );
    this.cameraKickVel +=
      (-60 * this.cameraKick - 11 * this.cameraKickVel) * dt;
    this.cameraKick += this.cameraKickVel * dt;
    const { pos, target } = this.baseCamera;
    const drift = this.reduced ? 0 : Math.sin(this.time * 0.21) * 0.025;
    this.camera.position.set(
      pos.x + this.pointerSmooth.x * 0.24 + this.cameraKick * 0.05 + drift,
      pos.y - this.pointerSmooth.y * 0.09,
      pos.z,
    );
    this.camera.lookAt(
      target.x + this.pointerSmooth.x * 0.07 + this.cameraKick * 0.03,
      target.y - this.pointerSmooth.y * 0.03,
      target.z,
    );

    // Lights breathe with the music.
    this.spotDip = Math.max(0, this.spotDip - dt * 1.6);
    const dip = Math.sin(Math.min(1, this.spotDip) * Math.PI);
    this.spot.intensity = 62 * (1 - dip * 0.45) * (1 + this.audio.bass * 0.35);
    this.candleLights.forEach((light, i) => {
      light.intensity =
        1.0 +
        Math.sin(this.time * 11 + i * 3) * 0.14 +
        Math.sin(this.time * 23 + i) * 0.09;
    });

    this.carousel.update(dt, this.time, this.audio, this.camera, this.progress);
    this.cabinet.update(this.time, this.audio.level);
    this.room.update(
      this.time,
      this.audio.bass,
      this.renderer.getPixelRatio() * (this.height / 900),
    );
    this.character?.update(dt, this.time, {
      look: { x: this.pointerSmooth.x, y: this.pointerSmooth.y },
      playing: this.playing,
      audio: {
        bass: this.beat * 0.6 + this.audio.bass * 0.4,
        level: this.audio.level,
      },
      drink: this.currentDrink,
      reduced: this.reduced,
    });

    if (!render) return;
    this.post.uniforms.pulse.value = this.audio.bass * 0.5;
    const overlay = this.room.overlay;
    this.post.render(this.scene, this.camera, this.time, {
      near: [
        this.carousel.group,
        ...overlay,
        ...(this.character ? [this.character.mesh] : []),
      ],
      far: [
        this.bar.group,
        this.cabinet.group,
        ...this.room.group.children.filter((c) => !overlay.includes(c)),
      ],
    });
    this.emitFrame();
  }

  private monitorPerformance(dt: number) {
    if (this.qualityLocked || this.time < 1.5) return;
    this.frameTimes.push(dt);
    if (this.frameTimes.length < 90) return;
    const avg =
      this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes = [];
    if (avg > 0.034 && this.quality !== "low")
      this.setQuality(this.quality === "high" ? "medium" : "low");
    else this.qualityLocked = true;
  }

  private project(x: number, y: number, z: number): [number, number] {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    return [(v.x * 0.5 + 0.5) * this.width, (-v.y * 0.5 + 0.5) * this.height];
  }

  private emitFrame() {
    if (!this.options.onFrame) return;
    const edge: [number, number][] = [];
    const r = BAR.outer + BAR.lip;
    // Use as much of the lip as fits on screen (narrow phones see only the front of the bar).
    let span = 0.38;
    for (let k = 0; k < 12; k++) {
      const [lx] = this.project(
        Math.sin(-span) * r,
        BAR.top,
        Math.cos(span) * r,
      );
      const [rx] = this.project(
        Math.sin(span) * r,
        BAR.top,
        Math.cos(span) * r,
      );
      if (lx > this.width * 0.1 && rx < this.width * 0.9) break;
      span *= 0.88;
    }
    for (let i = 0; i <= 40; i++) {
      const t = -span + (i / 40) * span * 2;
      edge.push(
        this.project(Math.sin(t) * r, BAR.top - 0.004, Math.cos(t) * r),
      );
    }
    const [px, py] = this.project(0, BAR.top - 0.13, BAR.outer);
    const [fx, fy] = this.project(0.0, 2.18, 0);
    this.options.onFrame({
      width: this.width,
      height: this.height,
      glasses: this.carousel.screenInfo(this.camera, this.width, this.height),
      barEdge: edge,
      plaque: { x: px, y: py },
      face: { x: fx, y: fy },
    });
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    window.removeEventListener("focus", this.wake);
    document.removeEventListener("visibilitychange", this.wake);
    this.resizeObserver.disconnect();
    this.renderer.domElement.removeEventListener(
      "webglcontextlost",
      this.onContextLost,
    );
    this.removeCharacter();
    this.carousel.dispose();
    this.cabinet.dispose();
    this.room.dispose();
    this.bar.dispose();
    this.post.dispose();
    this.envTarget.dispose();
    this.envTexture.dispose();
    this.scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.geometry?.dispose();
        const material = mesh.material as THREE.Material | THREE.Material[];
        if (Array.isArray(material)) material.forEach((m) => m.dispose());
        else material?.dispose();
      }
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
