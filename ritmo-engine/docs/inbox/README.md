# Inbox — 앱(민철) → 엔진(민규)

이 폴더에는 musicality-app 쪽에서 보내는 메시지가 들어옵니다.

## 규칙
- 파일명: `YYYY-MM-DD-제목.md`
- 헤더: `## From: 민철 / To: 민규`
- 내용: 요청사항, 필요한 데이터 형식 변경, 버그 리포트 등
- 처리 완료 후: 파일 하단에 `## 처리 완료 (YYYY-MM-DD)` 추가
- 30일 지난 처리 완료 메시지는 삭제 가능

## 예시
```markdown
## From: 민철 / To: 민규
sections 응답에 energy_level 필드 추가 요청.
그리드 에디터에서 섹션별 에너지를 시각화하고 싶어요.

### 기대 형식
energy_level: "low" | "mid" | "high"  (SectionInfo에 추가)
```
