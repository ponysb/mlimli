"""Real inference regression; requires installed models, does not download them.

Run with the plugin Python: speech-model-regression.py MODEL_ROOT [PCM16_WAV].
Private recording text is deliberately excluded from the report.
"""
import base64
import argparse
import json
import pathlib
import subprocess
import sys
import time
import wave

sys.stdout.reconfigure(encoding='utf-8')
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('model_root')
parser.add_argument('recording', nargs='?')
parser.add_argument('--reference', help='Known Chinese PCM16 WAV with the project-plan sentence below')
parser.add_argument('--expected-speakers', type=int, help='Expected speaker count in the optional recording')
args = parser.parse_args()
root = pathlib.Path(args.model_root)
worker = pathlib.Path(__file__).resolve().parents[2] / 'plugins/local-speech/worker.py'


def read_wav(file):
    with wave.open(str(file)) as audio:
        assert (audio.getnchannels(), audio.getsampwidth(), audio.getframerate()) == (1, 2, 16000)
        return audio.readframes(audio.getnframes())


def replay(pcm):
    process = subprocess.Popen([sys.executable, '-u', str(worker), str(root)],
                               stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                               stderr=subprocess.PIPE, encoding='utf-8')
    segments, partials, commits, live_speakers = [], [], [], set()
    started = time.monotonic()
    try:
        for offset in range(0, len(pcm) + 8000, 8000):
            finish = offset >= len(pcm)
            request = {'id': offset // 8000, 'finish': finish,
                       'pcm': base64.b64encode(pcm[offset:offset + 8000]).decode('ascii')}
            process.stdin.write(json.dumps(request) + '\n'); process.stdin.flush()
            line = process.stdout.readline()
            assert line, process.stderr.read()
            response = json.loads(line)
            assert not response.get('error'), response
            segments.extend(response['segments'])
            if response['partial']:
                partials.append(response['partial'])
            if response.get('speaker'):
                live_speakers.add(response['speaker'])
            if response['segments']:
                commits.append(min(len(pcm), offset + 8000) / 32000)
            if finish:
                assert not response['partial'] and not response['speaking']
                break
        return {'segments': segments, 'partials': partials, 'commits': commits,
                'liveSpeakers': sorted(live_speakers),
                'duration': len(pcm) / 32000, 'inferenceSeconds': round(time.monotonic() - started, 2)}
    finally:
        process.stdin.close()
        process.wait(timeout=10)
        process.stdout.close(); process.stderr.close()


silent = replay(bytes(16 * 32000 + 218))  # Includes an incomplete 512-sample tail.
assert not silent['segments'] and not silent['partials'], 'Silence hallucinated words'
fixture = root / 'sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2025-09-09/test_wavs/zh.wav'
spoken = replay(read_wav(fixture))
text = ''.join(segment['text'] for segment in spoken['segments'])
assert '时间' in text and '早上九点' in text and '下午五点' in text, text
assert spoken['partials'], 'No live preview'
assert spoken['segments'][-1]['end'] <= spoken['duration'] + .01
print(json.dumps({'silence': 'no words', 'referenceText': text,
                  'referenceInferenceSeconds': spoken['inferenceSeconds']}, ensure_ascii=False), flush=True)

if args.reference:
    reference = replay(read_wav(pathlib.Path(args.reference)))
    reference_text = ''.join(segment['text'] for segment in reference['segments'])
    expected = '我们今天讨论项目计划请张三负责开发李四负责测试周五交付第一版会议结束后生成会议纪要'
    import re
    assert re.sub(r'[^\w]', '', reference_text) == expected, reference_text
    print(json.dumps({'knownReference': 'exact match', 'characters': len(expected),
                      'referenceInferenceSeconds': reference['inferenceSeconds']}, ensure_ascii=False), flush=True)

if args.recording:
    recording = replay(read_wav(pathlib.Path(args.recording)))
    assert recording['segments'], 'No committed speech'
    assert recording['commits'][0] <= recording['segments'][0]['start'] + 12.5, recording['commits']
    assert len(recording['segments']) >= 4, 'Continuous speech did not split'
    for segment in recording['segments']:
        assert 0 < segment['end'] - segment['start'] <= 12.05, segment
    for previous, following in zip(recording['segments'], recording['segments'][1:]):
        assert following['start'] >= previous['end'] - .01, 'Duplicated audio at split'
    speakers = sorted({segment['speaker'] for segment in recording['segments'] if segment['speaker'] != 'unknown'})
    if args.expected_speakers:
        assert len(speakers) == args.expected_speakers, speakers
        assert len(recording['liveSpeakers']) == args.expected_speakers, recording['liveSpeakers']
    print(json.dumps({'recordingSeconds': recording['duration'],
                      'committedSegments': len(recording['segments']),
                      'speakers': speakers, 'liveSpeakers': recording['liveSpeakers'],
                      'commitAudioSeconds': recording['commits'],
                      'inferenceSeconds': recording['inferenceSeconds'],
                      'realTimeFactor': round(recording['inferenceSeconds'] / recording['duration'], 3)}), flush=True)
