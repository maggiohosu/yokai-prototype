#!/usr/bin/env python3
"""
generate_bgm.py
================
동양 설화풍 귀여운 요괴 성장 게임(yokai-game) - 배경음악(BGM) 100% Python DSP 합성 스크립트.

외부 음원이나 샘플, 상용 라이브러리를 일절 사용하지 않고 Python(numpy, scipy) 수식 알고리즘으로
가야금/고쟁(Karplus-Strong 및 배음 감쇠 물리 모델링), 대금/디즈(청공 비선형 포화 및 숨소리 노이즈 변조),
편종/풍경(비정수 배음 모달 가산 합성), 북/장구/징(막 진동 피치 스윕 및 과도응답)을 직접 합성합니다.

[음악 규격]
- 조성: D 평조 5음계 (D, E, G, A, B)
- 규격: 44.1kHz 스테레오/모노, 심리스 루프(Seamless Loop, 마디 경계 및 위상 연속, 꼬리 감기 순환)
- 길이: 각 48.0초 (calm/title: 80 BPM 16마디, tense/boss: 120 BPM 24마디 -> 정확한 2:3 마디 비례)
- PCM 피크: -5.5 dBFS 정규화. 배포 파일의 통합 음량과 트루 피크는 README.md에서 확인한다.
- 파일 크기: 곡당 OGG/MP3 각 <= 600 kB, 형식별 합 <= 3 MB
- 포맷: OGG (Vorbis), MP3 (LAME)
"""

import os
import sys
import subprocess
import numpy as np
from scipy import signal
from scipy.io import wavfile

SAMPLE_RATE = 44100

# 목표 피크 음량 (-5.5 dBFS: 효과음보다 작게 들리도록 설정하여 청각 피로 방지 및 헤드룸 확보)
TARGET_PEAK_DB = -5.5
TARGET_PEAK_AMP = 10.0 ** (TARGET_PEAK_DB / 20.0)

# 곡별 반복 길이(초). 게임의 src/audio/bgm.js LOOP_SEC·README 표와 같은 값이다(tests/bgm.test.mjs가 대조한다).
LOOP_SEC = {"calm": 48, "tense": 48, "boss": 48, "title": 48}

# D 평조 5음계 주파수 테이블 (D, E, G, A, B)
NOTES = {
    # Octave 1
    "D1": 36.71, "G1": 49.00, "A1": 55.00, "B1": 61.74,
    # Octave 2
    "D2": 73.42, "E2": 82.41, "G2": 98.00, "A2": 110.00, "B2": 123.47,
    # Octave 3
    "D3": 146.83, "E3": 164.81, "G3": 196.00, "A3": 220.00, "B3": 246.94,
    # Octave 4
    "D4": 293.66, "E4": 329.63, "G4": 392.00, "A4": 440.00, "B4": 493.88,
    # Octave 5
    "D5": 587.33, "E5": 659.25, "G5": 783.99, "A5": 880.00, "B5": 987.77,
    # Octave 6
    "D6": 1174.66, "E6": 1318.51, "G6": 1567.98, "A6": 1760.00, "B6": 1975.53,
}

# ==============================================================================
# 악기 합성기 (Instrument Synthesizers)
# ==============================================================================

def synth_gayageum(note_name, duration_sec, velocity=0.8, sr=SAMPLE_RATE, rng=None):
    """가야금/고쟁(Gayageum) 발현악기 합성.
    물리 모델링 및 배음 지수 감쇠, 오동나무 울림통 공명(260Hz, 550Hz), 농현(비브라토) 적용."""
    if rng is None:
        rng = np.random.default_rng()
    f0 = NOTES[note_name]
    n_samples = int(duration_sec * sr)
    t = np.linspace(0, duration_sec, n_samples, endpoint=False)
    
    # 농현 (지속음 0.25초 이후 4.2Hz 주파수 흔들림)
    vibrato = np.zeros_like(t)
    vib_mask = t > 0.25
    if np.any(vib_mask):
        vib_t = t[vib_mask] - 0.25
        vibrato[vib_mask] = f0 * 0.018 * np.sin(2.0 * np.pi * 4.2 * vib_t) * (1.0 - np.exp(-vib_t / 0.4))
    
    freq_inst = f0 + vibrato
    phase_inst = 2.0 * np.pi * np.cumsum(freq_inst) / sr
    
    # 배음 가산 합성 (고차 배음일수록 빠르게 감쇠)
    tau_base = 1.4 if f0 < 250 else (1.1 if f0 < 500 else 0.75)
    harmonics = [1, 2, 3, 4, 5, 6, 7, 8]
    sig = np.zeros(n_samples)
    for h in harmonics:
        amp_h = 1.0 / (h ** 0.82)
        tau_h = tau_base / (h ** 1.15)
        env_h = np.exp(-t / tau_h)
        sig += amp_h * np.sin(h * phase_inst + rng.uniform(0, 0.2)) * env_h
    
    # 뜯는 순간의 손톱/골무 탄현 노이즈 과도응답 (Click & transient)
    n_pluck = int(0.015 * sr)
    pluck_noise = rng.normal(0, 0.4, n_pluck) * np.exp(-np.linspace(0, 1, n_pluck) * 6.0)
    sig[:n_pluck] += pluck_noise * (velocity ** 0.8)
    
    # 오동나무 울림통 공명 필터 (260Hz 및 540Hz 피킹 필터링 효과)
    res1 = np.sin(2.0 * np.pi * 260.0 * t) * np.exp(-t / 0.12) * 0.25
    res2 = np.sin(2.0 * np.pi * 540.0 * t) * np.exp(-t / 0.08) * 0.15
    sig += res1 + res2
    
    # 무클릭 코사인 페이드인
    in_samples = min(int(0.002 * sr), n_samples)
    sig[:in_samples] *= np.sin(np.linspace(0, np.pi / 2, in_samples)) ** 2
    return sig * velocity


