#!/usr/bin/env python3
"""
generate_sfx.py
================
동양 설화풍 귀여운 요괴 성장 게임(모바일 웹) - 여의주 강화 연출 및 상점 효과음 6종 합성 스크립트.

외부 음원 및 녹음 없이 Python(numpy, scipy)을 이용한 순수 신시사이시스(가산/감산/FM/물리 모델링 합성)로 생성됩니다.
모든 효과음은 44.1kHz 모노, 피크 -1.2 dBFS (요구 규격: -1 dBFS 이하), 무클릭 페이드 적용, 60KB 이하 규격을 준수합니다.

효과음 6종:
1. enhance-charge: 0.8초, 기운이 모이며 음이 올라가는 긴장음 (맑은 금속/구슬 울림, 끝에서 살짝 멈칫)
2. enhance-success: 0.75초, 밝은 풍경(風磬)·종 소리 + 영롱한 반짝임
3. enhance-great: 1.4초, 대성공 궁중 팡파르 (웅장한 징 + 편종 5음계 선율 + 찬란한 반짝임)
4. enhance-fail: 0.5초, 둔탁하게 꺼지는 소리 (질그릇/목탁 느낌의 둔탁한 감쇠음, 듣기 편안한 실망음)
5. enhance-break: 0.75초, 여의주 구슬이 금 가며 깨져 흩어지는 소리 (날카로운 균열 + 파편 산란)
6. sell-coins: 0.65초, 엽전이 쏟아져 짤랑거리는 소리 (황동 엽전 타격 및 연속 쏟아짐 연출)
"""

import os
import sys
import subprocess
import numpy as np
from scipy.io import wavfile

SAMPLE_RATE = 44100
TARGET_PEAK_DB = -1.2
TARGET_PEAK_AMP = 10.0 ** (TARGET_PEAK_DB / 20.0)  # 약 0.87096 (-1 dBFS 이하 보장)


def apply_fades(signal, fade_in_ms=8.0, fade_out_ms=20.0, sr=SAMPLE_RATE):
    """신호 시작과 끝에 코사인 페이드 인/아웃을 적용하여 클릭 노이즈를 제거합니다."""
    sig = signal.copy()
    in_samples = int(fade_in_ms * sr / 1000.0)
    out_samples = int(fade_out_ms * sr / 1000.0)

    if in_samples > 0 and len(sig) > in_samples:
        t_in = np.linspace(0, np.pi / 2, in_samples)
        fade_curve = np.sin(t_in) ** 2
        sig[:in_samples] *= fade_curve

    if out_samples > 0 and len(sig) > out_samples:
        t_out = np.linspace(0, np.pi / 2, out_samples)
        fade_curve = np.cos(t_out) ** 2
        sig[-out_samples:] *= fade_curve

    return sig


def normalize(signal, target_amp=TARGET_PEAK_AMP):
    """최대 진폭을 목표 피크값으로 정규화합니다."""
    max_val = np.max(np.abs(signal))
    if max_val > 1e-8:
        return signal * (target_amp / max_val)
    return signal


