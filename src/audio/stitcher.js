/**
 * audio/stitcher.js
 * Upgraded with lamejs for gapless MP3 encoding.
 */
import * as lamejs from 'lamejs';

/**
 * Encodes an AudioBuffer into a single MP3 Blob using lamejs.
 * Provides precise duration and professional compatibility.
 */
export async function encodeAudioBufferToMP3(audioBuffer) {
  const channels = 1; // mono for TTS
  const sampleRate = audioBuffer.sampleRate;
  const samples = audioBuffer.getChannelData(0);
  
  // Initialize encoder: mono, sampleRate, 128kbps
  const encoder = new lamejs.Mp3Encoder(channels, sampleRate, 128);
  const mp3Data = [];

  // Convert Float32 (-1 to 1) to Int16 (-32768 to 32767)
  const int16Samples = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    int16Samples[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }

  // Encode in chunks of 1152 samples (LAME requirement)
  const sampleBlockSize = 1152;
  for (let i = 0; i < int16Samples.length; i += sampleBlockSize) {
    const chunk = int16Samples.subarray(i, i + sampleBlockSize);
    const mp3buf = encoder.encodeBuffer(chunk);
    if (mp3buf.length > 0) mp3Data.push(mp3buf);
  }

  // Flush encoder
  const endBuf = encoder.flush();
  if (endBuf.length > 0) mp3Data.push(endBuf);

  return new Blob(mp3Data, { type: 'audio/mpeg' });
}

/**
 * Modified Stitching Logic:
 * Instead of byte concatenation, we decode all parts into one big buffer,
 * then encode it once. This ensures zero gaps/clicks between sentences.
 */
export async function stitchBlobs(blobs) {
  if (blobs.length === 0) throw new Error('No blobs provided');
  if (blobs.length === 1) return blobs[0];

  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  
  // 1. Decode all blobs to AudioBuffers
  const buffers = await Promise.all(blobs.map(async (blob) => {
    const arrayBuf = await blob.arrayBuffer();
    return await ctx.decodeAudioData(arrayBuf);
  }));

  // 2. Calculate total length
  const totalLength = buffers.reduce((acc, buf) => acc + buf.length, 0);
  const outBuffer = ctx.createBuffer(1, totalLength, buffers[0].sampleRate);

  // 3. Copy data into the single output buffer
  let offset = 0;
  for (const buf of buffers) {
    outBuffer.getChannelData(0).set(buf.getChannelData(0), offset);
    offset += buf.length;
  }

  await ctx.close();

  // 4. Encode the final merged buffer to MP3
  return await encodeAudioBufferToMP3(outBuffer);
}