def synth_daegeum(note_name, duration_sec, velocity=0.7, sr=SAMPLE_RATE, rng=None):
    """대금/디즈(Daegeum) 대나무 가로피리 합성.
    청(淸) 갈대막 비선형 포화 버징, 숨소리 난류 노이즈, 온셋 피치 벤드, 비브라토 구현."""
    if rng is None:
        rng = np.random.default_rng()
    f0 = NOTES[note_name]
    n_samples = int(duration_sec * sr)
    t = np.linspace(0, duration_sec, n_samples, endpoint=False)
    
    # 온셋 추성/퇴성 (시작 0.05초간 아래에서 위로 살짝 올라오는 자연스러운 슬러)
    pitch_bend = f0 * (1.0 - 0.03 * np.exp(-t / 0.03))
    # 비브라토 (0.18초 이후 4.8Hz 비브라토)
    vib = np.zeros_like(t)
    mask = t > 0.18
    if np.any(mask):
        vt = t[mask] - 0.18
        vib[mask] = f0 * 0.015 * np.sin(2.0 * np.pi * 4.8 * vt) * (1.0 - np.exp(-vt / 0.3))
    
    freq = pitch_bend + vib
    phase = 2.0 * np.pi * np.cumsum(freq) / sr
    
    # 대금 배음 구조 (기음 + 홀수 배음 풍부)
    core = (
        0.75 * np.sin(phase) +
        0.35 * np.sin(2.0 * phase) +
        0.45 * np.sin(3.0 * phase) +
        0.20 * np.sin(4.0 * phase) +
        0.25 * np.sin(5.0 * phase)
    )
    
    # 청(막) 버징: 부드러운 쌍곡탄젠트 포화로 독특한 대금 청 울림 재현
    buzzed = np.tanh(1.8 * core) + 0.1 * (core ** 2)
    
    # 취구 숨소리 노이즈 (Pink-like noise bandpassed around f0)
    noise = rng.normal(0, 0.12, n_samples) * (0.8 + 0.2 * np.sin(phase))
    
    # 음량 엔벨로프 (부드러운 숨 불기 어택 0.06s, 서스테인, 디케이 0.08s)
    atk_len = int(min(0.06 * sr, n_samples * 0.3))
    rel_len = int(min(0.08 * sr, n_samples * 0.3))
    env = np.ones(n_samples)
    if atk_len > 0:
        env[:atk_len] = np.sin(np.linspace(0, np.pi / 2, atk_len)) ** 2
    if rel_len > 0:
        env[-rel_len:] = np.cos(np.linspace(0, np.pi / 2, rel_len)) ** 2
    
    sig = (buzzed + noise) * env * velocity
    return sig


def synth_chime(note_name, duration_sec, velocity=0.6, sr=SAMPLE_RATE):
    """편종/풍경(Bianzhong / Wind Chime) 금속 종소리 합성.
    청동 악기 고유의 비정수 배음 모드 [1.0, 2.76, 5.4, 8.9, 13.3] 적용."""
    f0 = NOTES[note_name]
    n_samples = int(duration_sec * sr)
    t = np.linspace(0, duration_sec, n_samples, endpoint=False)
    
    modes = [1.0, 2.76, 5.40, 8.90, 13.30]
    weights = [0.60, 0.35, 0.22, 0.12, 0.05]
    decay_factors = [1.0, 0.65, 0.40, 0.22, 0.12]
    
    tau_base = 2.2 if f0 < 600 else 1.4
    sig = np.zeros(n_samples)
    for m, w, df in zip(modes, weights, decay_factors):
        freq = f0 * m
        if freq < sr / 2:
            tau = tau_base * df
            sig += w * np.sin(2.0 * np.pi * freq * t) * np.exp(-t / tau)
    
    # 타격 틱
    n_tick = int(0.005 * sr)
    sig[:n_tick] += 0.3 * np.sin(2.0 * np.pi * 3200.0 * t[:n_tick]) * np.exp(-t[:n_tick] / 0.002)
    
    # 부드러운 페이드아웃
    out_samples = int(0.05 * sr)
    if n_samples > out_samples:
        sig[-out_samples:] *= np.cos(np.linspace(0, np.pi / 2, out_samples)) ** 2
        
    return sig * velocity


