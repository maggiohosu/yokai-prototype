#!/usr/bin/env python3
"""
generate_sfx.py
================
동양 설화풍 귀여운 요괴 성장 게임(모바일 웹) - 사운드 효과음(SFX) 합성 스크립트.

외부 음원 및 녹음 없이 Python(numpy, scipy)을 이용한 순수 신시사이시스(가산/감산/FM/물리 모델링 합성)로 생성됩니다.
모든 효과음은 44.1kHz 모노, 무클릭 코사인 페이드 적용, 모바일 최적화 규격(WAV/OGG/MP3 포맷 제공, OGG/MP3 파일당 60KB 이하)을 준수합니다.

[음향 구성]
1. 여의주 강화 및 판매 연출 (기존 6종):
   - enhance-charge: 0.8초, 기운이 모이며 음이 올라가는 긴장음 (맑은 금속/구슬 울림, 끝에서 살짝 멈칫)
   - enhance-success: 0.75초, 밝은 풍경(風磬)·종 소리 + 영롱한 반짝임
   - enhance-great: 1.4초, 대성공 궁중 팡파르 (웅장한 징 + 편종 5음계 선율 + 찬란한 반짝임)
   - enhance-fail: 0.5초, 둔탁하게 꺼지는 소리 (질그릇/목탁 느낌의 둔탁한 감쇠음, 듣기 편안한 실망음)
   - enhance-break: 0.75초, 여의주 구슬이 금 가며 깨져 흩어지는 소리 (날카로운 균열 + 파편 산란)
   - sell-coins: 0.65초, 엽전이 쏟아져 짤랑거리는 소리 (황동 엽전 타격 및 연속 쏟아짐 연출)

2. 보패 무기 발사음 7종 (발사음 규격: 길이 ≤ 0.18초, 피크 ≤ -7.2 dBFS [-6dB 이하], 피크 ≤ -1 dBFS):
   - shot-fan: 0.15초, 학우선 바람 (날렵하게 바람 깃을 가르는 깃털 풍절음)
   - shot-mirror: 0.16초, 팔괘경 맑은 울림 (신성한 구리 거울 공명 및 빛줄기 맑은 울림)
   - shot-sword: 0.15초, 도목검 휘두름 (복숭아나무 퇴마 검의 단단한 목재 틱과 날카로운 검풍)
   - shot-beads: 0.14초, 염주 구슬 부딪힘 (단단한 염주 알들이 타닥 맞부딪히는 경쾌한 충돌음)
   - shot-gourd: 0.15초, 단호로 쏟아짐·찰방 (호리병에서 약수 방울이 퐁 솟구쳐 찰방거리는 물방울음)
   - shot-bell: 0.16초, 삼청령 방울 (도사의 의식용 삼청령 놋쇠 방울의 청아하고 신비로운 방울음)
   - shot-seal: 0.16초, 옥인 둔탁한 찍음 (묵직한 옥도장을 바닥에 쿵 찍는 절도 있고 단단한 타격음)

3. 상점 및 시스템 효과음 3종 (시스템 규격: 길이 ≤ 1.2초, 피크 ≤ -1 dBFS):
   - shop-buy: 0.50초, 상점 구매 (엽전 지불 짤랑임과 기분 좋은 거래 완료 차임)
   - weapon-unlock: 0.90초, 새 보패 해금 (봉인이 풀리는 신비로운 기운과 동양 5음계 승전 팡파르)
   - equip-swap: 0.30초, 장착 교체 (기존 무기를 풀고 새 보패가 손에 찰칵 감기는 장착 체결음)

4. 필드 인게임 효과음 6종 (추가 과제: 부스터/흡수/피격/발사/명중):
   - boost-start: 0.30초 (0.25~0.4초), 부스터 켤 때 바람이 밀려 나가는 '휙'
   - boost-loop: 0.60초 (0.5~0.8초), 부스터 지속 루프음, 끝과 처음이 완벽히 연결되는 심리스 루프
   - eat: 0.15초 (0.12~0.2초), 요괴 흡수/먹기 '뽁/꿀꺽', 귀엽고 찰진 소리 (-8dB 이하: -9.5 dBFS)
   - player-hurt: 0.28초 (0.2~0.35초), 적에게 맞았을 때 둔탁한 '퍽' + 짧은 하강음
   - orb-fire: 0.13초 (0.1~0.16초), 여의주 기본 발사 '슝' (-6dB 이하: -7.5 dBFS)
   - orb-hit: 0.10초 (0.08~0.15초), 발사체 적 명중 '탁/팅' (-8dB 이하: -9.5 dBFS, 귀가 편안한 둥근 고역)
"""

import os
import sys
import subprocess
import numpy as np
from scipy.io import wavfile

SAMPLE_RATE = 44100

# 목표 피크 음량 기준
TARGET_PEAK_DB = -1.2
TARGET_PEAK_AMP = 10.0 ** (TARGET_PEAK_DB / 20.0)

# 무기 발사음 전용 목표 피크 (-7.5 dBFS: 기존 대비 -6dB 이하 및 ≤ -1 dBFS)
WEAPON_SHOT_PEAK_DB = -7.5
WEAPON_SHOT_PEAK_AMP = 10.0 ** (WEAPON_SHOT_PEAK_DB / 20.0)

# 상점 및 UI 시스템 효과음 목표 피크 (-1.5 dBFS)
SYSTEM_UI_PEAK_DB = -1.5
SYSTEM_UI_PEAK_AMP = 10.0 ** (SYSTEM_UI_PEAK_DB / 20.0)

# 필드 효과음 볼륨 프리셋
FIELD_PUNCH_PEAK_DB = -2.0  # boost-start, player-hurt
FIELD_PUNCH_PEAK_AMP = 10.0 ** (FIELD_PUNCH_PEAK_DB / 20.0)

FIELD_LOOP_PEAK_DB = -7.0   # boost-loop
FIELD_LOOP_PEAK_AMP = 10.0 ** (FIELD_LOOP_PEAK_DB / 20.0)

FIELD_SOFT_PEAK_DB = -9.5   # eat, orb-hit (-8dB 이하 적용)
FIELD_SOFT_PEAK_AMP = 10.0 ** (FIELD_SOFT_PEAK_DB / 20.0)

