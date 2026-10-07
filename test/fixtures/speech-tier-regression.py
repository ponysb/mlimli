"""Real installed-engine smoke and known-reference comparison; no downloads.

Use the appropriate private Python (x86 Python for --native). User recording
text and voiceprints are deliberately excluded from the output.
"""
import argparse
import base64
import json
import pathlib
import subprocess
import sys
import time
import wave
import re

sys.stdout.reconfigure(encoding='utf8')
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('root')
parser.add_argument('--model', choices=['paraformer', 'sensevoice', 'qwen06', 'qwen17'], required=True)
parser.add_argument('--native', action='store_true')
parser.add_argument('--reference')
parser.add_argument('--recording')
parser.add_argument('--expected-speakers', type=int)
args = parser.parse_args()
directories = {
    'paraformer': 'sherpa-onnx-paraformer-zh-int8-2025-10-07',
    'sensevoice': 'sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2025-09-09',
    'qwen06': 'sherpa-onnx-qwen3-asr-0.6B-int8-2026-03-25',
    'qwen17': 'qwen3-asr-1.7b',
}
options = {'modelId': args.model, 'directory': directories[args.model], 'preview': not args.native,
           'native': args.native, 'threads': 4}
worker = pathlib.Path(__file__).resolve().parents[2] / 'plugins/local-speech/worker.py'


def wav(file):
    with wave.open(file) as reader:
        assert (reader.getnchannels(), reader.getsampwidth(), reader.getframerate()) == (1, 2, 16000)
        return reader.readframes(reader.getnframes())


def replay(pcm):
    started = time.monotonic()
    process = subprocess.Popen([sys.executable, '-u', str(worker), args.root, '--options', json.dumps(options)],
                               stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, encoding='utf8')
    segments, partials, live = [], [], set()
    try:
        for offset in range(0, len(pcm) + 8000, 8000):
            finish = offset >= len(pcm)
            process.stdin.write(json.dumps({'id': offset, 'pcm': base64.b64encode(pcm[offset:offset+8000]).decode(), 'finish': finish}) + '\n')
            process.stdin.flush()
            line = process.stdout.readline()
            assert line, 'Worker exited unexpectedly'
            response = json.loads(line)
            assert not response.get('error'), response.get('error')
            segments.extend(response['segments'])
            if response['partial']:
                partials.append(response['partial'])
            if response.get('speaker'):
                live.add(response['speaker'])
            if finish:
                assert not response['partial'] and not response['speaking']
                break
        duration = len(pcm) / 32000
        for item in segments:
            assert 0 <= item['start'] < item['end'] <= duration + .01
        return segments, partials, live, round(time.monotonic() - started, 2)
    finally:
        process.stdin.close()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill(); process.wait()
        process.stdout.close()


silent = replay(bytes(8 * 32000 + 218))
assert not silent[0] and not silent[1], 'Silence produced words'
print(json.dumps({'model': args.model, 'native32': args.native, 'silence': 'no words'}), flush=True)

if args.reference:
    segments, partials, live, elapsed = replay(wav(args.reference))
    text = re.sub(r'[^\w]', '', ''.join(item['text'] for item in segments))
    expected = '我们今天讨论项目计划请张三负责开发李四负责测试周五交付第一版会议结束后生成会议纪要'
    assert text, 'No reference transcript'
    distances = list(range(len(text) + 1))
    for i, left in enumerate(expected, 1):
        previous, distances = distances, [i]
        for j, right in enumerate(text, 1):
            distances.append(min(distances[-1] + 1, previous[j] + 1, previous[j-1] + (left != right)))
    print(json.dumps({'knownReferenceCharacters': len(expected), 'characterEdits': distances[-1],
                      'inferenceSecondsIncludingStartup': elapsed, 'hasPreview': bool(partials)}), flush=True)

if args.recording:
    pcm = wav(args.recording)
    segments, partials, live, elapsed = replay(pcm)
    assert len(segments) >= 4, 'No incremental final segments'
    speakers = sorted({item['speaker'] for item in segments if item['speaker'] != 'unknown'})
    if args.expected_speakers:
        assert len(speakers) == args.expected_speakers, speakers
        assert len(live) == args.expected_speakers, sorted(live)
    print(json.dumps({'recordingSeconds': len(pcm) / 32000, 'segments': len(segments), 'speakers': speakers,
                      'liveSpeakers': sorted(live), 'inferenceSecondsIncludingStartup': elapsed,
                      'realTimeFactor': round(elapsed / (len(pcm) / 32000), 3)}), flush=True)