def synth_buk(velocity=0.85, is_heavy=False, sr=SAMPLE_RATE, rng=None):
    """소리북/대북(Buk) 타악기 합성.
    나무 틀 타격음 + 두터운 가죽 막 진동 + 지수형 주파수 강하 (120Hz -> 52Hz)."""
    if rng is None:
        rng = np.random.default_rng()
    duration = 0.45 if is_heavy else 0.35
    n_samples = int(duration * sr)
    t = np.linspace(0, duration, n_samples, endpoint=False)
    
    start_f = 95.0 if is_heavy else 125.0
    end_f = 42.0 if is_heavy else 54.0
    f_curve = end_f + (start_f - end_f) * np.exp(-t / 0.05)
    phase = 2.0 * np.pi * np.cumsum(f_curve) / sr
    
    tau = 0.22 if is_heavy else 0.16
    body = np.sin(phase) * np.exp(-t / tau)
    sub = 0.45 * np.sin(2.0 * np.pi * (end_f * 0.8) * t) * np.exp(-t / (tau * 1.3))
    
    # 북 가죽 때리는 순간의 딱 소리 (Wood click)
    click = rng.normal(0, 0.3, n_samples) * np.exp(-t / 0.012)
    
    sig = (body + sub + click * 0.4) * velocity
    # 페이드아웃
    out_samples = int(0.03 * sr)
    sig[-out_samples:] *= np.cos(np.linspace(0, np.pi / 2, out_samples)) ** 2
    return sig


def synth_janggu(part="chaepyeon", velocity=0.75, sr=SAMPLE_RATE, rng=None):
    """장구(Janggu) 합성: 궁편(gungpyeon) 저음 또는 채편(chaepyeon) 날카로운 고음 대나무 채 소리."""
    if rng is None:
        rng = np.random.default_rng()
    if part == "gungpyeon":
        duration = 0.28
        n_samples = int(duration * sr)
        t = np.linspace(0, duration, n_samples, endpoint=False)
        f = 58.0 + 38.0 * np.exp(-t / 0.04)
        phase = 2.0 * np.pi * np.cumsum(f) / sr
        sig = np.sin(phase) * np.exp(-t / 0.11)
        sig += 0.2 * rng.normal(0, 0.2, n_samples) * np.exp(-t / 0.015)
    else:  # 채편 (chaepyeon) - '딱' 하는 날렵한 죽간 타격
        duration = 0.18
        n_samples = int(duration * sr)
        t = np.linspace(0, duration, n_samples, endpoint=False)
        snap = (
            0.6 * np.sin(2.0 * np.pi * 840.0 * t) +
            0.4 * np.sin(2.0 * np.pi * 1620.0 * t) +
            0.25 * np.sin(2.0 * np.pi * 2850.0 * t)
        ) * np.exp(-t / 0.032)
        click = rng.normal(0, 0.4, n_samples) * np.exp(-t / 0.01)
        sig = snap + click * 0.5
    
    out_samples = int(0.02 * sr)
    sig[-out_samples:] *= np.cos(np.linspace(0, np.pi / 2, out_samples)) ** 2
    return sig * velocity


def synth_jing(velocity=0.8, sr=SAMPLE_RATE):
    """징(Jing) 궁중 제례악 및 풍물 징 합성.
    금속 원형판의 FM 모듈레이션 및 3.2Hz 느린 진폭 맥놀이(울림 잔향)."""
    duration = 3.2
    n_samples = int(duration * sr)
    t = np.linspace(0, duration, n_samples, endpoint=False)
    
    f0 = 135.0
    # FM 변조
    mod = np.sin(2.0 * np.pi * 215.0 * t) * np.exp(-t / 0.35) * 1.5
    carrier = np.sin(2.0 * np.pi * f0 * t + mod)
    
    # 3.2Hz 맥놀이 울림
    tremolo = 1.0 + 0.35 * np.sin(2.0 * np.pi * 3.2 * t)
    env = np.exp(-t / 1.1) * (1.0 - np.exp(-t / 0.005))
    
    sig = carrier * tremolo * env * velocity
    out_samples = int(0.1 * sr)
    sig[-out_samples:] *= np.cos(np.linspace(0, np.pi / 2, out_samples)) ** 2
    return sig


# ==============================================================================
# 트랙 렌더링 믹서 (Score Track Renderer with Loop-Wrapping)
# ==============================================================================

