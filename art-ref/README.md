# art-ref — 캐릭터 참고 시안 뽑기 (ComfyUI + IPAdapter Plus)

게임 캐릭터의 **참고 시안**을 기존 도감 그림체로 뽑아 보는 도구다. 여기서 나온 그림은 게임에 직접 넣지 않는다.
디자인 담당이 시안을 보고 부품 조립식(`src/art/creature.js`)으로 다시 그린다.

```
art-ref/
├─ README.md                 이 문서
├─ workflow-ipadapter.json   ComfyUI API 형식 워크플로 (SD1.5 + IPAdapter Plus)
├─ generate.py               API(/prompt)로 한 장(또는 여러 장) 뽑는 스크립트 (표준 라이브러리만 사용)
├─ style-ref/                그림체 기준 그림 (도감의 실제 캐릭터를 크림 배경에 올린 512px PNG)
├─ concepts/                 생성 결과 4장 (512px webp, 구미호 시안)
└─ style-compare.png         기준 그림(위)과 생성 4장(아래) 비교 시트
```

## 설치 위치 (저장소 밖)

| 항목 | 위치 / 버전 |
|---|---|
| ComfyUI | `C:\Users\SG\ComfyUI` (git clone, 커밋 `4c2b826`, v0.46.0) |
| 전용 venv | `C:\Users\SG\ComfyUI\venv` (uv, Python 3.12.13, torch 2.11.0+cu128) |
| IPAdapter 노드 | `C:\Users\SG\ComfyUI\custom_nodes\ComfyUI_IPAdapter_plus` (커밋 `a0f451a`) |
| 서버 실행 스크립트 | `C:\Users\SG\ComfyUI\run_comfyui.bat` |

시스템 전역 설정(PATH·레지스트리·드라이버)은 건드리지 않았다. 지우려면 `C:\Users\SG\ComfyUI` 폴더만 삭제하면 된다.

### 모델 (공식 Hugging Face 저장소에서만 받음, 파일 크기 검증 완료)

| 파일 | 위치(`ComfyUI/models/…`) | 출처 | 라이선스 |
|---|---|---|---|
| `v1-5-pruned-emaonly.safetensors` (4.27GB) — **Stable Diffusion 1.5** | `checkpoints/` | `stable-diffusion-v1-5/stable-diffusion-v1-5` | **CreativeML OpenRAIL-M** (상업 이용 허용, 불법·유해 용도 금지 등 사용 제한 조항 있음) |
| `CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors` (2.53GB) — CLIP Vision ViT-H | `clip_vision/` | `h94/IP-Adapter` → `models/image_encoder/model.safetensors` (README 규칙대로 이름 변경) | 저장소 라이선스 Apache-2.0 |
| `ip-adapter-plus_sd15.safetensors` (98MB) | `ipadapter/` | `h94/IP-Adapter` → `models/` | Apache-2.0 |

- 원래 SD1.5 공식 저장소(`runwayml/stable-diffusion-v1-5`)는 내려갔다. `stable-diffusion-v1-5/stable-diffusion-v1-5`는 그 후속으로 운영되는 저장소이고 라이선스 표기는 같다.
- ComfyUI와 IPAdapter 노드 코드는 GPL-3.0이다. 코드를 이 저장소에 복사하지 않았고 외부 도구로만 쓴다.
- 이 시안은 참고용이다. 최종 그림은 디자인 담당이 다시 그리므로 모델 생성물이 게임에 들어가지 않는다.

## 사용법

### 1) 서버 켜기

```bat
C:\Users\SG\ComfyUI\run_comfyui.bat
```

내용은 아래와 같다(창을 숨기고 백그라운드로 띄우려면 PowerShell의 `Start-Process -WindowStyle Hidden`을 쓴다).

```bat
cd /d C:\Users\SG\ComfyUI
venv\Scripts\python.exe main.py --listen 127.0.0.1 --port 8188 --fp32-vae --disable-auto-launch
```

- 뜰 때까지 20~30초. `http://127.0.0.1:8188/system_stats` 가 응답하면 준비된 것이다. 브라우저로 `http://127.0.0.1:8188` 을 열면 ComfyUI 화면에서도 쓸 수 있다.
- GTX 1660 SUPER에서는 ComfyUI가 UNet을 자동으로 fp32로 올린다(`model weight dtype torch.float32`). 그래서 16xx의 fp16 검은 이미지 문제는 나지 않았다. `--fp32-vae`는 안전 장치로 넣어 두었다.
- 포트 8188만 로컬(127.0.0.1)로 연다. 끌 때는 해당 python 프로세스를 종료한다.

### 2) API로 뽑기

```bash
# 한 장
python art-ref/generate.py --ref art-ref/style-ref/skyHound.png --seed 31 --out art-ref/concepts/test.png

# 시드 31~34, 네 장 + 512px webp 같이 저장 (webp는 Pillow가 필요하므로 ComfyUI venv의 python으로 실행)
C:\Users\SG\ComfyUI\venv\Scripts\python.exe art-ref/generate.py --ref art-ref/style-ref/skyHound.png --seed 31 --count 4 --webp --out art-ref/concepts/kumiho.png

# 다른 캐릭터: 프롬프트(영문)만 바꾼다
python art-ref/generate.py --ref art-ref/style-ref/skyHound.png --seed 5 --out out.png --prompt "cute kawaii mascot of a dokkaebi, small horn, front view, full body, chibi, thick dark outline, flat colors, (plain pale cream background:1.4), one character centered, no text"
```

옵션: `--weight`(IPAdapter 강도, 기본 0.6), `--end-at`(적용 구간 끝, 기본 0.85), `--steps`(25), `--cfg`(7), `--negative`, `--server`, `--workflow`.
`--ref`로 준 그림은 스크립트가 서버의 `input/`에 올려 준다. 서버가 꺼져 있으면 켜는 방법을 알려 주고 끝난다.