# ==============================================================================
# 1. enhance-charge (0.8초)
#    기운이 모이며 음이 올라가는 긴장음 (맑은 금속·구슬 울림, 끝에서 살짝 멈칫)
# ==============================================================================
def synth_enhance_charge():
    duration = 0.80
    n_samples = int(duration * SAMPLE_RATE)
    t = np.linspace(0, duration, n_samples, endpoint=False)

    # 1. 피크 주파수 궤적 (0 ~ 0.65초: 상승, 0.65 ~ 0.72초: 멈칫/숨고르기, 0.72 ~ 0.80초: 최종 솟구침 후 릴리즈)
    freq = np.zeros_like(t)
    for i, ti in enumerate(t):
        if ti <= 0.64:
            # 340Hz -> 1080Hz 완만한 지수 상승
            progress = ti / 0.64
            freq[i] = 340.0 * (1080.0 / 340.0) ** (progress ** 1.2)
        elif ti <= 0.72:
            # 끝에서 살짝 멈칫 (주파수가 1080Hz에서 1040Hz로 살짝 꺾이며 멈칫)
            progress = (ti - 0.64) / 0.08
            freq[i] = 1080.0 - 40.0 * np.sin(progress * np.pi)
        else:
            # 0.72 ~ 0.80초: 임팩트 직전 최종 짧은 긴장 상승
            progress = (ti - 0.72) / 0.08
            freq[i] = 1040.0 + 80.0 * progress

    # 위상 적분
    phase = 2.0 * np.pi * np.cumsum(freq) / SAMPLE_RATE

    # 2. 맑은 금속 및 여의주 구슬 배음 (가산 합성)
    # 기본음 + 2차 배음 + 비정수 금속성 배음 (2.76x, 4.2x, 5.4x)
    orb_tone = (
        0.55 * np.sin(phase) +
        0.25 * np.sin(2.0 * phase) +
        0.20 * np.sin(2.76 * phase + 0.3) +
        0.12 * np.sin(4.20 * phase + 0.7) +
        0.08 * np.sin(5.40 * phase + 1.2)
    )

    # 3. FM 금속성 긴장감 모듈레이션 (시간이 갈수록 빨라지는 맥놀이/트레몰로)
    tremolo_rate = 6.0 + 26.0 * (t / duration) ** 1.5
    tremolo_phase = 2.0 * np.pi * np.cumsum(tremolo_rate) / SAMPLE_RATE
    tremolo = 1.0 + 0.35 * np.sin(tremolo_phase)
    orb_tone *= tremolo

    # 4. 볼륨 엔벨로프 (끝부분 멈칫 연출: 0.64~0.72초 구간에서 음량이 40% 감쇄되어 숨을 들이쉬는 듯한 긴장감)
    env = np.ones_like(t)
    for i, ti in enumerate(t):
        if ti <= 0.64:
            env[i] = 0.2 + 0.8 * (ti / 0.64) ** 1.3
        elif ti <= 0.72:
            # 멈칫: 볼륨 딥 (0.64s 1.0 -> 0.68s 0.35 -> 0.72s 0.9)
            prog = (ti - 0.64) / 0.08
            env[i] = 1.0 - 0.65 * np.sin(prog * np.pi)
        else:
            # 마지막 순간 살짝 솟아올랐다가 릴리즈
            prog = (ti - 0.72) / 0.08
            env[i] = 0.9 * (1.0 - prog ** 2)

    # 5. 여의주 내부 기운(Swirling energy) 공명 노이즈 레이어
    rng = np.random.default_rng(1001)
    noise = rng.normal(0, 0.04, n_samples)
    noise_env = (t / duration) ** 2.0 * env
    noise_layer = noise * noise_env

    signal = orb_tone * env + noise_layer
    signal = apply_fades(signal, fade_in_ms=10.0, fade_out_ms=25.0)
    return normalize(signal)


