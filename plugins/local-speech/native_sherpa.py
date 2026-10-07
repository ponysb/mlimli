"""32-bit Windows adapter to the pinned sherpa-onnx 1.13.8 native C API.

No pip sherpa wheel or compiler is required. Handles and returned buffers have
explicit ownership. Only the lightweight offline models are enabled on x86.
"""
import ctypes as c
import json
import os
from types import SimpleNamespace
import numpy as np
from native_abi import (SherpaOnnxOfflineRecognizerConfig, SherpaOnnxVadModelConfig,
                        SherpaOnnxSpeakerEmbeddingExtractorConfig, SherpaOnnxSpeechSegment)

lib = None
_dll_directory = None
P = c.c_void_p
F = c.POINTER(c.c_float)


def load(directory):
    global lib, _dll_directory
    _dll_directory = os.add_dll_directory(str(directory))
    lib = c.CDLL(str(directory / 'sherpa-onnx-c-api.dll'))
    signatures = {
        'CreateOfflineRecognizer': (P, [c.POINTER(SherpaOnnxOfflineRecognizerConfig)]),
        'DestroyOfflineRecognizer': (None, [P]), 'CreateOfflineStream': (P, [P]),
        'DestroyOfflineStream': (None, [P]), 'AcceptWaveformOffline': (None, [P, c.c_int32, F, c.c_int32]),
        'DecodeOfflineStream': (None, [P, P]), 'GetOfflineStreamResultAsJson': (P, [P]),
        'DestroyOfflineStreamResultJson': (None, [P]),
        'CreateVoiceActivityDetector': (P, [c.POINTER(SherpaOnnxVadModelConfig), c.c_float]),
        'DestroyVoiceActivityDetector': (None, [P]), 'VoiceActivityDetectorAcceptWaveform': (None, [P, F, c.c_int32]),
        'VoiceActivityDetectorDetected': (c.c_int32, [P]), 'VoiceActivityDetectorEmpty': (c.c_int32, [P]),
        'VoiceActivityDetectorFront': (c.POINTER(SherpaOnnxSpeechSegment), [P]),
        'DestroySpeechSegment': (None, [c.POINTER(SherpaOnnxSpeechSegment)]),
        'VoiceActivityDetectorPop': (None, [P]), 'VoiceActivityDetectorFlush': (None, [P]),
        'CreateSpeakerEmbeddingExtractor': (P, [c.POINTER(SherpaOnnxSpeakerEmbeddingExtractorConfig)]),
        'DestroySpeakerEmbeddingExtractor': (None, [P]), 'SpeakerEmbeddingExtractorDim': (c.c_int32, [P]),
        'SpeakerEmbeddingExtractorCreateStream': (P, [P]), 'SpeakerEmbeddingExtractorIsReady': (c.c_int32, [P, P]),
        'SpeakerEmbeddingExtractorComputeEmbedding': (F, [P, P]), 'SpeakerEmbeddingExtractorDestroyEmbedding': (None, [F]),
        'OnlineStreamAcceptWaveform': (None, [P, c.c_int32, F, c.c_int32]),
        'OnlineStreamInputFinished': (None, [P]), 'DestroyOnlineStream': (None, [P]),
    }
    for name, (result, args) in signatures.items():
        function = getattr(lib, 'SherpaOnnx' + name)
        function.restype, function.argtypes = result, args


def call(name, *args):
    return getattr(lib, 'SherpaOnnx' + name)(*args)


def samples(value):
    return np.ascontiguousarray(value, dtype=np.float32)


class Handle:
    def __init__(self, pointer, destroy):
        if not pointer:
            raise RuntimeError('Native speech model could not be loaded')
        self.pointer, self.destroy = pointer, destroy

    def __del__(self):
        if getattr(self, 'pointer', None) and lib is not None:
            call(self.destroy, self.pointer)
            self.pointer = None


class Stream(Handle):
    def __init__(self, pointer, online=False):
        super().__init__(pointer, 'DestroyOnlineStream' if online else 'DestroyOfflineStream')
        self.online = online
        self.result = SimpleNamespace(text='')

    def accept_waveform(self, sample_rate, waveform):
        audio = samples(waveform)
        call('OnlineStreamAcceptWaveform' if self.online else 'AcceptWaveformOffline',
             self.pointer, sample_rate, audio.ctypes.data_as(F), len(audio))

    def input_finished(self):
        call('OnlineStreamInputFinished', self.pointer)


