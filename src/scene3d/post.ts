import * as THREE from "three";
import { FullScreenQuad } from "three/examples/jsm/postprocessing/Pass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

export type Quality = "high" | "medium" | "low";

const fullscreenVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

/**
 * Depth-aware gather blur. The bar, glasses and Lappland stay sharp while the
 * bottle wall softens into bokeh and the foreground drapes melt away.
 */
const dofFragment = /* glsl */ `
  #include <packing>
  uniform sampler2D tColor;
  uniform sampler2D tDepth;
  uniform vec2 resolution;
  uniform float cameraNear;
  uniform float cameraFar;
  uniform float focusFar;
  uniform float farRamp;
  uniform float nearStart;
  uniform float nearRamp;
  uniform float maxBlur;
  varying vec2 vUv;

  float viewDepth(vec2 uv) {
    float d = texture2D(tDepth, uv).x;
    return -perspectiveDepthToViewZ(d, cameraNear, cameraFar);
  }
  float coc(float z) {
    float far = smoothstep(focusFar, focusFar + farRamp, z);
    float near = 1.0 - smoothstep(nearStart - nearRamp, nearStart, z);
    return max(far * 0.85, near);
  }
  void main() {
    // clamp fireflies so a stray specular spike can never bloom into a haze
    vec3 base = min(texture2D(tColor, vUv).rgb, vec3(24.0));
    float radius = coc(viewDepth(vUv)) * maxBlur;
    if (radius < 0.6) {
      gl_FragColor = vec4(base, 1.0);
      return;
    }
    vec3 sum = base;
    float total = 1.0;
    for (int i = 0; i < 28; i++) {
      float fi = float(i) + 0.5;
      float r = sqrt(fi / 28.0) * radius;
      float a = fi * 2.39996323;
      vec2 uv = vUv + vec2(cos(a), sin(a)) * r / resolution;
      float sampleRadius = coc(viewDepth(uv)) * maxBlur;
      float w = clamp(sampleRadius - r + 1.0, 0.0, 1.0);
      vec3 c = min(texture2D(tColor, uv).rgb, vec3(24.0));
      // let bright points bloom into soft discs
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      w *= 1.0 + smoothstep(1.2, 4.0, l) * 1.5;
      sum += c * w;
      total += w;
    }
    gl_FragColor = vec4(sum / total, 1.0);
  }
`;

const finalFragment = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform vec2 resolution;
  uniform float time;
  uniform float exposure;
  uniform float vignette;
  uniform float grain;
  uniform float aberration;
  uniform float pulse;
  varying vec2 vUv;

  vec3 RRTAndODTFit(vec3 v) {
    vec3 a = v * (v + 0.0245786) - 0.000090537;
    vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
    return a / b;
  }
  vec3 acesFilmic(vec3 color) {
    const mat3 ACESInputMat = mat3(
      vec3(0.59719, 0.07600, 0.02840),
      vec3(0.35458, 0.90834, 0.13383),
      vec3(0.04823, 0.01566, 0.83777));
    const mat3 ACESOutputMat = mat3(
      vec3(1.60475, -0.10208, -0.00327),
      vec3(-0.53108, 1.10813, -0.07276),
      vec3(-0.07367, -0.00605, 1.07602));
    color *= exposure / 0.6;
    color = ACESInputMat * color;
    color = RRTAndODTFit(color);
    color = ACESOutputMat * color;
    return clamp(color, 0.0, 1.0);
  }
  vec3 toSRGB(vec3 c) {
    return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
  }
  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  void main() {
    vec2 centered = vUv - 0.5;
    float dist = length(centered * vec2(resolution.x / resolution.y, 1.0));
    vec2 shift = centered * aberration * dist;
    vec3 color;
    color.r = texture2D(tDiffuse, vUv - shift).r;
    color.g = texture2D(tDiffuse, vUv).g;
    color.b = texture2D(tDiffuse, vUv + shift).b;
    // warm the deep shadows towards wine red, keep highlights golden
    float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
    color += vec3(0.010, 0.0015, 0.002) * (1.0 - smoothstep(0.0, 0.18, luma));
    color *= 1.0 + pulse * 0.06;
    color = acesFilmic(color);
    float v = smoothstep(0.35, 1.15, dist);
    color *= 1.0 - v * vignette;
    color = toSRGB(color);
    // gentle split tone in display space
    float l = dot(color, vec3(0.299, 0.587, 0.114));
    color = mix(color, color * vec3(1.04, 0.98, 0.9), smoothstep(0.35, 0.9, l) * 0.6);
    color = mix(color, color * vec3(1.0, 0.92, 0.95), (1.0 - smoothstep(0.0, 0.3, l)) * 0.5);
    float n = hash(vUv * resolution + fract(time * 13.7) * 91.0) - 0.5;
    color += n * grain;
    gl_FragColor = vec4(color, 1.0);
  }