# 기존 원본 6종 효과음 목록 (실행 시 기존 파일 무단 변경 방지)
ORIGINAL_SFX_NAMES = {
    "enhance-charge",
    "enhance-success",
    "enhance-great",
    "enhance-fail",
    "enhance-break",
    "sell-coins",
}


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
# ==============================================================================
def synth_enhance_charge():
    duration = 0.80
    n_samples = int(duration * SAMPLE_RATE)
    t = np.linspace(0, duration, n_samples, endpoint=False)

    freq = np.zeros_like(t)
    for i, ti in enumerate(t):
        if ti <= 0.64:
            progress = ti / 0.64
            freq[i] = 340.0 * (1080.0 / 340.0) ** (progress ** 1.2)
        elif ti <= 0.72:
            progress = (ti - 0.64) / 0.08
            freq[i] = 1080.0 - 40.0 * np.sin(progress * np.pi)
        else:
            progress = (ti - 0.72) / 0.08
            freq[i] = 1040.0 + 80.0 * progress

    phase = 2.0 * np.pi * np.cumsum(freq) / SAMPLE_RATE

    orb_tone = (
        0.55 * np.sin(phase) +
        0.25 * np.sin(2.0 * phase) +
        0.20 * np.sin(2.76 * phase + 0.3) +
        0.12 * np.sin(4.20 * phase + 0.7) +
        0.08 * np.sin(5.40 * phase + 1.2)
    )

    tremolo_rate = 6.0 + 26.0 * (t / duration) ** 1.5
    tremolo_phase = 2.0 * np.pi * np.cumsum(tremolo_rate) / SAMPLE_RATE
    tremolo = 1.0 + 0.35 * np.sin(tremolo_phase)
    orb_tone *= tremolo

    env = np.ones_like(t)
    for i, ti in enumerate(t):
        if ti <= 0.64:
            env[i] = 0.2 + 0.8 * (ti / 0.64) ** 1.3
        elif ti <= 0.72:
            prog = (ti - 0.64) / 0.08
            env[i] = 1.0 - 0.65 * np.sin(prog * np.pi)
        else:
            prog = (ti - 0.72) / 0.08
            env[i] = 0.9 * (1.0 - prog ** 2)

    rng = np.random.default_rng(1001)
    noise = rng.normal(0, 0.04, n_samples)
    noise_env = (t / duration) ** 2.0 * env
    noise_layer = noise * noise_env

    signal = orb_tone * env + noise_layer
    signal = apply_fades(signal, fade_in_ms=10.0, fade_out_ms=25.0)
    return normalize(signal, TARGET_PEAK_AMP)


# ==============================================================================
# 2. enhance-success (0.75초)
# ==============================================================================
def synth_enhance_success():
    duration = 0.75
    n_samples = int(duration * SAMPLE_RATE)
    t = np.linspace(0, duration, n_samples, endpoint=False)
    signal = np.zeros(n_samples)

    bell_freqs = [
        (1318.5, 0.50, 0.45),
        (1661.2, 0.35, 0.40),
        (2093.0, 0.30, 0.35),
        (3639.0, 0.20, 0.20),
        (7120.0, 0.12, 0.12),
    ]

    for f, amp, decay_tau in bell_freqs:
        bell_env = np.exp(-t / decay_tau)
        signal += amp * np.sin(2.0 * np.pi * f * t) * bell_env

    t2 = t - 0.035
    mask2 = t2 >= 0
    t2_valid = t2[mask2]
    chime2 = (
        0.35 * np.sin(2.0 * np.pi * 1975.5 * t2_valid) * np.exp(-t2_valid / 0.30) +
        0.25 * np.sin(2.0 * np.pi * 2637.0 * t2_valid) * np.exp(-t2_valid / 0.25)
    )
    signal[mask2] += chime2

    sparkle_times = [0.04, 0.10, 0.17, 0.25, 0.34, 0.44]
    sparkle_freqs = [2637.0, 3136.0, 3951.0, 4698.0, 5274.0, 6272.0]

    for st, sf in zip(sparkle_times, sparkle_freqs):
        dt = t - st
        mask = dt >= 0
        if not np.any(mask):
            continue
        dt_v = dt[mask]
        s_env = np.exp(-dt_v / 0.07) * (1.0 - np.exp(-dt_v / 0.002))
        sparkle = np.sin(2.0 * np.pi * sf * dt_v + 1.2 * np.sin(2.0 * np.pi * 3.0 * sf * dt_v))
        signal[mask] += 0.22 * sparkle * s_env

    signal = apply_fades(signal, fade_in_ms=5.0, fade_out_ms=40.0)
    return normalize(signal, TARGET_PEAK_AMP)


# ==============================================================================
# 3. enhance-great (1.4초)
# ==============================================================================
def synth_enhance_great():
    duration = 1.40
    n_samples = int(duration * SAMPLE_RATE)
    t = np.linspace(0, duration, n_samples, endpoint=False)
    signal = np.zeros(n_samples)

    jing_f0 = 132.0 + 14.0 * (1.0 - np.exp(-t / 0.18))
    jing_phase = 2.0 * np.pi * np.cumsum(jing_f0) / SAMPLE_RATE
    jing_trem = 1.0 + 0.45 * np.sin(2.0 * np.pi * 3.3 * t)
    jing_env = np.exp(-t / 0.55)

    jing_fm = np.sin(jing_phase + 2.5 * np.exp(-t / 0.12) * np.sin(1.58 * jing_phase))
    jing_sub = 0.4 * np.sin(jing_phase * 0.5) * np.exp(-t / 0.65)
    signal += 0.65 * (jing_fm * jing_trem + jing_sub) * jing_env

    notes = [
        (0.00, 392.00, 0.40, 0.55),
        (0.09, 523.25, 0.45, 0.60),
        (0.18, 587.33, 0.45, 0.65),
        (0.27, 783.99, 0.55, 0.75),
        (0.38, 1046.50, 0.75, 0.90),
        (0.39, 1318.51, 0.50, 0.85),
        (0.40, 1567.98, 0.40, 0.80),
    ]

    for onset, f0, amp, tau in notes:
        dt = t - onset
        mask = dt >= 0
        if not np.any(mask):
            continue
        dt_v = dt[mask]
        bell_env = np.exp(-dt_v / tau) * (1.0 - np.exp(-dt_v / 0.003))

        bell_sound = (
            0.60 * np.sin(2.0 * np.pi * f0 * dt_v) +
            0.28 * np.sin(2.0 * np.pi * (f0 * 2.75) * dt_v) * np.exp(-dt_v / (tau * 0.6)) +
            0.15 * np.sin(2.0 * np.pi * (f0 * 5.40) * dt_v) * np.exp(-dt_v / (tau * 0.35)) +
            0.08 * np.sin(2.0 * np.pi * (f0 * 8.90) * dt_v) * np.exp(-dt_v / (tau * 0.2))
        )
        signal[mask] += amp * bell_sound * bell_env

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
    return normalize(signal, TARGET_PEAK_AMP)