# ==============================================================================
# 2. enhance-success (0.75초)
#    밝은 종·풍경 소리 + 반짝임 (0.6~0.9초)
# ==============================================================================
def synth_enhance_success():
    duration = 0.75
    n_samples = int(duration * SAMPLE_RATE)
    t = np.linspace(0, duration, n_samples, endpoint=False)
    signal = np.zeros(n_samples)

    # 1. 풍경(風磬, Punggyeong) 및 청아한 방울 종소리 타격음
    # 주음: E6 (1318.5 Hz) 및 G#6 (1661.2 Hz) 화음
    bell_freqs = [
        (1318.5, 0.50, 0.45),  # E6 fundamental
        (1661.2, 0.35, 0.40),  # G#6 (장3도 밝은 화음)
        (2093.0, 0.30, 0.35),  # C7
        (3639.0, 0.20, 0.20),  # 풍경 비정수 배음 (2.76x)
        (7120.0, 0.12, 0.12),  # 고주파 은구슬 울림
    ]

    for f, amp, decay_tau in bell_freqs:
        bell_env = np.exp(-t / decay_tau)
        signal += amp * np.sin(2.0 * np.pi * f * t) * bell_env

    # 2. 찰랑거리는 풍경 물고기 추(風경 魚鐸) 2차 가벼운 접촉음 (t = 0.035초)
    t2 = t - 0.035
    mask2 = t2 >= 0
    t2_valid = t2[mask2]
    chime2 = (
        0.35 * np.sin(2.0 * np.pi * 1975.5 * t2_valid) * np.exp(-t2_valid / 0.30) +
        0.25 * np.sin(2.0 * np.pi * 2637.0 * t2_valid) * np.exp(-t2_valid / 0.25)
    )
    signal[mask2] += chime2

    # 3. 영롱한 반짝임 (Sparkle chime arpeggio - 6개의 고주파 크리스탈 팅클)
    sparkle_times = [0.04, 0.10, 0.17, 0.25, 0.34, 0.44]
    sparkle_freqs = [2637.0, 3136.0, 3951.0, 4698.0, 5274.0, 6272.0]

    for st, sf in zip(sparkle_times, sparkle_freqs):
        dt = t - st
        mask = dt >= 0
        if not np.any(mask):
            continue
        dt_v = dt[mask]
        s_env = np.exp(-dt_v / 0.07) * (1.0 - np.exp(-dt_v / 0.002))
        # 약간의 FM 모듈레이션으로 영롱하게 반짝이는 빛무리 효과
        sparkle = np.sin(2.0 * np.pi * sf * dt_v + 1.2 * np.sin(2.0 * np.pi * 3.0 * sf * dt_v))
        signal[mask] += 0.22 * sparkle * s_env

    signal = apply_fades(signal, fade_in_ms=5.0, fade_out_ms=40.0)
    return normalize(signal)


