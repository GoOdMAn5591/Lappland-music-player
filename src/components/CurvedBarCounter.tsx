import { useEffect, useRef } from "react";
import {
  arcPoint,
  getBarGeometry,
  type BarGeometry,
} from "../scene/barGeometry";

function makeWoodTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#493225";
  ctx.fillRect(0, 0, 1024, 512);
  let seed = 481;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let row = 0; row < 950; row++) {
    const y = random() * 512;
    ctx.strokeStyle =
      row % 3
        ? `rgba(15,8,8,${0.08 + random() * 0.2})`
        : `rgba(191,142,77,${random() * 0.13})`;
    ctx.lineWidth = 0.4 + random() * 1.4;
    ctx.beginPath();
    for (let x = 0; x <= 1024; x += 8) {
      const bend =
        Math.sin(x * 0.007 + row * 0.1) * 3 +
        Math.sin(x * 0.02 + row * 0.18) * 0.5;
      if (x === 0) ctx.moveTo(x, y + bend);
      else ctx.lineTo(x, y + bend);
    }
    ctx.stroke();
  }
  return canvas;
}

function drawFallback(canvas: HTMLCanvasElement, bar: BarGeometry) {
  canvas.width = bar.width * devicePixelRatio;
  canvas.height = bar.height * devicePixelRatio;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(devicePixelRatio, devicePixelRatio);
  const path = (inner: number, outer: number, depth = 0) => {
    ctx.beginPath();
    for (let i = 0; i <= 120; i++) {
      const p = arcPoint(bar, -Math.PI / 2 + (i / 120) * Math.PI, outer);
      i ? ctx.lineTo(p.x, p.y + depth) : ctx.moveTo(p.x, p.y + depth);
    }
    for (let i = 120; i >= 0; i--) {
      const p = arcPoint(bar, -Math.PI / 2 + (i / 120) * Math.PI, inner);
      ctx.lineTo(p.x, p.y + depth);
    }
    ctx.closePath();
  };
  ctx.shadowColor = "#000b";
  ctx.shadowBlur = 25;
  ctx.shadowOffsetY = 12;
  path(bar.inner, 1, bar.thickness);
  ctx.fillStyle = "#241716";
  ctx.fill();
  path(bar.inner, 1);
  const surface = ctx.createLinearGradient(0, bar.cy, 0, bar.cy + bar.ry);
  surface.addColorStop(0, "#634b32");
  surface.addColorStop(0.5, "#49372a");
  surface.addColorStop(1, "#26221c");
  ctx.fillStyle = surface;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.strokeStyle = "#ae9058";
  ctx.lineWidth = 3;
  ctx.stroke();
  path(0.967, 0.972);
  ctx.fillStyle = "#a88e5c";
  ctx.fill();
}