# ==============================================================================
# 4. enhance-fail (0.5초)
# ==============================================================================
def synth_enhance_fail():
    duration = 0.50
    n_samples = int(duration * SAMPLE_RATE)
    t = np.linspace(0, duration, n_samples, endpoint=False)

    rng = np.random.default_rng(2002)
    noise = rng.normal(0, 0.35, n_samples)
    thud_env = np.exp(-t / 0.035)
    thud = noise * thud_env * (1.0 + np.sin(2.0 * np.pi * 160.0 * t))

    f_slide = 75.0 + (260.0 - 75.0) * np.exp(-t / 0.12)
    phase_slide = 2.0 * np.pi * np.cumsum(f_slide) / SAMPLE_RATE

    body_env = np.exp(-t / 0.18)
    body = (
        0.70 * np.sin(phase_slide) +
        0.25 * np.sin(2.0 * phase_slide) * np.exp(-t / 0.08)
    ) * body_env

    hollow = 0.35 * np.sin(2.0 * np.pi * 135.0 * t) * np.exp(-t / 0.14)
    sub_tail = 0.20 * np.sin(2.0 * np.pi * 65.0 * t) * np.exp(-t / 0.25)

    signal = 0.45 * thud + 0.65 * body + hollow + sub_tail
    signal = apply_fades(signal, fade_in_ms=4.0, fade_out_ms=30.0)
    return normalize(signal, TARGET_PEAK_AMP)


# ==============================================================================
# 5. enhance-break (0.75초)
# ==============================================================================
def synth_enhance_break():
    duration = 0.75
    n_samples = int(duration * SAMPLE_RATE)
    t = np.linspace(0, duration, n_samples, endpoint=False)
    signal = np.zeros(n_samples)

    f_crack = 4600.0 * np.exp(-t / 0.02) + 1800.0
    phase_crack = 2.0 * np.pi * np.cumsum(f_crack) / SAMPLE_RATE
    crack_env = np.exp(-t / 0.025)
    rng = np.random.default_rng(3003)
    crack_noise = rng.normal(0, 0.5, n_samples) * np.exp(-t / 0.015)
    signal += 0.85 * (np.sin(phase_crack) + 0.6 * crack_noise) * crack_env

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
        decay = max(0.025, 0.065 * (1.0 - sd / duration))
        sh_env = np.exp(-dt_v / decay) * (1.0 - np.exp(-dt_v / 0.001))
        shard_snd = np.sin(2.0 * np.pi * sf * dt_v) + 0.3 * np.sin(2.0 * np.pi * (sf * 1.85) * dt_v)
        amp = 0.35 * (1.0 - 0.7 * (sd / duration))
        signal[mask] += amp * shard_snd * sh_env

    scatter_noise = rng.normal(0, 0.15, n_samples)
    scatter_env = (t / 0.15) * np.exp(-t / 0.18)
    signal += scatter_noise * scatter_env

    signal = apply_fades(signal, fade_in_ms=2.0, fade_out_ms=40.0)
    return normalize(signal, TARGET_PEAK_AMP)


# ==============================================================================
# 6. sell-coins (0.65초)
# ==============================================================================
def synth_sell_coins():
    duration = 0.65
    n_samples = int(duration * SAMPLE_RATE)
    t = np.linspace(0, duration, n_samples, endpoint=False)
    signal = np.zeros(n_samples)

    rng = np.random.default_rng(4004)
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

        pitch_scale = rng.uniform(0.92, 1.08)
        modes = [m * pitch_scale for m in base_modes]

        decay = rng.uniform(0.035, 0.075)
        c_env = np.exp(-dt_v / decay) * (1.0 - np.exp(-dt_v / 0.001))
        body_click = np.sin(2.0 * np.pi * (1150.0 * pitch_scale) * dt_v) * np.exp(-dt_v / 0.008)

        ring = (
            0.45 * np.sin(2.0 * np.pi * modes[0] * dt_v) +
            0.35 * np.sin(2.0 * np.pi * modes[1] * dt_v) +
            0.25 * np.sin(2.0 * np.pi * modes[2] * dt_v) +
            0.15 * np.sin(2.0 * np.pi * modes[3] * dt_v)
        )

        amp = rng.uniform(0.35, 0.70) * (1.0 - 0.4 * (onset / duration))
        signal[mask] += amp * (body_click * 0.4 + ring * 0.6) * c_env

    cascade_noise = rng.normal(0, 0.08, n_samples)
    cascade_env = (t / 0.2) * np.exp(-t / 0.25)
    signal += cascade_noise * cascade_env

    signal = apply_fades(signal, fade_in_ms=3.0, fade_out_ms=35.0)
    return normalize(signal, TARGET_PEAK_AMP)


# ==============================================================================
# 7. shot-fan (0.15초) - 학우선 바람 발사음
# ==============================================================================
def synth_shot_fan():
    duration = 0.15
    n = int(duration * SAMPLE_RATE)
    t = np.linspace(0, duration, n, endpoint=False)
    rng = np.random.default_rng(5001)

    raw_noise = rng.normal(0, 0.4, n)
    freq_sweep = 800.0 + 1800.0 * np.sin(np.pi * (t / duration) ** 0.8)
    phase_mod = 2.0 * np.pi * np.cumsum(freq_sweep) / SAMPLE_RATE
    wind = raw_noise * (0.6 + 0.4 * np.sin(phase_mod))

    flutter = 1.0 + 0.35 * np.sin(2.0 * np.pi * 45.0 * t)
    env = np.sin(np.pi * (t / duration) ** 0.6) ** 1.8
    swish = 0.25 * np.sin(phase_mod * 0.7) * np.exp(-t / 0.06)

    sig = (wind * flutter + swish) * env
    sig = apply_fades(sig, fade_in_ms=3.0, fade_out_ms=25.0)
    return normalize(sig, WEAPON_SHOT_PEAK_AMP)


# ==============================================================================
# 8. shot-mirror (0.16초) - 팔괘경 맑은 울림 발사음
# ==============================================================================
def synth_shot_mirror():
    duration = 0.16
    n = int(duration * SAMPLE_RATE)
    t = np.linspace(0, duration, n, endpoint=False)

    f_attack = 1864.0 + 1000.0 * np.exp(-t / 0.015)
    phase_atk = 2.0 * np.pi * np.cumsum(f_attack) / SAMPLE_RATE
    laser_beam = 0.35 * np.sin(phase_atk) * np.exp(-t / 0.035)

    bell = (
        0.55 * np.sin(2.0 * np.pi * 1864.0 * t) * np.exp(-t / 0.09) +
        0.30 * np.sin(2.0 * np.pi * 5146.0 * t) * np.exp(-t / 0.05) +
        0.18 * np.sin(2.0 * np.pi * 7925.0 * t) * np.exp(-t / 0.03)
    )

    sig = laser_beam + bell
    sig = apply_fades(sig, fade_in_ms=2.0, fade_out_ms=30.0)
    return normalize(sig, WEAPON_SHOT_PEAK_AMP)