class LoopMixer:
    """루프 길이 T에 잔향 꼬리(T_tail)를 더해 합성한 후,
    끝부분 잔향을 앞부분으로 순환 덧셈(Loop-Wrap)하여 완벽한 심리스 루프를 만드는 믹서."""
    def __init__(self, loop_duration_sec, tail_sec=4.0, sr=SAMPLE_RATE):
        self.sr = sr
        self.loop_duration = loop_duration_sec
        self.tail_duration = tail_sec
        self.total_duration = loop_duration_sec + tail_sec
        self.loop_samples = int(round(loop_duration_sec * sr))
        self.tail_samples = int(round(tail_sec * sr))
        self.total_samples = self.loop_samples + self.tail_samples
        # 스테레오 좌/우 채널
        self.buffer_left = np.zeros(self.total_samples, dtype=np.float64)
        self.buffer_right = np.zeros(self.total_samples, dtype=np.float64)

    def add_sound(self, start_time_sec, sound_mono, pan=0.0):
        """특정 시점에 모노 음원을 패닝(-1.0 ~ +1.0)하여 추가합니다."""
        start_idx = int(round(start_time_sec * self.sr))
        if start_idx >= self.total_samples:
            return
        snd_len = len(sound_mono)
        end_idx = min(start_idx + snd_len, self.total_samples)
        valid_len = end_idx - start_idx
        if valid_len <= 0:
            return
        
        # 상수 전력 패닝 (Constant power panning)
        pan_angle = (pan + 1.0) * (np.pi / 4.0)  # -1 -> 0, 0 -> pi/4, +1 -> pi/2
        gain_l = np.cos(pan_angle)
        gain_r = np.sin(pan_angle)
        
        chunk = sound_mono[:valid_len]
        self.buffer_left[start_idx:end_idx] += chunk * gain_l
        self.buffer_right[start_idx:end_idx] += chunk * gain_r

    def finalize(self):
        """루프 경계 뒤쪽 잔향을 앞쪽에 더하고, 정확한 loop_samples 길이로 자릅니다."""
        # 끝부분 잔향을 시작점에 덧셈 (Loop wrap)
        wrap_len = min(self.tail_samples, self.loop_samples)
        self.buffer_left[:wrap_len] += self.buffer_left[self.loop_samples : self.loop_samples + wrap_len]
        self.buffer_right[:wrap_len] += self.buffer_right[self.loop_samples : self.loop_samples + wrap_len]
        
        # 정확한 루프 길이로 절단
        final_l = self.buffer_left[:self.loop_samples].copy()
        final_r = self.buffer_right[:self.loop_samples].copy()
        
        # 이음매: 위 loop-wrap으로 신호가 이미 주기적으로 이어지므로 추가 크로스페이드는 하지 않는다.
        stereo = np.vstack((final_l, final_r))
        
        # PCM 피크를 TARGET_PEAK_DB(-5.5 dBFS)에 맞춘다.
        peak = np.max(np.abs(stereo))
        if peak > 1e-6:
            stereo = stereo * (TARGET_PEAK_AMP / peak)
            
        return stereo


# ==============================================================================
# 곡별 작곡 로직 (Track Compositions)
# ==============================================================================

def compose_calm():
    """1. calm (여유·탐색): 80 BPM, 16마디 (48.0초).
    맑고 느긋한 가야금 선율, 청아한 대금, 은은한 장구와 편종 울림."""
    bpm = 80.0
    spb = 60.0 / bpm         # 0.75s per beat
    spbar = spb * 4.0        # 3.0s per bar (16 bars = 48.0s)
    total_sec = spbar * 16.0 # 48.0s
    mixer = LoopMixer(total_sec, tail_sec=4.0)
    rng = np.random.default_rng(701)
    
    # 가야금 아르페지오 패턴 (4마디 단위 루프 구조)
    # 각 마디당 8분음표 8개 (D 평조 분산화음)
    gayageum_bars = [
        # Bar 1: D 코드 안정
        [("D3", 0.0), ("A3", 0.5), ("D4", 1.0), ("E4", 1.5), ("G4", 2.0), ("A4", 2.5), ("E4", 3.0), ("A3", 3.5)],
        # Bar 2: G/A 진행
        [("G3", 0.0), ("D4", 0.5), ("G4", 1.0), ("A4", 1.5), ("B4", 2.0), ("D5", 2.5), ("B4", 3.0), ("G4", 3.5)],
        # Bar 3: A 진행
        [("A3", 0.0), ("E4", 0.5), ("A4", 1.0), ("B4", 1.5), ("D5", 2.0), ("E5", 2.5), ("D5", 3.0), ("A4", 3.5)],
        # Bar 4: D 해결 및 턴어라운드
        [("D3", 0.0), ("A3", 0.5), ("D4", 1.0), ("G4", 1.5), ("A4", 2.0), ("D4", 2.5), ("A3", 3.0), ("D3", 3.5)],
    ]
    
    for bar_idx in range(16):
        bar_start = bar_idx * spbar
        pattern = gayageum_bars[bar_idx % 4]
        # 후반부(8마디 이후)는 옥타브 고음 뉘앙스 추가
        high_shift = (bar_idx >= 8 and (bar_idx % 2 == 1))
        for note_name, beat_pos in pattern:
            actual_note = note_name
            if high_shift and note_name in ["D4", "E4", "G4", "A4"]:
                actual_note = note_name.replace("4", "5")
            t_note = bar_start + beat_pos * spb
            vel = rng.uniform(0.65, 0.85)
            pan = rng.uniform(-0.35, 0.15)
            snd = synth_gayageum(actual_note, duration_sec=1.2, velocity=vel, rng=rng)
            mixer.add_sound(t_note, snd, pan=pan)
            
    # 대금(Daegeum) 멜로디 (4마디 프레이즈 4개: 서정적이고 맑은 선율)
    daegeum_melodies = [
        # Phrase 1 (Bars 1-4)
        [(1.0, "A4", 1.5), (2.5, "B4", 1.0), (3.5, "D5", 2.2), (6.0, "E5", 1.5), (7.5, "D5", 2.0),
         (9.5, "B4", 1.0), (10.5, "A4", 2.5)],
        # Phrase 2 (Bars 5-8): 상승 발전
        [(13.0, "D5", 1.2), (14.2, "E5", 1.2), (15.5, "G5", 2.0), (18.0, "A5", 1.5), (19.5, "G5", 1.2),
         (20.7, "E5", 1.8), (22.5, "D5", 3.0)],
        # Phrase 3 (Bars 9-12): 서정적 전개
        [(25.0, "B4", 1.2), (26.2, "D5", 1.2), (27.5, "E5", 2.0), (30.0, "G5", 1.2), (31.2, "E5", 1.0),
         (32.2, "D5", 1.5), (34.0, "B4", 2.5)],
        # Phrase 4 (Bars 13-16): 종결 및 순환 연결
        [(37.0, "A4", 1.5), (38.5, "B4", 1.2), (39.7, "D5", 2.0), (42.0, "E5", 1.5), (43.5, "D5", 2.5),
         (46.0, "D4", 2.0)]
    ]
    for phrase in daegeum_melodies:
        for beat_time, note_name, dur in phrase:
            snd = synth_daegeum(note_name, duration_sec=dur, velocity=0.72, rng=rng)
            mixer.add_sound(beat_time * spb, snd, pan=0.25)
            
    # 장구 및 북 (세마치/굿거리 풍의 부드러운 리듬)
    for bar_idx in range(16):
        bar_start = bar_idx * spbar
        # 1박: 북 쿵
        mixer.add_sound(bar_start + 0.0 * spb, synth_buk(velocity=0.65, is_heavy=False, rng=rng), pan=-0.2)
        # 2.5박: 장구 채편 딱
        mixer.add_sound(bar_start + 1.5 * spb, synth_janggu("chaepyeon", velocity=0.55, rng=rng), pan=0.3)
        # 3박: 궁편 쿵
        mixer.add_sound(bar_start + 2.0 * spb, synth_janggu("gungpyeon", velocity=0.58, rng=rng), pan=-0.15)
        # 4.5박: 채편 가볍게
        if bar_idx % 2 == 1:
            mixer.add_sound(bar_start + 3.5 * spb, synth_janggu("chaepyeon", velocity=0.45, rng=rng), pan=0.3)
            
    # 편종/풍경 (매 4마디 전환부에서 맑은 차임 반짝임)
    chime_events = [
        (3.75, "D6"), (7.75, "B5"), (11.75, "A5"), (15.75, "D6")
    ]
    for bar_f, n in chime_events:
        snd = synth_chime(n, duration_sec=2.2, velocity=0.55)
        mixer.add_sound(bar_f * spbar, snd, pan=0.4)
        
    return mixer.finalize()