# ==============================================================================
# 3. enhance-great (1.4초)
#    대성공 팡파르 (징·편종 느낌 + 반짝임 겹침, 1.2~1.6초)
# ==============================================================================
def synth_enhance_great():
    duration = 1.40
    n_samples = int(duration * SAMPLE_RATE)
    t = np.linspace(0, duration, n_samples, endpoint=False)
    signal = np.zeros(n_samples)

    # 1. 전통 징(Jing)의 깊은 공명음
    # 징 특유의 음정 상승 및 '개-갱' 맥놀이 (132Hz -> 146Hz)
    jing_f0 = 132.0 + 14.0 * (1.0 - np.exp(-t / 0.18))
    jing_phase = 2.0 * np.pi * np.cumsum(jing_f0) / SAMPLE_RATE
    # 징 맥놀이 진폭 모듈레이션 (3.3 Hz)
    jing_trem = 1.0 + 0.45 * np.sin(2.0 * np.pi * 3.3 * t)
    jing_env = np.exp(-t / 0.55)

    # 징 FM 금속성 타격체 합성
    jing_fm = np.sin(jing_phase + 2.5 * np.exp(-t / 0.12) * np.sin(1.58 * jing_phase))
    jing_sub = 0.4 * np.sin(jing_phase * 0.5) * np.exp(-t / 0.65)
    signal += 0.65 * (jing_fm * jing_trem + jing_sub) * jing_env

    # 2. 궁중 제례악 편종(編鐘, Pyeonjong) 승전 5음계 팡파르
    # 승전의 웅장한 아르페지오: 솔(G4) -> 도(C5) -> 레(D5) -> 솔(G5) -> 도(C6) + 미(E6) 화음
    notes = [
        (0.00, 392.00, 0.40, 0.55),   # G4
        (0.09, 523.25, 0.45, 0.60),   # C5
        (0.18, 587.33, 0.45, 0.65),   # D5
        (0.27, 783.99, 0.55, 0.75),   # G5
        (0.38, 1046.50, 0.75, 0.90),  # C6 (대성공 클라이맥스 주음)
        (0.39, 1318.51, 0.50, 0.85),  # E6 (화음)
        (0.40, 1567.98, 0.40, 0.80),  # G6 (화음)
    ]

    for onset, f0, amp, tau in notes:
        dt = t - onset
        mask = dt >= 0
        if not np.any(mask):
            continue
        dt_v = dt[mask]
        bell_env = np.exp(-dt_v / tau) * (1.0 - np.exp(-dt_v / 0.003))

        # 청동 편종의 물리적 고유 배음비 [1.0, 2.75, 5.4, 8.9]
        bell_sound = (
            0.60 * np.sin(2.0 * np.pi * f0 * dt_v) +
            0.28 * np.sin(2.0 * np.pi * (f0 * 2.75) * dt_v) * np.exp(-dt_v / (tau * 0.6)) +
            0.15 * np.sin(2.0 * np.pi * (f0 * 5.40) * dt_v) * np.exp(-dt_v / (tau * 0.35)) +
            0.08 * np.sin(2.0 * np.pi * (f0 * 8.90) * dt_v) * np.exp(-dt_v / (tau * 0.2))
        )
        signal[mask] += amp * bell_sound * bell_env

    # 3. 찬란한 빛가루 반짝임 레이어 (Cascading Sparkle Showers)
    sparkle_times = [0.42, 0.49, 0.57, 0.66, 0.76, 0.87, 0.99, 1.10]
    sparkle_freqs = [3136.0, 3951.0, 4698.0, 5274.0, 6272.0, 7040.0, 5274.0, 6272.0]

    for st, sf in zip(sparkle_times, sparkle_freqs):
        dt = t - st
        mask = dt >= 0
        if not np.any(mask):
            continue
        dt_v = dt[mask]
        s_env = np.exp(-dt_v / 0.10) * (1.0 - np.exp(-dt_v / 0.002))
        sparkle = np.sin(2.0 * np.pi * sf * dt_v) * (1.0 + 0.4 * np.sin(2.0 * np.pi * 18.0 * dt_v))
        signal[mask] += 0.25 * sparkle * s_env

    signal = apply_fades(signal, fade_in_ms=4.0, fade_out_ms=60.0)
    return normalize(signal)


# ==============================================================================
# 4. enhance-fail (0.5초)
#    둔탁하게 꺼지는 소리 (실망하되 듣기 싫지 않게, 0.4~0.6초)
# ==============================================================================
def synth_enhance_fail():
    duration = 0.50
    n_samples = int(duration * SAMPLE_RATE)
    t = np.linspace(0, duration, n_samples, endpoint=False)

    # 1. 둔탁한 질그릇/목탁 느낌의 타격 과도응답 (0 ~ 0.04초)
    rng = np.random.default_rng(2002)
    noise = rng.normal(0, 0.35, n_samples)
    thud_env = np.exp(-t / 0.035)
    # 저역 필터링 느낌의 둔탁한 펀치
    thud = noise * thud_env * (1.0 + np.sin(2.0 * np.pi * 160.0 * t))

    # 2. 실망감을 주되 귀엽고 부드러운 하향 피치 슬라이드 ('쿵... 퓽')
    # 260Hz -> 75Hz로 부드럽게 감쇠하며 하강
    f_slide = 75.0 + (260.0 - 75.0) * np.exp(-t / 0.12)
    phase_slide = 2.0 * np.pi * np.cumsum(f_slide) / SAMPLE_RATE

    body_env = np.exp(-t / 0.18)
    body = (
        0.70 * np.sin(phase_slide) +
        0.25 * np.sin(2.0 * phase_slide) * np.exp(-t / 0.08)
    ) * body_env

    # 3. 속이 빈 동양풍 도자기/항아리 공명음 (135Hz 감쇠 진동)
    hollow = 0.35 * np.sin(2.0 * np.pi * 135.0 * t) * np.exp(-t / 0.14)

    # 4. 부드러운 저음 여운 (0.2 ~ 0.45초 잔향)
    sub_tail = 0.20 * np.sin(2.0 * np.pi * 65.0 * t) * np.exp(-t / 0.25)

    signal = 0.45 * thud + 0.65 * body + hollow + sub_tail
    signal = apply_fades(signal, fade_in_ms=4.0, fade_out_ms=30.0)
    return normalize(signal)