`;

/** Writes the scene depth into the (colour-preserving) DOF target. */
const depthCopyFragment = /* glsl */ `
  uniform sampler2D tDepth;
  varying vec2 vUv;
  void main() {
    gl_FragDepth = texture2D(tDepth, vUv).x;
    gl_FragColor = vec4(0.0);
  }
`;

/**
 * Objects that must stay sharp *and* correctly composited over the blurred
 * background. Semi-transparent pixels (Lappland's hair wisps, glass walls)
 * would otherwise bake the still-sharp bottle wall into themselves before the
 * depth-of-field pass, which showed up as horizontal "tears" at every shelf.
 */
export interface RenderSplit {
  near: THREE.Object3D[];
  far: THREE.Object3D[];
}

export class PostFX {
  private sceneTarget: THREE.WebGLRenderTarget;
  private depthCopyQuad: FullScreenQuad;
  private depthCopyMaterial: THREE.ShaderMaterial;
  private dofTarget: THREE.WebGLRenderTarget;
  private dofQuad: FullScreenQuad;
  private finalQuad: FullScreenQuad;
  private dofMaterial: THREE.ShaderMaterial;
  private finalMaterial: THREE.ShaderMaterial;
  private bloom: UnrealBloomPass;
  private width = 1;
  private height = 1;
  quality: Quality;
  /** Performance mode: skip the glow passes as well. */
  skipBloom = false;

  constructor(
    private renderer: THREE.WebGLRenderer,
    quality: Quality,
  ) {
    this.quality = quality;
    const make = (samples: number, depth: boolean) => {
      const target = new THREE.WebGLRenderTarget(1, 1, {
        type: THREE.HalfFloatType,
        samples,
        depthBuffer: true,
      });
      if (depth) target.depthTexture = new THREE.DepthTexture(1, 1);
      return target;
    };
    this.sceneTarget = make(quality === "low" ? 0 : 4, true);
    // MSAA here too: the sharp layer (Lappland, glasses) is drawn straight into it.
    this.dofTarget = make(quality === "low" ? 0 : 4, false);
    this.depthCopyMaterial = new THREE.ShaderMaterial({
      vertexShader: fullscreenVertex,
      fragmentShader: depthCopyFragment,
      uniforms: { tDepth: { value: null } },
      depthTest: true,
      depthFunc: THREE.AlwaysDepth,
      depthWrite: true,
      colorWrite: false,
    });
    this.depthCopyQuad = new FullScreenQuad(this.depthCopyMaterial);
    this.dofMaterial = new THREE.ShaderMaterial({
      vertexShader: fullscreenVertex,
      fragmentShader: dofFragment,
      uniforms: {
        tColor: { value: null },
        tDepth: { value: null },
        resolution: { value: new THREE.Vector2(1, 1) },
        cameraNear: { value: 0.1 },
        cameraFar: { value: 40 },
        focusFar: { value: 6.2 },
        farRamp: { value: 3.2 },
        nearStart: { value: 1.6 },
        nearRamp: { value: 0.6 },
        maxBlur: { value: 7 },
      },
      depthTest: false,
      depthWrite: false,
    });
    this.finalMaterial = new THREE.ShaderMaterial({
      vertexShader: fullscreenVertex,
      fragmentShader: finalFragment,
      uniforms: {
        tDiffuse: { value: null },
        resolution: { value: new THREE.Vector2(1, 1) },
        time: { value: 0 },
        exposure: { value: 0.92 },
        vignette: { value: 0.62 },
        grain: { value: 0.022 },
        aberration: { value: 0.0026 },
        pulse: { value: 0 },
      },
      depthTest: false,
      depthWrite: false,
    });
    this.dofQuad = new FullScreenQuad(this.dofMaterial);
    this.finalQuad = new FullScreenQuad(this.finalMaterial);
    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(256, 256),
      0.42,
      0.55,
      0.9,
    );
  }

  setSize(width: number, height: number, pixelRatio: number) {
    this.width = Math.max(1, Math.round(width * pixelRatio));
    this.height = Math.max(1, Math.round(height * pixelRatio));
    this.sceneTarget.setSize(this.width, this.height);
    this.dofTarget.setSize(this.width, this.height);
    this.bloom.setSize(this.width, this.height);
    this.dofMaterial.uniforms.resolution.value.set(this.width, this.height);
    this.finalMaterial.uniforms.resolution.value.set(this.width, this.height);
    this.dofMaterial.uniforms.maxBlur.value = 7 * pixelRatio * (height / 900);
  }

  get uniforms() {
    return this.finalMaterial.uniforms;
  }

  get focus() {
    return this.dofMaterial.uniforms;
  }

  render(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    time: number,
    split?: RenderSplit,
  ) {
    const { renderer } = this;
    const twoPhase = this.quality !== "low" && !!split;
    const hide = (objects: THREE.Object3D[]) => {
      const was = objects.map((o) => o.visible);
      objects.forEach((o) => (o.visible = false));
      return () => objects.forEach((o, i) => (o.visible = was[i]));
    };
    renderer.setRenderTarget(this.sceneTarget);
    renderer.clear();
    const restoreNear = twoPhase ? hide(split!.near) : null;
    renderer.render(scene, camera);
    restoreNear?.();

    let current = this.sceneTarget;
    if (this.quality !== "low") {
      this.dofMaterial.uniforms.tColor.value = this.sceneTarget.texture;
      this.dofMaterial.uniforms.tDepth.value = this.sceneTarget.depthTexture;
      this.dofMaterial.uniforms.cameraNear.value = camera.near;
      this.dofMaterial.uniforms.cameraFar.value = camera.far;
      renderer.setRenderTarget(this.dofTarget);
      this.dofQuad.render(renderer);
      current = this.dofTarget;
      if (twoPhase) {
        // sharp layer on top of the blurred room, depth-tested against it
        const autoClear = renderer.autoClear;
        renderer.autoClear = false;
        this.depthCopyMaterial.uniforms.tDepth.value =
          this.sceneTarget.depthTexture;
        this.depthCopyQuad.render(renderer);
        const restoreFar = hide(split!.far);
        renderer.render(scene, camera);
        restoreFar();
        renderer.autoClear = autoClear;
      }
    }
    if (!this.skipBloom)
      this.bloom.render(
        renderer,
        null as unknown as THREE.WebGLRenderTarget,
        current,
        0,
        false,
      );

    this.finalMaterial.uniforms.tDiffuse.value = current.texture;
    this.finalMaterial.uniforms.time.value = time;
    renderer.setRenderTarget(null);
    this.finalQuad.render(renderer);
  }

  dispose() {
    this.sceneTarget.depthTexture?.dispose();
    this.sceneTarget.dispose();
    this.dofTarget.dispose();
    this.dofMaterial.dispose();
    this.finalMaterial.dispose();
    this.dofQuad.dispose();
    this.depthCopyQuad.dispose();
    this.depthCopyMaterial.dispose();
    this.finalQuad.dispose();
    this.bloom.dispose();
  }
}