def compose_tense():
    """2. tense (긴급·위협): 120 BPM, 24마디 (48.0초).
    calm과 정확히 같은 조성(D 평조) 및 같은 길이(48.0초 = calm 16마디 = tense 24마디, 2:3 마디 비례).
    빠른 휘모리 북·장구 리듬, 긴박한 가야금 스타카토 오스티나토, 날렵한 대금 시김새."""
    bpm = 120.0
    spb = 60.0 / bpm         # 0.5s per beat
    spbar = spb * 4.0        # 2.0s per bar (24 bars = 48.0s)
    total_sec = spbar * 24.0 # 48.0s
    mixer = LoopMixer(total_sec, tail_sec=4.0)
    rng = np.random.default_rng(702)
    
    # 가야금 16분음표 질주 오스티나토 (박진감 넘치는 짧은 뜯음)
    # 1마디 = 16분음표 16개 (0.125s 간격)
    pattern_fast = [
        "D3", "A3", "D4", "E4", "G4", "A4", "G4", "E4",
        "D4", "A3", "E4", "G4", "A4", "B4", "A4", "G4"
    ]
    pattern_fast_alt = [
        "G3", "D4", "G4", "A4", "B4", "D5", "B4", "A4",
        "A3", "E4", "A4", "B4", "D5", "E5", "D5", "B4"
    ]
    
    for bar_idx in range(24):
        bar_start = bar_idx * spbar
        pat = pattern_fast_alt if (bar_idx % 4 == 3) else pattern_fast
        for step, note_name in enumerate(pat):
            t_note = bar_start + step * (spb / 4.0)
            vel = 0.85 if (step % 4 == 0) else 0.62
            snd = synth_gayageum(note_name, duration_sec=0.28, velocity=vel, rng=rng)
            mixer.add_sound(t_note, snd, pan=-0.25 if step % 2 == 0 else 0.25)
            
    # 휘모리 북 & 장구 빠른 연타 리듬
    for bar_idx in range(24):
        bar_start = bar_idx * spbar
        # 북: 1박 강타, 3박 중타, 4.5박 연결
        mixer.add_sound(bar_start + 0.0 * spb, synth_buk(velocity=0.82, is_heavy=False, rng=rng), pan=-0.2)
        mixer.add_sound(bar_start + 2.0 * spb, synth_buk(velocity=0.72, is_heavy=False, rng=rng), pan=-0.2)
        mixer.add_sound(bar_start + 3.5 * spb, synth_buk(velocity=0.65, is_heavy=False, rng=rng), pan=-0.2)
        
        # 장구 채편: 16분음표 당김음 비트 (딱-따닥-딱-따닥)
        for s in [0.5, 1.0, 1.5, 2.5, 3.0, 3.5]:
            v = 0.75 if s in [1.0, 3.0] else 0.55
            mixer.add_sound(bar_start + s * spb, synth_janggu("chaepyeon", velocity=v, rng=rng), pan=0.35)
        # 장구 궁편
        mixer.add_sound(bar_start + 0.75 * spb, synth_janggu("gungpyeon", velocity=0.6, rng=rng), pan=-0.15)
        mixer.add_sound(bar_start + 2.75 * spb, synth_janggu("gungpyeon", velocity=0.6, rng=rng), pan=-0.15)
        
    # 대금 날카로운 리듬 릭 (짧은 브레스 및 고음 강조)
    daegeum_tense_riffs = [
        # Phrase 1 (Bars 1-4)
        [(1.0, "D5", 0.4), (1.5, "E5", 0.4), (2.0, "G5", 0.8), (4.0, "A5", 0.9), (6.0, "G5", 0.5), (6.5, "E5", 1.2)],
        # Phrase 2 (Bars 5-8)
        [(9.0, "A5", 0.5), (9.5, "B5", 0.5), (10.0, "D6", 1.1), (12.0, "B5", 0.6), (13.0, "A5", 0.6), (14.0, "G5", 1.4)],
        # Phrase 3 (Bars 9-12)
        [(17.0, "E5", 0.4), (17.5, "G5", 0.4), (18.0, "A5", 0.8), (20.0, "B5", 0.9), (22.0, "A5", 0.5), (22.5, "G5", 1.2)],
        # Phrase 4 (Bars 13-16)
        [(25.0, "G5", 0.4), (25.5, "A5", 0.4), (26.0, "B5", 0.8), (28.0, "D6", 1.0), (30.0, "B5", 0.5), (31.0, "A5", 1.5)],
        # Phrase 5 (Bars 17-20: 긴장 최고조)
        [(33.0, "D6", 0.6), (34.0, "E6", 0.6), (35.0, "D6", 0.8), (37.0, "B5", 0.6), (38.0, "A5", 0.6), (39.0, "G5", 1.2)],
        # Phrase 6 (Bars 21-24: 회전 연결)
        [(41.0, "A5", 0.5), (42.0, "G5", 0.5), (43.0, "E5", 0.8), (45.0, "D5", 1.5), (47.0, "D4", 0.8)]
    ]
    for phrase in daegeum_tense_riffs:
        for beat_time, note_name, dur in phrase:
            snd = synth_daegeum(note_name, duration_sec=dur, velocity=0.78, rng=rng)
            mixer.add_sound(beat_time * spb, snd, pan=0.2)
            
    # 징 (매 6초 / 3마디 = calm 2마디 전환점마다 웅장한 강타)
    for bar_idx in [0, 6, 12, 18]:
        mixer.add_sound(bar_idx * spbar, synth_jing(velocity=0.75), pan=-0.35)
        
    return mixer.finalize()


