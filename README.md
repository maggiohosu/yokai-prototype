# 요괴 키우기

저장소 루트에서 `python -m http.server 8000`을 실행한 뒤 [들판](http://localhost:8000/index.html) 또는 [17종 요괴 도감](http://localhost:8000/index.html?gallery=1)을 연다. 빌드는 필요 없으며 Phaser 3.90.0은 jsDelivr에서 불러온다.

휴대폰에서는 왼쪽 화면을 누르고 끌어 이동한다. 키보드에서는 WASD 또는 방향키를 사용한다. 자신보다 충분히 작은 요괴와 겹치면 먹고, 더 큰 요괴에게 먹히면 판이 끝난다.

게임 수치는 `src/config.js`, 형태와 부품 조합은 `src/data/forms.js`에서 조정한다.
