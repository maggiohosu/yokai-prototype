// 판 중 [정비] 버튼: 화면 위쪽, 도감 버튼 옆. 누르면 onPress가 불린다(판 멈춤·정비 화면은 PlayScene이 맡는다).
// 엄지로 조작하는 아래쪽 스틱·발사·부스터 영역과 겹치지 않게 위쪽에 둔다. 모양은 overlay.css의 .field-maint.
export class MaintButton {
  constructor(surface, onPress) {
    this.disabled = false;
    this.button = document.createElement('button');
    this.button.className = 'field-maint';
    this.button.type = 'button';
    this.button.textContent = '정비';
    this.button.setAttribute('aria-label', '정비 화면 열기, 판이 멈춥니다');
    surface.append(this.button);

    this.events = new AbortController();
    const options = { signal: this.events.signal };
    // 이동 스틱·발사 버튼을 잡고 있는 다른 손가락의 입력과 섞이지 않게 이 버튼에서 끊는다.
    this.button.addEventListener('pointerdown', (event) => event.stopPropagation(), options);
    this.button.addEventListener('click', () => {
      if (!this.disabled) onPress();
    }, options);
  }

  // 정비·성장 카드가 열려 있는 동안은 누를 수 없다.
  setDisabled(disabled) {
    this.disabled = disabled;
    this.button.disabled = disabled;
  }

  destroy() {
    this.events.abort();
    this.button.remove();
  }
}
