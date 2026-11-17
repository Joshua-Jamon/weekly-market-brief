# Weekly Market Brief

매주 월요일 아침, 지난 한 주의 해상·항공 운임 시황을 A4 1장 분량 웹페이지로 자동 생성합니다.

## 무엇이 들어가는가
- 운임 지수 4종 (SCFI · KCCI · BDI · BAI)
- 컨테이너 / 벌크 운임 추이 그래프
- 주요 항로 6종 전주 대비
- 지난 한 주 업계 기사 요약 (근거 기사 번호 포함)

## 원칙
- 수치는 **각 출처가 발표한 값을 그대로** 옮긴다. 자료에 없는 값은 추정하지 않고 `[확인 필요]`로 둔다.
- 모든 수치에 **기준일**을 함께 표기한다. 지수마다 발표 요일이 다르다.
- 운임 전망·권고 같은 **판단성 문장은 쓰지 않는다**. 사실 정리까지만.
- 수집 실패는 조용히 비우지 않고 **사유와 함께 표시**한다.

## 출처
- [forwarder.kr 운임지수](https://www.forwarder.kr/freight/index) — SCFI · CCFI · KCCI · BDI
- [한국해양진흥공사 해양정보서비스](https://www.kobc.or.kr/ebz/shippinginfo/main.do) — KCCI 항로별 · 시계열
- 공개 기사 (Google News RSS, Splash247, gCaptain, Container News) — 항공 BAI 및 업계 동향

## 실행
```bash
node run.mjs            # 수집 → 생성 → public/ 에 저장
node --test tests/      # 테스트
```
매주 월요일 06:30 KST에 GitHub Actions가 자동 실행합니다.

## 생성물
- `public/index.html` — 최신 주차
- `public/archive/<ISO주차>.html` — 주차별 보관본 (한 번 만들어지면 덮어쓰지 않음)
- `data/history.json` — 지수 누적 이력 (그래프용)
