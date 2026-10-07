# ctypes ABI definitions derived from sherpa-onnx v1.13.8 c-api.h.
# Upstream: k2-fsa/sherpa-onnx, Apache-2.0. Pin the DLL and ABI together.
from ctypes import Structure, c_char_p, c_int32, c_float, POINTER

class SherpaOnnxFeatureConfig(Structure):
    _fields_ = [('sample_rate', c_int32), ('feature_dim', c_int32)]

class SherpaOnnxOfflineTransducerModelConfig(Structure):
    _fields_ = [('encoder', c_char_p), ('decoder', c_char_p), ('joiner', c_char_p)]

class SherpaOnnxOfflineParaformerModelConfig(Structure):
    _fields_ = [('model', c_char_p)]

class SherpaOnnxOfflineNemoEncDecCtcModelConfig(Structure):
    _fields_ = [('model', c_char_p)]

class SherpaOnnxOfflineWhisperModelConfig(Structure):
    _fields_ = [('encoder', c_char_p), ('decoder', c_char_p), ('language', c_char_p), ('task', c_char_p), ('tail_paddings', c_int32), ('enable_token_timestamps', c_int32), ('enable_segment_timestamps', c_int32)]

class SherpaOnnxOfflineTdnnModelConfig(Structure):
    _fields_ = [('model', c_char_p)]

class SherpaOnnxOfflineSenseVoiceModelConfig(Structure):
    _fields_ = [('model', c_char_p), ('language', c_char_p), ('use_itn', c_int32)]

class SherpaOnnxOfflineMoonshineModelConfig(Structure):
    _fields_ = [('preprocessor', c_char_p), ('encoder', c_char_p), ('uncached_decoder', c_char_p), ('cached_decoder', c_char_p), ('merged_decoder', c_char_p)]

class SherpaOnnxOfflineFireRedAsrModelConfig(Structure):
    _fields_ = [('encoder', c_char_p), ('decoder', c_char_p)]

class SherpaOnnxOfflineDolphinModelConfig(Structure):
    _fields_ = [('model', c_char_p)]

class SherpaOnnxOfflineZipformerCtcModelConfig(Structure):
    _fields_ = [('model', c_char_p)]

class SherpaOnnxOfflineCanaryModelConfig(Structure):
    _fields_ = [('encoder', c_char_p), ('decoder', c_char_p), ('src_lang', c_char_p), ('tgt_lang', c_char_p), ('use_pnc', c_int32)]

class SherpaOnnxOfflineWenetCtcModelConfig(Structure):
    _fields_ = [('model', c_char_p)]

class SherpaOnnxOfflineOmnilingualAsrCtcModelConfig(Structure):
    _fields_ = [('model', c_char_p)]

class SherpaOnnxOfflineMedAsrCtcModelConfig(Structure):
    _fields_ = [('model', c_char_p)]

class SherpaOnnxOfflineFunASRNanoModelConfig(Structure):
    _fields_ = [('encoder_adaptor', c_char_p), ('llm', c_char_p), ('embedding', c_char_p), ('tokenizer', c_char_p), ('system_prompt', c_char_p), ('user_prompt', c_char_p), ('max_new_tokens', c_int32), ('temperature', c_float), ('top_p', c_float), ('seed', c_int32), ('language', c_char_p), ('itn', c_int32), ('hotwords', c_char_p)]

class SherpaOnnxOfflineFireRedAsrCtcModelConfig(Structure):
    _fields_ = [('model', c_char_p)]

class SherpaOnnxOfflineQwen3ASRModelConfig(Structure):
    _fields_ = [('conv_frontend', c_char_p), ('encoder', c_char_p), ('decoder', c_char_p), ('tokenizer', c_char_p), ('max_total_len', c_int32), ('max_new_tokens', c_int32), ('temperature', c_float), ('top_p', c_float), ('seed', c_int32), ('hotwords', c_char_p)]

class SherpaOnnxOfflineCohereTranscribeModelConfig(Structure):
    _fields_ = [('encoder', c_char_p), ('decoder', c_char_p), ('language', c_char_p), ('use_punct', c_int32), ('use_itn', c_int32)]