### 3) 튜닝 요령 (시험으로 확인한 것)

- **기준 그림은 배경을 크림색으로 맞춘 정사각 그림**을 쓴다. 기준의 배경색과 팔레트가 결과에 그대로 따라온다.
- **기준 그림의 생김새와 색이 결과로 번진다.** `hillFox`(초록 여우)를 기준으로 쓰면 결과가 초록이 된다. 그림체만 빌리고 싶으면 색·종이 다른 그림(`skyHound`, 뾰족 귀 흰 짐승)을 쓰고 프롬프트로 종을 지정한다.
- 강도 0.6 이상이면 기준 그림과 닮고, 0.35~0.5로 낮추면 프롬프트를 더 따르지만 **배경이 어두워지고 글자·워터마크 같은 무늬가 생긴다.** 낮출 때는 `(plain pale cream background:1.4)`와 부정 프롬프트의 `(text:1.4), (watermark:1.4), dark background`를 반드시 유지한다.
- `style-ref/`에 도감 캐릭터를 더 넣고 싶으면 갤러리 화면(`index.html?gallery=1`)의 `<img>` data URL을 PNG로 저장해 크림 배경 512px에 올리면 된다.
- 이미지 생성 규칙 스킬(`image-generation`) 중 이 시안에 해당하는 것만 적용했다: 자연스러운 색감·채도 절제(1·5번), 단순한 배경·한 개념·글자 금지(4번), 단일 광원·접촉 그림자(7번). 사진 전용 항목(렌즈·심도·썸네일 구도·우연한 순간)은 건너뛰었다.

## 시험 결과 (구미호 시안, GTX 1660 SUPER 6GB, 512×512, 25스텝)

프롬프트: 구미호(아홉 꼬리 여우) 귀여운 마스코트, 굵은 외곽선, 크림색 배경, 정면, 전신 (영문, `workflow-ipadapter.json` 안에 있음).
기준 그림: `style-ref/skyHound.png`(도감의 천구). 설정: IPAdapter Plus, 강도 0.6, 적용 구간 0~0.85, dpmpp_2m / karras, cfg 7.

| 항목 | 측정값 |
|---|---|
| 한 장 생성 시간 | 서버 켠 직후 첫 장 약 25~29초(모델 불러오기 포함), 이후 **14~18초/장** (약 1.2~1.8 it/s) |
| 4장 연속 | 62.6초(클라이언트 벽시계, 업로드 포함) |
| GPU 메모리(nvidia-smi 전체) | ComfyUI 기동 전 2.9GB(다른 앱), 기동 후 대기 4.1GB, **생성 중 최대 5.4GB / 6.1GB** (ComfyUI 몫 약 2.5GB). GPU 사용률 최대 98% |
| 저장 용량 | webp 한 장 19~24KB |

### 그림체 일치 정도 — 비교는 `style-compare.png`

- **맞는 것**: 굵은 짙은 외곽선, 납작한 색면, 크고 반짝이는 붉은 눈, 크림색 바탕, 둥근 체형, 뾰족한 여우 귀 — 같은 게임의 캐릭터로 보이는 수준의 "분위기"는 재현된다. 도감 속에 넣으면 한눈에 튀지는 않는다.
- **다른 것**: 기준 그림은 외곽선 굵기가 균일하고 깔끔한데, 생성 그림은 외곽선이 더 굵고 들쭉날쭉하다. 볼터치·몸통 하이라이트·줄무늬 같은 세부 문법은 일정하지 않다. 몸 구조(다리·꼬리)가 가끔 어색하다.
- **되지 않은 것**: **아홉 꼬리는 표현되지 않았다.** 몸 뒤에 꼬리 덩어리처럼 보이는 형태가 일부 보이는 정도다(SD1.5는 개수 지시를 못 따른다). 프롬프트에 `(nine fluffy tails:1.4)`를 넣어도 마찬가지였다.
- 결론: 그림체 방향을 잡는 **분위기 시안**으로는 쓸 만하다. 정확한 설정(꼬리 수 등)이나 구조는 시안에서 얻을 수 없으므로, 디자인 담당이 `docs/research-bestiary.md` 같은 설정 자료를 기준으로 부품을 다시 짜야 한다.

## 재설치 (다른 PC에서 같은 환경을 만들 때)

```powershell
git clone --depth 1 https://github.com/comfyanonymous/ComfyUI.git C:\Users\SG\ComfyUI
cd C:\Users\SG\ComfyUI
uv venv --python 3.12 venv
uv pip install --python venv\Scripts\python.exe torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu128
uv pip install --python venv\Scripts\python.exe -r requirements.txt
git clone --depth 1 https://github.com/cubiq/ComfyUI_IPAdapter_plus.git custom_nodes\ComfyUI_IPAdapter_plus
# 모델 3개: 위 표의 출처에서 받아 표의 위치·이름으로 저장 (models\ipadapter 폴더는 새로 만든다)
```

설치 중 겪은 일: 첫 `requirements.txt` 설치가 uv 캐시의 scipy 오류(`METADATA` 없음)로 중간에 끊겨, `anyio`·`h11`·`hf-xet`·`safetensors` 4개 패키지의 파일 일부가 빠진 채 남았다. 서버가 `No module named 'h11._connection'`으로 죽어서 발견했고, `uv pip install --no-cache --reinstall-package …`로 해결했다. 같은 증상이 나면 venv의 각 `*.dist-info/RECORD`와 실제 파일을 대조해 빠진 패키지를 찾아 재설치하면 된다. uv 관리 Python 3.12에도 `python.exe`가 빠져 있어 `uv python install 3.12 --reinstall`을 한 번 했다.
