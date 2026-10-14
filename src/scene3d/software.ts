/**
 * Without a usable graphics card (no GPU, a blocked driver, many CI machines)
 * the browser draws WebGL on the processor. A frame can then take a second, so
 * the 3D scenes switch to a light, slow-paced mode to keep the page responsive.
 */

/** True when this WebGL context runs on the processor. */
export function isSoftwareRenderer(gl: WebGLRenderingContext | WebGL2RenderingContext) {
  try {
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const name = String(
      gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? "",
    );
    return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name);
  } catch {
    return false;
  }
}

let probed: boolean | undefined;

/** Ask once, with a throwaway canvas, before creating a renderer. */
export function softwareGraphics() {
  if (probed !== undefined) return probed;
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    probed = gl ? isSoftwareRenderer(gl) : false;
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    probed = false;
  }
  return probed;
}

/** Wait for the GPU (or the processor drawing for it) to finish what was sent. */
export function finishFrame(gl: WebGLRenderingContext | WebGL2RenderingContext) {
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
}