class SherpaOnnxOfflineModelConfig(Structure):
    _fields_ = [('transducer', SherpaOnnxOfflineTransducerModelConfig), ('paraformer', SherpaOnnxOfflineParaformerModelConfig), ('nemo_ctc', SherpaOnnxOfflineNemoEncDecCtcModelConfig), ('whisper', SherpaOnnxOfflineWhisperModelConfig), ('tdnn', SherpaOnnxOfflineTdnnModelConfig), ('tokens', c_char_p), ('num_threads', c_int32), ('debug', c_int32), ('provider', c_char_p), ('model_type', c_char_p), ('modeling_unit', c_char_p), ('bpe_vocab', c_char_p), ('telespeech_ctc', c_char_p), ('sense_voice', SherpaOnnxOfflineSenseVoiceModelConfig), ('moonshine', SherpaOnnxOfflineMoonshineModelConfig), ('fire_red_asr', SherpaOnnxOfflineFireRedAsrModelConfig), ('dolphin', SherpaOnnxOfflineDolphinModelConfig), ('zipformer_ctc', SherpaOnnxOfflineZipformerCtcModelConfig), ('canary', SherpaOnnxOfflineCanaryModelConfig), ('wenet_ctc', SherpaOnnxOfflineWenetCtcModelConfig), ('omnilingual', SherpaOnnxOfflineOmnilingualAsrCtcModelConfig), ('medasr', SherpaOnnxOfflineMedAsrCtcModelConfig), ('funasr_nano', SherpaOnnxOfflineFunASRNanoModelConfig), ('fire_red_asr_ctc', SherpaOnnxOfflineFireRedAsrCtcModelConfig), ('qwen3_asr', SherpaOnnxOfflineQwen3ASRModelConfig), ('cohere_transcribe', SherpaOnnxOfflineCohereTranscribeModelConfig)]

class SherpaOnnxOfflineLMConfig(Structure):
    _fields_ = [('model', c_char_p), ('scale', c_float)]

class SherpaOnnxHomophoneReplacerConfig(Structure):
    _fields_ = [('dict_dir', c_char_p), ('lexicon', c_char_p), ('rule_fsts', c_char_p)]

class SherpaOnnxOfflineRecognizerConfig(Structure):
    _fields_ = [('feat_config', SherpaOnnxFeatureConfig), ('model_config', SherpaOnnxOfflineModelConfig), ('lm_config', SherpaOnnxOfflineLMConfig), ('decoding_method', c_char_p), ('max_active_paths', c_int32), ('hotwords_file', c_char_p), ('hotwords_score', c_float), ('rule_fsts', c_char_p), ('rule_fars', c_char_p), ('blank_penalty', c_float), ('hr', SherpaOnnxHomophoneReplacerConfig)]

class SherpaOnnxSileroVadModelConfig(Structure):
    _fields_ = [('model', c_char_p), ('threshold', c_float), ('min_silence_duration', c_float), ('min_speech_duration', c_float), ('window_size', c_int32), ('max_speech_duration', c_float)]

class SherpaOnnxTenVadModelConfig(Structure):
    _fields_ = [('model', c_char_p), ('threshold', c_float), ('min_silence_duration', c_float), ('min_speech_duration', c_float), ('window_size', c_int32), ('max_speech_duration', c_float)]

class SherpaOnnxVadModelConfig(Structure):
    _fields_ = [('silero_vad', SherpaOnnxSileroVadModelConfig), ('sample_rate', c_int32), ('num_threads', c_int32), ('provider', c_char_p), ('debug', c_int32), ('ten_vad', SherpaOnnxTenVadModelConfig)]

class SherpaOnnxSpeakerEmbeddingExtractorConfig(Structure):
    _fields_ = [('model', c_char_p), ('num_threads', c_int32), ('debug', c_int32), ('provider', c_char_p)]

class SherpaOnnxSpeechSegment(Structure):
    _fields_ = [('start', c_int32), ('samples', POINTER(c_float)), ('n', c_int32)]