# ==============================================================================
# 9. shot-sword (0.15초) - 도목검 휘두름 발사음
# ==============================================================================
def synth_shot_sword():
    duration = 0.15
    n = int(duration * SAMPLE_RATE)
    t = np.linspace(0, duration, n, endpoint=False)
    rng = np.random.default_rng(5003)

    wood_tap = (
        0.45 * np.sin(2.0 * np.pi * 480.0 * t) +
        0.35 * np.sin(2.0 * np.pi * 920.0 * t)
    ) * np.exp(-t / 0.02)

    f_whoosh = 420.0 + 1180.0 * np.exp(-t / 0.05)
    phase_whoosh = 2.0 * np.pi * np.cumsum(f_whoosh) / SAMPLE_RATE
    noise = rng.normal(0, 0.3, n) * (1.0 + 0.4 * np.sin(phase_whoosh))
    whoosh_env = (t / 0.03) * np.exp(-t / 0.045)

    sig = wood_tap * 0.7 + (np.sin(phase_whoosh) * 0.4 + noise * 0.6) * whoosh_env
    sig = apply_fades(sig, fade_in_ms=2.0, fade_out_ms=25.0)
    return normalize(sig, WEAPON_SHOT_PEAK_AMP)


# ==============================================================================
# 10. shot-beads (0.14초) - 염주 구슬 부딪힘 발사음
# ==============================================================================
def synth_shot_beads():
    duration = 0.14
    n = int(duration * SAMPLE_RATE)
    t = np.linspace(0, duration, n, endpoint=False)
    sig = np.zeros(n)

    clicks = [
        (0.000, 1.00, 960.0, 1720.0, 0.022),
        (0.018, 0.65, 1080.0, 1940.0, 0.018),
        (0.038, 0.40, 1220.0, 2180.0, 0.015),
    ]
    rng = np.random.default_rng(5004)
    noise = rng.normal(0, 0.15, n)

    for onset, amp, f1, f2, tau in clicks:
        dt = t - onset
        mask = dt >= 0
        if not np.any(mask):
            continue
        dt_v = dt[mask]
        env = np.exp(-dt_v / tau)
        bead_sound = (
            0.6 * np.sin(2.0 * np.pi * f1 * dt_v) +
            0.35 * np.sin(2.0 * np.pi * f2 * dt_v) +
            0.15 * noise[mask]
        ) * env
        sig[mask] += amp * bead_sound

    sig = apply_fades(sig, fade_in_ms=1.5, fade_out_ms=20.0)
    return normalize(sig, WEAPON_SHOT_PEAK_AMP)


# ==============================================================================
# 11. shot-gourd (0.15초) - 단호로 쏟아짐·찰방 발사음
# ==============================================================================
def synth_shot_gourd():
    duration = 0.15
    n = int(duration * SAMPLE_RATE)
    t = np.linspace(0, duration, n, endpoint=False)

    f_drop = 480.0 * (1320.0 / 480.0) ** (t / 0.035)
    f_drop[t > 0.035] = 1320.0
    phase_drop = 2.0 * np.pi * np.cumsum(f_drop) / SAMPLE_RATE
    drop_env = (t / 0.01) * np.exp(-t / 0.028)
    bubble = np.sin(phase_drop) * drop_env

    sig = bubble * 0.85
    rng = np.random.default_rng(5005)
    splash_times = [(0.025, 1450.0, 0.02), (0.052, 1920.0, 0.018), (0.075, 2350.0, 0.015)]
    for st, sf, stau in splash_times:
        dt = t - st
        mask = dt >= 0
        if not np.any(mask):
            continue
        dt_v = dt[mask]
        s_env = np.exp(-dt_v / stau) * (1.0 - np.exp(-dt_v / 0.002))
        sig[mask] += 0.3 * np.sin(2.0 * np.pi * sf * dt_v) * s_env

    sig += rng.normal(0, 0.08, n) * (t / 0.04) * np.exp(-t / 0.04)
    sig = apply_fades(sig, fade_in_ms=2.0, fade_out_ms=25.0)
    return normalize(sig, WEAPON_SHOT_PEAK_AMP)


# ==============================================================================
# 12. shot-bell (0.16초) - 삼청령 방울 발사음
# ==============================================================================
def synth_shot_bell():
    duration = 0.16
    n = int(duration * SAMPLE_RATE)
    t = np.linspace(0, duration, n, endpoint=False)

    bell = (
        0.50 * np.sin(2.0 * np.pi * 2217.4 * t) * np.exp(-t / 0.055) +
        0.35 * np.sin(2.0 * np.pi * 2793.8 * t) * np.exp(-t / 0.045) +
        0.20 * np.sin(2.0 * np.pi * 5144.0 * t) * np.exp(-t / 0.030) +
        0.12 * np.sin(2.0 * np.pi * 8320.0 * t) * np.exp(-t / 0.020)
    )

    tick = np.sin(2.0 * np.pi * 3800.0 * t) * np.exp(-t / 0.008)
    sig = bell + 0.35 * tick
    sig = apply_fades(sig, fade_in_ms=1.5, fade_out_ms=30.0)
    return normalize(sig, WEAPON_SHOT_PEAK_AMP)


# ==============================================================================
# 13. shot-seal (0.16초) - 옥인 둔탁한 찍음 발사음
# ==============================================================================
def synth_shot_seal():
    duration = 0.16
    n = int(duration * SAMPLE_RATE)
    t = np.linspace(0, duration, n, endpoint=False)
    rng = np.random.default_rng(5007)

    f_thud = 50.0 + 100.0 * np.exp(-t / 0.03)
    phase_thud = 2.0 * np.pi * np.cumsum(f_thud) / SAMPLE_RATE
    thud = np.sin(phase_thud) * np.exp(-t / 0.05)

    click = np.sin(2.0 * np.pi * 1250.0 * t) * np.exp(-t / 0.012)
    noise_thud = rng.normal(0, 0.25, n) * np.exp(-t / 0.025)
    sub = 0.45 * np.sin(2.0 * np.pi * 60.0 * t) * np.exp(-t / 0.07)

    sig = 0.65 * thud + 0.45 * click + 0.35 * noise_thud + sub
    sig = apply_fades(sig, fade_in_ms=1.5, fade_out_ms=25.0)
    return normalize(sig, WEAPON_SHOT_PEAK_AMP)


