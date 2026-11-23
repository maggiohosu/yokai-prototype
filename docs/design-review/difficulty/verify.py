import json
import re
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

url = "http://127.0.0.1:8765"
out = Path(sys.argv[1])
out.mkdir(parents=True, exist_ok=True)
with sync_playwright() as api:
    browser = api.chromium.launch(executable_path="C:/Program Files/Google/Chrome/Application/chrome.exe", headless=True,
                                  args=["--disable-dev-shm-usage", "--enable-unsafe-swiftshader"])
    context = browser.new_context(viewport={"width": 1024, "height": 576}, locale="ko-KR")
    page = context.new_page()
    expect.set_options(timeout=15000)
    page.on("console", lambda msg: print("콘솔", msg.text, flush=True) if msg.type == "error" else None)
    page.on("requestfailed", lambda req: print("요청 실패", req.url, req.failure, flush=True))
    page.set_default_timeout(14000)
    page.on("pageerror", lambda exc: print("브라우저 오류",str(exc),flush=True))
    def capture(name):
        page.screenshot(path=out / (name + ".png"), animations="disabled")
    def saved(slot=2):
        return page.evaluate("(s) => JSON.parse(localStorage.getItem('yokai-proto-v1-slot-'+s))?.progress ?? null",slot)
    def hook_scene():
        page.evaluate("""async () => {
            const {PlayScene} = await import('./src/scenes/PlayScene.js');
            const create = PlayScene.prototype.create;
            PlayScene.prototype.create = function(data) { create.call(this, data); window.testScene = this; };
        }""")
    def playing():
        page.wait_for_function("window.testScene && !testScene.ended && testScene.enemies.length > 0")
    def collide():
        page.evaluate("""() => {
            const s = testScene;
            const e = s.enemies.find(e => e.sprite.active);
            e.setSize(s.player.size * 2);
            e.sprite.setPosition(s.player.x, s.player.y);
        }""")
        expect(page.locator("#result")).to_be_visible()
    page.goto(url, wait_until="domcontentloaded")
    expect(page.locator(".title-screen")).to_be_visible()
    hook_scene()
    # 별도 브라우저 저장소의 이웃 슬롯. 마지막 판의 삭제 범위를 검증한다.
    page.evaluate("""async () => {const s = await import('./src/state/save.js'); s.startNewSlot(1, localStorage, 'easy');}""")
    neighbor = saved(1)
    page.locator('[data-slot="2"] [data-action="new"]').click()
    hard = page.get_by_role("button", name=re.compile("하드"))
    expect(hard).to_be_visible()
    capture("01-difficulty")
    hard.click()
    playing()
    assert saved()["difficulty"] == "hard" and saved()["lives"] == 10
    expect(page.locator(".hud")).to_contain_text(re.compile(r"목숨\s*10"))
    capture("02-hard-hud-10")
    page.get_by_role("button", name=re.compile("정비 화면 열기")).click()
    page.get_by_role("button", name="게임으로 돌아가기").click()
    assert saved()["lives"] == 10
    log = []
    for expected in range(9,-1,-1):
        playing()
        if expected == 8:
            page.evaluate("() => { const s = testScene; s.applyEnemyHits([{x:s.player.x, y:s.player.y, damage:1000}]); }")
            expect(page.locator("#result")).to_be_visible()
        else:
            collide()
        text = page.locator("#result").inner_text()
        assert re.search(fr"남은 목숨\s*{expected}\b", text), text
        data = saved()
        assert (data is None and expected == 0) or (data and data["lives"] == expected), data
        assert saved(1) == neighbor
        log.append({"결과창":expected, "저장": data["lives"] if data else None})
        if expected == 9:
            capture("03-defeat-9")
            page.reload(wait_until="domcontentloaded")
            card = page.locator('[data-slot="2"]')
            expect(card).to_contain_text("하드")
            expect(card).to_contain_text(re.compile(r"목숨\s*9"))
            capture("04-saved-slot-9")
            hook_scene()
            card.locator('[data-action="continue"]').click()
        elif expected == 0:
            assert "캐릭터가 사라졌습니다" in text
            capture("05-final-defeat")
            page.locator("#result").get_by_role("button", name=re.compile("시작 화면")).click()
        else:
            page.locator("#restart").click()
        print("결과창", expected,flush=True)
    empty = page.locator('[data-slot="2"]')
    expect(empty).to_have_attribute("data-state", "empty")
    assert empty.get_by_role("button", name=re.compile("이어하기")).count() == 0
    assert saved() is None and saved(1) == neighbor
    capture("06-title-after-erasure")
    page.reload(wait_until="domcontentloaded")
    expect(empty).to_have_attribute("data-state", "empty")
    hook_scene()
    empty.locator('[data-action="new"]').click()
    page.get_by_role("button", name=re.compile("하드")).click()
    playing()
    page.evaluate("""() => {const s = testScene; Object.assign(s.progress, {stage:5,formId:'cheonho'}); s.player.stage = 5; s.player.setSize(150);}""")
    expect(page.locator("#result")).to_have_attribute("data-outcome", "ascension")
    expect(page.locator("#result")).to_contain_text(re.compile(r"남은 목숨\s*10"))
    assert saved()["lives"] == 10
    capture("07-ascension-10")
    print(json.dumps({"Chrome":browser.version,"연속 패배":log,"승천":saved()["lives"],"다른 슬롯":saved(1)["difficulty"]},ensure_ascii=False),flush=True)
    page.reload(wait_until="domcontentloaded")
    expect(page.locator(".title-screen")).to_be_visible()
    hook_scene()
    page.locator('[data-slot="3"] [data-action="new"]').click()
    page.get_by_role("button", name=re.compile("이지")).click()
    playing()
    expect(page.locator(".booster-button")).to_be_hidden()
    expect(page.locator(".fire-button")).to_be_hidden()
    expect(page.locator("#lives-stat")).to_be_hidden()
    page.evaluate("""() => {
        const s = testScene, fire = s.combat.fire.bind(s.combat);
        window.shots = [];
        s.combat.fire = (...args) => { shots.push(s.simTime); return fire(...args); };
    }""")
    page.keyboard.down("Shift")
    page.wait_for_function("shots.length >= 3")
    easy = page.evaluate("""() => ({
        speed:testScene.playerStats.speed, pace:testScene.playerStats.pace, boostMult:testScene.boostMult,
        boostHeld:testScene.boostHeld, gauge:testScene.booster.value, cooldown:testScene.combat.cooldownMax,
        shots:shots.slice(0,3), boostButtons:document.querySelectorAll('.booster-button:not([hidden])').length,
        fireButtons:document.querySelectorAll('.fire-button:not([hidden])').length
    })""")
    assert easy["speed"] == 131 and not easy["boostHeld"] and easy["boostMult"] == 1, easy
    assert easy["boostButtons"] == easy["fireButtons"] == 0
    intervals = [b-a for a,b in zip(easy["shots"],easy["shots"][1:])]
    assert all(easy["cooldown"]-1e-8 <= dt < easy["cooldown"]+0.04 for dt in intervals)
    page.keyboard.up("Shift")
    capture("08-easy-auto-fire")
    page.get_by_role("button", name=re.compile("정비 화면 열기")).click()
    before = page.evaluate("shots.length")
    page.wait_for_timeout(1250)
    assert page.evaluate("shots.length") == before
    page.get_by_role("button", name="게임으로 돌아가기").click()
    page.wait_for_function("n => shots.length > n",arg=before)
    print(json.dumps({"이지":easy,"정비 중 추가 발사":0},ensure_ascii=False),flush=True)
    browser.close()
