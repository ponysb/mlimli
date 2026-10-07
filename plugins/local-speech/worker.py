"""Local streaming ASR + Silero VAD + online speaker embedding clustering.

stdin/stdout: JSON lines; audio: little-endian mono PCM16, 16 kHz.
Speaker numbers are session-local clusters, never verified personal identities.
"""
import base64
import json
import pathlib
import sys
sys.dont_write_bytecode = True
sys.stdin.reconfigure(encoding='utf-8')
sys.stdout.reconfigure(encoding='utf-8')
import numpy as np
from diarization import SpeakerDiarizer, WINDOW, STEP
from asr import create_final

root = pathlib.Path(sys.argv[1])
options = json.loads(sys.argv[sys.argv.index('--options') + 1]) if '--options' in sys.argv else {}
if options.get('native'):
    import native_sherpa as sherpa_onnx
    sherpa_onnx.load(root / 'native32' / 'lib')
else:
    import sherpa_onnx
model = root / 'sherpa-onnx-streaming-zipformer-zh-int8-2025-06-30'


def model_file(prefix):
    files = sorted(model.glob(prefix + '*.onnx'))
    return str(next((f for f in files if 'int8' in f.name), files[0]))


recognizer = sherpa_onnx.OnlineRecognizer.from_transducer(
    tokens=str(model / 'tokens.txt'), encoder=model_file('encoder'),
    decoder=model_file('decoder'), joiner=model_file('joiner'),
    num_threads=options.get('threads', 2), sample_rate=16000, feature_dim=80,
    decoding_method='greedy_search', enable_endpoint_detection=False,
) if options.get('preview', True) else None
# Short dictation uses the installed Chinese streaming recognizer directly.
# Do not load meeting ASR weights or speaker embeddings on this latency path.
if options.get('kind') == 'dictation' and recognizer is not None and '--check' not in sys.argv:
    live_stream = recognizer.create_stream()
    received_samples = 0
    for line in sys.stdin:
        request = {}
        try:
            request = json.loads(line)
            if request.get('reset'):
                live_stream = recognizer.create_stream()
                received_samples = 0
            samples = np.frombuffer(base64.b64decode(request.get('pcm', ''), validate=True), dtype='<i2').astype(np.float32) / 32768
            received_samples += len(samples)
            if len(samples):
                live_stream.accept_waveform(16000, samples)
            if request.get('finish'):
                live_stream.accept_waveform(16000, np.zeros(4800, dtype=np.float32))
                live_stream.input_finished()
            while recognizer.is_ready(live_stream):
                recognizer.decode_stream(live_stream)
            text = recognizer.get_result(live_stream).strip()
            complete = request.get('finish', False)
            segments = [{'id': 1, 'text': text, 'start': 0, 'end': round(received_samples / 16000, 2), 'speaker': 'unknown'}] if complete and text else []
            print(json.dumps({'id': request['id'], 'segments': segments, 'partial': '' if complete else text, 'speaker': None, 'speaking': bool(len(samples)), 'voiceprints': {}, 'matches': {}}, ensure_ascii=False), flush=True)
        except Exception as error:
            print(json.dumps({'id': request.get('id'), 'error': str(error)}), flush=True)
    sys.exit(0)
# Streaming text is provisional. Decode the actual VAD waveform with the
# multilingual model before persisting text or sending it to the minutes LLM.
final_recognizer = create_final(root, options, sherpa_onnx)
config = sherpa_onnx.VadModelConfig()
config.silero_vad.model = str(root / 'silero_vad.onnx')
config.silero_vad.min_silence_duration = 0.45
config.silero_vad.min_speech_duration = 0.2
config.silero_vad.max_speech_duration = 12
config.sample_rate = 16000
vad = sherpa_onnx.VoiceActivityDetector(config, buffer_size_in_seconds=30)
extractor = sherpa_onnx.SpeakerEmbeddingExtractor(
    sherpa_onnx.SpeakerEmbeddingExtractorConfig(
        model=str(root / '3dspeaker_speech_campplus_sv_zh_en_16k-common_advanced.onnx'),
        num_threads=2, provider='cpu',
    )
) if options.get('kind') != 'dictation' else None
if '--check' in sys.argv:
    # A successful import/load alone does not validate a model's decode path.
    check_stream = final_recognizer.create_stream()
    check_stream.accept_waveform(16000, np.zeros(16000, dtype=np.float32))
    final_recognizer.decode_stream(check_stream)
    sys.exit(0)

stream = None
pending_audio = np.zeros(0, dtype=np.float32)
utterance = []
segments = []
cursor = 0
received = 0
start = 0
active_speaker = None
speaker_window_end = WINDOW
profiles = []
matches = {}


def match_profile(index):
    speaker = 'speaker-' + str(index + 1)
    candidates = []
    for profile in profiles:
        vector = np.array(profile.get('embedding', []), dtype=np.float32)
        if vector.shape != centroids[index].shape:
            continue
        vector /= max(float(np.linalg.norm(vector)), 1e-8)
        candidates.append((float(np.dot(vector, centroids[index])), profile))
    candidates.sort(key=lambda item: item[0], reverse=True)
    # Global identity matching is stricter than clustering within one meeting.
    if candidates and candidates[0][0] >= 0.65 and (len(candidates) == 1 or candidates[0][0] - candidates[1][0] >= 0.08):
        score, profile = candidates[0]
        matches[speaker] = {'profileId': profile['id'], 'confidence': round(score, 3)}
    else:
        matches.pop(speaker, None)