# ==============================================================================
# 14. shop-buy (0.50초) - 상점 구매 효과음
# ==============================================================================
def synth_shop_buy():
    duration = 0.50
    n = int(duration * SAMPLE_RATE)
    t = np.linspace(0, duration, n, endpoint=False)
    sig = np.zeros(n)

    coin_times = [0.000, 0.025, 0.055]
    modes = [2420.0, 3550.0, 4920.0]
    for onset in coin_times:
        dt = t - onset
        mask = dt >= 0
        if not np.any(mask):
            continue
        dt_v = dt[mask]
        c_env = np.exp(-dt_v / 0.04) * (1.0 - np.exp(-dt_v / 0.001))
        coin = (
            0.5 * np.sin(2.0 * np.pi * modes[0] * dt_v) +
            0.35 * np.sin(2.0 * np.pi * modes[1] * dt_v) +
            0.2 * np.sin(2.0 * np.pi * modes[2] * dt_v)
        ) * c_env
        sig[mask] += 0.4 * coin

    chimes = [
        (0.08, 659.25, 0.45, 0.22),
        (0.16, 830.61, 0.55, 0.26),
        (0.24, 987.77, 0.65, 0.24),
    ]
    for onset, f0, amp, tau in chimes:
        dt = t - onset
        mask = dt >= 0
        if not np.any(mask):
            continue
        dt_v = dt[mask]
        ch_env = np.exp(-dt_v / tau) * (1.0 - np.exp(-dt_v / 0.003))
        ch_sound = (
            0.65 * np.sin(2.0 * np.pi * f0 * dt_v) +
            0.25 * np.sin(2.0 * np.pi * (f0 * 2.76) * dt_v) * np.exp(-dt_v / (tau * 0.5)) +
            0.15 * np.sin(2.0 * np.pi * (f0 * 4.4) * dt_v) * np.exp(-dt_v / (tau * 0.3))
        ) * ch_env
        sig[mask] += amp * ch_sound

    for st, sf in [(0.28, 3951.0), (0.34, 5274.0)]:
        dt = t - st
        mask = dt >= 0
        if not np.any(mask):
            continue
        dt_v = dt[mask]
        s_env = np.exp(-dt_v / 0.06) * (1.0 - np.exp(-dt_v / 0.002))
        sig[mask] += 0.2 * np.sin(2.0 * np.pi * sf * dt_v) * s_env

    sig = apply_fades(sig, fade_in_ms=2.0, fade_out_ms=40.0)
    return normalize(sig, SYSTEM_UI_PEAK_AMP)


# ==============================================================================
# 15. weapon-unlock (0.90초) - 새 보패 해금 효과음
# ==============================================================================
def synth_weapon_unlock():
    duration = 0.90
    n = int(duration * SAMPLE_RATE)
    t = np.linspace(0, duration, n, endpoint=False)
    sig = np.zeros(n)

    f_rise = 220.0 * (880.0 / 220.0) ** (t / 0.28)
    f_rise[t > 0.28] = 880.0
    phase_rise = 2.0 * np.pi * np.cumsum(f_rise) / SAMPLE_RATE
    rise_env = np.where(t <= 0.28, (t / 0.28) ** 1.5, np.exp(-(t - 0.28) / 0.1))
    sig += 0.35 * np.sin(phase_rise) * rise_env

    notes = [
        (0.18, 587.33, 0.35, 0.35),
        (0.28, 659.25, 0.40, 0.38),
        (0.38, 783.99, 0.50, 0.42),
        (0.48, 880.00, 0.55, 0.46),
        (0.58, 1174.66, 0.75, 0.30),
        (0.60, 1760.00, 0.45, 0.28),
    ]
    for onset, f0, amp, tau in notes:
        dt = t - onset
        mask = dt >= 0
        if not np.any(mask):
            continue
        dt_v = dt[mask]
        b_env = np.exp(-dt_v / tau) * (1.0 - np.exp(-dt_v / 0.003))
        b_sound = (
            0.60 * np.sin(2.0 * np.pi * f0 * dt_v) +
            0.28 * np.sin(2.0 * np.pi * (f0 * 2.75) * dt_v) * np.exp(-dt_v / (tau * 0.5)) +
            0.15 * np.sin(2.0 * np.pi * (f0 * 5.4) * dt_v) * np.exp(-dt_v / (tau * 0.3))
        ) * b_env
        sig[mask] += amp * b_sound

    sparkles = [(0.62, 3520.0), (0.68, 4698.0), (0.75, 5873.0)]
    for st, sf in sparkles:
        dt = t - st
        mask = dt >= 0
        if not np.any(mask):
            continue
        dt_v = dt[mask]
        s_env = np.exp(-dt_v / 0.09) * (1.0 - np.exp(-dt_v / 0.002))
        sig[mask] += 0.22 * np.sin(2.0 * np.pi * sf * dt_v) * s_env

    sig = apply_fades(sig, fade_in_ms=3.0, fade_out_ms=50.0)
    return normalize(sig, SYSTEM_UI_PEAK_AMP)


# ==============================================================================
# 16. equip-swap (0.30초) - 장착 교체 효과음
# ==============================================================================
def synth_equip_swap():
    duration = 0.30
    n = int(duration * SAMPLE_RATE)
    t = np.linspace(0, duration, n, endpoint=False)
    sig = np.zeros(n)

    rng = np.random.default_rng(5010)
    slide_noise = rng.normal(0, 0.2, n) * (t / 0.02) * np.exp(-t / 0.025)
    sig += slide_noise

    dt1 = t - 0.045
    mask1 = dt1 >= 0
    if np.any(mask1):
        dt1_v = dt1[mask1]
        sig[mask1] += 0.65 * np.sin(2.0 * np.pi * 1450.0 * dt1_v) * np.exp(-dt1_v / 0.012)

    dt2 = t - 0.075
    mask2 = dt2 >= 0
    if np.any(mask2):
        dt2_v = dt2[mask2]
        latch = (
            0.75 * np.sin(2.0 * np.pi * 2350.0 * dt2_v) +
            0.35 * np.sin(2.0 * np.pi * 4100.0 * dt2_v)
        ) * np.exp(-dt2_v / 0.018)
        sig[mask2] += latch

    dt3 = t - 0.08
    mask3 = dt3 >= 0
    if np.any(mask3):
        dt3_v = dt3[mask3]
        sig[mask3] += 0.45 * np.sin(2.0 * np.pi * 523.25 * dt3_v) * np.exp(-dt3_v / 0.12)

    sig = apply_fades(sig, fade_in_ms=2.0, fade_out_ms=35.0)
    return normalize(sig, SYSTEM_UI_PEAK_AMP)