# ==============================================================================
# 5. enhance-break (0.75초)
#    구슬이 금 가며 깨져 흩어지는 소리 (0.6~0.9초)
# ==============================================================================
def synth_enhance_break():
    duration = 0.75
    n_samples = int(duration * SAMPLE_RATE)
    t = np.linspace(0, duration, n_samples, endpoint=False)
    signal = np.zeros(n_samples)

    # 1. 구슬에 금이 쩍 가는 순간의 날카로운 균열음 (Crack, 0 ~ 0.05초)
    f_crack = 4600.0 * np.exp(-t / 0.02) + 1800.0
    phase_crack = 2.0 * np.pi * np.cumsum(f_crack) / SAMPLE_RATE
    crack_env = np.exp(-t / 0.025)
    rng = np.random.default_rng(3003)
    crack_noise = rng.normal(0, 0.5, n_samples) * np.exp(-t / 0.015)
    signal += 0.85 * (np.sin(phase_crack) + 0.6 * crack_noise) * crack_env

    # 2. 구슬 산산조각 파편 분산 (Shatter & Shard Scatter)
    # 20여 개의 크리스탈 유리 파편이 튀고 바닥에 튕기는 소리
    shard_delays = [
        0.018, 0.035, 0.052, 0.075, 0.105, 0.138, 0.175, 0.220, 0.270, 0.330,
        0.042, 0.088, 0.125, 0.185, 0.250, 0.315, 0.390, 0.460, 0.520, 0.580
    ]
    shard_freqs = [
        3450.0, 4820.0, 5600.0, 2950.0, 6200.0, 3880.0, 4420.0, 5150.0, 6780.0, 3120.0,
        4150.0, 5920.0, 3340.0, 4730.0, 5450.0, 6100.0, 3700.0, 4950.0, 5800.0, 6300.0
    ]

    for sd, sf in zip(shard_delays, shard_freqs):
        dt = t - sd
        mask = dt >= 0
        if not np.any(mask):
            continue
        dt_v = dt[mask]
        # 튕길수록 감쇠 시간이 짧아짐 (0.06s -> 0.025s)
        decay = max(0.025, 0.065 * (1.0 - sd / duration))
        sh_env = np.exp(-dt_v / decay) * (1.0 - np.exp(-dt_v / 0.001))
        # 파편 타격 및 미세 울림
        shard_snd = np.sin(2.0 * np.pi * sf * dt_v) + 0.3 * np.sin(2.0 * np.pi * (sf * 1.85) * dt_v)
        amp = 0.35 * (1.0 - 0.7 * (sd / duration))
        signal[mask] += amp * shard_snd * sh_env

    # 3. 깨진 기운이 흩어지는 바람소리 잔향
    scatter_noise = rng.normal(0, 0.15, n_samples)
    scatter_env = (t / 0.15) * np.exp(-t / 0.18)
    signal += scatter_noise * scatter_env

    signal = apply_fades(signal, fade_in_ms=2.0, fade_out_ms=40.0)
    return normalize(signal)


