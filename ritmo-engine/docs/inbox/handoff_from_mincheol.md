## From: 민철 / To: 민규
## Date: 2026-03-30

핸드오프 문서 작성 완료.

**`docs/interface/HANDOFF_ENGINE.md`** 참조.

### 문서 내용 요약

1. **AnalysisResult 필드별 사용 맵** — 모든 필드가 앱 어디에서 어떻게 쓰이는지
2. **비트 카운팅 로직 상세** — 기준 비트 결정 순서, 카운트 계산 공식
3. **프레이즈 검출 3가지 모드** — rule-based / user-marked / server
4. **섹션 사용 방식** — derecho 시작점이 자동 기준 비트가 되는 구조
5. **On-Device 분석과의 관계** — 서버 분석과 동일 형식, 폴백 시나리오
6. **앱이 기대하는 개선 사항** — 우선순위 위시리스트
7. **snake_case → camelCase 매핑** — 새 필드 추가 시 반드시 참조
8. **에러/폴백 시나리오** — 빈 배열, 서버 불가 등 상황별 앱 동작

### 가장 중요한 포인트

- **downbeats 정확도**가 사용자 경험에 가장 큰 영향 (1박 자동 감지)
- **sections에서 derecho 시작점**이 정확하면 자동 기준 비트가 맞음
- **fingerprint**는 Chromaprint 알고리즘 유지 필수 (기존 동기화 데이터 호환)
- 새 필드 추가/변경 시 inbox로 알려주면 `mapAnalysisResult()` 업데이트할게

— 민철