export function CurvedBarCounter() {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let cancelled = false,
      dispose = () => {};
    void (async () => {
      const T = await import("three");
      if (cancelled) return;
      let renderer: InstanceType<typeof T.WebGLRenderer>;
      try {
        renderer = new T.WebGLRenderer({ alpha: true, antialias: true });
      } catch {
        const canvas = document.createElement("canvas");
        element.append(canvas);
        canvas.setAttribute("aria-label", "半圆环吧台");
        const observer = new ResizeObserver(([entry]) =>
          drawFallback(
            canvas,
            getBarGeometry(entry.contentRect.width, entry.contentRect.height),
          ),
        );
        observer.observe(element);
        dispose = () => {
          observer.disconnect();
          canvas.remove();
        };
        return;
      }
      renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
      renderer.setClearColor(0, 0);
      renderer.domElement.setAttribute("aria-label", "半圆环吧台");
      element.append(renderer.domElement);
      const scene = new T.Scene();
      const camera = new T.OrthographicCamera(-1, 1, 1, -1, 0.1, 3000);
      camera.position.z = 1500;
      const wood = new T.CanvasTexture(makeWoodTexture());
      wood.colorSpace = T.SRGBColorSpace;
      wood.wrapS = wood.wrapT = T.RepeatWrapping;
      wood.repeat.set(3, 1);
      const topMaterial = new T.MeshStandardMaterial({
        map: wood,
        color: 0xc0a386,
        roughness: 0.38,
        metalness: 0.16,
        side: T.DoubleSide,
      });
      const wallMaterial = new T.MeshStandardMaterial({
        map: wood,
        color: 0x675248,
        roughness: 0.6,
        metalness: 0.13,
        side: T.DoubleSide,
      });
      const brass = new T.MeshStandardMaterial({
        color: 0xbe9956,
        metalness: 0.62,
        roughness: 0.29,
        side: T.DoubleSide,
      });
      const wornBrass = new T.MeshStandardMaterial({
        color: 0x665337,
        metalness: 0.45,
        roughness: 0.52,
        side: T.DoubleSide,
      });
      const underLight = new T.MeshBasicMaterial({
        color: 0xaa7735,
        transparent: true,
        opacity: 0.55,
        side: T.DoubleSide,
      });
      scene.add(new T.HemisphereLight(0xffeac2, 0x24221d, 2));
      const key = new T.DirectionalLight(0xffda93, 3);
      key.position.set(-350, 500, 600);
      scene.add(key);
      const fill = new T.DirectionalLight(0xd7e5da, 1.5);
      fill.position.set(500, 50, 450);
      scene.add(fill);
      let group = new T.Group();
      scene.add(group);
      const clear = () => {
        group.traverse((obj) => {
          if (obj instanceof T.Mesh) obj.geometry.dispose();
        });
        scene.remove(group);
        group = new T.Group();
        scene.add(group);
      };
      const build = (bar: BarGeometry) => {
        clear();
        renderer.setSize(bar.width, bar.height);
        camera.left = -bar.width / 2;
        camera.right = bar.width / 2;
        camera.top = bar.height / 2;
        camera.bottom = -bar.height / 2;
        camera.updateProjectionMatrix();
        const strip = (
          inner: number,
          outer: number,
          z: number,
          material: InstanceType<typeof T.Material>,
          wall = 0,
        ) => {
          const vertices: number[] = [],
            uv: number[] = [],
            indices: number[] = [];
          for (let i = 0; i <= 160; i++) {
            const angle = -Math.PI / 2 + (i / 160) * Math.PI;
            const a = arcPoint(bar, angle, inner),
              b = arcPoint(bar, angle, outer);
            vertices.push(
              a.x - bar.cx,
              bar.height / 2 - a.y,
              z,
              b.x - bar.cx,
              bar.height / 2 - b.y - wall,
              z - (wall ? 18 : 0),
            );
            uv.push(i / 160, 0, i / 160, 1);
            if (i < 160) {
              const v = i * 2;
              indices.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
            }
          }
          const geometry = new T.BufferGeometry();
          geometry.setAttribute(
            "position",
            new T.Float32BufferAttribute(vertices, 3),
          );
          geometry.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
          geometry.setIndex(indices);
          geometry.computeVertexNormals();
          group.add(new T.Mesh(geometry, material));
        };
        strip(1, 1, -2, wallMaterial, bar.thickness);
        strip(bar.inner, bar.inner, -3, wallMaterial, 20);
        strip(bar.inner, 1, 0, topMaterial);
        strip(bar.inner, bar.inner + 0.007, 3, brass);
        strip(0.984, 1, 3, brass);
        strip(0.962, 0.966, 2, wornBrass);
        strip(0.735, 0.738, 2, wornBrass);
        strip(1, 1, 3, brass, 6);
        strip(1, 1, -8, underLight, 4);
        // The vertical stave seams make the curved fascia's thickness readable.
        for (let i = 0; i <= 46; i++) {
          const angle = -Math.PI / 2 + (i / 46) * Math.PI;
          const p = arcPoint(bar, angle, 1);
          const seam = new T.Mesh(
            new T.PlaneGeometry(1, bar.thickness - 9),
            wornBrass,
          );
          seam.position.set(
            p.x - bar.cx,
            bar.height / 2 - p.y - bar.thickness / 2,
            1,
          );
          group.add(seam);
          if (i % 3 === 0) {
            const rivet = new T.Mesh(new T.CircleGeometry(1.5, 8), brass);
            rivet.position.set(p.x - bar.cx, bar.height / 2 - p.y - 13, 2);
            group.add(rivet);
          }
        }
        renderer.render(scene, camera);
      };
      const observer = new ResizeObserver(([entry]) =>
        build(
          getBarGeometry(entry.contentRect.width, entry.contentRect.height),
        ),
      );
      observer.observe(element);
      dispose = () => {
        observer.disconnect();
        clear();
        wood.dispose();
        [topMaterial, wallMaterial, brass, wornBrass, underLight].forEach((m) =>
          m.dispose(),
        );
        renderer.dispose();
        renderer.domElement.remove();
      };
    })().catch(() => {
      element.dataset.failed = "true";
    });
    return () => {
      cancelled = true;
      dispose();
    };
  }, []);
  return <div className="counter-scene" ref={host} aria-hidden="true" />;
}
