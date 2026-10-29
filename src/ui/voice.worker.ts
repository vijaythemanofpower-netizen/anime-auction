// Runs the Kokoro text-to-speech model in a worker so the arena stays smooth.
// The model (~90 MB) is downloaded once from Hugging Face and cached by the browser.
import { KokoroTTS } from 'kokoro-js';

type In = { type: 'load' } | { type: 'speak'; id: number; text: string; voice: string; speed: number };

let tts: KokoroTTS | null = null;
const post = (m: unknown, transfer?: Transferable[]) => (self as unknown as Worker).postMessage(m, transfer ?? []);

self.onmessage = async (ev: MessageEvent<In>) => {
  const m = ev.data;
  if (m.type === 'load') {
    const progress_callback = (p: { status?: string; progress?: number; file?: string }) => {
      if (p.status === 'progress' && typeof p.progress === 'number') post({ type: 'progress', progress: p.progress, file: p.file });
    };
    const id = 'onnx-community/Kokoro-82M-v1.0-ONNX';
    // The graphics card is many times faster than the CPU; fall back if it is unavailable.
    const gpu = (self as unknown as { navigator: { gpu?: { requestAdapter(): Promise<unknown> } } }).navigator.gpu;
    if (gpu && await gpu.requestAdapter().catch(() => null)) {
      try {
        tts = await KokoroTTS.from_pretrained(id, { dtype: 'fp32', device: 'webgpu', progress_callback });
        post({ type: 'ready', device: 'webgpu' });
        return;
      } catch { tts = null; }
    }
    try {
      tts = await KokoroTTS.from_pretrained(id, { dtype: 'q8', device: 'wasm', progress_callback });
      post({ type: 'ready', device: 'wasm' });
    } catch (e) {
      post({ type: 'error', message: (e as Error).message || 'Could not load the voice model.' });
    }
    return;
  }
  if (m.type === 'speak' && tts) {
    try {
      const audio = await tts.generate(m.text, { voice: m.voice as never, speed: m.speed });
      const data = audio.audio as Float32Array;
      post({ type: 'audio', id: m.id, data, rate: audio.sampling_rate }, [data.buffer]);
    } catch {
      post({ type: 'audio', id: m.id, data: null, rate: 0 });
    }
  }
};
