import {
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
  type CSSProperties,
} from "react";
import type { PortraitRig, PointerPosition } from "./portrait";
import { getCharacterRuntime } from "./runtime";

const vertexShader = `
  varying vec2 vUv;
  uniform float uTime, uMotion, uReaction;
  uniform vec2 uPointer, uHead, uHairL, uHairR;
  uniform vec2 uTrail, uBody, uEarL, uEarR, uShoulders, uChest, uRibbon, uHandL, uHandR, uHeldGlass;
  float weight(vec2 p, vec2 center, vec2 radius) {
    vec2 d = (p - center) / radius;
    return exp(-dot(d, d) * 2.0);
  }
  void main() {
    vUv = uv;
    vec2 p = vec2(uv.x, 1.0 - uv.y);
    vec3 pos = position;
    float breath = sin(uTime * 1.55);
    float head = weight(p, uHead, vec2(0.22, 0.23));
    float torso = weight(p, uChest, vec2(0.27, 0.23));
    float shoulders = weight(p, uShoulders, vec2(0.29, 0.115));
    float earL = weight(p, uEarL, vec2(0.055, 0.09));
    float earR = weight(p, uEarR, vec2(0.065, 0.09));
    float ribbon = weight(p, uRibbon, vec2(0.24, 0.075));
    float handL = weight(p, uHandL, vec2(0.12, 0.075));
    float handR = weight(p, uHandR, vec2(0.12, 0.065));
    float glass = weight(p, uHeldGlass, vec2(0.07, 0.1));
    float hairL = weight(p, uHairL, vec2(0.17, 0.27));
    float hairR = weight(p, uHairR, vec2(0.17, 0.27));
    pos.x += uMotion * (torso * ((p.x - uChest.x) * breath * 0.021 + uBody.x*0.01)
      + head * uPointer.x * 0.025
      + hairL * (sin(uTime * 1.25 + p.y * 7.0) * 0.012 + uTrail.x*0.012)
      + hairR * (sin(uTime * 1.1 + p.y * 8.0 + 1.7) * 0.018 + uTrail.x*0.021)
      + earL * (sin(uTime*1.8)*0.006 + uPointer.x*0.009)
      - earR * (sin(uTime*1.63+.8)*0.008 - uPointer.x*0.007)
      + ribbon * (sin(uTime*1.16+p.x*10.0)*0.012 + uTrail.x*0.018)
      + handL * sin(uTime*.85+.6)*0.004
      + handR * (sin(uTime*.85)*0.003 + uReaction*0.003)
      + glass * (sin(uTime*.85-.16)*0.0035 + uReaction*0.004));
    pos.y += uMotion * (torso * breath * 0.005 + shoulders * breath * 0.007
      - head * uPointer.y * 0.011 + (hairL + hairR) * sin(uTime * 1.1) * 0.004
      + ribbon * (sin(uTime*1.05+p.x*12.0)*0.006-uTrail.y*0.008)
      + handL * sin(uTime*.85)*0.003 + (handR+glass)*sin(uTime*.85+.4)*0.0025
      + earR * sin(uTime*1.63)*0.003);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;
const fragmentShader = `
  varying vec2 vUv;
  uniform sampler2D uImage, uMask;
  uniform float uTime, uMotion, uFeather, uReaction;
  uniform vec2 uEyeL, uEyeR, uPointer, uHeldGlass;
  void main() {
    vec4 color = texture2D(uImage, vUv);
    vec2 p = vec2(vUv.x, 1.0 - vUv.y);
    float edge = min(min(vUv.x, 1.0-vUv.x), min(vUv.y, 1.0-vUv.y));
    float alpha = smoothstep(0.0, max(0.001, uFeather), edge) * texture2D(uMask, vUv).r;
    vec2 gaze = uPointer * vec2(0.002, 0.001);
    float eyeL = exp(-dot((p-uEyeL-gaze)/vec2(0.007, 0.0035), (p-uEyeL-gaze)/vec2(0.007, 0.0035)));
    float eyeR = exp(-dot((p-uEyeR-gaze)/vec2(0.007, 0.0035), (p-uEyeR-gaze)/vec2(0.007, 0.0035)));
    color.rgb += vec3(0.24, 0.2, 0.12) * (eyeL+eyeR) * (0.7+0.3*sin(uTime*1.7)+uReaction) * uMotion;
    vec2 glint = (p-uHeldGlass) / vec2(0.027,0.062);
    float glass = exp(-dot(glint,glint)*2.0);
    float sweep = exp(-pow((p.x-uHeldGlass.x+(uReaction-.5)*.055)*130.0,2.0));
    color.rgb += vec3(0.65,0.45,0.18) * glass * sweep * uReaction * uMotion;
    gl_FragColor = vec4(color.rgb, color.a * alpha);
    #include <colorspace_fragment>
  }
