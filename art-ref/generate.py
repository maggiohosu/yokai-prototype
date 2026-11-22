#!/usr/bin/env python
"""ComfyUI API(/prompt)로 IPAdapter 워크플로를 보내 참고 시안을 뽑는다. 표준 라이브러리만 쓴다.

예)
  python art-ref/generate.py --ref art-ref/style-ref/littleTiger.png \
      --prompt "kumiho, nine-tailed fox mascot ..." --seed 7 --out art-ref/concepts/kumiho.png

--webp 를 주면 Pillow 가 있을 때 512px webp 로도 저장한다(ComfyUI venv 의 python 으로 실행하면 된다).
"""
import argparse
import copy
import json
import mimetypes
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

HERE = Path(__file__).resolve().parent

# workflow-ipadapter.json 의 노드 번호
NODE_CKPT, NODE_REF, NODE_IPA, NODE_POS, NODE_NEG, NODE_LATENT, NODE_SAMPLER, NODE_SAVE = (
    "1", "3", "4", "5", "6", "7", "8", "10",
)


def http_json(url, payload=None):
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as res:
            return json.loads(res.read())
    except urllib.error.HTTPError as e:
        sys.exit(f"HTTP {e.code} from {url}\n{e.read().decode('utf-8', 'replace')}")
    except urllib.error.URLError as e:
        sys.exit(f"ComfyUI 서버에 연결할 수 없다 ({url}): {e.reason}\n"
                 "먼저 서버를 켠다: C:\\Users\\SG\\ComfyUI\\run_comfyui.bat")


def upload_image(server, path):
    """기준 그림을 ComfyUI input 폴더로 올리고 서버가 정한 파일명을 돌려준다."""
    boundary = uuid.uuid4().hex
    mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    head = (
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"image\"; filename=\"{path.name}\"\r\n"
        f"Content-Type: {mime}\r\n\r\n"
    ).encode()
    tail = (
        f"\r\n--{boundary}\r\nContent-Disposition: form-data; name=\"overwrite\"\r\n\r\ntrue"
        f"\r\n--{boundary}--\r\n"
    ).encode()
    req = urllib.request.Request(
        f"{server}/upload/image",
        data=head + path.read_bytes() + tail,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    with urllib.request.urlopen(req, timeout=60) as res:
        return json.loads(res.read())["name"]


def run_one(server, graph, client_id):
    """워크플로 한 번 실행. (PNG 바이트, 서버 측 실행 시간 초)를 돌려준다."""
    prompt_id = http_json(f"{server}/prompt", {"prompt": graph, "client_id": client_id})["prompt_id"]
    wall = time.time()
    while True:
        hist = http_json(f"{server}/history/{prompt_id}").get(prompt_id)
        if hist and hist.get("status", {}).get("completed") is not None:
            break
        time.sleep(0.5)
    status = hist["status"]
    if status.get("status_str") == "error":
        sys.exit("생성 실패:\n" + json.dumps(status.get("messages", [])[-3:], ensure_ascii=False, indent=1))
    stamps = {m[0]: m[1].get("timestamp") for m in status["messages"] if m[0] in ("execution_start", "execution_success")}
    if len(stamps) == 2:
        seconds = (stamps["execution_success"] - stamps["execution_start"]) / 1000
    else:  # 캐시 적중 등으로 메시지가 없으면 벽시계 시간
        seconds = time.time() - wall
    img = hist["outputs"][NODE_SAVE]["images"][0]
    query = urllib.parse.urlencode({k: img[k] for k in ("filename", "subfolder", "type")})
    with urllib.request.urlopen(f"{server}/view?{query}", timeout=60) as res:
        return res.read(), seconds


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--server", default="http://127.0.0.1:8188")
    ap.add_argument("--workflow", default=str(HERE / "workflow-ipadapter.json"))
    ap.add_argument("--ref", required=True, help="그림체 기준 그림(PNG/JPG)")
    ap.add_argument("--prompt", help="긍정 프롬프트(생략하면 워크플로 기본값)")
    ap.add_argument("--negative", help="부정 프롬프트(생략하면 워크플로 기본값)")
    ap.add_argument("--seed", type=int, default=1, help="첫 시드. --count 가 2 이상이면 1씩 늘려 간다")
    ap.add_argument("--count", type=int, default=1)
    ap.add_argument("--weight", type=float, help="IPAdapter 강도(기본 0.6). 높을수록 기준 그림을 닮는다")
    ap.add_argument("--end-at", type=float, help="IPAdapter 를 적용할 샘플링 구간의 끝(0~1, 기본 0.85). 낮추면 형태는 프롬프트가 잡는다")
    ap.add_argument("--steps", type=int)
    ap.add_argument("--cfg", type=float)
    ap.add_argument("--out", required=True, help="저장 경로(.png). --count 2 이상이면 _<시드> 가 붙는다")
    ap.add_argument("--webp", action="store_true", help="512px webp 도 함께 저장(Pillow 필요)")
    a = ap.parse_args()

    server = a.server.rstrip("/")
    http_json(f"{server}/system_stats")  # 서버가 꺼져 있으면 여기서 안내 메시지를 내고 끝난다
    graph = json.loads(Path(a.workflow).read_text(encoding="utf-8"))
    ref = Path(a.ref)
    if not ref.is_file():
        sys.exit(f"기준 그림이 없다: {ref}")
    graph[NODE_REF]["inputs"]["image"] = upload_image(server, ref)
    if a.prompt:
        graph[NODE_POS]["inputs"]["text"] = a.prompt
    if a.negative:
        graph[NODE_NEG]["inputs"]["text"] = a.negative
    if a.weight is not None:
        graph[NODE_IPA]["inputs"]["weight"] = a.weight
    if a.end_at is not None:
        graph[NODE_IPA]["inputs"]["end_at"] = a.end_at
    if a.steps:
        graph[NODE_SAMPLER]["inputs"]["steps"] = a.steps
    if a.cfg:
        graph[NODE_SAMPLER]["inputs"]["cfg"] = a.cfg

    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    client_id = uuid.uuid4().hex
    for i in range(a.count):
        seed = a.seed + i
        g = copy.deepcopy(graph)
        g[NODE_SAMPLER]["inputs"]["seed"] = seed
        png, seconds = run_one(server, g, client_id)
        path = out if a.count == 1 else out.with_name(f"{out.stem}_{seed}{out.suffix or '.png'}")
        path.write_bytes(png)
        print(f"seed={seed} {seconds:.1f}s -> {path}")
        if a.webp:
            try:
                from PIL import Image
            except ImportError:
                sys.exit("--webp 에는 Pillow 가 필요하다(ComfyUI venv 의 python 으로 실행).")
            im = Image.open(path).convert("RGB").resize((512, 512), Image.LANCZOS)
            im.save(path.with_suffix(".webp"), "WEBP", quality=90)


if __name__ == "__main__":
    main()