# ==============================================================================
# 6. sell-coins (0.65초)
#    엽전이 쏟아지는 소리 (0.5~0.8초)
# ==============================================================================
def synth_sell_coins():
    duration = 0.65
    n_samples = int(duration * SAMPLE_RATE)
    t = np.linspace(0, duration, n_samples, endpoint=False)
    signal = np.zeros(n_samples)

    # 전통 구멍 뚫린 황동 엽전(葉錢)의 물리 음향 특성:
    # 2.2kHz ~ 6.5kHz 대역의 고유 맑은 황동 금속 링 + 1.2kHz 중심의 동전끼리 부딪히는 틱
    rng = np.random.default_rng(4004)

    # 엽전 22닢이 쏟아져 내리는 타이밍 (초반 와르르 쏟아짐 -> 바닥에서 잘랑거리며 안착)
    coin_onsets = [
        0.000, 0.015, 0.032, 0.054, 0.078, 0.105, 0.135, 0.168, 0.204, 0.242,
        0.282, 0.324, 0.368, 0.412, 0.456, 0.498, 0.535, 0.565, 0.045, 0.092,
        0.152, 0.225
    ]

    base_modes = [2380.0, 3420.0, 4850.0, 6120.0]

    for onset in coin_onsets:
        dt = t - onset
        mask = dt >= 0
        if not np.any(mask):
            continue
        dt_v = dt[mask]

        # 개별 동전마다 미세한 크기 및 두께 차이 반영 (피치 변동)
        pitch_scale = rng.uniform(0.92, 1.08)
        modes = [m * pitch_scale for m in base_modes]

        decay = rng.uniform(0.035, 0.075)
        c_env = np.exp(-dt_v / decay) * (1.0 - np.exp(-dt_v / 0.001))

        # 동전 바디 타격음 (금속 딱 소리)
        body_click = np.sin(2.0 * np.pi * (1150.0 * pitch_scale) * dt_v) * np.exp(-dt_v / 0.008)

        # 황동 엽전 링잉 (가산 배음)
        ring = (
            0.45 * np.sin(2.0 * np.pi * modes[0] * dt_v) +
            0.35 * np.sin(2.0 * np.pi * modes[1] * dt_v) +
            0.25 * np.sin(2.0 * np.pi * modes[2] * dt_v) +
            0.15 * np.sin(2.0 * np.pi * modes[3] * dt_v)
        )

        amp = rng.uniform(0.35, 0.70) * (1.0 - 0.4 * (onset / duration))
        signal[mask] += amp * (body_click * 0.4 + ring * 0.6) * c_env

    # 쏟아질 때 엽전들끼리 스치는 바스락거림 (Chinkling texture)
    cascade_noise = rng.normal(0, 0.08, n_samples)
    cascade_env = (t / 0.2) * np.exp(-t / 0.25)
    signal += cascade_noise * cascade_env

    signal = apply_fades(signal, fade_in_ms=3.0, fade_out_ms=35.0)
    return normalize(signal)


# ==============================================================================
# 메인 생성 및 포맷 변환 루틴
# ==============================================================================
SFX_DEFINITIONS = [
    {
        "name": "enhance-charge",
        "synth_fn": synth_enhance_charge,
        "desc": "기운이 모이며 음이 올라가는 긴장음 (맑은 금속·구슬 울림, 끝에서 살짝 멈칫)",
        "expected_duration": 0.80,
    },
    {
        "name": "enhance-success",
        "synth_fn": synth_enhance_success,
        "desc": "밝은 종·풍경 소리 + 반짝임",
        "expected_duration": 0.75,
    },
    {
        "name": "enhance-great",
        "synth_fn": synth_enhance_great,
        "desc": "대성공 팡파르 (징·편종 느낌 + 반짝임 겹침)",
        "expected_duration": 1.40,
    },
    {
        "name": "enhance-fail",
        "synth_fn": synth_enhance_fail,
        "desc": "둔탁하게 꺼지는 소리 (실망하되 듣기 싫지 않게)",
        "expected_duration": 0.50,
    },
    {
        "name": "enhance-break",
        "synth_fn": synth_enhance_break,
        "desc": "구슬이 금 가며 깨져 흩어지는 소리",
        "expected_duration": 0.75,
    },
    {
        "name": "sell-coins",
        "synth_fn": synth_sell_coins,
        "desc": "엽전이 쏟아지는 소리",
        "expected_duration": 0.65,
    },
]