def compose_boss():
    """3. boss (대요괴 herald 출현): 120 BPM, 24마디 (48.0초).
    대북(Heavy Buk)의 묵직한 쿵쾅거림, 장엄한 징(Jing)과 편종의 웅장한 포효,
    고조되는 긴박한 선율로 신수/요괴 대결 연출."""
    bpm = 120.0
    spb = 60.0 / bpm         # 0.5s per beat
    spbar = spb * 4.0        # 2.0s per bar
    total_sec = spbar * 24.0 # 48.0s
    mixer = LoopMixer(total_sec, tail_sec=4.0)
    rng = np.random.default_rng(703)
    
    # 묵직한 대북 (Heavy Buk) 서브 우퍼 강타 패턴
    for bar_idx in range(24):
        bar_start = bar_idx * spbar
        # 정박 강타
        mixer.add_sound(bar_start + 0.0 * spb, synth_buk(velocity=0.95, is_heavy=True, rng=rng), pan=-0.1)
        mixer.add_sound(bar_start + 1.5 * spb, synth_buk(velocity=0.75, is_heavy=True, rng=rng), pan=-0.15)
        mixer.add_sound(bar_start + 2.0 * spb, synth_buk(velocity=0.88, is_heavy=True, rng=rng), pan=-0.1)
        mixer.add_sound(bar_start + 3.0 * spb, synth_buk(velocity=0.78, is_heavy=True, rng=rng), pan=-0.15)
        
        # 장구 채편의 거친 16분음표 트릴 (긴장 고조)
        for sub_step in range(8):
            t_sub = bar_start + (sub_step * 0.5) * spb
            mixer.add_sound(t_sub, synth_janggu("chaepyeon", velocity=0.52, rng=rng), pan=0.3)
            
    # 대요괴 등장 징(Jing) 웅장한 울림 (매 4마디 첫 박)
    for bar_idx in range(0, 24, 4):
        mixer.add_sound(bar_idx * spbar, synth_jing(velocity=0.92), pan=-0.4)
        # 편종 저음 화음 (D2, A2)
        mixer.add_sound(bar_idx * spbar, synth_chime("D2", duration_sec=3.0, velocity=0.75), pan=0.35)
        mixer.add_sound(bar_idx * spbar + 0.05, synth_chime("A2", duration_sec=2.5, velocity=0.65), pan=-0.35)
        
    # 가야금 저음 질주 리프 (D2, D3 중심의 묵직한 오스티나토)
    bass_riff = [
        "D2", "D2", "A2", "D3", "E3", "D3", "A2", "D2",
        "G2", "G2", "D3", "E3", "G3", "E3", "D3", "A2"
    ]
    for bar_idx in range(24):
        bar_start = bar_idx * spbar
        for step, note_name in enumerate(bass_riff):
            t_note = bar_start + step * (spb / 4.0)
            v = 0.88 if (step % 4 == 0) else 0.70
            snd = synth_gayageum(note_name, duration_sec=0.35, velocity=v, rng=rng)
            mixer.add_sound(t_note, snd, pan=-0.2)
            
    # 대금 격렬한 고음 비상 (Dramatic Dizi Cry)
    boss_melodies = [
        [(1.0, "D5", 0.6), (2.0, "A5", 1.2), (4.0, "G5", 0.8), (5.0, "D6", 1.8)],
        [(9.0, "E6", 0.8), (10.0, "D6", 1.0), (12.0, "B5", 0.8), (13.0, "A5", 1.6)],
        [(17.0, "D5", 0.5), (18.0, "E5", 0.5), (19.0, "G5", 1.0), (21.0, "A5", 2.0)],
        [(25.0, "B5", 0.8), (26.0, "D6", 1.2), (28.0, "E6", 1.2), (30.0, "D6", 2.0)],
        # 클라이맥스 질주
        [(33.0, "G6", 1.0), (34.5, "E6", 0.8), (36.0, "D6", 1.2), (38.0, "B5", 1.5)],
        [(41.0, "A5", 0.8), (42.5, "G5", 0.8), (44.0, "E5", 1.0), (46.0, "D5", 2.2)]
    ]
    for phrase in boss_melodies:
        for beat_time, note_name, dur in phrase:
            snd = synth_daegeum(note_name, duration_sec=dur, velocity=0.85, rng=rng)
            mixer.add_sound(beat_time * spb, snd, pan=0.25)
            
    return mixer.finalize()


