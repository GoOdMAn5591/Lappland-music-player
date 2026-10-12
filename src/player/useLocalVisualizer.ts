import { useCallback, useEffect, useRef } from "react";
import { usePowerSaver } from "../power";

/**
 * Owns the local Web Audio graph: <audio> -> analyser -> gain -> speakers.
 * The 3D bar reads the analyser directly every frame; only a coarse
 * `--audio-pulse` CSS variable is published for the HUD.
 */
export function useLocalVisualizer(isPlaying: boolean) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const appRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext>();
  const sourceRef = useRef<MediaElementAudioSourceNode>();
  const analyserRef = useRef<AnalyserNode>();
  const gainRef = useRef<GainNode>();
  const animationRef = useRef<number>();
  const ensureAudioGraph = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const AudioCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtor) return;
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioCtor();
    }
    if (!sourceRef.current) {
      const context = audioContextRef.current;
      analyserRef.current = context.createAnalyser();
      analyserRef.current.fftSize = 1024;
      analyserRef.current.smoothingTimeConstant = 0.72;
      sourceRef.current = context.createMediaElementSource(audio);
      sourceRef.current.connect(analyserRef.current);
      gainRef.current = context.createGain();
      analyserRef.current.connect(gainRef.current);
      gainRef.current.connect(context.destination);
    }
    if (audioContextRef.current.state === "suspended") {
      void audioContextRef.current.resume();
    }
  }, []);
  const publishPulse = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const buffer = new Uint8Array(analyser.frequencyBinCount);
    let last = 0;
    const render = (now: number) => {
      animationRef.current = requestAnimationFrame(render);
      if (now - last < 66) return;
      last = now;
      analyser.getByteFrequencyData(buffer);
      let sum = 0;
      for (let i = 0; i < 48; i++) sum += buffer[i];
      appRef.current?.style.setProperty(
        "--audio-pulse",
        (sum / 48 / 255).toFixed(3),
      );
    };
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    animationRef.current = requestAnimationFrame(render);
  }, []);
  // performance mode: no per-frame analysis for the HUD glow
  const powerSaver = usePowerSaver();
  useEffect(() => {
    if (isPlaying && !powerSaver) {
      ensureAudioGraph();
      publishPulse();
    } else {
      if (isPlaying) ensureAudioGraph();
      appRef.current?.style.setProperty("--audio-pulse", "0");
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    }
  }, [publishPulse, ensureAudioGraph, isPlaying, powerSaver]);
  useEffect(
    () => () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      void audioContextRef.current?.close();
    },
    [],
  );
  return {
    audioRef,
    appRef,
    analyserRef,
    audioContextRef,
    gainRef,
    ensureAudioGraph,
  };
}
