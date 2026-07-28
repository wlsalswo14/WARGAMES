# PROJECT BRICK WARFARE

God Mode에서 세 거점을 지휘하다가 결정적인 순간 아군 유닛을 직접 조종하는 3분짜리 3D 블록 전술 게임입니다.

- **플레이:** https://wlsalswo14.github.io/WARGAMES/
- **1:1:1:** https://wlsalswo14.github.io/WARGAMES/?mode=challenge&factions=3
- **Sandbox:** https://wlsalswo14.github.io/WARGAMES/?mode=sandbox
- **소스:** https://github.com/wlsalswo14/WARGAMES

## 게임 한눈에 보기

### AI Challenge

- `1:1` 또는 `1:1:1`
- 제한 시간 3분
- 중립 거점 `A / B / C`
- 진영별 시작 병력 8기
- 100 지휘 점수 선취
- 아군 유닛 즉시·무제한 직접 조종
- 플레이어 명령 성향에 대응하는 적응형 적 지휘관

거점 점령은 8점, 적 격파는 2점, 적 지휘관 기만은 5점을 제공합니다. 소유 거점은 매초 점수를 생산하며, 동시에 보유한 거점이 많을수록 점수 생산량이 빠르게 증가합니다.

### Sandbox

- 3개 진영과 자율 외교
- 무한 유닛·건물·장벽·나무 배치
- 산·참호 실시간 지형 제작
- 실행할 때마다 달라지는 절차 생성 전장
- 모든 진영 유닛 직접 조종
- 전투기·헬기 포함 전체 병과

## 핵심 플레이

1. God Mode에서 전장을 관찰하고 아군을 선택합니다.
2. `1 / 2 / 3`으로 선택 유닛을 `A / B / C` 거점에 보냅니다.
3. `Enter` 또는 유닛 더블클릭으로 즉시 직접 조종합니다.
4. 좌클릭 일반공격, 우클릭 특수공격으로 돌파합니다.
5. 거점과 격파 점수를 합쳐 100점을 먼저 달성합니다.

## 조작

### God Mode

| 입력 | 기능 |
| --- | --- |
| 마우스 | FPS 방식 자유 시점 |
| `W / S` | 전진 / 후진 |
| `A / D` | 왼쪽 / 오른쪽 이동 |
| `Space / Shift` | 상승 / 하강 |
| 마우스 휠 | 관찰자 이동속도 |
| 좌클릭 | 유닛 선택 |
| 우클릭 | 이동 또는 공격 명령 |
| `1 / 2 / 3` | A / B / C 거점 명령 |
| `Enter` / 더블클릭 | 선택 유닛 직접 조종 |

### 직접 조종

| 입력 | 기능 |
| --- | --- |
| 마우스 | 조준과 시점 |
| `W / S` | 전진 / 후진 |
| `A / D` | 왼쪽 / 오른쪽 이동 |
| `Space / Shift` | 항공 유닛 상승 / 하강 |
| 좌클릭 | 일반공격 |
| 우클릭 | 특수공격, 드론 자폭 |
| `V` | 1인칭 / 3인칭 |
| `G` / `Esc` | God Mode 복귀 |

## 구현 특징

- **Three-point frontline:** 세 거점을 두고 전선이 빠르게 이동하는 압축형 맵
- **Adaptive Director:** 플레이어가 반복해서 명령한 거점을 가중치로 기억하고 적 예비대를 대응 배치
- **Unit AI:** 거점 우선 진격, 가까운 위협 교전, 구조물 우회, 정지 상태 탈출
- **Dual weapons:** 보병 외 유닛은 빠른 일반공격과 느리지만 강력한 특수공격 사용
- **Drone strike:** 드론은 사격과 충돌 자폭을 모두 사용
- **Brick destruction:** 유닛·나무·구조물이 실제로 파괴될 때만 블록 파편 생성
- **Structure collapse:** 하부 지지 블록이 무너지면 상부 블록 연쇄 붕괴
- **Straight projectiles:** 모든 탄환과 폭탄은 조준 방향으로 직선 비행
- **Territory feedback:** 점령한 거점 주변 지형이 해당 진영 색으로 변화
- **Procedural audio:** 음원 파일 없이 Web Audio API로 사격·폭발·점령·음악 합성

게임 내부 적응형 지휘관은 브라우저에서 동작하는 경량 규칙·가중치 시스템입니다. 외부 LLM이나 유료 API가 필요하지 않습니다.

## 로컬 실행

Node.js 24 이상을 권장합니다.

```bash
npm install
npm run dev
```

프로덕션 검증:

```bash
npm run check
npm run build
npm run preview
```

## 기술 구성

- TypeScript
- Three.js
- Vite
- WebGL / Web Audio API
- GitHub Actions / GitHub Pages

외부 이미지, 3D 모델, 음원, 폰트 파일을 포함하지 않습니다. 유닛·구조물·지형·식생·효과·사운드는 모두 코드에서 생성합니다.

## 프로젝트 구조

```text
src/
├─ game/
│  ├─ battlefield/    # 전장 배치와 테마
│  ├─ entities/       # 유닛, 발사체, 거점, 파괴 구조물
│  ├─ input/          # 키보드·마우스·포인터 잠금
│  ├─ modes/          # Challenge / Sandbox 규칙
│  ├─ systems/        # AI, 전투, 점수, 오디오, 외교
│  ├─ ui/             # HUD와 결과 화면
│  ├─ world/          # 절차 생성 지형
│  └─ BrickWarfare.ts # 메인 조율 계층
└─ main.ts
```

## 성능 설계

- Challenge 그림자와 안티앨리어싱 비활성화
- Challenge AI 15 Hz, HUD 5 Hz, 거점 판정 10 Hz
- 구조물 블록을 재질별 `InstancedMesh`로 렌더링
- 진영별 동시 병력 8기 유지
- Challenge 발사체 최대 72개
- 구조물별 잔해 최대 48개, 전역 장식 파편 최대 104개
- 파괴된 유닛과 GPU 리소스 자동 정리
- 소프트웨어 렌더러 감지 시 내부 해상도 자동 축소

브라우저 하드웨어 가속을 켜면 GPU로 WebGL을 렌더링합니다. 하드웨어 가속이 꺼진 환경에서는 경고와 함께 저해상도 안전 모드를 적용합니다.

## 제출물

- [게임 소개 및 설명 PDF](submission/PROJECT_BRICK_WARFARE_GAME_GUIDE.pdf)
- [AI 활용 기술 문서 PDF](submission/PROJECT_BRICK_WARFARE_AI_TECHNICAL_DOCUMENT.pdf)
- [30.52초 실제 플레이 영상](submission/PROJECT_BRICK_WARFARE_GAMEPLAY_31S.webm)
- [게임 설명 원문](docs/GAME_GUIDE.md)
- [AI 기술 문서 원문](docs/AI_TECHNICAL_DOCUMENT.md)
- [제출 체크리스트](docs/SUBMISSION_CHECKLIST.md)
- [YouTube 업로드 정보](submission/YOUTUBE_UPLOAD.md)

## 오픈소스 및 권리

- Three.js — MIT License
- Vite — MIT License
- TypeScript — Apache License 2.0

특정 완구 회사의 상표·캐릭터·모델을 사용하지 않는 독립적인 블록 기반 게임입니다.
