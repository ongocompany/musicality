# 앱과의 협업 프로토콜

## 인터페이스 계약

- **계약서 위치**: 프로젝트 루트 `docs/interface/INTERFACE.md`
- `AnalysisResult` 스키마를 변경할 때는 반드시 INTERFACE.md 업데이트 + 앱 inbox에 알림
- `analyzer_engine` 필드로 엔진 버전 식별 (앱이 버전별 분기 가능)

## inbox 메시지

- **엔진→앱 알림**: 프로젝트 루트 `docs/inbox/` 에 메시지 파일 작성
- **앱→엔진 요청**: `docs/inbox/` 에서 메시지 확인
- 파일명: `YYYY-MM-DD-제목.md`
- 형식: `## From: 민규 / To: 민철` + 내용 + 필요한 액션

## 코드 변경 시 체크리스트

- [ ] `schemas.py` (AnalysisResult) 변경했는가? → INTERFACE.md 업데이트
- [ ] 새 필드 추가? → 기본값 포함 (앱 하위호환)
- [ ] 기존 필드 타입 변경? → inbox로 사전 협의 필수
- [ ] analyzer_engine 값 변경? → INTERFACE.md에 새 식별자 등록