def compose_title():
    """4. title (타이틀·도감·결과 화면): 80 BPM, 16마디 (48.0초).
    신비롭고 몽환적인 편종과 풍경, 가야금의 서정적인 아르페지오, 따뜻한 선협 설화 테마."""
    bpm = 80.0
    spb = 60.0 / bpm         # 0.75s per beat
    spbar = spb * 4.0        # 3.0s per bar
    total_sec = spbar * 16.0 # 48.0s
    mixer = LoopMixer(total_sec, tail_sec=4.0)
    rng = np.random.default_rng(704)
    
    # 몽환적인 편종/풍경 도입 및 아르페지오
    chime_intro = [
        (0.0, "D5"), (0.75, "A5"), (1.5, "D6"), (2.25, "E6"),
        (6.0, "G5"), (6.75, "D6"), (7.5, "G6"),
        (12.0, "A5"), (12.75, "E6"), (13.5, "A6"),
        (18.0, "D5"), (18.75, "A5"), (19.5, "D6")
    ]
    for b_pos, n in chime_intro:
        snd = synth_chime(n, duration_sec=2.5, velocity=0.62)
        mixer.add_sound(b_pos * spb, snd, pan=rng.uniform(-0.35, 0.35))
        
    # 가야금 서정적 독주
    title_gayageum = [
        # Bar 1-4
        [("D3", 0.0), ("A3", 1.0), ("D4", 2.0), ("E4", 2.5), ("G4", 3.0)],
        [("G3", 0.0), ("D4", 1.0), ("G4", 2.0), ("A4", 2.5), ("B4", 3.0)],
        [("A3", 0.0), ("E4", 1.0), ("A4", 2.0), ("B4", 2.5), ("D5", 3.0)],
        [("D3", 0.0), ("A3", 1.0), ("D4", 2.0), ("G4", 2.5), ("D4", 3.0)],
    ]
    for bar_idx in range(16):
        bar_start = bar_idx * spbar
        pat = title_gayageum[bar_idx % 4]
        for note_name, b_offset in pat:
            t_note = bar_start + b_offset * spb
            snd = synth_gayageum(note_name, duration_sec=1.8, velocity=0.68, rng=rng)
            mixer.add_sound(t_note, snd, pan=rng.uniform(-0.25, 0.15))
            
    # 대금 부드러운 주제 선율
    daegeum_title_theme = [
        # Phrase A
        [(1.5, "A4", 2.0), (3.5, "B4", 1.5), (5.0, "D5", 2.5), (8.0, "E5", 1.8), (10.0, "D5", 3.0)],
        # Phrase B
        [(13.5, "G5", 2.0), (15.5, "A5", 1.5), (17.0, "G5", 1.5), (18.5, "E5", 2.0), (21.0, "D5", 3.5)],
        # Phrase C
        [(25.5, "B4", 2.0), (27.5, "D5", 1.5), (29.0, "E5", 2.0), (31.5, "D5", 1.5), (33.0, "A4", 3.0)],
        # Phrase D
        [(37.5, "A4", 1.8), (39.5, "B4", 1.5), (41.0, "D5", 2.5), (44.0, "E5", 1.5), (46.0, "D5", 3.0)]
    ]
    for phrase in daegeum_title_theme:
        for b_time, note_name, dur in phrase:
            snd = synth_daegeum(note_name, duration_sec=dur, velocity=0.65, rng=rng)
            mixer.add_sound(b_time * spb, snd, pan=0.2)
            
    # 아련하고 부드러운 저역 북 & 장구
    for bar_idx in range(16):
        bar_start = bar_idx * spbar
        # 1박 부드러운 쿵
        mixer.add_sound(bar_start + 0.0 * spb, synth_buk(velocity=0.5, is_heavy=False, rng=rng), pan=-0.2)
        # 3박 장구 궁편
        mixer.add_sound(bar_start + 2.0 * spb, synth_janggu("gungpyeon", velocity=0.45, rng=rng), pan=-0.1)
        
    return mixer.finalize()