def embedding(samples):
    if extractor is None or len(samples) < 16000:
        return None
    s = extractor.create_stream()
    s.accept_waveform(sample_rate=16000, waveform=samples)
    s.input_finished()
    if not extractor.is_ready(s):
        return None
    return np.array(extractor.compute(s), dtype=np.float32)


diarizer = SpeakerDiarizer(embedding)
centroids = diarizer.centroids


def decode():
    while recognizer is not None and recognizer.is_ready(stream):
        recognizer.decode_stream(stream)


def finalize(samples, segment_start):
    global stream, utterance, start, active_speaker, speaker_window_end
    audio = samples[:max(0, received - segment_start)]
    if len(audio) >= 3200 and float(np.sqrt(np.mean(audio ** 2))) > 0.0001:
        # Speaker changes need not contain silence. Split the waveform first,
        # then transcribe each turn; never discard words by resetting live ASR.
        turns = [(0, len(audio), 'unknown')] if options.get('kind') == 'dictation' else diarizer.split(audio, segment_start)
        for left, right, speaker in turns:
            final_stream = final_recognizer.create_stream()
            final_stream.accept_waveform(16000, audio[left:right])
            final_recognizer.decode_stream(final_stream)
            text = final_stream.result.text.strip()
            if text:
                segments.append({'id': len(segments) + 1, 'text': text, 'start': round((segment_start + left) / 16000, 2), 'end': round((segment_start + right) / 16000, 2), 'speaker': speaker})
        for index in range(len(centroids)):
            match_profile(index)
    stream = None
    utterance = []
    start = cursor
    active_speaker = None
    speaker_window_end = WINDOW


def drain_segments():
    while not vad.empty():
        segment = vad.front
        finalize(np.array(segment.samples, dtype=np.float32), segment.start)
        vad.pop()


def accept_block(block):
    global cursor, stream, start, active_speaker, speaker_window_end
    cursor += len(block)
    vad.accept_waveform(block)
    if vad.is_speech_detected():
        if stream is None:
            # Include VAD's pre-roll so its onset delay cannot drop initial words.
            segment = vad.current_segment
            start = segment.start
            initial = np.array(segment.samples, dtype=np.float32)
            stream = recognizer.create_stream() if recognizer is not None else True
            if recognizer is not None:
                stream.accept_waveform(16000, initial)
            utterance.append(initial)
        else:
            if recognizer is not None:
                stream.accept_waveform(16000, block)
            utterance.append(block)
        decode()
        if options.get('kind') != 'dictation' and cursor - start >= speaker_window_end:
            voiced = np.concatenate(utterance)
            while len(voiced) >= speaker_window_end:
                offset = speaker_window_end - WINDOW
                record = diarizer.observe(voiced[offset:speaker_window_end], start + offset)
                active_speaker = diarizer.speaker(record)
                speaker_window_end += STEP
            for index in range(len(centroids)):
                match_profile(index)
        # sherpa's max_speech_duration only tightens VAD thresholds; it is not
        # a hard limit. Explicitly flush continuous speech to bound latency.
        if cursor - start >= 12 * 16000:
            vad.flush()
    drain_segments()


for line in sys.stdin:
    request = {}
    try:
        request = json.loads(line)
        if request.get('reset'):
            # Keep ASR weights resident; recreate the small VAD to clear its audio history.
            vad = sherpa_onnx.VoiceActivityDetector(config, buffer_size_in_seconds=30)
            stream = None
            pending_audio = np.zeros(0, dtype=np.float32)
            utterance = []
            segments = []
            cursor = received = start = 0
            active_speaker = None
            speaker_window_end = WINDOW
            profiles = []
            matches = {}
            diarizer = SpeakerDiarizer(embedding)
            centroids = diarizer.centroids
        if 'profiles' in request:
            profiles = request['profiles']
        before = len(segments)
        raw = base64.b64decode(request.get('pcm', ''), validate=True)
        samples = np.frombuffer(raw, dtype='<i2').astype(np.float32) / 32768
        received += len(samples)
        pending_audio = np.concatenate((pending_audio, samples))
        while len(pending_audio) >= 512:
            block, pending_audio = pending_audio[:512], pending_audio[512:]
            accept_block(block)
        if request.get('finish'):
            if len(pending_audio):
                accept_block(np.pad(pending_audio, (0, 512 - len(pending_audio))))
                pending_audio = np.zeros(0, dtype=np.float32)
            vad.flush()
            drain_segments()
        print(json.dumps({'id': request['id'], 'segments': segments[before:], 'partial': recognizer.get_result(stream) if stream is not None and recognizer is not None else '', 'speaker': active_speaker, 'speaking': vad.is_speech_detected(), 'voiceprints': {'speaker-' + str(i + 1): vector.tolist() for i, vector in enumerate(centroids)}, 'matches': matches}, ensure_ascii=False), flush=True)
    except Exception as error:
        print(json.dumps({'id': request.get('id'), 'error': str(error)}), flush=True)
