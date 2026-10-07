"""Real CAM++ turn detection: A-B-A without a pause, one speaker, optional meeting.

Usage: plugin-python speaker-model-regression.py MODEL_ROOT [PCM16_WAV]
"""
import pathlib
import sys
import wave
import numpy as np
import sherpa_onnx
sys.dont_write_bytecode = True
sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / 'plugins/local-speech'))
from diarization import SpeakerDiarizer, WINDOW, STEP

root = pathlib.Path(sys.argv[1])
extractor = sherpa_onnx.SpeakerEmbeddingExtractor(sherpa_onnx.SpeakerEmbeddingExtractorConfig(
    model=str(root / '3dspeaker_speech_campplus_sv_zh_en_16k-common_advanced.onnx'), num_threads=2, provider='cpu'))


def embedding(audio):
    stream = extractor.create_stream()
    stream.accept_waveform(16000, audio); stream.input_finished()
    return np.asarray(extractor.compute(stream), dtype=np.float32) if extractor.is_ready(stream) else None


def read(file):
    with wave.open(str(file)) as audio:
        assert (audio.getnchannels(), audio.getsampwidth(), audio.getframerate()) == (1, 2, 16000)
        return np.frombuffer(audio.readframes(audio.getnframes()), dtype='<i2').astype(np.float32) / 32768


def speech_chunks(audio):
    config = sherpa_onnx.VadModelConfig()
    config.silero_vad.model = str(root / 'silero_vad.onnx')
    config.silero_vad.min_silence_duration = .45
    config.silero_vad.min_speech_duration = .2
    config.silero_vad.max_speech_duration = 12
    config.sample_rate = 16000
    vad = sherpa_onnx.VoiceActivityDetector(config, buffer_size_in_seconds=30)
    for offset in range(0, len(audio), 512):
        block = audio[offset:offset + 512]
        vad.accept_waveform(np.pad(block, (0, 512 - len(block))))
        if vad.is_speech_detected() and offset + 512 - vad.current_segment.start >= 12 * 16000:
            vad.flush()
        while not vad.empty():
            segment = vad.front
            yield segment.start, np.asarray(segment.samples, dtype=np.float32)
            vad.pop()
    vad.flush()
    while not vad.empty():
        segment = vad.front
        yield segment.start, np.asarray(segment.samples, dtype=np.float32)
        vad.pop()


def detect(audio, with_vad=False):
    diarizer = SpeakerDiarizer(embedding)
    turns, live = [], []
    chunks = speech_chunks(audio) if with_vad else ((start, audio[start:start + 12 * 16000]) for start in range(0, len(audio), 12 * 16000))
    for start, chunk in chunks:
        for end in range(WINDOW, len(chunk) + 1, STEP):
            record = diarizer.observe(chunk[end - WINDOW:end], start + end - WINDOW)
            speaker = diarizer.speaker(record)
            if speaker:
                live.append(speaker)
        turns.extend((round((start + left) / 16000, 2), round((start + right) / 16000, 2), speaker)
                     for left, right, speaker in diarizer.split(chunk, start))
    return diarizer, turns, live


samples = root / 'sherpa-onnx-streaming-zipformer-zh-int8-2025-06-30/test_wavs'
a = read(samples / '0.wav')
b = read(root / 'sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2025-09-09/test_wavs/zh.wav')
diarizer, turns, live = detect(np.concatenate((a, b, a)))
assert len(diarizer.centroids) == 2, turns
order = [turn[2] for i, turn in enumerate(turns) if turn[2] != 'unknown' and (i == 0 or turn[2] != turns[i - 1][2])]
assert order == ['speaker-1', 'speaker-2', 'speaker-1'], turns
assert set(live) == {'speaker-1', 'speaker-2'}, live
print('A-B-A with no inserted silence:', turns, flush=True)

single, turns, live = detect(np.concatenate((a, a * .65, a)))
assert len(single.centroids) == 1, turns
assert {turn[2] for turn in turns} <= {'speaker-1', 'unknown'}, turns
print('One voice with changed volume: one speaker', flush=True)

if len(sys.argv) > 2:
    meeting, turns, live = detect(read(sys.argv[2]), with_vad=True)
    assert len(meeting.centroids) == 2, turns
    assert {turn[2] for turn in turns if turn[2] != 'unknown'} == {'speaker-1', 'speaker-2'}, turns
    assert set(live) == {'speaker-1', 'speaker-2'}, live
    print('Meeting turn timeline:', turns, flush=True)