class OfflineRecognizer(Handle):
    @classmethod
    def _create(cls, model, tokens, threads, sense=False, use_itn=True):
        config = SherpaOnnxOfflineRecognizerConfig()
        config.feat_config.sample_rate, config.feat_config.feature_dim = 16000, 80
        config.model_config.tokens = tokens.encode('utf8')
        config.model_config.num_threads, config.model_config.provider = threads, b'cpu'
        config.decoding_method = b'greedy_search'
        config.max_active_paths = 4
        if sense:
            config.model_config.sense_voice.model = model.encode('utf8')
            config.model_config.sense_voice.language = b'auto'
            config.model_config.sense_voice.use_itn = int(use_itn)
        else:
            config.model_config.paraformer.model = model.encode('utf8')
        return cls(call('CreateOfflineRecognizer', c.byref(config)), 'DestroyOfflineRecognizer')

    @classmethod
    def from_paraformer(cls, paraformer, tokens, num_threads=2):
        return cls._create(paraformer, tokens, num_threads)

    @classmethod
    def from_sense_voice(cls, model, tokens, num_threads=2, use_itn=True):
        return cls._create(model, tokens, num_threads, True, use_itn)

    def create_stream(self):
        return Stream(call('CreateOfflineStream', self.pointer))

    def decode_stream(self, stream):
        call('DecodeOfflineStream', self.pointer, stream.pointer)
        result = call('GetOfflineStreamResultAsJson', stream.pointer)
        if not result:
            raise RuntimeError('Native ASR returned no result')
        try:
            stream.result.text = json.loads(c.string_at(result).decode('utf8')).get('text', '')
        finally:
            call('DestroyOfflineStreamResultJson', result)


class VadModelConfig:
    def __init__(self):
        self.sample_rate = 16000
        self.silero_vad = SimpleNamespace(model='', threshold=0.5, min_silence_duration=0.45,
                                          min_speech_duration=0.2, max_speech_duration=12)


class VoiceActivityDetector(Handle):
    def __init__(self, settings, buffer_size_in_seconds=30):
        config = SherpaOnnxVadModelConfig()
        config.sample_rate, config.num_threads, config.provider = settings.sample_rate, 1, b'cpu'
        config.silero_vad.model = settings.silero_vad.model.encode('utf8')
        for name in ['threshold', 'min_silence_duration', 'min_speech_duration', 'max_speech_duration']:
            setattr(config.silero_vad, name, getattr(settings.silero_vad, name))
        config.silero_vad.window_size = 512
        super().__init__(call('CreateVoiceActivityDetector', c.byref(config), buffer_size_in_seconds), 'DestroyVoiceActivityDetector')
        self.cursor = 0
        self.pre_roll = np.zeros(0, dtype=np.float32)

    def accept_waveform(self, value):
        audio = samples(value)
        self.cursor += len(audio)
        self.pre_roll = np.concatenate((self.pre_roll, audio))[-8000:]
        call('VoiceActivityDetectorAcceptWaveform', self.pointer, audio.ctypes.data_as(F), len(audio))

    def is_speech_detected(self):
        return bool(call('VoiceActivityDetectorDetected', self.pointer))

    def empty(self):
        return bool(call('VoiceActivityDetectorEmpty', self.pointer))

    @property
    def current_segment(self):
        # C API does not expose the in-progress segment. Retain an onset
        # pre-roll for live clustering; final decoding uses the actual VAD queue.
        return SimpleNamespace(start=self.cursor - len(self.pre_roll), samples=self.pre_roll.copy())

    @property
    def front(self):
        pointer = call('VoiceActivityDetectorFront', self.pointer)
        if not pointer:
            raise RuntimeError('Empty VAD queue')
        try:
            value = pointer.contents
            return SimpleNamespace(start=value.start, samples=np.ctypeslib.as_array(value.samples, shape=(value.n,)).copy())
        finally:
            call('DestroySpeechSegment', pointer)

    def pop(self):
        call('VoiceActivityDetectorPop', self.pointer)

    def flush(self):
        call('VoiceActivityDetectorFlush', self.pointer)


class SpeakerEmbeddingExtractorConfig:
    def __init__(self, model, num_threads=2, provider='cpu'):
        self.model, self.num_threads, self.provider = model, num_threads, provider


class SpeakerEmbeddingExtractor(Handle):
    def __init__(self, settings):
        config = SherpaOnnxSpeakerEmbeddingExtractorConfig()
        config.model = settings.model.encode('utf8')
        config.num_threads, config.provider = settings.num_threads, settings.provider.encode('utf8')
        super().__init__(call('CreateSpeakerEmbeddingExtractor', c.byref(config)), 'DestroySpeakerEmbeddingExtractor')

    def create_stream(self):
        return Stream(call('SpeakerEmbeddingExtractorCreateStream', self.pointer), True)

    def is_ready(self, stream):
        return bool(call('SpeakerEmbeddingExtractorIsReady', self.pointer, stream.pointer))

    def compute(self, stream):
        vector = call('SpeakerEmbeddingExtractorComputeEmbedding', self.pointer, stream.pointer)
        if not vector:
            raise RuntimeError('Could not compute speaker embedding')
        try:
            return np.ctypeslib.as_array(vector, shape=(call('SpeakerEmbeddingExtractorDim', self.pointer),)).copy()
        finally:
            call('SpeakerEmbeddingExtractorDestroyEmbedding', vector)
