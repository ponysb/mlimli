"""Shared meeting transcription policy.

The streaming recognizer remains responsive while these values control when
the higher-quality offline recognizer commits final transcript segments.
"""

SAMPLE_RATE = 16000
MIN_SILENCE_SECONDS = 0.75
MIN_SPEECH_SECONDS = 0.2
MAX_UTTERANCE_SECONDS = 24


def fill_ambiguous_speakers(labels):
    """Assign uncertain windows to the nearest confirmed speaker.

    Speaker embeddings around a hand-off often contain both voices. Emitting
    those windows as separate ``unknown`` turns starves ASR of context. Keep a
    real boundary between two confirmed speakers, but divide the uncertain
    windows between the closest confirmed windows on either side.
    """
    resolved = list(labels)
    known = [index for index, label in enumerate(resolved) if label is not None]
    if not known:
        return resolved
    first, last = known[0], known[-1]
    resolved[:first] = [resolved[first]] * first
    resolved[last + 1:] = [resolved[last]] * (len(resolved) - last - 1)
    for left, right in zip(known, known[1:]):
        if right == left + 1:
            continue
        left_label, right_label = resolved[left], resolved[right]
        if left_label == right_label:
            resolved[left + 1:right] = [left_label] * (right - left - 1)
            continue
        midpoint = (left + right) / 2
        for index in range(left + 1, right):
            resolved[index] = left_label if index < midpoint else right_label
    return resolved