# ==============================================================================
# 17. boost-start (0.30초, 0.25~0.4초) - 부스터 켤 때 바람 밀려나가는 '휙'
# ==============================================================================
def synth_boost_start():
    duration = 0.30
    n = int(duration * SAMPLE_RATE)
    t = np.linspace(0, duration, n, endpoint=False)
    rng = np.random.default_rng(6001)

    f_sub = 55.0 + 75.0 * np.exp(-t / 0.05)
    p_sub = 2.0 * np.pi * np.cumsum(f_sub) / SAMPLE_RATE
    sub = np.sin(p_sub) * np.exp(-t / 0.08)

    f_wind = 400.0 + 1500.0 * np.sin(np.pi * (t / duration) ** 0.6)
    p_wind = 2.0 * np.pi * np.cumsum(f_wind) / SAMPLE_RATE
    noise = rng.normal(0, 0.4, n) * (0.6 + 0.4 * np.sin(p_wind))
    env_wind = np.sin(np.pi * (t / duration) ** 0.5) ** 1.5

    sig = 0.45 * sub + noise * env_wind
    sig = apply_fades(sig, fade_in_ms=3.0, fade_out_ms=35.0)
    return normalize(sig, FIELD_PUNCH_PEAK_AMP)


# ==============================================================================
# 18. boost-loop (0.60초, 0.5~0.8초) - 부스터 누르는 동안 가벼운 바람 소리 (심리스 루프)
# ==============================================================================
def synth_boost_loop():
    duration = 0.60
    n = int(duration * SAMPLE_RATE)
    t = np.linspace(0, duration, n, endpoint=False)
    rng = np.random.default_rng(6002)

    sig = np.zeros(n)
    for k in range(35, 420):
        f = k / duration
        phi = rng.uniform(0, 2 * np.pi)
        amp = np.exp(-((np.log(f) - np.log(260.0)) ** 2) / (2 * 0.55 ** 2))
        sig += amp * np.sin(2.0 * np.pi * f * t + phi)

    pulsation = 1.0 + 0.20 * np.sin(2.0 * np.pi * 3.0 * t / duration)
    sig *= pulsation
    return normalize(sig, FIELD_LOOP_PEAK_AMP)


# ==============================================================================
# 19. eat (0.15초, 0.12~0.2초) - 적 흡수할 때 귀여운 '뽁/꿀꺽' (-8dB)
# ==============================================================================
def synth_eat():
    duration = 0.15
    n = int(duration * SAMPLE_RATE)
    t = np.linspace(0, duration, n, endpoint=False)

    f_pop = 320.0 + 500.0 * np.sin(np.pi * np.clip(t / 0.04, 0, 1) ** 0.7)
    phase_pop = 2.0 * np.pi * np.cumsum(f_pop) / SAMPLE_RATE
    env_pop = (t / 0.012) * np.exp(-t / 0.035)
    bubble = np.sin(phase_pop) * env_pop

    body = 0.35 * np.sin(2.0 * np.pi * 420.0 * t) * np.exp(-t / 0.06)

    sig = bubble + body
    sig = apply_fades(sig, fade_in_ms=1.5, fade_out_ms=25.0)
    return normalize(sig, FIELD_SOFT_PEAK_AMP)


# ==============================================================================
# 20. player-hurt (0.28초, 0.2~0.35초) - 적에게 피격 시 둔탁한 '퍽' + 짧은 하강음
# ==============================================================================
def synth_player_hurt():
    duration = 0.28
    n = int(duration * SAMPLE_RATE)
    t = np.linspace(0, duration, n, endpoint=False)
    rng = np.random.default_rng(6004)

    f_punch = 48.0 + 122.0 * np.exp(-t / 0.035)
    phase_punch = 2.0 * np.pi * np.cumsum(f_punch) / SAMPLE_RATE
    punch = np.sin(phase_punch) * np.exp(-t / 0.06)

    thud_noise = rng.normal(0, 0.3, n) * np.exp(-t / 0.02)

    f_slide = 85.0 + 155.0 * np.exp(-t / 0.09)
    phase_slide = 2.0 * np.pi * np.cumsum(f_slide) / SAMPLE_RATE
    slide = 0.55 * np.sin(phase_slide) * np.exp(-t / 0.12)

    sig = 0.65 * punch + 0.35 * thud_noise + slide
    sig = apply_fades(sig, fade_in_ms=1.5, fade_out_ms=30.0)
    return normalize(sig, FIELD_PUNCH_PEAK_AMP)


# ==============================================================================
# 21. orb-fire (0.13초, 0.1~0.16초) - 여의주 기본 발사 '슝' (-6dB)
# ==============================================================================
def synth_orb_fire():
    duration = 0.13
    n = int(duration * SAMPLE_RATE)
    t = np.linspace(0, duration, n, endpoint=False)
    rng = np.random.default_rng(6005)

    f_whoosh = 650.0 + 800.0 * np.sin(np.pi * (t / duration) ** 0.7)
    phase_whoosh = 2.0 * np.pi * np.cumsum(f_whoosh) / SAMPLE_RATE
    whoosh_noise = rng.normal(0, 0.25, n) * (0.6 + 0.4 * np.sin(phase_whoosh))
    whoosh_env = (t / 0.015) * np.exp(-t / 0.035)

    orb_core = 0.45 * np.sin(2.0 * np.pi * 740.0 * t) * np.exp(-t / 0.06)

    sig = whoosh_noise * whoosh_env + orb_core
    sig = apply_fades(sig, fade_in_ms=2.0, fade_out_ms=25.0)
    return normalize(sig, WEAPON_SHOT_PEAK_AMP)


# ==============================================================================
# 22. orb-hit (0.10초, 0.08~0.15초) - 발사체 명중 '탁/팅' (-8dB)
# ==============================================================================
def synth_orb_hit():
    duration = 0.10
    n = int(duration * SAMPLE_RATE)
    t = np.linspace(0, duration, n, endpoint=False)

    ping = (
        0.60 * np.sin(2.0 * np.pi * 1320.0 * t) * np.exp(-t / 0.018) +
        0.35 * np.sin(2.0 * np.pi * 1975.0 * t) * np.exp(-t / 0.012)
    )
    tap = 0.40 * np.sin(2.0 * np.pi * 520.0 * t) * np.exp(-t / 0.008)

    sig = ping + tap
    sig = apply_fades(sig, fade_in_ms=1.0, fade_out_ms=20.0)
    return normalize(sig, FIELD_SOFT_PEAK_AMP)