`;

interface Props {
  url: string;
  rig: PortraitRig;
  pointer: MutableRefObject<PointerPosition>;
  onStatus: (message: string) => void;
  playing: boolean;
  trackId?: string;
  attention: MutableRefObject<number>;
}

export function CharacterPortrait({
  url,
  rig,
  pointer,
  onStatus,
  playing,
  trackId,
  attention,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const rigRef = useRef(rig);
  const [fallback, setFallback] = useState(false);
  const [imageSize, setImageSize] = useState({ width: 910, height: 1200 });
  rigRef.current = rig;
  const reaction = useRef(-10000);
  const lastPlayback = useRef({ playing, trackId });
  useEffect(() => {
    if (
      (playing && !lastPlayback.current.playing) ||
      trackId !== lastPlayback.current.trackId
    )
      reaction.current = performance.now();
    lastPlayback.current = { playing, trackId };
  }, [playing, trackId]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let cleanup = () => {};
    setFallback(false);
    void (async () => {
      const THREE = await import("three");
      const image = new Image();
      image.src = url;
      await image.decode();
      if (cancelled) return;
      setImageSize({ width: image.naturalWidth, height: image.naturalHeight });
      const renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
      });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
      renderer.setClearColor(0x000000, 0);
      renderer.domElement.setAttribute("aria-label", "拉普兰德图片动画");
      host.append(renderer.domElement);
      const texture = new THREE.Texture(image);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.needsUpdate = true;
      const maskCanvas = document.createElement("canvas");
      maskCanvas.width = maskCanvas.height = 512;
      const maskContext = maskCanvas.getContext("2d")!;
      const mask = new THREE.CanvasTexture(maskCanvas);
      const uniforms = {
        uImage: { value: texture },
        uMask: { value: mask },
        uTime: { value: 0 },
        uMotion: { value: 0 },
        uFeather: { value: 0.075 },
        uReaction: { value: 0 },
        uPointer: { value: new THREE.Vector2() },
        uTrail: { value: new THREE.Vector2() },
        uBody: { value: new THREE.Vector2() },
        uHead: { value: new THREE.Vector2() },
        uHairL: { value: new THREE.Vector2() },
        uHairR: { value: new THREE.Vector2() },
        uEyeL: { value: new THREE.Vector2() },
        uEyeR: { value: new THREE.Vector2() },
        uEarL: { value: new THREE.Vector2() },
        uEarR: { value: new THREE.Vector2() },
        uShoulders: { value: new THREE.Vector2() },
        uChest: { value: new THREE.Vector2() },
        uRibbon: { value: new THREE.Vector2() },
        uHandL: { value: new THREE.Vector2() },
        uHandR: { value: new THREE.Vector2() },
        uHeldGlass: { value: new THREE.Vector2() },
      };
      const material = new THREE.ShaderMaterial({
        uniforms,
        vertexShader,
        fragmentShader,
        transparent: true,
      });
      const geometry = new THREE.PlaneGeometry(2, 2, 100, 120);
      const mesh = new THREE.Mesh(geometry, material);
      const scene = new THREE.Scene();
      scene.add(mesh);
      const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
      camera.position.z = 2;
      const reduced = matchMedia("(prefers-reduced-motion: reduce)");
      let width = 1,
        height = 1,
        frame = 0,
        time = 0,
        last = performance.now();
      let lastRig: PortraitRig | undefined;
      const observer = new ResizeObserver(([entry]) => {
        width = Math.max(1, entry.contentRect.width);
        height = Math.max(1, entry.contentRect.height);
        renderer.setSize(width, height);
      });
      observer.observe(host);
      const draw = (now: number) => {
        const delta = Math.min((now - last) / 1000, 0.05);
        last = now;
        const config = rigRef.current;
        if (!document.hidden) {
          if (!reduced.matches) time += delta;
          uniforms.uTime.value = time;
          uniforms.uMotion.value = reduced.matches ? 0 : config.motion;
          uniforms.uReaction.value = reduced.matches
            ? 0
            : Math.max(
                0,
                1 -
                  (now - Math.max(reaction.current, attention.current)) / 1000,
              );
          const gaze = reduced.matches ? { x: 0, y: 0 } : pointer.current;
          uniforms.uPointer.value.lerp(
            new THREE.Vector2(gaze.x, gaze.y),
            1 - Math.exp(-delta * 5),
          );
          uniforms.uTrail.value.lerp(
            uniforms.uPointer.value,
            1 - Math.exp(-delta * 1.7),
          );
          uniforms.uBody.value.lerp(
            uniforms.uPointer.value,
            1 - Math.exp(-delta * 0.85),
          );
          if (lastRig !== config) {
            uniforms.uFeather.value = config.feather;
            const { head, leftHair, rightHair, leftEye, rightEye } =
              config.anchors;
            uniforms.uHead.value.set(head.x, head.y);
            uniforms.uHairL.value.set(leftHair.x, leftHair.y);
            uniforms.uHairR.value.set(rightHair.x, rightHair.y);
            uniforms.uEyeL.value.set(leftEye.x, leftEye.y);
            uniforms.uEyeR.value.set(rightEye.x, rightEye.y);
            const localAnchors = {
              uEarL: "leftEar",
              uEarR: "rightEar",
              uShoulders: "shoulders",
              uChest: "chest",
              uRibbon: "ribbon",
              uHandL: "leftHand",
              uHandR: "rightHand",
              uHeldGlass: "heldGlass",
            } as const;
            for (const [uniform, anchor] of Object.entries(localAnchors)) {
              const p = config.anchors[anchor];
              uniforms[uniform as keyof typeof localAnchors].value.set(
                p.x,
                p.y,
              );
            }
            maskContext.filter = "none";
            maskContext.fillStyle =
              config.outline.length >= 3 ? "black" : "white";
            maskContext.fillRect(0, 0, 512, 512);
            if (config.outline.length >= 3) {
              maskContext.filter = "blur(1.5px)";
              maskContext.fillStyle = "white";
              maskContext.beginPath();
              config.outline.forEach((p, i) =>
                i
                  ? maskContext.lineTo(p.x * 512, p.y * 512)
                  : maskContext.moveTo(p.x * 512, p.y * 512),
              );
              maskContext.closePath();
              maskContext.fill();
            }
            mask.needsUpdate = true;
            lastRig = config;
          }
          const ratio =
            image.naturalWidth / image.naturalHeight / (width / height);
          mesh.scale.set(
            Math.min(1, ratio) * config.zoom * 0.96,
            Math.min(1, 1 / ratio) * config.zoom * 0.96,
            1,
          );
          mesh.position.set(config.x * 0.02, -config.y * 0.02, 0);
          renderer.render(scene, camera);
        }
        frame = requestAnimationFrame(draw);
      };
      const contextLost = (event: Event) => {
        event.preventDefault();
        cancelAnimationFrame(frame);
        setFallback(true);
        onStatus("图形加速暂不可用，已保留原图并切换为轻微呼吸动画。");
      };
      renderer.domElement.addEventListener("webglcontextlost", contextLost);
      cleanup = () => {
        cancelAnimationFrame(frame);
        observer.disconnect();
        renderer.domElement.removeEventListener(
          "webglcontextlost",
          contextLost,
        );
        geometry.dispose();
        material.dispose();
        texture.dispose();
        mask.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };
      frame = requestAnimationFrame(draw);
    })().catch(() => {
      if (!cancelled) {
        setFallback(true);
        onStatus("角色动效加载失败，当前显示你选择的原图。");
      }
    });
    return () => {
      cancelled = true;
      cleanup();
    };
  }, [url, pointer, onStatus, attention]);

  const fallbackMask =
    rig.outline.length >= 3
      ? `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${imageSize.width}" height="${imageSize.height}" viewBox="0 0 100 100" preserveAspectRatio="none"><polygon fill="white" points="${rig.outline.map((p) => `${p.x * 100},${p.y * 100}`).join(" ")}"/></svg>`)}")`
      : undefined;
  return (
    <div className="portrait-renderer" ref={hostRef} data-fallback={fallback}>
      {fallback && (
        <div
          className="portrait-fallback-motion"
          style={{ "--fallback-motion": rig.motion } as CSSProperties}
        >
          <img
            className="portrait-fallback"
            src={url}
            alt="拉普兰德"
            style={{
              transform: `translate(${rig.x}%, ${rig.y}%) scale(${rig.zoom * 0.96})`,
              maskImage: fallbackMask,
              maskSize: "contain",
              maskPosition: "center",
              maskRepeat: "no-repeat",
            }}
          />
        </div>
      )}
    </div>
  );
}

export function ModelLayer({
  files,
  pointer,
  onStatus,
}: {
  files: File[];
  pointer: MutableRefObject<PointerPosition>;
  onStatus: (message: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const runtime = getCharacterRuntime();
    const model = files.find((file) => file.name.endsWith(".model3.json"));
    if (!host.current || !runtime || !model) return;
    const controller = new AbortController();
    let instance: { dispose(): void } | undefined;
    setReady(false);
    const fail = () => {
      setReady(false);
      onStatus("模型加载失败，继续显示已选定的拉普兰德图片。");
    };
    void runtime
      .mount({
        host: host.current,
        files,
        model,
        pointer,
        signal: controller.signal,
        onError: fail,
      })
      .then((result) => {
        if (controller.signal.aborted) result.dispose();
        else {
          instance = result;
          setReady(true);
        }
      })
      .catch(fail);
    return () => {
      controller.abort();
      instance?.dispose();
    };
  }, [files, pointer, onStatus]);
  return (
    <div ref={host} className={`model-renderer ${ready ? "ready" : ""}`} />
  );
}
