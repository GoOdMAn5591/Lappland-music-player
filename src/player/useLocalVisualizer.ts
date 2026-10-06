import { useRef, useCallback, useEffect } from "react";
export function useLocalVisualizer(isPlaying: boolean) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const appRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
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
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 128;
      sourceRef.current =
        audioContextRef.current.createMediaElementSource(audio);
      sourceRef.current.connect(analyserRef.current);
      gainRef.current = audioContextRef.current.createGain();
      analyserRef.current.connect(gainRef.current);
      gainRef.current.connect(audioContextRef.current.destination);
    }
    if (audioContextRef.current.state === "suspended") {
      void audioContextRef.current.resume();
    }
  }, []);
  const drawVisualizer = useCallback(() => {
    const analyser = analyserRef.current;
    const canvas = canvasRef.current;
    if (!analyser || !canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const buffer = new Uint8Array(analyser.frequencyBinCount);
    const render = () => {
      analyser.getByteFrequencyData(buffer);
      const width = canvas.width;
      const height = canvas.height;
      const average =
        buffer.reduce((sum, value) => sum + value, 0) / buffer.length / 255;
      appRef.current?.style.setProperty("--audio-pulse", average.toFixed(3));
      context.clearRect(0, 0, width, height);
      const gradient = context.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, "rgba(247, 210, 123, 0.08)");
      gradient.addColorStop(0.5, "rgba(147, 23, 43, 0.42)");
      gradient.addColorStop(1, "rgba(255, 226, 161, 0.12)");
      context.fillStyle = gradient;
      const barWidth = width / buffer.length;
      buffer.forEach((value, index) => {
        const barHeight = Math.max(2, (value / 255) * height * 0.86);
        context.fillRect(
          index * barWidth,
          height - barHeight,
          Math.max(2, barWidth - 2),
          barHeight,
        );
      });
      animationRef.current = requestAnimationFrame(render);
    };
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    render();
  }, []);
  useEffect(() => {
    if (isPlaying) {
      ensureAudioGraph();
      drawVisualizer();
    } else {
      appRef.current?.style.setProperty("--audio-pulse", "0");
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    }
  }, [drawVisualizer, ensureAudioGraph, isPlaying]);
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
    canvasRef,
    audioContextRef,
    gainRef,
    ensureAudioGraph,
  };
}