# ==============================================================================
# 전체 효과음 정의 리스트 (총 22종)
# ==============================================================================
SFX_DEFINITIONS = [
    # --- 1. 기존 강화 및 상점 효과음 6종 ---
    {
        "name": "enhance-charge",
        "synth_fn": synth_enhance_charge,
        "desc": "기운이 모이며 음이 올라가는 긴장음 (맑은 금속·구슬 울림, 끝에서 살짝 멈칫)",
        "expected_duration": 0.80,
        "min_duration": 0.60,
        "max_duration": 1.20,
        "max_peak_db": -1.0,
    },
    {
        "name": "enhance-success",
        "synth_fn": synth_enhance_success,
        "desc": "밝은 종·풍경 소리 + 반짝임",
        "expected_duration": 0.75,
        "min_duration": 0.50,
        "max_duration": 1.20,
        "max_peak_db": -1.0,
    },
    {
        "name": "enhance-great",
        "synth_fn": synth_enhance_great,
        "desc": "대성공 팡파르 (징·편종 느낌 + 반짝임 겹침)",
        "expected_duration": 1.40,
        "min_duration": 1.00,
        "max_duration": 1.60,
        "max_peak_db": -1.0,
    },
    {
        "name": "enhance-fail",
        "synth_fn": synth_enhance_fail,
        "desc": "둔탁하게 꺼지는 소리 (실망하되 듣기 싫지 않게)",
        "expected_duration": 0.50,
        "min_duration": 0.30,
        "max_duration": 1.20,
        "max_peak_db": -1.0,
    },
    {
        "name": "enhance-break",
        "synth_fn": synth_enhance_break,
        "desc": "구슬이 금 가며 깨져 흩어지는 소리",
        "expected_duration": 0.75,
        "min_duration": 0.50,
        "max_duration": 1.20,
        "max_peak_db": -1.0,
    },
    {
        "name": "sell-coins",
        "synth_fn": synth_sell_coins,
        "desc": "엽전이 쏟아지는 소리",
        "expected_duration": 0.65,
        "min_duration": 0.40,
        "max_duration": 1.20,
        "max_peak_db": -1.0,
    },
    # --- 2. 신규 보패 무기 발사 효과음 7종 (발사음: ≤0.18초, 기존 대비 -6dB 이하) ---
    {
        "name": "shot-fan",
        "synth_fn": synth_shot_fan,
        "desc": "학우선 바람 발사음 (바람 깃 흩뿌리는 날렵한 깃털 풍절음)",
        "expected_duration": 0.15,
        "min_duration": 0.05,
        "max_duration": 0.18,
        "max_peak_db": -7.2,
    },
    {
        "name": "shot-mirror",
        "synth_fn": synth_shot_mirror,
        "desc": "팔괘경 맑은 울림 발사음 (신성한 구리 거울 공명과 빛줄기 울림)",
        "expected_duration": 0.16,
        "min_duration": 0.05,
        "max_duration": 0.18,
        "max_peak_db": -7.2,
    },
    {
        "name": "shot-sword",
        "synth_fn": synth_shot_sword,
        "desc": "도목검 휘두름 발사음 (복숭아나무 퇴마 검의 단단한 타격과 날카로운 검풍)",
        "expected_duration": 0.15,
        "min_duration": 0.05,
        "max_duration": 0.18,
        "max_peak_db": -7.2,
    },
    {
        "name": "shot-beads",
        "synth_fn": synth_shot_beads,
        "desc": "염주 구슬 부딪힘 발사음 (단단한 염주 알들의 경쾌한 타닥 충돌음)",
        "expected_duration": 0.14,
        "min_duration": 0.05,
        "max_duration": 0.18,
        "max_peak_db": -7.2,
    },
    {
        "name": "shot-gourd",
        "synth_fn": synth_shot_gourd,
        "desc": "단호로 쏟아짐·찰방 발사음 (선약 호리병 약수 방울 퐁 솟구침 및 찰방임)",
        "expected_duration": 0.15,
        "min_duration": 0.05,
        "max_duration": 0.18,
        "max_peak_db": -7.2,
    },
    {
        "name": "shot-bell",
        "synth_fn": synth_shot_bell,
        "desc": "삼청령 방울 발사음 (도사의 의식용 놋쇠 요령의 청아한 방울 소리)",
        "expected_duration": 0.16,
        "min_duration": 0.05,
        "max_duration": 0.18,
        "max_peak_db": -7.2,
    },
    {
        "name": "shot-seal",
        "synth_fn": synth_shot_seal,
        "desc": "옥인 둔탁한 찍음 발사음 (묵직한 옥도장을 바닥에 쿵 찍는 단단한 타격음)",
        "expected_duration": 0.16,
        "min_duration": 0.05,
        "max_duration": 0.18,
        "max_peak_db": -7.2,
    },
    # --- 3. 신규 상점 및 시스템 효과음 3종 (시스템: ≤1.2초, 피크 ≤-1.0 dBFS) ---
    {
        "name": "shop-buy",
        "synth_fn": synth_shop_buy,
        "desc": "상점 구매 효과음 (엽전 지불 짤랑임과 기분 좋은 거래 완료 차임)",
        "expected_duration": 0.50,
        "min_duration": 0.20,
        "max_duration": 1.20,
        "max_peak_db": -1.0,
    },
    {
        "name": "weapon-unlock",
        "synth_fn": synth_weapon_unlock,
        "desc": "새 보패 해금 효과음 (봉인 해제 기운과 동양 5음계 승전 해금 팡파르)",
        "expected_duration": 0.90,
        "min_duration": 0.40,
        "max_duration": 1.20,
        "max_peak_db": -1.0,
    },
    {
        "name": "equip-swap",
        "synth_fn": synth_equip_swap,
        "desc": "장착 교체 효과음 (보패 무기 찰칵 체결 잠금 및 옥 공명 안정음)",
        "expected_duration": 0.30,
        "min_duration": 0.15,
        "max_duration": 1.20,
        "max_peak_db": -1.0,
    },
    # --- 4. 필드 인게임 효과음 6종 (추가 과제: 부스터/흡수/피격/발사/명중) ---
    {
        "name": "boost-start",
        "synth_fn": synth_boost_start,
        "desc": "부스터 시동음 (부스터 켤 때 바람이 밀려 나가는 '휙')",
        "expected_duration": 0.30,
        "min_duration": 0.25,
        "max_duration": 0.40,
        "max_peak_db": -1.0,
    },
    {
        "name": "boost-loop",
        "synth_fn": synth_boost_loop,
        "desc": "부스터 지속 루프음 (부스터 누르는 동안 가벼운 바람 소리, 심리스 루프)",
        "expected_duration": 0.60,
        "min_duration": 0.50,
        "max_duration": 0.80,
        "max_peak_db": -1.0,
    },
    {
        "name": "eat",
        "synth_fn": synth_eat,
        "desc": "요괴 흡수/먹기음 (적을 흡수할 때 귀여운 '뽁/꿀꺽', -8dB)",
        "expected_duration": 0.15,
        "min_duration": 0.12,
        "max_duration": 0.20,
        "max_peak_db": -8.0,
    },
    {
        "name": "player-hurt",
        "synth_fn": synth_player_hurt,
        "desc": "플레이어 피격음 (적에게 맞았을 때 둔탁한 '퍽' + 짧은 하강음)",
        "expected_duration": 0.28,
        "min_duration": 0.20,
        "max_duration": 0.35,
        "max_peak_db": -1.0,
    },
    {
        "name": "orb-fire",
        "synth_fn": synth_orb_fire,
        "desc": "여의주 기본 발사음 (여의주 구슬 기본 발사 '슝', -6dB)",
        "expected_duration": 0.13,
        "min_duration": 0.10,
        "max_duration": 0.16,
        "max_peak_db": -6.0,
    },
    {
        "name": "orb-hit",
        "synth_fn": synth_orb_hit,
        "desc": "발사체 명중음 (구슬이 적에게 맞을 때 찰진 '탁/팅', -8dB)",
        "expected_duration": 0.10,
        "min_duration": 0.08,
        "max_duration": 0.15,
        "max_peak_db": -8.0,
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

    force_all = "--all" in sys.argv

    print("=" * 85)
    print(" 요괴 성장 게임(yokai-game) 사운드 효과음 합성 및 생성 스크립트")
    print("=" * 85)
    print(f"출력 경로: {output_dir}")
    print(f"샘플링 레이트: {SAMPLE_RATE} Hz (모노)")
    print(f"기존 파일 보존 정책: {'전체 재생성(--all)' if force_all else '기존 6종 원본 파일 보존 및 신규 음원 생성'}\n")

    results = []

    for item in SFX_DEFINITIONS:
        name = item["name"]
        fn = item["synth_fn"]
        desc = item["desc"]
        min_duration = item.get("min_duration", 0.0)
        max_duration = item.get("max_duration", 1.60)
        max_peak_db = item.get("max_peak_db", -1.0)

        wav_filename = f"{name}.wav"
        ogg_filename = f"{name}.ogg"
        mp3_filename = f"{name}.mp3"

        wav_path = os.path.join(output_dir, wav_filename)
        ogg_path = os.path.join(output_dir, ogg_filename)
        mp3_path = os.path.join(output_dir, mp3_filename)

        # 기존 원본 6종 효과음 보존
        if name in ORIGINAL_SFX_NAMES and not force_all and os.path.exists(wav_path) and os.path.exists(ogg_path) and os.path.exists(mp3_path):
            print(f"[-] 기존 음원 보존 (건너뜀): {name}")
            sr, data = wavfile.read(wav_path)
            actual_len_sec = len(data) / float(sr)
            peak_db = 20.0 * np.log10(max(float(np.max(np.abs(data))) / 32767.0, 1e-9))
            wav_size_kb = os.path.getsize(wav_path) / 1024.0
            ogg_size_kb = os.path.getsize(ogg_path) / 1024.0
            mp3_size_kb = os.path.getsize(mp3_path) / 1024.0

            results.append({
                "name": name,
                "desc": desc,
                "duration": actual_len_sec,
                "min_duration": min_duration,
                "max_duration": max_duration,
                "peak_db": peak_db,
                "max_peak_db": max_peak_db,
                "wav_kb": wav_size_kb,
                "ogg_kb": ogg_size_kb,
                "mp3_kb": mp3_size_kb,
                "is_new": False,
            })
            continue

        print(f"[*] 합성 및 인코딩 중: {name} ({desc})...")
        audio = fn()

        actual_len_sec = len(audio) / SAMPLE_RATE
        peak_amp = float(np.max(np.abs(audio)))
        peak_db = 20.0 * np.log10(max(peak_amp, 1e-9))

        audio_int16 = (audio * 32767.0).astype(np.int16)

        wavfile.write(wav_path, SAMPLE_RATE, audio_int16)
        convert_audio(wav_path, ogg_path, mp3_path)

        wav_size_kb = os.path.getsize(wav_path) / 1024.0
        ogg_size_kb = os.path.getsize(ogg_path) / 1024.0
        mp3_size_kb = os.path.getsize(mp3_path) / 1024.0

        results.append({
            "name": name,
            "desc": desc,
            "duration": actual_len_sec,
            "min_duration": min_duration,
            "max_duration": max_duration,
            "peak_db": peak_db,
            "max_peak_db": max_peak_db,
            "wav_kb": wav_size_kb,
            "ogg_kb": ogg_size_kb,
            "mp3_kb": mp3_size_kb,
            "is_new": True,
        })

        print(f"    - 길이: {actual_len_sec:.2f}초 (허용: {min_duration:.2f}~{max_duration:.2f}초) | 피크: {peak_db:.2f} dBFS (기준: ≤{max_peak_db:.2f} dBFS)")
        print(f"    - 파일 크기: WAV {wav_size_kb:.1f} KB | OGG {ogg_size_kb:.1f} KB | MP3 {mp3_size_kb:.1f} KB")

    print("\n" + "=" * 85)
    print(" 전체 사운드 생성 및 검증 완료 요약 표")
    print("=" * 85)
    header = f"{'효과음 이름':<16} | {'구분':<4} | {'길이':<7} | {'피크(dBFS)':<11} | {'WAV(KB)':<8} | {'OGG(KB)':<8} | {'MP3(KB)':<8} | {'규격 준수':<8}"
    print(header)
    print("-" * len(header))
    for r in results:
        kind = "신규" if r.get("is_new") else "기존"
        valid_size = r["ogg_kb"] <= 60.0 and r["mp3_kb"] <= 60.0
        valid_peak = r["peak_db"] <= r["max_peak_db"] + 0.05
        valid_len = (r["min_duration"] - 0.01) <= r["duration"] <= (r["max_duration"] + 0.01)
        status = "통과" if (valid_size and valid_peak and valid_len) else "초과"
        print(f"{r['name']:<16} | {kind:<4} | {r['duration']:>5.2f}초 | {r['peak_db']:>9.2f} | {r['wav_kb']:>6.1f} KB | {r['ogg_kb']:>6.1f} KB | {r['mp3_kb']:>6.1f} KB | {status}")

    print("=" * 85)


if __name__ == "__main__":
    main()