def convert_audio(wav_path, ogg_path, mp3_path):
    """ffmpeg를 사용하여 wav를 ogg 및 mp3로 변환합니다."""
    # OGG 변환 (Vorbis, qscale 4: 약 128kbps 모노)
    subprocess.run(
        ["ffmpeg", "-y", "-i", wav_path, "-c:a", "libvorbis", "-q:a", "4", ogg_path],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=True
    )
    # MP3 변환 (LAME, 128kbps 모노)
    subprocess.run(
        ["ffmpeg", "-y", "-i", wav_path, "-c:a", "libmp3lame", "-b:a", "128k", mp3_path],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=True
    )


def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    output_dir = script_dir
    os.makedirs(output_dir, exist_ok=True)

    print("=" * 75)
    print(" 요괴 성장 게임(yokai-game) 사운드 효과음 합성 및 생성 스크립트")
    print("=" * 75)
    print(f"출력 경로: {output_dir}")
    print(f"샘플링 레이트: {SAMPLE_RATE} Hz (모노)")
    print(f"목표 피크: {TARGET_PEAK_DB} dBFS (피크 제한: -1.0 dBFS 이하)\n")

    results = []

    for item in SFX_DEFINITIONS:
        name = item["name"]
        fn = item["synth_fn"]
        desc = item["desc"]

        print(f"[*] 합성 중: {name} ({desc})...")
        audio = fn()

        actual_len_sec = len(audio) / SAMPLE_RATE
        peak_amp = float(np.max(np.abs(audio)))
        peak_db = 20.0 * np.log10(max(peak_amp, 1e-9))

        # 16-bit PCM 변환 (-32767 ~ +32767)
        audio_int16 = (audio * 32767.0).astype(np.int16)

        wav_filename = f"{name}.wav"
        ogg_filename = f"{name}.ogg"
        mp3_filename = f"{name}.mp3"

        wav_path = os.path.join(output_dir, wav_filename)
        ogg_path = os.path.join(output_dir, ogg_filename)
        mp3_path = os.path.join(output_dir, mp3_filename)

        # WAV 파일 저장
        wavfile.write(wav_path, SAMPLE_RATE, audio_int16)

        # ffmpeg 변환
        convert_audio(wav_path, ogg_path, mp3_path)

        wav_size_kb = os.path.getsize(wav_path) / 1024.0
        ogg_size_kb = os.path.getsize(ogg_path) / 1024.0
        mp3_size_kb = os.path.getsize(mp3_path) / 1024.0

        results.append({
            "name": name,
            "desc": desc,
            "duration": actual_len_sec,
            "peak_db": peak_db,
            "wav_kb": wav_size_kb,
            "ogg_kb": ogg_size_kb,
            "mp3_kb": mp3_size_kb,
        })

        print(f"    - 길이: {actual_len_sec:.2f}초 | 피크: {peak_db:.2f} dBFS")
        print(f"    - 파일 크기: WAV {wav_size_kb:.1f} KB | OGG {ogg_size_kb:.1f} KB | MP3 {mp3_size_kb:.1f} KB")

    print("\n" + "=" * 75)
    print(" 전체 사운드 생성 및 검증 완료 요약 표")
    print("=" * 75)
    header = f"{'효과음 이름':<18} | {'길이':<7} | {'피크(dBFS)':<11} | {'OGG(KB)':<8} | {'MP3(KB)':<8} | {'규격(<=60KB)':<10}"
    print(header)
    print("-" * len(header))
    for r in results:
        valid_size = "통과" if r["ogg_kb"] <= 60.0 and r["mp3_kb"] <= 60.0 else "초과"
        valid_peak = "통과" if r["peak_db"] <= -1.0 else "초과"
        print(f"{r['name']:<18} | {r['duration']:>5.2f}초 | {r['peak_db']:>9.2f} | {r['ogg_kb']:>6.1f} KB | {r['mp3_kb']:>6.1f} KB | {valid_size}({valid_peak})")

    print("=" * 75)


if __name__ == "__main__":
    main()