# ==============================================================================
# 파일 출력 및 인코딩 (OGG / MP3)
# ==============================================================================

def export_audio(stereo_signal, name, out_dir):
    """스테레오 신호를 임시 WAV로 기록 후, ffmpeg를 이용해 모바일 최적화 OGG/MP3로 인코딩합니다.
    규격: OGG/MP3 각 <= 600KB, WAV는 커밋하지 않고 제거."""
    temp_wav = os.path.join(out_dir, f"_temp_{name}.wav")
    ogg_path = os.path.join(out_dir, f"{name}.ogg")
    mp3_path = os.path.join(out_dir, f"{name}.mp3")
    
    # 16-bit PCM 정규화
    pcm16 = np.clip(stereo_signal * 32767.0, -32768.0, 32767.0).astype(np.int16).T
    wavfile.write(temp_wav, SAMPLE_RATE, pcm16)
    
    try:
        # OGG 인코딩 (Vorbis, qscale 1 -> 모바일 경량 고음질, 곡당 ~250KB)
        cmd_ogg = [
            "ffmpeg", "-y", "-i", temp_wav,
            "-c:a", "libvorbis", "-q:a", "1",
            ogg_path
        ]
        subprocess.run(cmd_ogg, check=True, capture_output=True)
            
        # MP3 인코딩 (LAME, 64kbps 모바일 웹 최적화 -> 곡당 ~375KB)
        cmd_mp3 = [
            "ffmpeg", "-y", "-i", temp_wav,
            "-c:a", "libmp3lame", "-b:a", "64k",
            mp3_path
        ]
        subprocess.run(cmd_mp3, check=True, capture_output=True)
            
        # ebur128 음량 및 피크 측정
        cmd_meter = [
            "ffmpeg", "-hide_banner", "-nostats", "-i", temp_wav,
            "-vn", "-af", "ebur128=peak=true", "-f", "null", "-"
        ]
        res_meter = subprocess.run(cmd_meter, check=True, capture_output=True, encoding="utf-8", errors="replace")
        meter_out = res_meter.stderr
        
        # 파일 크기 확인
        ogg_size = os.path.getsize(ogg_path) if os.path.exists(ogg_path) else 0
        mp3_size = os.path.getsize(mp3_path) if os.path.exists(mp3_path) else 0
        
        # LUFS 및 피크 파싱
        lufs_val = "N/A"
        peak_val = "N/A"
        for line in meter_out.splitlines():
            line_str = line.strip()
            if "I:" in line_str and "LUFS" in line_str:
                lufs_val = line_str
            if "Peak:" in line_str and "dBFS" in line_str:
                peak_val = line_str
                
        seam = np.max(np.abs(stereo_signal[:, -1] - stereo_signal[:, 0]))
        p99 = np.quantile(np.abs(np.diff(stereo_signal, axis=1)), 0.99)
        print(f"[{name}] OGG {ogg_size} B, MP3 {mp3_size} B | {lufs_val} | {peak_val} | PCM seam {seam:.6f}, p99 {p99:.6f}")
        return {
            "name": name,
            "ogg_size": ogg_size,
            "mp3_size": mp3_size,
            "lufs": lufs_val,
            "peak": peak_val
        }
    finally:
        if os.path.exists(temp_wav):
            os.remove(temp_wav)


def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    out_dir = script_dir
    os.makedirs(out_dir, exist_ok=True)
    
    print("=== 요괴 키우기 (yokai-game) BGM 신시사이시스 시작 ===")
    tracks = [
        ("calm", compose_calm),
        ("tense", compose_tense),
        ("boss", compose_boss),
        ("title", compose_title),
    ]
    
    results = []
    for name, composer in tracks:
        print(f"Synthesizing {name} (48.0s seamless loop)...")
        stereo = composer()
        frames = stereo.shape[1]
        if frames != round(LOOP_SEC[name] * SAMPLE_RATE):
            raise SystemExit(f"{name}: 길이 {frames} 프레임이 LOOP_SEC({LOOP_SEC[name]}초)와 다릅니다.")
        info = export_audio(stereo, name, out_dir)
        results.append(info)
        
    print("---------------------------------------------------------")
    totals = [sum(r[key] for r in results) for key in ("ogg_size", "mp3_size")]
    print(f"형식별 합계: OGG {totals[0]} B, MP3 {totals[1]} B")
    all_pass = all(max(r["ogg_size"], r["mp3_size"]) <= 600_000 for r in results) and max(totals) <= 3_000_000
    print(f"규격 검증 결과: {'모든 파일 규격 충족 (통과)' if all_pass else '규격 초과'}")
    if not all_pass:
        sys.exit(1)


if __name__ == "__main__":
    main()
