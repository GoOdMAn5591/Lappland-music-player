import { useEffect, useRef, useState } from "react";
import type { Object3D, Material } from "three";

export function DoorScene({ opening }: { opening: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const started = useRef<number>();
  const [fallback, setFallback] = useState(false);
  useEffect(() => {
    started.current = opening ? performance.now() : undefined;
  }, [opening]);
  useEffect(() => {
    let cancelled = false;
    let dispose = () => {};
    void (async () => {
      const T = await import("three");
      if (cancelled || !host.current) return;
      const renderer = new T.WebGLRenderer({ alpha: true, antialias: true });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
      renderer.setClearColor(0x000000, 0);
      renderer.domElement.setAttribute("aria-label", "酒馆木门场景");
      host.current.append(renderer.domElement);
      const scene = new T.Scene();
      const camera = new T.PerspectiveCamera(42, 1, 0.1, 80);
      const ambient = new T.HemisphereLight(0xbbc4bb, 0x1a0914, 1.5);
      scene.add(ambient);
      const lamp = new T.PointLight(0xffd18a, 45, 22, 2);
      lamp.position.set(0, 4.1, 3.4);
      scene.add(lamp);
      const interior = new T.PointLight(0xf9b54f, 14, 12, 2);
      interior.position.set(0, 0, -1);
      scene.add(interior);

      const grain = document.createElement("canvas");
      grain.width = 256;
      grain.height = 1024;
      const ctx = grain.getContext("2d")!;
      ctx.fillStyle = "#302724";
      ctx.fillRect(0, 0, 256, 1024);
      let seed = 124;
      const random = () =>
        (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
      for (let i = 0; i < 1900; i++) {
        const x = random() * 256;
        ctx.strokeStyle =
          random() > 0.5
            ? `rgba(168,131,77,${random() * 0.12})`
            : `rgba(4,7,9,${random() * 0.26})`;
        ctx.lineWidth = 0.3 + random() * 1.6;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.bezierCurveTo(
          x + random() * 12 - 6,
          340,
          x + random() * 18 - 9,
          670,
          x,
          1024,
        );
        ctx.stroke();
      }
      const texture = new T.CanvasTexture(grain);
      texture.colorSpace = T.SRGBColorSpace;
      const wood = new T.MeshStandardMaterial({ map: texture, roughness: 0.7 });
      const inset = new T.MeshStandardMaterial({
        map: texture,
        color: 0x777e75,
        roughness: 0.82,
      });
      const brass = new T.MeshStandardMaterial({
        color: 0x957449,
        metalness: 0.8,
        roughness: 0.3,
      });
      const trim = new T.MeshStandardMaterial({
        color: 0x49473a,
        metalness: 0.6,
        roughness: 0.5,
      });
      const wall = new T.MeshStandardMaterial({
        color: 0x162320,
        roughness: 1,
      });
      const box = (
        parent: Object3D,
        w: number,
        h: number,
        d: number,
        x: number,
        y: number,
        z: number,
        material: Material,
      ) => {
        const mesh = new T.Mesh(new T.BoxGeometry(w, h, d), material);
        mesh.position.set(x, y, z);
        parent.add(mesh);
        return mesh;
      };
      // The doorway is hollow: the real bar scene is visible through its widening opening.
      box(scene, 14, 24, 0.8, -10.2, 0, -0.3, wall);
      box(scene, 14, 24, 0.8, 10.2, 0, -0.3, wall);
      box(scene, 6.5, 10, 0.8, 0, 8.85, -0.3, wall);
      box(scene, 6.5, 10, 0.8, 0, -8.85, -0.3, wall);
      for (const side of [-1, 1]) {
        box(scene, 0.25, 7.9, 0.55, side * 3.18, 0, 0.05, wood);
        box(scene, 0.045, 7.9, 0.06, side * 3.24, 0, 0.36, brass);
        box(scene, 0.09, 7.7, 0.07, side * 3.08, 0, 0.35, trim);
      }
      box(scene, 6.7, 0.24, 0.6, 0, 3.88, 0.06, wood);
      box(scene, 6.8, 0.05, 0.64, 0, 3.95, 0.08, brass);
      const doors: InstanceType<typeof T.Group>[] = [];
      for (const side of [-1, 1]) {
        const hinge = new T.Group();
        hinge.position.x = side * 3.03;
        scene.add(hinge);
        doors.push(hinge);
        const center = -side * 1.51;
        box(hinge, 3, 7.55, 0.22, center, 0, 0, wood);
        for (const y of [2.06, -1.75]) {
          box(hinge, 2.34, 2.98, 0.05, center, y, 0.14, inset);
          for (const dx of [-1.21, 1.21]) {
            box(hinge, 0.08, 3.18, 0.12, center + dx, y, 0.2, wood);
            box(hinge, 0.014, 3.06, 0.025, center + dx * 0.93, y, 0.19, brass);
          }
          for (const dy of [-1.55, 1.55])
            box(hinge, 2.5, 0.09, 0.12, center, y + dy, 0.2, wood);
        }
        box(hinge, 3, 0.15, 0.16, center, 0.35, 0.19, trim);
        box(hinge, 0.045, 7.3, 0.04, -side * 2.98, 0, 0.14, brass);
        const handleX = -side * 2.61;
        box(hinge, 0.2, 0.84, 0.07, handleX, -0.12, 0.21, brass);
        const handle = new T.Mesh(
          new T.TorusGeometry(0.17, 0.035, 10, 28),
          brass,
        );
        handle.scale.y = 1.6;
        handle.position.set(handleX, -0.12, 0.34);
        hinge.add(handle);
        for (const y of [-3.3, 0, 3.3]) {
          box(hinge, 0.55, 0.13, 0.07, -side * 0.28, y, 0.18, trim);
          for (const dx of [0.1, 0.44]) {
            const rivet = new T.Mesh(new T.SphereGeometry(0.035, 8, 6), brass);
            rivet.position.set(-side * dx, y, 0.24);
            hinge.add(rivet);
          }
        }
      }
      const bell = new T.Group();
      bell.position.set(0, 3.62, 0.5);
      scene.add(bell);
      const bellShape = new T.Mesh(
        new T.LatheGeometry(
          [
            new T.Vector2(0.055, 0),
            new T.Vector2(0.11, -0.06),
            new T.Vector2(0.12, -0.23),
            new T.Vector2(0.2, -0.34),
            new T.Vector2(0.205, -0.38),
          ],
          32,
        ),
        brass,
      );
      bell.add(bellShape);
      const clapper = new T.Mesh(new T.SphereGeometry(0.045, 12, 8), brass);
      clapper.position.y = -0.4;
      bell.add(clapper);
      const particles = new Float32Array(90 * 3);
      for (let i = 0; i < particles.length; i += 3) {
        particles[i] = (random() - 0.5) * 5;
        particles[i + 1] = (random() - 0.5) * 7;
        particles[i + 2] = 0.4 + random() * 2;
      }
      const dustGeometry = new T.BufferGeometry();
      dustGeometry.setAttribute(
        "position",
        new T.BufferAttribute(particles, 3),
      );
      const dustMaterial = new T.PointsMaterial({
        color: 0xd2b778,
        size: 0.017,
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
      });
      const dust = new T.Points(dustGeometry, dustMaterial);
      scene.add(dust);
      let baseZ = 12,
        frame = 0;
      const reduced = matchMedia("(prefers-reduced-motion: reduce)");
      const resize = new ResizeObserver(([entry]) => {
        const { width, height } = entry.contentRect;
        camera.aspect = width / Math.max(height, 1);
        scene.scale.y = camera.aspect < 0.75 ? 1.55 : 1;
        camera.updateProjectionMatrix();
        baseZ = Math.max(11.5, 9.1 / camera.aspect);
        renderer.setSize(width, height);
      });
      resize.observe(host.current);
      const draw = (now: number) => {
        if (!document.hidden) {
          const progress =
            started.current === undefined
              ? 0
              : Math.min(1, (now - started.current) / 3000);
          const ease = progress * progress * (3 - 2 * progress);
          doors[0].rotation.y = ease * 1.47;
          doors[1].rotation.y = -ease * 1.47;
          bell.rotation.z =
            progress > 0 && !reduced.matches
              ? Math.sin(progress * 42) * Math.exp(-progress * 5) * 0.25
              : 0;
          camera.position.set(0, 0.1, baseZ - ease * 2.2);
          camera.lookAt(0, 0, 0);
          if (!reduced.matches)
            dust.rotation.z = Math.sin(now * 0.00007) * 0.07;
          interior.intensity = 14 + ease * 23;
          renderer.render(scene, camera);
        }
        frame = requestAnimationFrame(draw);
      };
      frame = requestAnimationFrame(draw);
      dispose = () => {
        cancelAnimationFrame(frame);
        resize.disconnect();
        scene.traverse((obj) => {
          if (obj instanceof T.Mesh || obj instanceof T.Points)
            obj.geometry.dispose();
        });
        [wood, inset, brass, trim, wall, dustMaterial].forEach((m) =>
          m.dispose(),
        );
        texture.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };
      if (cancelled) dispose();
    })().catch(() => {
      if (!cancelled) setFallback(true);
    });
    return () => {
      cancelled = true;
      dispose();
    };
  }, []);
  return (
    <div
      ref={host}
      className="door-scene"
      data-fallback={fallback}
      aria-hidden="true"
    >
      {fallback && (
        <div className="door-fallback">
          <i />
          <i />
        </div>
      )}
    </div>
  );
}
